// content_script.js
// - scan for forms
// - if signup form detected: add "Create alias & signup" button
// - if login form detected: add "Autofill from Vault" button
// - fills primary + confirm email/password fields

/**********************
 * STYLE INJECTION
 **********************/
(function () {
    if (document.getElementById("vault-autofill-styles")) return;
    const style = document.createElement("style");
    style.id = "vault-autofill-styles";
    style.textContent = `
        .vault-autofill-btn {
            position: relative !important;
            z-index: 999999 !important;
            margin-left: 12px !important;
            margin-top: 8px !important;
            margin-bottom: 8px !important;
            padding: 12px 24px !important;
            font-size: 14px !important;
            font-weight: 600 !important;
            border-radius: 10px !important;
            border: none !important;
            cursor: pointer !important;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif !important;
            letter-spacing: 0.4px !important;
            white-space: nowrap !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            min-height: 44px !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
        }
    `;
    document.head.appendChild(style);
})();

/**********************
 * HELPERS
 **********************/
function findForms() {
    return Array.from(document.forms || []);
}

function getInputText(input) {
    return `${input.name || ""} ${input.id || ""} ${input.placeholder || ""}`.toLowerCase();
}

function findEmailFields(form) {
    const inputs = Array.from(form.querySelectorAll("input"))
        .filter(i => i.type === "email" || /email/.test(getInputText(i)));

    if (inputs.length <= 1) {
        return { primary: inputs[0] || null, confirms: [] };
    }

    const primary =
        inputs.find(i => !/confirm|repeat|verify|again/.test(getInputText(i))) || inputs[0];

    return {
        primary,
        confirms: inputs.filter(i => i !== primary)
    };
}

function findPasswordFields(form) {
    const inputs = Array.from(form.querySelectorAll("input[type=password]"));

    if (inputs.length <= 1) {
        return { primary: inputs[0] || null, confirms: [] };
    }

    const primary =
        inputs.find(i => !/confirm|repeat|verify|again/.test(getInputText(i))) || inputs[0];

    return {
        primary,
        confirms: inputs.filter(i => i !== primary)
    };
}

function setInputValue(input, value) {
    if (!input) return;
    input.focus();
    input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.blur();
}

function sendMessageSafe(message) {
    return new Promise((resolve) => {
        try {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    console.warn("sendMessage error:", chrome.runtime.lastError.message);
                    resolve({ ok: false, error: chrome.runtime.lastError.message });
                    return;
                }
                resolve(response);
            });
        } catch (err) {
            console.warn("sendMessage threw:", err);
            resolve({ ok: false, error: err.message });
        }
    });
}


function isSignupForm(form) {
    const inputs = Array.from(form.querySelectorAll("input"));
    const hasEmail = inputs.some(i => i.type === "email" || /email/.test(getInputText(i)));
    const hasPwd = inputs.some(i => i.type === "password");
    const hasPwdConfirm = inputs.some(i => /confirm|repeat|verify/.test(getInputText(i)));
    const hasName = inputs.some(i => /name/.test(getInputText(i)));
    return hasEmail && hasPwd && (hasPwdConfirm || hasName);
}

function isLoginForm(form) {
    const inputs = Array.from(form.querySelectorAll("input"));
    const hasPwd = inputs.some(i => i.type === "password");
    const hasUser = inputs.some(i =>
        i.type === "email" || /user|login|email|username/.test(getInputText(i))
    );
    return hasPwd && hasUser;
}

/**********************
 * BUTTON CREATION
 **********************/
function createButton(text, isSignup) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = text;
    btn.className = "vault-autofill-btn";

    btn.style.background = isSignup
        ? "linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
        : "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)";
    btn.style.color = "white";
    btn.style.boxShadow = "0 4px 14px rgba(0,0,0,0.25)";

    btn.addEventListener("mouseenter", () => {
        btn.style.transform = "translateY(-2px) scale(1.02)";
    });
    btn.addEventListener("mouseleave", () => {
        btn.style.transform = "none";
    });

    return btn;
}

/**********************
 * MAIN INJECTION LOGIC
 **********************/
function attachButtons() {
    const forms = findForms();

    for (const form of forms) {
        if (form.dataset.vaultInjected) continue;
        form.dataset.vaultInjected = "1";

        const submit =
            form.querySelector("button[type=submit], input[type=submit]") ||
            form.querySelector("button, input[type=button]");

        /* SIGNUP */
        if (isSignupForm(form)) {
            const btn = createButton("Create alias & signup", true);
            btn.addEventListener("click", async e => {
                e.preventDefault();

                const hostname = location.hostname;
                const nameInput = form.querySelector("input[name*=name], input[id*=name]");
                const displayName = nameInput?.value || hostname;

                const resp = await new Promise(resolve =>
                    chrome.runtime.sendMessage(
                        {
                            action: "generate_alias_and_credentials",
                            payload: { hostname, display_name: displayName, password_length: 16 }
                        },
                        resolve
                    )
                );

                if (!resp || !resp.ok) {
                    alert("Vault error: " + (resp?.error || "unknown"));
                    return;
                }

                const { primary: emailPrimary, confirms: emailConfirms } = findEmailFields(form);
                const { primary: pwdPrimary, confirms: pwdConfirms } = findPasswordFields(form);

                setInputValue(emailPrimary, resp.alias);
                emailConfirms.forEach(i => setInputValue(i, resp.alias));

                setInputValue(pwdPrimary, resp.password);
                pwdConfirms.forEach(i => setInputValue(i, resp.password));
            });

            submit?.parentNode?.insertBefore(btn, submit.nextSibling) || form.appendChild(btn);
        }

        /* LOGIN */
        if (isLoginForm(form)) {
            const btn = createButton("Autofill from Vault", false);
            btn.addEventListener("click", async e => {
                e.preventDefault();

                const hostname = location.hostname;

                const resp = await sendMessageSafe({
                    action: "autofill_login",
                    payload: { hostname }
                });

                if (!resp || !resp.ok) {
                    console.warn("Vault autofill aborted:", resp?.error);
                    return; // IMPORTANT: do not throw
                }

                if (!resp || !resp.ok) {
                    alert("Vault error: " + (resp?.error || "not found"));
                    return;
                }

                const { primary: emailPrimary } = findEmailFields(form);
                const { primary: pwdPrimary } = findPasswordFields(form);

                setInputValue(emailPrimary, resp.username);
                setInputValue(pwdPrimary, resp.password);
            });

            submit?.parentNode?.insertBefore(btn, submit.nextSibling) || form.appendChild(btn);
        }
    }
}

/**********************
 * INIT + OBSERVER
 **********************/
attachButtons();

const observer = new MutationObserver(attachButtons);
observer.observe(document, { childList: true, subtree: true });
