
/**********************
 * STYLE INJECTION
 **********************/
(function () {
    if (document.getElementById("vault-autofill-styles")) return;
    const style = document.createElement("style");
    style.id = "vault-autofill-styles";
    style.textContent = `
        .vault-autofill-btn { position: relative !important; z-index: 999999 !important; margin-left: 12px !important; margin-top: 8px !important; margin-bottom: 8px !important; padding: 12px 24px !important; font-size: 14px !important; font-weight: 600 !important; border-radius: 10px !important; border: none !important; cursor: pointer !important; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important; letter-spacing: 0.4px !important; white-space: nowrap !important; display: inline-flex !important; align-items: center !important; justify-content: center !important; min-height: 44px !important; overflow: hidden !important; box-sizing: border-box !important; }
    `;
    document.head.appendChild(style);
})();

/**********************
 * sendMessageSafe wrapper
 **********************/
function sendMessageSafe(message, timeout = 60000) {
    return new Promise((resolve) => {
        let called = false;
        try {
            chrome.runtime.sendMessage(message, (response) => {
                if (called) return;
                called = true;
                if (chrome.runtime.lastError) {
                    console.warn("sendMessage lastError:", chrome.runtime.lastError.message);
                    resolve({ ok: false, error: chrome.runtime.lastError.message });
                    return;
                }
                resolve(response);
            });
        } catch (err) {
            console.warn("sendMessage threw:", err);
            resolve({ ok: false, error: err.message });
        }
        // safety timeout: resolve with error if no response
        setTimeout(() => {
            if (!called) {
                called = true;
                resolve({ ok: false, error: "sendMessage timeout" });
            }
        }, timeout);
    });
}

/**********************
 * HELPERS: find fields + set values
 **********************/
function findForms() { return Array.from(document.forms || []); }

function getInputText(input) { return `${input.name || ""} ${input.id || ""} ${input.placeholder || ""}`.toLowerCase(); }

function findEmailFields(form) {
    const inputs = Array.from(form.querySelectorAll("input"))
        .filter(i => i.type === "email" || /email/.test(getInputText(i)));
    if (inputs.length <= 1) return { primary: inputs[0] || null, confirms: [] };
    const primary = inputs.find(i => !/confirm|repeat|verify|again/.test(getInputText(i))) || inputs[0];
    return { primary, confirms: inputs.filter(i => i !== primary) };
}

function findPasswordFields(form) {
    const inputs = Array.from(form.querySelectorAll("input[type=password]"));
    if (inputs.length <= 1) return { primary: inputs[0] || null, confirms: [] };
    const primary = inputs.find(i => !/confirm|repeat|verify|again/.test(getInputText(i))) || inputs[0];
    return { primary, confirms: inputs.filter(i => i !== primary) };
}

function findUsernameField(form) {
    // Look for obvious username fields (non-password)
    const candidates = Array.from(form.querySelectorAll("input"))
        .filter(i => i.type === "text" || i.type === "email" || i.type === "tel" || i.type === "" || i.type === "username")
        .filter(i => {
            const t = getInputText(i);
            // avoid name fields (first/last), avoid hidden fields
            if (/first|last|full name|given|family|address|phone|search|captcha|token|otp|code/i.test(t)) return false;
            // accept common username patterns
            return /user|username|login|id|account|handle/.test(t) || i.type === "email";
        });

    // prefer email-looking inputs or inputs with user in name/id
    const emailLike = candidates.find(i => i.type === "email" || /@/.test(i.placeholder || ""));
    if (emailLike) return emailLike;
    return candidates[0] || null;
}

function setInputValue(input, value) {
    if (!input) return;
    try {
        input.focus({ preventScroll: true });
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
        input.blur();
    } catch (err) {
        // best-effort; some fields are read-only or controlled
        console.warn("setInputValue failed:", err);
    }
}

function isSignupForm(form) {
    const inputs = Array.from(form.querySelectorAll("input"));
    const hasEmail = inputs.some(i => i.type === "email" || /email/.test(getInputText(i)));
    const hasPwd = inputs.some(i => i.type === "password");
    const hasPwdConfirm = inputs.some(i => /confirm|repeat|verify/.test(getInputText(i)));
    const hasName = inputs.some(i => /name/.test(getInputText(i)));
    // also treat forms that explicitly include "username" + password as signup
    const hasUsername = inputs.some(i => /user|username|handle|account|id/.test(getInputText(i)));
    return hasEmail && hasPwd && (hasPwdConfirm || hasName || hasUsername);
}

function isLoginForm(form) {
    const inputs = Array.from(form.querySelectorAll("input"));
    const hasPwd = inputs.some(i => i.type === "password");
    const hasUser = inputs.some(i => i.type === "email" || /user|login|email|username|id/.test(getInputText(i)));
    return hasPwd && hasUser;
}

/**********************
 * UI: create button
 **********************/
function createButton(text, isSignup) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = text;
    btn.className = "vault-autofill-btn";
    btn.style.background = isSignup ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)" : "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)";
    btn.style.color = "white";
    btn.style.boxShadow = "0 4px 14px rgba(0,0,0,0.25)";
    btn.addEventListener("mouseenter", () => btn.style.transform = "translateY(-2px) scale(1.02)");
    btn.addEventListener("mouseleave", () => btn.style.transform = "none");
    return btn;
}

/**********************
 * Main injection: attach buttons and handlers
 **********************/
async function attachButtons() {
    const forms = findForms();
    for (const form of forms) {
        if (form.dataset.vaultInjected) continue;
        form.dataset.vaultInjected = "1";

        const submit = form.querySelector("button[type=submit], input[type=submit]") || form.querySelector("button, input[type=button]");

        // SIGNUP flow
        if (isSignupForm(form)) {
            const btn = createButton("Create alias & signup", true);
            btn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();

                const hostname = location.hostname;
                const nameInput = form.querySelector("input[name*=name], input[id*=name]");
                const displayName = nameInput?.value || hostname;

                const resp = await sendMessageSafe({
                    action: "generate_alias_and_credentials",
                    payload: { hostname, display_name: displayName, password_length: 16 }
                }, 45000);

                if (!resp || !resp.ok) {
                    console.warn("Vault response error:", resp && resp.error);
                    alert("Vault error: " + (resp && resp.error ? resp.error : "unknown"));
                    return;
                }

                // find fields and insert values: username, email (primary+confirms), password (primary+confirms)
                const usernameField = findUsernameField(form);
                const { primary: emailPrimary, confirms: emailConfirms } = findEmailFields(form);
                const { primary: pwdPrimary, confirms: pwdConfirms } = findPasswordFields(form);

                // username: try resp.username, resp.alias, or derive from alias
                let usernameVal = resp.username || (typeof resp.alias === "string" ? resp.alias.split("@")[0] : (resp.alias && resp.alias.alias ? (typeof resp.alias.alias === "string" ? resp.alias.alias.split("@")[0] : null) : null));
                if (!usernameVal && resp.alias && typeof resp.alias === "string") usernameVal = resp.alias.split("@")[0];

                // fill username
                if (usernameField && usernameVal) setInputValue(usernameField, usernameVal);

                // fill emails
                if (emailPrimary) setInputValue(emailPrimary, (typeof resp.alias === "string" ? resp.alias : (resp.alias && resp.alias.alias.email) || ""));
                emailConfirms.forEach(i => setInputValue(i, (typeof resp.alias === "string" ? resp.alias : (resp.alias && resp.alias.alias.email) || "")));

                // fill password + confirms
                if (pwdPrimary) setInputValue(pwdPrimary, resp.password);
                pwdConfirms.forEach(i => setInputValue(i, resp.password));
            });

            submit?.parentNode?.insertBefore(btn, submit.nextSibling) || form.appendChild(btn);
        }

        // LOGIN flow
        if (isLoginForm(form)) {
            const btn = createButton("Autofill from Vault", false);
            btn.addEventListener("click", async (e) => {
                e.preventDefault();
                e.stopPropagation();

                const hostname = location.hostname;
                const resp = await sendMessageSafe({ action: "autofill_login", payload: { hostname } }, 30000);

                if (!resp || !resp.ok) {
                    console.warn("Autofill error:", resp && resp.error);
                    alert("Vault error: " + (resp && resp.error ? resp.error : "no matching entry"));
                    return;
                }

                // before mutating, ensure form still in DOM
                if (!form.isConnected) {
                    console.warn("Form detached before autofill completed");
                    return;
                }

                const usernameField = findUsernameField(form);
                const { primary: emailPrimary } = findEmailFields(form);
                const { primary: pwdPrimary } = findPasswordFields(form);

                // pick best target for username (prefer email field if username looks like email)
                const usernameVal = resp.username || resp.user || resp.login || null;
                if (usernameVal) {
                    if (emailPrimary && usernameVal.includes("@")) setInputValue(emailPrimary, usernameVal);
                    else if (usernameField) setInputValue(usernameField, usernameVal);
                }

                if (pwdPrimary && resp.password) setInputValue(pwdPrimary, resp.password);
            });

            submit?.parentNode?.insertBefore(btn, submit.nextSibling) || form.appendChild(btn);
        }
    }
}

attachButtons();
const observer = new MutationObserver(attachButtons);
observer.observe(document, { childList: true, subtree: true });
