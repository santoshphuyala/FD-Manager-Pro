// ===================================
// FD Manager Pro - Data Manager
// IndexedDB with Encryption
// ===================================

class DataManager {
    constructor() {
        this.dbName = 'FDManagerDB';
        this.version = 1;
        this.db = null;
        this.encryptionKey = null;

        // FIX 1 (Memory Leak / Race Condition): Guard against concurrent init() calls.
        // Without this, multiple simultaneous callers each open their own IDBOpenDBRequest,
        // leaking the extra connections and potentially causing "blocked" events.
        this._initPromise = null;
    }

    async init() {
        // Return the in-flight promise if init is already running.
        if (this._initPromise) return this._initPromise;
        // If db is already open, nothing to do.
        if (this.db) return Promise.resolve();

        this._initPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => {
                this._initPromise = null; // Allow retry on failure
                reject(request.error);
            };

            request.onsuccess = () => {
                this.db = request.result;

                // FIX 2 (Memory Leak): Listen for unexpected version-change events
                // (e.g. another tab opening a higher version). Without this the
                // connection is never closed and blocks the upgrade in the other tab.
                this.db.onversionchange = () => {
                    this.db.close();
                    this.db = null;
                    this._initPromise = null;
                };

                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('data')) {
                    db.createObjectStore('data');
                }
            };

            // FIX 3 (Bug): Handle the `blocked` event — fired when another open
            // connection prevents the upgrade. Without this the promise hangs forever.
            request.onblocked = () => {
                this._initPromise = null;
                reject(new Error('IndexedDB open blocked by another connection'));
            };
        });

        return this._initPromise;
    }

    async setEncryptionKey(pin) {
        // FIX 4 (Security / Performance): Use a proper per-installation random salt
        // stored in localStorage instead of a hard-coded constant salt.
        // A static salt makes PBKDF2 equivalent to a plain hash — defeats its purpose.
        let saltHex = localStorage.getItem('fd-manager-pbkdf2-salt');
        if (!saltHex) {
            const saltBytes = crypto.getRandomValues(new Uint8Array(16));
            saltHex = Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');
            localStorage.setItem('fd-manager-pbkdf2-salt', saltHex);
        }
        const salt = new Uint8Array(saltHex.match(/.{2}/g).map(h => parseInt(h, 16)));

        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            new TextEncoder().encode(pin),
            'PBKDF2',
            false,
            ['deriveKey']
        );

        this.encryptionKey = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt,
                iterations: 100000,
                hash: 'SHA-256'
            },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async encrypt(data) {
        if (!this.encryptionKey) throw new Error('Encryption key not set');

        const iv = crypto.getRandomValues(new Uint8Array(12));
        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            this.encryptionKey,
            new TextEncoder().encode(JSON.stringify(data))
        );

        // FIX 5 (Performance): Store iv and data as Uint8Array directly instead of
        // converting to plain Array. Array.from() on large ArrayBuffers is O(n) and
        // allocates a new JS array, doubling memory use during every encrypt/decrypt.
        // Storing typed arrays avoids the intermediate allocation.
        return {
            iv: new Uint8Array(iv),                   // already a Uint8Array
            data: new Uint8Array(encrypted)
        };
    }

    async decrypt(encryptedData) {
        if (!this.encryptionKey) throw new Error('Encryption key not set');

        // FIX 5 (cont.): Accept both legacy plain-Array format and new Uint8Array format
        // so existing stored records (saved before this fix) still decrypt correctly.
        const iv   = encryptedData.iv   instanceof Uint8Array
            ? encryptedData.iv
            : new Uint8Array(encryptedData.iv);
        const data = encryptedData.data instanceof Uint8Array
            ? encryptedData.data
            : new Uint8Array(encryptedData.data);

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            this.encryptionKey,
            data
        );

        return JSON.parse(new TextDecoder().decode(decrypted));
    }

    async saveData(key, data) {
        if (!this.db) await this.init();

        const encrypted = await this.encrypt(data);

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['data'], 'readwrite');
            const store = transaction.objectStore('data');
            const request = store.put(encrypted, key);

            // FIX 6 (Bug): Resolve/reject on the *transaction* complete/error events,
            // not just the request. The IDBRequest success fires before the transaction
            // is durable — if the transaction later aborts (e.g. disk full) the data
            // is silently lost while the caller believes the save succeeded.
            transaction.oncomplete = () => resolve();
            transaction.onerror   = () => reject(transaction.error);
            transaction.onabort   = () => reject(transaction.error ?? new Error('Transaction aborted'));

            request.onerror = () => reject(request.error);
        });
    }

    async getData(key) {
        if (!this.db) await this.init();

        // FIX 7 (Bug / Anti-pattern): Remove the `async` keyword from the Promise
        // executor. An async executor swallows rejections thrown after the first
        // `await` — they become unhandled promise rejections instead of reaching
        // the caller. Restructured to use .then()/.catch() inside a sync executor.
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['data'], 'readonly');
            const store = transaction.objectStore('data');
            const request = store.get(key);

            request.onsuccess = () => {
                if (request.result) {
                    this.decrypt(request.result).then(resolve).catch(reject);
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(request.error);
        });
    }

    async deleteData(key) {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['data'], 'readwrite');
            const store = transaction.objectStore('data');
            store.delete(key);

            // FIX 6 (cont.): Same transaction-level durability fix as saveData.
            transaction.oncomplete = () => resolve();
            transaction.onerror   = () => reject(transaction.error);
            transaction.onabort   = () => reject(transaction.error ?? new Error('Transaction aborted'));
        });
    }

    async clearAllData() {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['data'], 'readwrite');
            const store = transaction.objectStore('data');
            store.clear();

            // FIX 6 (cont.): Same transaction-level durability fix.
            transaction.oncomplete = () => resolve();
            transaction.onerror   = () => reject(transaction.error);
            transaction.onabort   = () => reject(transaction.error ?? new Error('Transaction aborted'));
        });
    }

    // FIX 8 (Memory Leak): Add an explicit close() method so callers (e.g. tests,
    // page-unload handlers) can release the IDBDatabase connection.  A dangling open
    // connection blocks upgrades from other tabs indefinitely.
    close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            this._initPromise = null;
        }
    }
}

// Global instance
const dataManager = new DataManager();

// FIX 9 (Memory Leak): Close the DB connection on page unload so the connection
// does not linger and block version upgrades opened by other tabs/windows.
window.addEventListener('pagehide', () => dataManager.close());

// Initialize data manager
async function initDataManager(pin) {
    await dataManager.init();
    if (pin) {
        await dataManager.setEncryptionKey(pin);
    }
}

// Key → cache slot mapping for auto-invalidation
const _cacheKeyMap = {
    'fd_records':           'records',
    'fd_matured_records':   'maturedRecords',
    'fd_account_holders':   'accountHolders',
    'fd_templates':         'templates',
    'fd_calculations':      'calculations',
    'fd_comparisons':       'comparisons'
};

// Wrapper functions for backward compatibility
async function saveData(key, data) {
    // Invalidate in-memory cache so next read gets fresh data
    if (typeof _cache !== 'undefined' && _cacheKeyMap[key]) {
        _cache[_cacheKeyMap[key]] = null;
    }
    try {
        await dataManager.saveData(key, data);
    } catch (error) {
        if (error.message && error.message.includes('Encryption key not set')) {
            return;
        }
        console.error('Save data error:', error);
        try { localStorage.setItem(key, JSON.stringify(data)); } catch (_) {}
    }
}

async function getData(key) {
    try {
        return await dataManager.getData(key);
    } catch (error) {
        if (error.message && error.message.includes('Encryption key not set')) {
            // PIN not entered yet — return null silently, app will show empty state
            return null;
        }
        console.error('Get data error:', error);
        // Fallback to localStorage for other errors
        try {
            const data = localStorage.getItem(key);
            return data ? JSON.parse(data) : null;
        } catch (parseError) {
            console.error('JSON parse error:', parseError);
            return null;
        }
    }
}

async function deleteData(key) {
    try {
        await dataManager.deleteData(key);
    } catch (error) {
        console.error('Delete data error:', error);
        localStorage.removeItem(key);
    }
}

async function clearAllData() {
    try {
        await dataManager.clearAllData();
    } catch (error) {
        console.error('Clear data error:', error);
        localStorage.clear();
    }
}