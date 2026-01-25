// ===================================
// FD Manager Pro - Core Module
// ===================================

import { showToast, showLoading, hideLoading } from './utils.js';
import { getData, saveData } from './dataManager.js';

export async function initializeApp() {
    showLoading();
    try {
        await loadAccountHolders();
        await loadFDRecords();
        await loadTemplates();
        await updateDashboard();
        if (typeof updateAnalytics === 'function') updateAnalytics();
        // populateSettings(); // TODO: implement
        // checkExpiringFDs(); // TODO: implement

        // Load certificates if function exists
        if (typeof loadCertificates === 'function') {
            loadCertificates();
        }


export async function initializeEventListeners() {
    // Login form
    const loginPin = document.getElementById('loginPin');
    if (loginPin) {
        loginPin.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                login();
            }
        });
    }

    // Setup form
    const setupPin = document.getElementById('setupPin');
    if (setupPin) {
        setupPin.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                setupPin();
            }
        });
    }

    const confirmPin = document.getElementById('confirmPin');
    if (confirmPin) {
        confirmPin.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                setupPin();
            }
        });
    }

    // Auto-save draft
    setupFormAutoSave();

    // Account holder management
    const addHolderBtn = document.getElementById('addHolderBtn');
    if (addHolderBtn) {
        addHolderBtn.addEventListener('click', addAccountHolder);
    }

    const newHolderInput = document.getElementById('newHolderInput');
    if (newHolderInput) {
        newHolderInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                addAccountHolder();
            }
        });
    }

    // FD Record management
    const addRecordBtn = document.getElementById('addRecordBtn');
    if (addRecordBtn) {
        addRecordBtn.addEventListener('click', showAddRecordModal);
    }

    const saveRecordBtn = document.getElementById('saveRecordBtn');
    if (saveRecordBtn) {
        saveRecordBtn.addEventListener('click', saveFDRecord);
    }

    // Template management
    const saveTemplateBtn = document.getElementById('saveTemplateBtn');
    if (saveTemplateBtn) {
        saveTemplateBtn.addEventListener('click', saveTemplate);
    }

    // Settings
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', saveSettings);
    }

    // Export buttons
    const exportExcelBtn = document.getElementById('exportExcelBtn');
    if (exportExcelBtn) {
        exportExcelBtn.addEventListener('click', exportToExcel);
    }

    const exportPDFBtn = document.getElementById('exportPDFBtn');
    if (exportPDFBtn) {
        exportPDFBtn.addEventListener('click', exportToPDF);
    }

    // Backup buttons
    const backupBtn = document.getElementById('backupBtn');
    if (backupBtn) {
        backupBtn.addEventListener('click', createBackup);
    }

    const restoreBtn = document.getElementById('restoreBtn');
    if (restoreBtn) {
        restoreBtn.addEventListener('click', restoreBackup);
    }

    // Calculator
    const calculateBtn = document.getElementById('calculateBtn');
    if (calculateBtn) {
        calculateBtn.addEventListener('click', performCalculation);
    }

    // OCR
    const ocrBtn = document.getElementById('ocrBtn');
    if (ocrBtn) {
        ocrBtn.addEventListener('click', processOCR);
    }

    // Dashboard filters
    const recordFilter = document.getElementById('recordFilter');
    if (recordFilter) {
        recordFilter.addEventListener('change', function() {
            updateDashboard();
        });
    }

    // Chart type selector
    const chartTypeSelect = document.getElementById('chartTypeSelect');
    if (chartTypeSelect) {
        chartTypeSelect.addEventListener('change', function() {
            currentChartType = this.value;
            updateDashboard();
        });
    }
}

function setupFormAutoSave() {
    const inputs = document.querySelectorAll('#recordForm input, #recordForm select, #recordForm textarea');
    inputs.forEach(input => {
        input.addEventListener('input', function() {
            if (typeof saveDraft === 'function') saveDraft();
        });
    });
}

export async function loadAccountHolders() {
    try {
        const holders = await getData('fd_account_holders') || [];
        updateAccountHoldersList(holders);
        return holders;
    } catch (error) {
        console.error('Load account holders error:', error);
        return [];
    }
}

function updateAccountHoldersList(holders) {
    const select = document.getElementById('accountHolder');
    const list = document.getElementById('accountHoldersList');

    if (select) {
        select.innerHTML = '<option value="">Select Account Holder</option>';
        holders.forEach(holder => {
            const option = document.createElement('option');
            option.value = holder;
            option.textContent = holder;
            select.appendChild(option);
        });
    }

    if (list) {
        list.innerHTML = '';
        holders.forEach(holder => {
            const li = document.createElement('li');
            li.className = 'list-group-item d-flex justify-content-between align-items-center';
            li.innerHTML = `
                ${holder}
                <button class="btn btn-sm btn-danger" onclick="deleteAccountHolder('${holder}')">
                    <i class="bi bi-trash"></i>
                </button>
            `;
            list.appendChild(li);
        });
    }
}

export async function addAccountHolder(event) {
    if (event) event.preventDefault();

    const input = document.getElementById('newHolderInput');
    const name = input?.value?.trim();

    if (!name) {
        showToast('Please enter account holder name', 'warning');
        return;
    }

    try {
        const holders = await getData('fd_account_holders') || [];
        if (holders.includes(name)) {
            showToast('Account holder already exists', 'warning');
            return;
        }

        holders.push(name);
        holders.sort();
        await saveData('fd_account_holders', holders);

        updateAccountHoldersList(holders);
        if (input) input.value = '';
        showToast('Account holder added successfully', 'success');
    } catch (error) {
        console.error('Add account holder error:', error);
        showToast('Error adding account holder', 'error');
    }
}

export async function deleteAccountHolder(name) {
    if (!confirm(`Delete account holder "${name}"? This will not delete associated FD records.`)) {
        return;
    }

    try {
        const holders = await getData('fd_account_holders') || [];
        const filtered = holders.filter(h => h !== name);
        await saveData('fd_account_holders', filtered);

        updateAccountHoldersList(filtered);
        showToast('Account holder deleted', 'success');
    } catch (error) {
        console.error('Delete account holder error:', error);
        showToast('Error deleting account holder', 'error');
    }
}

// Placeholder functions - will be implemented in other modules
async function loadFDRecords() { /* from records module */ }
async function loadTemplates() { /* from templates module */ }
async function updateDashboard() { /* from dashboard module */ }
function showAddRecordModal() { /* from records module */ }
function saveFDRecord() { /* from records module */ }
function saveTemplate() { /* from templates module */ }
function saveSettings() { /* from settings module */ }
function exportToExcel() { /* from export module */ }
function exportToPDF() { /* from export module */ }
function createBackup() { /* from backup module */ }
function restoreBackup() { /* from backup module */ }
function performCalculation() { /* from calculator module */ }
function processOCR() { /* from ocr module */ }