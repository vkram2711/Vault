// background.js (robust version)
// Talks to local vault API, with resilient parsing of responses and helpful errors.

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

/**
 * Generic vault caller that will try to unlock once if the server replies 'vault locked'.
 * Throws Error with body text when final attempt fails.
 */
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

        // successful response
        if (res.ok) {
            // attempt to parse JSON; if parse fails, return text
            const ct = res.headers.get("content-type") || "";
            if (ct.includes("application/json")) {
                return res.json();
            }
            return res.text();
        }

        const txt = await res.text().catch(() => "");
        const locked = (res.status === 400 || res.status === 403) && txt && txt.toLowerCase().includes("vault locked");
        if (locked && attempt === 0) {
            // Unlock then retry once
            const cfg = await getUnlockConfig();
            if (!cfg.password) {
                throw new Error("Vault locked. Please unlock from the extension popup first.");
            }
            await unlockVault(cfg.password, cfg.use_argon2);
            continue;
        }

        // Not a locked error or second attempt already used -> throw
        throw new Error(`Vault API ${res.status} ${url}: ${txt}`);
    }
}

/* Utility: extract id-like fields from API responses (robust) */
function extractField(obj, keys) {
    if (!obj) return undefined;
    // if obj is a string (e.g., the API returned just an id string)
    if (typeof obj === "string") return obj;
    // if it's an array, try indices mapping
    if (Array.isArray(obj)) {
        // array might be rows from sqlite: [item_id, domain, title, ...]
        // try to return first element or object-like indices
        if (obj.length > 0) return obj[0];
        return undefined;
    }
    // object: try keys
    for (const k of keys) {
        if (k in obj && obj[k] != null) return obj[k];
        // try snake/camel variants
        const snake = k.replace(/([A-Z])/g, "_$1").toLowerCase();
        if (snake in obj && obj[snake] != null) return obj[snake];
        const camel = k.replace(/_([a-z])/g, g => g[1].toUpperCase());
        if (camel in obj && obj[camel] != null) return obj[camel];
    }
    // maybe the returned object directly contains the hash or row fields
    if ("id" in obj && obj.id) return obj.id;
    if ("item_id" in obj && obj.item_id) return obj.item_id;
    if ("secret_id" in obj && obj.secret_id) return obj.secret_id;
    return undefined;
}

/* Utility: find a best matching item for a hostname from an /items result */
function findMatchingItem(items, hostname) {
    if (!items || !Array.isArray(items)) return null;
    hostname = hostname.toLowerCase();

    // Normalize candidate extractor: items could be array rows or objects
    for (const it of items) {
        if (!it) continue;
        // handle array row: try common positions
        if (Array.isArray(it)) {
            // common layout we used earlier: [item_id, domain, title, created_at, updated_at]
            const item_id = it[0];
            const domain = (it[1] || "").toString().toLowerCase();
            const title = (it[2] || "").toString().toLowerCase();
            if (domain && (domain === hostname || domain.includes(hostname) || hostname.includes(domain))) return { item_id, domain, title };
            if (title && (title.includes(hostname) || hostname.includes(title))) return { item_id, domain, title };
            // also check item_id if it looks like domain
            if (typeof item_id === "string" && item_id.toLowerCase().includes(hostname)) return { item_id, domain, title };
            continue;
        }

        // object style: expected { item_id, domain, title, ... } or similar
        const item_id = extractField(it, ["item_id", "id", "itemId"]);
        const domain = (it.domain || it.host || it.hostname || "").toString().toLowerCase();
        const title = (it.title || it.name || "").toString().toLowerCase();
        if (domain && (domain === hostname || domain.includes(hostname) || hostname.includes(domain))) return { item_id, domain, title };
        if (title && (title.includes(hostname) || hostname.includes(title))) return { item_id, domain, title };
        // last resort: check other fields for host substring match
        for (const v of Object.values(it)) {
            if (typeof v === "string" && v.toLowerCase().includes(hostname)) return { item_id, domain, title };
        }
    }
    return null;
}

/* Attempt to get secrets for an item_id. Will try multiple endpoints and fallback strategies. */
async function fetchSecretsForItem(item_id) {
    // try dedicated endpoint first
    try {
        const resp = await callVault(`/items/${item_id}/secrets`, "GET");
        if (Array.isArray(resp) && resp.length > 0) return resp;
        // allow empty array
        if (Array.isArray(resp)) return [];
    } catch (err) {
        // ignore and fallback
        console.info("No /items/<id>/secrets endpoint or it failed, falling back:", err.message);
    }

    // fallback: if service exposes /secrets listing, request and filter by item_id
    try {
        const allSecrets = await callVault(`/secrets`, "GET"); // optional endpoint
        if (Array.isArray(allSecrets)) {
            return allSecrets.filter(s => {
                if (!s) return false;
                // object or array shapes: check s.item_id or s[1] etc
                const sid = extractField(s, ["secret_id", "id"]);
                const s_item = s.item_id || s.itemId || (Array.isArray(s) && s[1]);
                return s_item === item_id;
            });
        }
    } catch (err) {
        console.info("No /secrets endpoint or it failed:", err.message);
    }

    // final fallback: request /items and try to inspect inline secret refs (unlikely)
    try {
        const items = await callVault("/items", "GET");
        if (Array.isArray(items)) {
            const match = findMatchingItem(items, item_id) || items.find(i => extractField(i, ["item_id","id"]) === item_id);
            if (match && match.detail_blob_hash) {
                // we don't have a convenient way to return secrets from detail blob — fail graceful
                return [];
            }
        }
    } catch (err) {
        console.info("Fallback attempt to parse /items for secrets failed:", err.message);
    }

    // If we reach here, we couldn't get secrets
    return [];
}

/* Simple helper to pick an id from API response object */
function pickItemIdFromResponse(resp) {
    if (!resp) return undefined;
    // if the response is a string -> treat as id
    if (typeof resp === "string") return resp;
    // if array: maybe first element is item_id
    if (Array.isArray(resp) && resp.length > 0) return resp[0];
    // object: common keys
    return extractField(resp, ["item_id", "id", "itemId"]);
}


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

                // 1) Create alias (vault API)
                const aliasResp = await callVault("/alias", "POST", {
                    api_key: null,
                    hostname,
                    mode,
                    note: `Generated by extension for ${hostname}`
                });

                // 2) Generate password
                const pwdResp = await callVault("/password", "POST", { length: password_length });

                // Resolve alias email flexibly
                let aliasEmail = undefined;
                if (!aliasResp) aliasEmail = "";
                else if (typeof aliasResp === "string") aliasEmail = aliasResp;
                else if (aliasResp.alias) {
                    if (typeof aliasResp.alias === "string") aliasEmail = aliasResp.alias;
                    else if (aliasResp.alias.email) aliasEmail = aliasResp.alias.email;
                    else aliasEmail = JSON.stringify(aliasResp.alias);
                } else if (aliasResp.email) aliasEmail = aliasResp.email;
                else aliasEmail = JSON.stringify(aliasResp);

                // 3) Create identity in vault
                const identityResp = await callVault("/identity", "POST", {
                    domain: hostname,
                    name: display_name || aliasEmail,
                    pii: { email: aliasEmail, phone: null },
                    site_type: "generic",
                    trust_level: 0
                });

                // Extract item_id robustly. If not present, try to find the item by domain in /items
                let item_id = pickItemIdFromResponse(identityResp);
                if (!item_id) {
                    console.info("identity response did not include item id; searching /items for domain...");
                    try {
                        const items = await callVault("/items", "GET");
                        const match = findMatchingItem(items, hostname) || items.find(i => extractField(i, ["detail_blob_hash","blob_hash"]) === identityResp?.blob_hash);
                        if (match) item_id = match.item_id || match[0] || extractField(match, ["item_id","id"]);
                    } catch (err) {
                        console.warn("Failed to find created identity in /items:", err.message);
                    }
                }
                if (!item_id) {
                    // Give a detailed error so you can see what identityResp looked like
                    throw new Error("Failed to determine item_id for created identity. Identity response: " + JSON.stringify(identityResp));
                }

                // 4) Create secret (store password)
                const secretResp = await callVault("/secret", "POST", {
                    item_id,
                    secret_type: "password",
                    username: aliasEmail,
                    password: pwdResp.password
                });

                // resolve secret id
                const secret_id = pickItemIdFromResponse(secretResp) || extractField(secretResp, ["secret_id","id"]);

                sendResp({ ok: true, alias: aliasEmail, password: pwdResp.password, item_id, secret_id });
                return;
            }

            else if (msg.action === "autofill_login") {
                const { hostname } = msg.payload;
                if (!hostname) throw new Error("hostname required");

                // 1) Get items and find best candidate
                const items = await callVault("/items", "GET");
                const match = findMatchingItem(items, hostname);
                if (!match) {
                    // more permissive heuristics: try substring match across fields
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
                        if (item_id) {
                            // use fallback
                            match = { item_id, domain: fallback.domain || (Array.isArray(fallback) && fallback[1]) || null };
                        }
                    }
                }

                if (!match || !match.item_id) throw new Error("No matching vault entry found for this site.");

                const item_id = match.item_id;

                // Try to fetch secrets for that item
                const secrets = await fetchSecretsForItem(item_id);
                if (!Array.isArray(secrets) || secrets.length === 0) throw new Error("No secrets returned for item: " + item_id);

                // pick first password secret (supports both object and array shapes)
                let pwdSecret = secrets.find(s => (s.secret_type && s.secret_type === "password") || (Array.isArray(s) && (s[4] === "password" || s[3] === "password")));
                if (!pwdSecret) pwdSecret = secrets[0];

                // get secret_id
                const secret_id = extractField(pwdSecret, ["secret_id","id"]) || (Array.isArray(pwdSecret) ? pwdSecret[0] : undefined);
                if (!secret_id) throw new Error("Could not determine secret_id for secret record.");

                const secretLoad = await callVault(`/secret/${secret_id}`, "GET");
                // secretLoad should be a JSON object with username/password
                // fallback parsing if secretLoad is array/tuple
                let username = secretLoad.username || secretLoad.user || secretLoad.login || extractField(secretLoad, ["username", "user", "login"]);
                let password = secretLoad.password || secretLoad.pw || extractField(secretLoad, ["password", "pw"]);
                if (!username && Array.isArray(secretLoad)) {
                    // guess positions: e.g., [secret_id, item_id, blob_hash, type, username, ...]
                    username = secretLoad[4] || null;
                    password = secretLoad[5] || null;
                }
                if (!username && !password) {
                    // If secret endpoint returns the encrypted blob info rather than content, try /secret/<id>/export or instruct user
                    throw new Error("Secret loaded but username/password not in response. Check vault secret endpoint output: " + JSON.stringify(secretLoad));
                }

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

    return true; // will respond asynchronously
});
