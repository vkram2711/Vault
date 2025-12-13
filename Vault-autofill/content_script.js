// content_script.js
// - scan for forms
// - if signup form detected: add "Create alias & signup" button
// - if login form detected: add "Autofill from Vault" button
// - on click, message background and then fill form fields

// Inject CSS to ensure button styles are applied
(function() {
    if (document.getElementById('vault-autofill-styles')) return;
    const style = document.createElement('style');
    style.id = 'vault-autofill-styles';
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
            text-transform: none !important;
            white-space: nowrap !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            min-height: 44px !important;
            outline: none !important;
            overflow: hidden !important;
            box-sizing: border-box !important;
        }
    `;
    document.head.appendChild(style);
})();

function findForms() {
    return Array.from(document.forms || []);
}

function isSignupForm(form) {
    // heuristics: presence of email + password + password-confirm or name
    const inputs = Array.from(form.querySelectorAll("input"));
    const hasEmail = inputs.some(i => i.type === "email" || /email/i.test(i.name + i.id + i.placeholder));
    const hasPwd = inputs.some(i => i.type === "password");
    const hasPwdConfirm = inputs.some(i => /confirm|repeat|verify/i.test(i.name + i.id + i.placeholder));
    const hasName = inputs.some(i => /name/i.test(i.name + i.id + i.placeholder));
    return hasEmail && hasPwd && (hasPwdConfirm || hasName);
}

function isLoginForm(form) {
    const inputs = Array.from(form.querySelectorAll("input"));
    const hasPwd = inputs.some(i => i.type === "password");
    // If we find a single password and either username/email style field - treat as login
    const hasUser = inputs.some(i => i.type === "email" || /user|login|email|username/i.test(i.name + i.id + i.placeholder));
    return hasPwd && hasUser;
}

function createButton(text, isSignup = false) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.innerText = text;
    btn.className = "vault-autofill-btn";
    btn.id = "vault-btn-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);
    
    // Enhanced modern styling with !important to override page CSS
    btn.style.setProperty("position", "relative", "important");
    btn.style.setProperty("z-index", "999999", "important");
    btn.style.setProperty("margin-left", "12px", "important");
    btn.style.setProperty("margin-top", "8px", "important");
    btn.style.setProperty("margin-bottom", "8px", "important");
    btn.style.setProperty("padding", "12px 24px", "important");
    btn.style.setProperty("font-size", "14px", "important");
    btn.style.setProperty("font-weight", "600", "important");
    btn.style.setProperty("border-radius", "10px", "important");
    btn.style.setProperty("border", "none", "important");
    btn.style.setProperty("cursor", "pointer", "important");
    btn.style.setProperty("transition", "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)", "important");
    btn.style.setProperty("font-family", "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif", "important");
    btn.style.setProperty("letter-spacing", "0.4px", "important");
    btn.style.setProperty("text-transform", "none", "important");
    btn.style.setProperty("white-space", "nowrap", "important");
    btn.style.setProperty("display", "inline-flex", "important");
    btn.style.setProperty("align-items", "center", "important");
    btn.style.setProperty("justify-content", "center", "important");
    btn.style.setProperty("min-height", "44px", "important");
    btn.style.setProperty("outline", "none", "important");
    btn.style.setProperty("overflow", "hidden", "important");
    btn.style.setProperty("box-sizing", "border-box", "important");
    
    // Color scheme based on action with enhanced gradients
    if (isSignup) {
        // Beautiful gradient for signup (purple/blue)
        btn.style.setProperty("background", "linear-gradient(135deg, #667eea 0%, #764ba2 100%)", "important");
        btn.style.setProperty("color", "white", "important");
        btn.style.setProperty("box-shadow", "0 4px 14px rgba(102, 126, 234, 0.4), 0 2px 4px rgba(118, 75, 162, 0.3)", "important");
    } else {
        // Enhanced gradient for autofill (indigo/blue)
        btn.style.setProperty("background", "linear-gradient(135deg, #4f46e5 0%, #6366f1 100%)", "important");
        btn.style.setProperty("color", "white", "important");
        btn.style.setProperty("box-shadow", "0 4px 14px rgba(79, 70, 229, 0.4), 0 2px 4px rgba(99, 102, 241, 0.3)", "important");
    }
    
    // Add a subtle shine effect on hover
    const shine = document.createElement("div");
    shine.style.cssText = `
        position: absolute;
        top: 0;
        left: -100%;
        width: 100%;
        height: 100%;
        background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.3), transparent);
        transition: left 0.5s ease;
        pointer-events: none;
    `;
    btn.appendChild(shine);
    
    // Enhanced hover effects
    btn.addEventListener("mouseenter", () => {
        btn.style.setProperty("transform", "translateY(-3px) scale(1.02)", "important");
        if (isSignup) {
            btn.style.setProperty("box-shadow", "0 8px 20px rgba(102, 126, 234, 0.5), 0 4px 8px rgba(118, 75, 162, 0.4)", "important");
        } else {
            btn.style.setProperty("box-shadow", "0 8px 20px rgba(79, 70, 229, 0.5), 0 4px 8px rgba(99, 102, 241, 0.4)", "important");
        }
        shine.style.left = "100%";
    });
    
    btn.addEventListener("mouseleave", () => {
        btn.style.setProperty("transform", "translateY(0) scale(1)", "important");
        if (isSignup) {
            btn.style.setProperty("box-shadow", "0 4px 14px rgba(102, 126, 234, 0.4), 0 2px 4px rgba(118, 75, 162, 0.3)", "important");
        } else {
            btn.style.setProperty("box-shadow", "0 4px 14px rgba(79, 70, 229, 0.4), 0 2px 4px rgba(99, 102, 241, 0.3)", "important");
        }
        shine.style.left = "-100%";
    });
    
    btn.addEventListener("mousedown", () => {
        btn.style.setProperty("transform", "translateY(-1px) scale(0.98)", "important");
    });
    
    btn.addEventListener("mouseup", () => {
        btn.style.setProperty("transform", "translateY(-3px) scale(1.02)", "important");
    });
    
    // Focus state for accessibility
    btn.addEventListener("focus", () => {
        btn.style.outline = "3px solid rgba(102, 126, 234, 0.5)";
        btn.style.outlineOffset = "2px";
    });
    
    btn.addEventListener("blur", () => {
        btn.style.outline = "none";
    });
    
    // Add active state animation
    btn.addEventListener("click", (e) => {
        const ripple = document.createElement("span");
        const rect = btn.getBoundingClientRect();
        const size = Math.max(rect.width, rect.height);
        const x = e.clientX - rect.left - size / 2;
        const y = e.clientY - rect.top - size / 2;
        
        ripple.style.cssText = `
            position: absolute;
            width: ${size}px;
            height: ${size}px;
            left: ${x}px;
            top: ${y}px;
            border-radius: 50%;
            background: rgba(255, 255, 255, 0.5);
            transform: scale(0);
            animation: ripple 0.6s ease-out;
            pointer-events: none;
        `;
        
        // Add animation if not already in style
        if (!document.getElementById('vault-button-styles')) {
            const style = document.createElement('style');
            style.id = 'vault-button-styles';
            style.textContent = `
                @keyframes ripple {
                    to {
                        transform: scale(4);
                        opacity: 0;
                    }
                }
            `;
            document.head.appendChild(style);
        }
        
        btn.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    });
    
    return btn;
}

// Attach UI next to submit buttons
function attachButtons() {
    const forms = findForms();
    for (const form of forms) {
        // avoid injecting twice
        if (form.dataset.vaultInjected) continue;
        form.dataset.vaultInjected = "1";

        if (isSignupForm(form)) {
            const submit = form.querySelector("button[type=submit], input[type=submit]") || form.querySelector("button, input[type=button]");
            const btn = createButton("Create alias & signup", true);
            btn.addEventListener("click", async (e) => {
                e.preventDefault();
                // basic data extraction
                const hostname = location.hostname;
                // attempt to pick a name/email fields
                const emailInput = form.querySelector("input[type=email], input[name*=email], input[id*=email]") ;
                const nameInput = form.querySelector("input[name*=name], input[id*=name], input[placeholder*=name]");
                const displayName = nameInput ? nameInput.value || nameInput.placeholder : hostname;
                // inform background to create alias and credentials
                const resp = await new Promise(resolve => chrome.runtime.sendMessage({
                    action: "generate_alias_and_credentials",
                    payload: { hostname, display_name: displayName, password_length: 16 }
                }, resolve));

                if (!resp || !resp.ok) {
                    alert("Vault error: " + (resp && resp.error ? resp.error : "unknown"));
                    return;
                }

                // fill email and password fields
                if (emailInput) {
                    emailInput.focus();
                    emailInput.value = resp.alias;
                    emailInput.dispatchEvent(new Event('input', {bubbles:true}));
                } else {
                    // fallback: try to find any text field
                    const txt = form.querySelector("input[type=text], input:not([type])");
                    if (txt) {
                        txt.value = resp.alias;
                        txt.dispatchEvent(new Event('input', {bubbles:true}));
                    }
                }

                // fill password
                const pwdInput = form.querySelector("input[type=password]");
                if (pwdInput) {
                    pwdInput.focus();
                    pwdInput.value = resp.password;
                    pwdInput.dispatchEvent(new Event('input', {bubbles:true}));
                }

                // optionally auto-submit? we'll leave to user
            });

            // insert near submit
            if (submit && submit.parentNode) {
                submit.parentNode.insertBefore(btn, submit.nextSibling);
            } else {
                form.appendChild(btn);
            }
        }

        if (isLoginForm(form)) {
            const submit = form.querySelector("button[type=submit], input[type=submit]") || form.querySelector("button, input[type=button]");
            const btn = createButton("Autofill from Vault", false);
            btn.addEventListener("click", async (e) => {
                e.preventDefault();
                const hostname = location.hostname;
                const resp = await new Promise(resolve => chrome.runtime.sendMessage({ action: "autofill_login", payload: { hostname } }, resolve));
                if (!resp || !resp.ok) {
                    alert("Vault error: " + (resp && resp.error ? resp.error : "no matching entry"));
                    return;
                }
                // find username/email field
                const userField = form.querySelector("input[type=email], input[name*=user], input[name*=email], input[name*=login], input[id*=user]");
                if (userField && resp.username) {
                    userField.value = resp.username;
                    userField.dispatchEvent(new Event('input', {bubbles:true}));
                }
                const pwdField = form.querySelector("input[type=password]");
                if (pwdField && resp.password) {
                    pwdField.value = resp.password;
                    pwdField.dispatchEvent(new Event('input', {bubbles:true}));
                }
            });


            if (submit && submit.parentNode) {
                submit.parentNode.insertBefore(btn, submit.nextSibling);
            } else {
                form.appendChild(btn);
            }
        }
    }
}

// Run initial attach
attachButtons();

// Observe DOM changes to attach to dynamically loaded forms (single observer)
const observer = new MutationObserver((mutations) => {
    attachButtons();
});
observer.observe(document, { childList: true, subtree: true });
