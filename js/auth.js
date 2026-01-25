// ===================================
// FD Manager Pro - Authentication Module
// ===================================

import { showToast, isValidPIN, setPinHash, setCurrentEditId } from './utils.js';
import { initDataManager, saveData, clearAllData } from './dataManager.js';

export function checkLogin() {
    const savedPin = localStorage.getItem('fd_pin');

    const loginForm = document.getElementById('loginForm');
    const setupForm = document.getElementById('setupForm');
    const loginScreen = document.getElementById('loginScreen');
    const mainApp = document.getElementById('mainApp');

    if (!savedPin) {
        if (loginForm) loginForm.style.display = 'none';
        if (setupForm) setupForm.style.display = 'block';
    } else {
        if (loginForm) loginForm.style.display = 'block';
        if (setupForm) setupForm.style.display = 'none';
    }

    if (loginScreen) loginScreen.style.display = 'flex';
    if (mainApp) mainApp.style.display = 'none';
}

export async function setupPin() {
    const pinInput = document.getElementById('setupPin');
    const confirmInput = document.getElementById('confirmPin');

    const pin = pinInput?.value || '';
    const confirmPin = confirmInput?.value || '';

    if (!isValidPIN(pin)) {
        showToast('PIN must be exactly 4 digits', 'error');
        return;
    }

    if (pin !== confirmPin) {
        showToast('PINs do not match', 'error');
        return;
    }

    const hash = CryptoJS.SHA256(pin).toString();
    localStorage.setItem('fd_pin', hash);
    setPinHash(hash);

    // Initialize data manager with PIN
    await initDataManager(pin);

    showToast('PIN created successfully!', 'success');

    // Initialize empty data
    await saveData('fd_account_holders', []);
    await saveData('fd_records', []);
    await saveData('fd_templates', []);
    await saveData('fd_comparisons', []);
    await saveData('fd_calculations', []);

    setTimeout(() => {
        const loginScreen = document.getElementById('loginScreen');
        const mainApp = document.getElementById('mainApp');

        if (loginScreen) loginScreen.style.display = 'none';
        if (mainApp) mainApp.style.display = 'block';

        // Note: initializeApp will be called from main app.js
    }, 500);
}

export async function login() {
    const pinInput = document.getElementById('loginPin');
    const pin = pinInput?.value || '';

    if (!isValidPIN(pin)) {
        showToast('Invalid PIN format', 'error');
        return;
    }

    const hash = CryptoJS.SHA256(pin).toString();
    const savedHash = localStorage.getItem('fd_pin');

    if (hash !== savedHash) {
        showToast('Incorrect PIN', 'error');
        if (pinInput) pinInput.value = '';
        return;
    }

    setPinHash(hash);

    // Initialize data manager with PIN
    await initDataManager(pin);

    const loginScreen = document.getElementById('loginScreen');
    const mainApp = document.getElementById('mainApp');

    if (loginScreen) loginScreen.style.display = 'none';
    if (mainApp) mainApp.style.display = 'block';

    // Note: initializeApp will be called from main app.js
}

export function logout() {
    if (confirm('Are you sure you want to logout?')) {
        setPinHash('');
        setCurrentEditId(null);

        const loginPin = document.getElementById('loginPin');
        if (loginPin) loginPin.value = '';

        checkLogin();
        showToast('Logged out successfully', 'info');
    }
}

export async function showResetConfirm() {
    const confirmation = prompt('⚠️ WARNING: This will delete ALL data!\n\nType "RESET" to confirm:');

    if (confirmation === 'RESET') {
        localStorage.clear(); // Clear PIN
        await clearAllData(); // Clear encrypted data
        showToast('All data cleared. Please set up new PIN.', 'success');
        setTimeout(() => {
            location.reload();
        }, 1000);
    } else {
        showToast('Reset cancelled', 'info');
    }
}