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
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve();
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                // Create object stores
                if (!db.objectStoreNames.contains('data')) {
                    db.createObjectStore('data');
                }
            };
        });
    }

    async setEncryptionKey(pin) {
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
                salt: new TextEncoder().encode('fd-manager-salt'),
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
            { name: 'AES-GCM', iv: iv },
            this.encryptionKey,
            new TextEncoder().encode(JSON.stringify(data))
        );

        return {
            iv: Array.from(iv),
            data: Array.from(new Uint8Array(encrypted))
        };
    }

    async decrypt(encryptedData) {
        if (!this.encryptionKey) throw new Error('Encryption key not set');

        const iv = new Uint8Array(encryptedData.iv);
        const data = new Uint8Array(encryptedData.data);

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
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

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getData(key) {
        if (!this.db) await this.init();

        return new Promise(async (resolve, reject) => {
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
            const request = store.delete(key);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async clearAllData() {
        if (!this.db) await this.init();

        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['data'], 'readwrite');
            const store = transaction.objectStore('data');
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
}

// Global instance
const dataManager = new DataManager();

// Initialize data manager
async function initDataManager(pin) {
    await dataManager.init();
    if (pin) {
        await dataManager.setEncryptionKey(pin);
    }
}

// Wrapper functions for backward compatibility
async function saveData(key, data) {
    try {
        await dataManager.saveData(key, data);
    } catch (error) {
        console.error('Save data error:', error);
        // Fallback to localStorage if IndexedDB fails
        localStorage.setItem(key, JSON.stringify(data));
    }
}

async function getData(key) {
    try {
        return await dataManager.getData(key);
    } catch (error) {
        console.error('Get data error:', error);
        // Fallback to localStorage
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : null;
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