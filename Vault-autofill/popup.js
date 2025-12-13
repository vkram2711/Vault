document.getElementById('ping').addEventListener('click', async () => {
    const statusEl = document.getElementById('status');
    statusEl.className = '';
    statusEl.innerText = "Checking vault...";
    
    const resp = await new Promise(resolve => chrome.runtime.sendMessage({ action: "ping_vault" }, resolve));
    
    if (resp.ok) {
        statusEl.innerText = "Vault reachable";
        statusEl.className = "success";
        // fetch items
        const itemsResp = await fetch("http://127.0.0.1:5000/items");
        const items = await itemsResp.json();
        const container = document.getElementById('items');
        container.innerHTML = '<h4>Saved items</h4>';
        const ul = document.createElement('ul');
        items.forEach(it => {
            const li = document.createElement('li');
            // Support both array and object shapes returned by /items
            const itemId = it.item_id ?? it.id ?? (Array.isArray(it) ? it[0] : "");
            const domain = it.domain ?? it.site ?? (Array.isArray(it) ? it[1] : "");
            const title = it.title ?? it.name ?? "";
            const label = domain || title || "(no domain)";
            li.textContent = `${itemId || "(no id)"} - ${label}`;
            ul.appendChild(li);
        });
        container.appendChild(ul);
    } else {
        statusEl.innerText = "Vault unreachable: " + (resp.error || '');
        statusEl.className = "error";
    }
});

// Unlock vault with user-provided password and preference.
document.getElementById('unlock').addEventListener('click', async () => {
    const passwordInput = document.getElementById('vault-password');
    const statusEl = document.getElementById('status');
    const password = passwordInput.value;
    const use_argon2 = true; // default to Argon2

    if (!password) {
        statusEl.innerText = "Enter a password to unlock.";
        statusEl.className = "error";
        return;
    }

    statusEl.className = '';
    statusEl.innerText = "Unlocking vault...";

    const resp = await new Promise(resolve => chrome.runtime.sendMessage({
        action: "unlock_vault",
        payload: { password, use_argon2 }
    }, resolve));

    if (resp && resp.ok) {
        statusEl.innerText = "Vault unlocked successfully!";
        statusEl.className = "success";
        passwordInput.value = ""; // Clear password for security
    } else {
        statusEl.innerText = "Unlock failed: " + (resp && resp.error ? resp.error : "unknown");
        statusEl.className = "error";
    }
});
