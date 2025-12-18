// background.js (username-aware, robust)
// Talks to local vault API, generates usernames, and returns credentials for autofill.

const VAULT_BASE = "http://127.0.0.1:5000"; // adapt if your vault uses a different port

// Persisted unlock config (password + hashing preference).
async function getUnlockConfig() {
    return new Promise((resolve) =>
        chrome.storage.local.get(["vault_password", "vault_use_argon2"], (data) => {
            resolve({
                password: data.vault_password || null,
                use_argon2: data.vault_use_argon2 !== false // default true
            });
        })
    );
}

async function setUnlockConfig(password, use_argon2) {
    return new Promise((resolve) =>
        chrome.storage.local.set({
            vault_password: password || null,
            vault_use_argon2: use_argon2 !== false
        }, resolve)
    );
}

async function unlockVault(password, use_argon2 = true) {
    const res = await fetch(VAULT_BASE + "/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, use_argon2 })
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Vault unlock failed ${res.status}: ${txt}`);
    }
    return true;
}

async function callVault(path, method = "GET", body = null) {
    const url = VAULT_BASE + path;
    const opts = {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
    };

    for (let attempt = 0; attempt < 2; attempt++) {
        let res;
        try {
            res = await fetch(url, opts);
        } catch (networkErr) {
            throw new Error(`Network error calling vault (${url}): ${networkErr.message}`);
        }

        if (res.ok) {
            const ct = res.headers.get("content-type") || "";
            if (ct.includes("application/json")) {
                return res.json();
            }
            return res.text();
        }

        const txt = await res.text().catch(() => "");
        const locked = (res.status === 400 || res.status === 403) && txt && txt.toLowerCase().includes("vault locked");
        if (locked && attempt === 0) {
            const cfg = await getUnlockConfig();
            if (!cfg.password) {
                throw new Error("Vault locked. Please unlock from the extension popup first.");
            }
            await unlockVault(cfg.password, cfg.use_argon2);
            continue;
        }

        throw new Error(`Vault API ${res.status} ${url}: ${txt}`);
    }
}

/* helpers to parse responses */
function extractField(obj, keys) {
    if (!obj) return undefined;
    if (typeof obj === "string") return obj;
    if (Array.isArray(obj)) {
        if (obj.length > 0) return obj[0];
        return undefined;
    }
    for (const k of keys) {
        if (k in obj && obj[k] != null) return obj[k];
        const snake = k.replace(/([A-Z])/g, "_$1").toLowerCase();
        if (snake in obj && obj[snake] != null) return obj[snake];
        const camel = k.replace(/_([a-z])/g, g => g[1].toUpperCase());
        if (camel in obj && obj[camel] != null) return obj[camel];
    }
    if ("id" in obj && obj.id) return obj.id;
    if ("item_id" in obj && obj.item_id) return obj.item_id;
    if ("secret_id" in obj && obj.secret_id) return obj.secret_id;
    return undefined;
}

function findMatchingItem(items, hostname) {
    if (!items || !Array.isArray(items)) return null;
    hostname = hostname.toLowerCase();
    for (const it of items) {
        if (!it) continue;
        if (Array.isArray(it)) {
            const item_id = it[0];
            const domain = (it[1] || "").toString().toLowerCase();
            const title = (it[2] || "").toString().toLowerCase();
            if (domain && (domain === hostname || domain.includes(hostname) || hostname.includes(domain))) return { item_id, domain, title };
            if (title && (title.includes(hostname) || hostname.includes(title))) return { item_id, domain, title };
            continue;
        }
        const item_id = extractField(it, ["item_id", "id", "itemId"]);
        const domain = (it.domain || it.host || it.hostname || "").toString().toLowerCase();
        const title = (it.title || it.name || "").toString().toLowerCase();
        if (domain && (domain === hostname || domain.includes(hostname) || hostname.includes(domain))) return { item_id, domain, title };
        if (title && (title.includes(hostname) || hostname.includes(title))) return { item_id, domain, title };
        for (const v of Object.values(it)) {
            if (typeof v === "string" && v.toLowerCase().includes(hostname)) return { item_id, domain, title };
        }
    }
    return null;
}

/* fetch secrets for item: tries /items/<id>/secrets, /secrets fallback */
async function fetchSecretsForItem(item_id) {
    try {
        const resp = await callVault(`/items/${item_id}/secrets`, "GET");
        if (Array.isArray(resp)) return resp;
    } catch (err) {
        console.info("No /items/<id>/secrets:", err.message);
    }
    try {
        const allSecrets = await callVault(`/secrets`, "GET");
        if (Array.isArray(allSecrets)) {
            return allSecrets.filter(s => {
                if (!s) return false;
                const s_item = s.item_id || s.itemId || (Array.isArray(s) && s[1]);
                return s_item === item_id;
            });
        }
    } catch (err) {
        console.info("No /secrets endpoint:", err.message);
    }
    return [];
}

/* Try to extract username from secretLoad or item/identity endpoints */
async function resolveUsernameForItem(item_id, secretLoad) {
    // 1) from secret directly
    if (secretLoad) {
        const username = secretLoad.username || secretLoad.user || secretLoad.login || extractField(secretLoad, ["username", "user", "login"]);
        if (username) return username;
    }

    // 2) try identity /item endpoints
    const candidates = [
        `/identity/${item_id}`,
        `/items/${item_id}`,
        `/item/${item_id}`
    ];
    for (const path of candidates) {
        try {
            const resp = await callVault(path, "GET");
            if (!resp) continue;
            // resp may be object or array
            // check common fields: email, username, login, title
            const email = resp.email || resp.user || resp.username || extractField(resp, ["email", "username", "login", "name"]);
            if (email) return email;
            // if it's an array with domain etc
            if (Array.isArray(resp)) {
                // attempt to locate an email-like field in array
                for (const v of resp) {
                    if (typeof v === "string" && v.includes("@")) return v;
                }
            }
        } catch (err) {
            // ignore and try next
            continue;
        }
    }
    return null;
}

/* pick an id from various responses */
function pickId(resp) {
    if (!resp) return undefined;
    if (typeof resp === "string") return resp;
    if (Array.isArray(resp) && resp.length > 0) return resp[0];
    return extractField(resp, ["item_id", "id", "secret_id"]);
}

/* safe attempt to generate username: try /username, fallback to /alias (mode=username) */
async function generateUsername(hostname, display_name) {
    try {
        const resp = await callVault("/username", "POST", { hostname, name: display_name });
        // resp can be string or object
        if (!resp) return null;
        if (typeof resp === "string") return resp;
        if (resp.username) return resp.username;
        if (resp.alias) return typeof resp.alias === "string" ? resp.alias : (resp.alias.username || resp.alias.email || null);
        if (resp.email) return resp.email;
        return null;
    } catch (err) {
        console.info("/username not available or failed, falling back to /alias:", err.message);
    }

    // fallback to alias (mode=username)
    try {
        const a = await callVault("/alias", "POST", { hostname, mode: "username", note: "fallback username generation" });
        if (!a) return null;
        if (typeof a === "string") return a;
        if (a.alias) return typeof a.alias === "string" ? a.alias : (a.alias.username || a.alias.email || null);
        if (a.email) return a.email;
        return null;
    } catch (err) {
        console.warn("Alias fallback failed when generating username:", err.message);
        return null;
    }
}

/* message handling */
chrome.runtime.onMessage.addListener((msg, sender, sendResp) => {
    (async () => {
        try {
            if (msg.action === "unlock_vault") {
                const { password, use_argon2 = true } = msg.payload || {};
                if (!password) throw new Error("Password required to unlock.");
                await unlockVault(password, use_argon2);
                await setUnlockConfig(password, use_argon2);
                sendResp({ ok: true });
                return;
            }

            if (msg.action === "generate_alias_and_credentials") {
                const { hostname, display_name, password_length = 16, mode = "word" } = msg.payload;

                // alias
                const aliasResp = await callVault("/alias", "POST", {
                    api_key: null,
                    hostname,
                    mode,
                    note: `Generated by extension for ${hostname}`
                });

                // password
                const pwdResp = await callVault("/password", "POST", { length: password_length });

                // generate username (preferred)
                let username = await generateUsername(hostname, display_name);
                // if username not available, try to use alias (if email-like strip domain part)
                if (!username) {
                    if (aliasResp) {
                        if (typeof aliasResp === "string") username = aliasResp.split("@")[0];
                        else if (aliasResp.alias && typeof aliasResp.alias === "string") username = aliasResp.alias.split("@")[0];
                        else if (aliasResp.email) username = aliasResp.email.split("@")[0];
                    }
                }

                // create identity
                const identityResp = await callVault("/identity", "POST", {
                    domain: hostname,
                    name: display_name || username || (typeof aliasResp === "string" ? aliasResp : null),
                    pii: { email: (aliasResp && (aliasResp.alias || aliasResp.email)) || null, phone: null },
                    site_type: "generic",
                    trust_level: 0
                });

                let item_id = pickId(identityResp);
                if (!item_id) {
                    // fallback: search items
                    try {
                        const items = await callVault("/items", "GET");
                        const match = findMatchingItem(items, hostname);
                        if (match) item_id = match.item_id;
                    } catch (err) {
                        console.warn("Could not locate created identity in /items:", err.message);
                    }
                }
                if (!item_id) throw new Error("Failed to determine item_id for created identity: " + JSON.stringify(identityResp));

                // create secret (store password + username)
                const secretResp = await callVault("/secret", "POST", {
                    item_id,
                    secret_type: "password",
                    username: username || (aliasResp && (aliasResp.alias || aliasResp.email) || null),
                    password: pwdResp.password
                });

                const secret_id = pickId(secretResp);
                sendResp({ ok: true, alias: aliasResp, username, password: pwdResp.password, item_id, secret_id });
                return;
            }

            else if (msg.action === "autofill_login") {
                const { hostname } = msg.payload;
                if (!hostname) throw new Error("hostname required");

                const items = await callVault("/items", "GET");
                let match = findMatchingItem(items, hostname);
                if (!match) {
                    const fallback = (items || []).find(it => {
                        try {
                            if (Array.isArray(it)) {
                                return ("" + (it.join(" "))).toLowerCase().includes(hostname.toLowerCase());
                            } else {
                                return JSON.stringify(it).toLowerCase().includes(hostname.toLowerCase());
                            }
                        } catch (e) {
                            return false;
                        }
                    });
                    if (fallback) {
                        const item_id = Array.isArray(fallback) ? fallback[0] : extractField(fallback, ["item_id","id"]);
                        if (item_id) match = { item_id, domain: fallback.domain || (Array.isArray(fallback) && fallback[1]) || null };
                    }
                }
                if (!match || !match.item_id) throw new Error("No matching vault entry found for this site.");

                const item_id = match.item_id;
                const secrets = await fetchSecretsForItem(item_id);
                if (!Array.isArray(secrets) || secrets.length === 0) throw new Error("No secrets returned for item: " + item_id);

                // pick password secret
                let pwdSecret = secrets.find(s => (s.secret_type && s.secret_type === "password") || (Array.isArray(s) && (s[4] === "password" || s[3] === "password")));
                if (!pwdSecret) pwdSecret = secrets[0];
                const secret_id = extractField(pwdSecret, ["secret_id","id"]) || (Array.isArray(pwdSecret) ? pwdSecret[0] : undefined);
                if (!secret_id) throw new Error("Could not determine secret_id for secret record.");

                const secretLoad = await callVault(`/secret/${secret_id}`, "GET");
                // extract username/password
                let username = secretLoad.username || secretLoad.user || secretLoad.login || extractField(secretLoad, ["username", "user", "login"]);
                let password = secretLoad.password || secretLoad.pw || extractField(secretLoad, ["password", "pw"]);

                // if username missing, try to resolve from item/identity
                if (!username) {
                    const resolved = await resolveUsernameForItem(item_id, secretLoad);
                    if (resolved) username = resolved;
                }

                if (!username && !password) throw new Error("Secret loaded but username/password not present. Check vault secret endpoint.");
                sendResp({ ok: true, username, password });
                return;
            }

            else if (msg.action === "ping_vault") {
                try {
                    await callVault("/items", "GET");
                    sendResp({ ok: true });
                } catch (e) {
                    sendResp({ ok: false, error: e.message });
                }
                return;
            }

            else {
                sendResp({ ok: false, error: "unknown action" });
                return;
            }
        } catch (err) {
            console.error("Background error:", err);
            sendResp({ ok: false, error: err.message });
        }
    })();

    return true;
});
