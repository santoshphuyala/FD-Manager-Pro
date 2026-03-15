// ===================================
// FD Manager Pro - Main Application
// Part 1: Core & Authentication
// Nepal Edition - Version 4.0 (Corrected)
// ===================================

// Global variables for pagination
let currentPage = 1;
// Dynamic records per page (default 10, stored in localStorage)
let recordsPerPage = parseInt(localStorage.getItem('recordsPerPage')) || 10;

// ===================================
// In-Memory Cache
// Avoids repeated IndexedDB decrypt calls on every render/search/sort.
// Invalidated whenever records are saved/deleted/moved.
// ===================================
const _cache = {
    records: null,
    maturedRecords: null,
    accountHolders: null,
    templates: null,
    calculations: null,
    comparisons: null,

    invalidate(key) {
        if (key) { this[key] = null; }
        else { this.records = null; this.maturedRecords = null;
               this.accountHolders = null; this.templates = null;
               this.calculations = null; this.comparisons = null; }
    }
};

async function getCachedData(key, storeKey) {
    if (_cache[key] !== null && _cache[key] !== undefined) return _cache[key];
    const data = (await getData(storeKey)) || [];
    _cache[key] = Array.isArray(data) ? data : [];
    return _cache[key];
}

async function setCachedData(key, storeKey, data) {
    _cache[key] = data;
    await saveData(storeKey, data);
}

// ===================================
// Initialization
// ===================================

document.addEventListener('DOMContentLoaded', async function() {
    checkLogin();
    loadSettings();
    await initializeEventListeners();
});

// ===================================
// Settings
// ===================================

function loadSettings() {
    // Load currency symbol from localStorage
    const savedCurrency = localStorage.getItem('fd_currency_symbol');
    if (savedCurrency) {
        currencySymbol = savedCurrency;
    }
    // Other settings can be loaded here
}

// ===================================
// Login & Authentication
// ===================================

function checkLogin() {
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

async function setupPin() {
    const pinInput = document.getElementById('setupPin');
    const confirmInput = document.getElementById('confirmPin');
    
    const pin = pinInput?.value || '';
    const confirmPin = confirmInput?.value || '';
    
    if (!isValidPIN(pin)) {
        showToast('PIN must be exactly 4 digits', 'error');
        // FIX (Security): Never log PIN values — removed console.error with pin/confirmPin
        return;
    }
    
    if (pin !== confirmPin) {
        showToast('PINs do not match', 'error');
        // FIX (Security): Never log PIN values — removed console.error with pin/confirmPin
        return;
    }
    
    // FIX (Security): Removed console.log('PIN validation passed:', { pin, confirmPin })
    // Plaintext PINs must never appear in browser console logs.
    const hash = CryptoJS.SHA256(pin).toString();
    localStorage.setItem('fd_pin', hash);
    pinHash = hash;
    
    // Initialize data manager with PIN
    await initDataManager(pin);
    
    showToast('PIN created successfully!', 'success');
    
    // Initialize empty data
    await saveData('fd_account_holders', []);
    await saveData('fd_records', []);
    await saveData('fd_matured_records', []);
    await saveData('fd_templates', []);
    await saveData('fd_comparisons', []);
    await saveData('fd_calculations', []);
    
    setTimeout(() => {
        const loginScreen = document.getElementById('loginScreen');
        const mainApp = document.getElementById('mainApp');
        
        if (loginScreen) loginScreen.style.display = 'none';
        if (mainApp) mainApp.style.display = 'block';
        
        initializeApp();
    }, 500);
}

async function login() {
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
    
    pinHash = hash;
    
    // Initialize data manager with PIN
    await initDataManager(pin);
    
    const loginScreen = document.getElementById('loginScreen');
    const mainApp = document.getElementById('mainApp');
    
    if (loginScreen) loginScreen.style.display = 'none';
    if (mainApp) mainApp.style.display = 'block';
    
    initializeApp();
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        pinHash = '';
        currentEditId = null;
        
        // FIX: Invalidate the in-memory cache on logout. Without this, decrypted
        // record data from the previous session remains in _cache and is readable
        // by anyone who gains access to the JS console after logout.
        if (typeof _cache !== 'undefined') _cache.invalidate();

        // FIX: Close the IndexedDB connection so the encryption key is released
        // and cannot be reused without re-entering the PIN.
        if (typeof dataManager !== 'undefined') dataManager.close();
        
        const loginPin = document.getElementById('loginPin');
        if (loginPin) loginPin.value = '';
        
        checkLogin();
        showToast('Logged out successfully', 'info');
    }
}

async function showResetConfirm() {
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

// ===================================
// App Initialization
// ===================================

async function initializeApp() {
    // Safety guard: never run without an active PIN/encryption key
    if (!pinHash) {
        console.warn('[FD Manager] initializeApp() called before PIN was set — aborting.');
        return;
    }
    showLoading();
    try {
        // Load independent data sources in parallel for faster startup
        await Promise.all([
            loadAccountHolders(),
            loadFDRecords(),
            loadMaturedFDRecords(),
            loadTemplates()
        ]);

        // Dashboard and analytics depend on records being loaded first
        await Promise.all([
            updateDashboard(),
            (typeof updateAnalytics === 'function' ? updateAnalytics() : Promise.resolve()),
            loadAccountHoldersForCalc(),
            (typeof loadCertificates === 'function' ? loadCertificates() : Promise.resolve())
        ]);

        populateSettings();
        checkExpiringFDs();

        showToast('Welcome to FD Manager Pro - Nepal Edition!', 'success');
    } catch (error) {
        console.error('App initialization error:', error);
        showToast('Error loading data. Please refresh.', 'error');
    } finally {
        hideLoading();
    }
}

async function initializeEventListeners() {
    // Login form keyboard navigation
    const loginPin = document.getElementById('loginPin');
    if (loginPin) {
        loginPin.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') login();
        });
    }
    
    const setupPin = document.getElementById('setupPin');
    if (setupPin) {
        setupPin.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                const confirmPin = document.getElementById('confirmPin');
                if (confirmPin) confirmPin.focus();
            }
        });
    }
    
    const confirmPin = document.getElementById('confirmPin');
    if (confirmPin) {
        confirmPin.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') window.setupPin();
        });
    }
    
    // Bank autocomplete
    await setupBankAutocomplete();
    
    // Search with debounce
    const searchInput = document.getElementById('searchRecords');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(filterRecords, 300));
    }
    
    // Form auto-save
    setupFormAutoSave();
}

/**
 * Setup form auto-save listeners
 */
function setupFormAutoSave() {
    const formFields = [
        'fdAccountHolder', 'fdBank', 'fdAmount', 'fdDuration',
        'fdDurationUnit', 'fdRate', 'fdStartDate', 'fdCertStatus',
        'fdNumber', 'fdNotes'
    ];
    
    formFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('change', () => {
                if (typeof saveDraft === 'function') saveDraft();
            });
            field.addEventListener('input', debounce(() => {
                if (typeof saveDraft === 'function') saveDraft();
            }, 500));
        }
    });
}

// ===================================
// Account Holder Management
// ===================================

async function loadAccountHolders() {
    let holders = await getCachedData('accountHolders', 'fd_account_holders');

    // Clean up invalid entries — only write back if something changed
    const cleaned = cleanupAccountHolders(holders);
    if (cleaned.length !== holders.length && pinHash) {
        await setCachedData('accountHolders', 'fd_account_holders', cleaned);
        holders = cleaned;
    } else {
        holders = cleaned;
    }
    
    const dropdowns = [
        'fdAccountHolder',
        'dashboardHolderFilter',
        'ocrAccountHolder'
    ];
    
    dropdowns.forEach(id => {
        const select = document.getElementById(id);
        if (select) {
            const currentValue = select.value;
            select.innerHTML = id === 'dashboardHolderFilter' ? 
                '<option value="">All Account Holders</option>' :
                '<option value="">Select Account Holder</option>';
            
            // Filter enabled account holders and handle both string/object formats
            const enabledHolders = holders.filter(holder => {
                if (typeof holder === 'object') {
                    return holder.enabled !== false;
                }
                return true; // Default to enabled for old string format
            });
            
            enabledHolders.forEach(holder => {
                const holderName = typeof holder === 'object' ? holder.name : holder;
                // Skip invalid entries
                if (!holderName || holderName === '[object Object]' || typeof holderName !== 'string') {
                    return;
                }
                const option = document.createElement('option');
                option.value = holderName;
                option.textContent = holderName;
                select.appendChild(option);
            });
            
            // Restore previous selection if valid and enabled
            const isValidSelection = currentValue && enabledHolders.some(h => {
                const holderName = typeof h === 'object' ? h.name : h;
                return holderName === currentValue;
            });
            if (isValidSelection) {
                select.value = currentValue;
            }
        }
    });
    
    updateAccountHoldersList(holders);
}

/**
 * Clean up invalid account holder entries
 * @param {Array} holders - Array of account holders
 * @returns {Array} - Cleaned array
 */
function cleanupAccountHolders(holders) {
    if (!Array.isArray(holders)) return [];
    
    return holders.filter(holder => {
        if (typeof holder === 'object') {
            // Check if object has a valid name
            return holder.name && 
                   holder.name !== '[object Object]' && 
                   typeof holder.name === 'string' &&
                   holder.name.trim() !== '';
        } else if (typeof holder === 'string') {
            // Check if string is valid
            return holder !== '[object Object]' && 
                   holder.trim() !== '';
        }
        return false;
    });
}

/**
 * Manual cleanup function to fix corrupted account holder data
 */
async function cleanupAccountHolderData() {
    try {
        const holders = (await getCachedData('accountHolders', 'fd_account_holders')) || [];
        const cleanedHolders = cleanupAccountHolders(holders);
        
        if (cleanedHolders.length !== holders.length) {
            await saveData('fd_account_holders', cleanedHolders);
            loadAccountHolders();
            showToast(`Cleaned up ${holders.length - cleanedHolders.length} invalid account holder entries`, 'success');
        } else {
            showToast('No invalid account holder entries found', 'info');
        }
    } catch (error) {
        console.error('Cleanup error:', error);
        showToast('Error cleaning up account holder data', 'error');
    }
}

function updateAccountHoldersList(holders) {
    const container = document.getElementById('accountHoldersList');
    if (!container) return;
    
    if (!holders || holders.length === 0) {
        container.innerHTML = '<p class="text-muted">No account holders added yet</p>';
        return;
    }
    
    // Clear container and build safely
    container.innerHTML = '';
    
    holders.forEach((holder, index) => {
        // Handle both string and object formats
        let holderName, isEnabled;
        
        if (typeof holder === 'object') {
            holderName = holder.name || holder.toString();
            isEnabled = holder.enabled !== false;
        } else {
            holderName = holder;
            isEnabled = true;
        }
        
        // Skip invalid entries
        if (!holderName || holderName === '[object Object]' || typeof holderName !== 'string') {
            console.warn('Invalid account holder entry:', holder);
            return;
        }
        
        const div = document.createElement('div');
        div.className = 'account-holder-item';
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.justifyContent = 'space-between';
        div.style.padding = '8px';
        div.style.border = '1px solid #dee2e6';
        div.style.borderRadius = '4px';
        div.style.marginBottom = '8px';
        
        // Left section: Name and status
        const leftSection = document.createElement('div');
        leftSection.style.display = 'flex';
        leftSection.style.alignItems = 'center';
        leftSection.style.gap = '10px';
        
        // Status indicator
        const statusIndicator = document.createElement('div');
        statusIndicator.style.width = '8px';
        statusIndicator.style.height = '8px';
        statusIndicator.style.borderRadius = '50%';
        statusIndicator.style.backgroundColor = isEnabled ? '#28a745' : '#dc3545';
        statusIndicator.title = isEnabled ? 'Enabled' : 'Disabled';
        
        // Name span
        const span = document.createElement('span');
        span.style.color = isEnabled ? '#000' : '#6c757d';
        span.style.textDecoration = isEnabled ? 'none' : 'line-through';
        span.innerHTML = `<i class="bi bi-person-fill"></i> ${holderName}`;
        
        leftSection.appendChild(statusIndicator);
        leftSection.appendChild(span);
        
        // Right section: Buttons
        const rightSection = document.createElement('div');
        rightSection.style.display = 'flex';
        rightSection.style.gap = '5px';
        
        // Toggle enable/disable button
        const toggleBtn = document.createElement('button');
        toggleBtn.className = `btn btn-sm ${isEnabled ? 'btn-outline-warning' : 'btn-outline-success'}`;
        toggleBtn.innerHTML = isEnabled ? '<i class="bi bi-pause"></i>' : '<i class="bi bi-play"></i>';
        toggleBtn.title = isEnabled ? 'Disable Account Holder' : 'Enable Account Holder';
        toggleBtn.onclick = () => toggleAccountHolder(holderName, !isEnabled);
        
        // Delete button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'btn btn-sm btn-outline-danger';
        deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
        deleteBtn.title = 'Delete Account Holder';
        deleteBtn.onclick = () => deleteAccountHolder(holderName);
        
        rightSection.appendChild(toggleBtn);
        rightSection.appendChild(deleteBtn);
        
        div.appendChild(leftSection);
        div.appendChild(rightSection);
        container.appendChild(div);
    });
}

async function addAccountHolder(event) {
    if (event) event.preventDefault();
    
    const input = document.getElementById('newAccountHolder');
    const name = input?.value?.trim();
    
    if (!name) {
        showToast('Please enter a name', 'error');
        return;
    }
    
    let holders = (await getCachedData('accountHolders', 'fd_account_holders')) || [];
    
    // Convert old string format to object format if needed
    if (holders.length > 0 && typeof holders[0] === 'string') {
        holders = holders.map(h => ({ name: h, enabled: true }));
    }
    
    // Case-insensitive duplicate check
    if (holders.some(h => h.name.toLowerCase() === name.toLowerCase())) {
        showToast('Account holder already exists', 'error');
        return;
    }
    
    // Add as object with enabled status
    holders.push({ name: name, enabled: true });
    await saveData('fd_account_holders', holders);
    
    loadAccountHolders();
    await loadAccountHoldersForCalc(); // Refresh calculator dropdown
    if (input) input.value = '';
    
    showToast(`Account holder "${name}" added successfully`, 'success');
}

async function deleteAccountHolder(name) {
    // Validate input
    if (!name || name === '[object Object]' || typeof name !== 'string') {
        showToast('Invalid account holder name', 'error');
        return;
    }
    
    if (!confirm(`Delete account holder "${name}"?\n\nThis will also delete all associated FD records.`)) {
        return;
    }
    
    let holders = (await getCachedData('accountHolders', 'fd_account_holders')) || [];
    
    // Clean up holders first
    holders = cleanupAccountHolders(holders);
    
    // Handle both string and object formats
    if (holders.length > 0 && typeof holders[0] === 'object') {
        holders = holders.filter(h => h.name !== name);
    } else {
        holders = holders.filter(h => h !== name);
    }
    
    await saveData('fd_account_holders', holders);
    
    let records = (await getCachedData('records', 'fd_records')) || [];
    const deletedCount = records.filter(r => r.accountHolder === name).length;
    records = records.filter(r => r.accountHolder !== name);
    await saveData('fd_records', records);
    
    // Also delete from matured records
    let maturedRecords = (await getCachedData('maturedRecords', 'fd_matured_records')) || [];
    const deletedMaturedCount = maturedRecords.filter(r => r.accountHolder === name).length;
    maturedRecords = maturedRecords.filter(r => r.accountHolder !== name);
    await saveData('fd_matured_records', maturedRecords);
    
    loadAccountHolders();
    await loadAccountHoldersForCalc(); // Refresh calculator dropdown
    loadFDRecords();
    await loadMaturedFDRecords(); // Refresh matured records
    updateDashboard();
    
    const totalDeleted = deletedCount + deletedMaturedCount;
    showToast(`Account holder "${name}" deleted (${totalDeleted} records removed: ${deletedCount} active, ${deletedMaturedCount} matured)`, 'success');
}

async function toggleAccountHolder(name, enabled) {
    let holders = (await getCachedData('accountHolders', 'fd_account_holders')) || [];
    
    // Handle both string and object formats
    if (holders.length > 0 && typeof holders[0] === 'object') {
        const holder = holders.find(h => h.name === name);
        if (holder) {
            holder.enabled = enabled;
        }
    } else {
        // Convert to object format
        holders = holders.map(h => {
            if (h === name) {
                return { name: h, enabled: enabled };
            }
            return { name: h, enabled: true };
        });
    }
    
    await saveData('fd_account_holders', holders);
    
    // Refresh all UI components to reflect the change
    loadAccountHolders();
    await loadAccountHoldersForCalc(); // Refresh calculator dropdown
    loadFDRecords();
    await loadMaturedFDRecords(); // Refresh matured records
    await updateDashboard();
    if (typeof updateAnalytics === 'function') await updateAnalytics();
    
    showToast(`Account holder "${name}" ${enabled ? 'enabled' : 'disabled'}`, 'success');
}

// ===================================
// Helper Functions for Account Holder Status
// ===================================

/**
 * Get enabled account holders only
 * @returns {Array} - Array of enabled account holder names
 */
async function getEnabledAccountHolders() {
    const holders = (await getCachedData('accountHolders', 'fd_account_holders')) || [];
    return holders
        .filter(holder => {
            if (typeof holder === 'object') {
                return holder.enabled !== false;
            }
            return true; // Default to enabled for old string format
        })
        .map(holder => typeof holder === 'object' ? holder.name : holder);
}

/**
 * Check if an account holder is enabled
 * @param {string} holderName - Name of the account holder
 * @returns {boolean} - True if enabled, false if disabled
 */
async function isAccountHolderEnabled(holderName) {
    const holders = (await getCachedData('accountHolders', 'fd_account_holders')) || [];
    const holder = holders.find(h => {
        const name = typeof h === 'object' ? h.name : h;
        return name === holderName;
    });
    
    if (!holder) return true; // Default to enabled if not found
    if (typeof holder === 'object') {
        return holder.enabled !== false;
    }
    return true; // Default to enabled for old string format
}

// ===================================
// FD Records Management
// ===================================

async function loadFDRecords() {
    // First check for any matured FDs and move them
    await checkAndMoveMaturedFDs();

    const records = await getCachedData('records', 'fd_records');

    // Filter out records for disabled account holders (single-pass, no N decrypts)
    const enabledRecords = await filterRecordsByAccountHolderStatus(records);
    
    // Update the page size selector to reflect current setting
    const selector = document.getElementById('recordsPerPageSelect');
    if (selector) {
        selector.value = recordsPerPage;
    }
    
    displayFDRecords(enabledRecords, 1);
}

/**
 * Filter FD records based on account holder enabled status.
 * Fetches holders ONCE and uses a Set for O(1) lookup — previously called
 * getData (full decrypt) once per record, which was the main perf bottleneck.
 */
async function filterRecordsByAccountHolderStatus(records) {
    const holders = await getCachedData('accountHolders', 'fd_account_holders');

    // Build a set of disabled holder names for fast O(1) lookup
    const disabledNames = new Set(
        holders
            .filter(h => typeof h === 'object' && h.enabled === false)
            .map(h => h.name)
    );

    // If no one is disabled, skip filtering entirely
    if (disabledNames.size === 0) return records;

    return records.filter(r => !disabledNames.has(r.accountHolder));
}

function displayFDRecords(records, page = 1) {
    currentPage = page;
    const tbody = document.getElementById('recordsTableBody');
    if (!tbody) return;
    
    if (!records || records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="13" class="text-center text-muted">No records found</td></tr>';
        document.getElementById('recordsPagination').innerHTML = '';
        return;
    }
    
    records = applyRecordFilters(records);
    
    if (records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="13" class="text-center text-muted">No matching records found</td></tr>';
        document.getElementById('recordsPagination').innerHTML = '';
        return;
    }
    
    // Pagination
    const totalPages = Math.ceil(records.length / recordsPerPage);
    const startIndex = (page - 1) * recordsPerPage;
    const endIndex = startIndex + recordsPerPage;
    const paginatedRecords = records.slice(startIndex, endIndex);
    
    tbody.innerHTML = paginatedRecords.map(record => {
        const maturityDate = record.maturityDate || calculateMaturityDate(
            record.startDate, record.duration, record.durationUnit
        );
        
        const daysRemaining = calculateDaysRemaining(maturityDate);
        const status = getRecordStatus(daysRemaining);
        const interest = calculateInterestForRecord(record);
        const displayDays = daysRemaining !== null && daysRemaining > 0 ? daysRemaining : '0';

        // Earned To-Date
        const earned = calculateEarnedToDate(record);
        const earnedPct = interest > 0 ? Math.min(100, Math.round((earned / interest) * 100)) : 0;
        const isMatured = daysRemaining <= 0;

        // Earned cell HTML
        let earnedCell;
        if (isMatured) {
            earnedCell = `<span class="earned-badge" title="Fully matured">${formatCurrency(interest)} <i class="bi bi-check-circle-fill text-success"></i></span>`;
        } else {
            earnedCell = `
                <span class="earned-badge" title="${earnedPct}% of expected interest earned so far">${formatCurrency(earned)}</span>
                <span class="earned-progress"><span class="earned-progress-bar" style="width:${earnedPct}%"></span></span>`;
        }
        
        // Escape all user-provided data
        const safeId = escapeHtml(record.id);
        const safeHolder = escapeHtml(record.accountHolder);
        const safeBank = escapeHtml(record.bank);
        const safeUnit = escapeHtml(record.durationUnit);
        
        return `
            <tr>
                <td><input type="checkbox" class="record-checkbox" value="${safeId}" onchange="updateSelectAllState()"></td>
                <td>${safeHolder}</td>
                <td>${safeBank}</td>
                <td>${formatCurrency(record.amount)}</td>
                <td>${record.duration} ${safeUnit}</td>
                <td>${record.rate}%</td>
                <td>${formatDate(record.startDate)}</td>
                <td>${formatDate(maturityDate)}</td>
                <td>${displayDays}</td>
                <td>${formatCurrency(interest)}</td>
                <td>${earnedCell}</td>
                <td><span class="${getStatusBadgeClass(status)}">${status}</span></td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editFD('${safeId}')" title="Edit">
                        <i class="bi bi-pencil-fill"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteFD('${safeId}')" title="Delete">
                        <i class="bi bi-trash-fill"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    // Render pagination
    renderPagination(totalPages, page);
}

function renderPagination(totalPages, currentPage) {
    const paginationEl = document.getElementById('recordsPagination');
    if (totalPages <= 1) {
        paginationEl.innerHTML = '';
        return;
    }
    
    let paginationHtml = '<nav><ul class="pagination">';
    
    // Previous button
    paginationHtml += `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
        <a class="page-link" href="#" onclick="changePage(${currentPage - 1})">Previous</a>
    </li>`;
    
    // Page numbers
    for (let i = 1; i <= totalPages; i++) {
        if (i === currentPage) {
            paginationHtml += `<li class="page-item active"><span class="page-link">${i}</span></li>`;
        } else {
            paginationHtml += `<li class="page-item"><a class="page-link" href="#" onclick="changePage(${i})">${i}</a></li>`;
        }
    }
    
    // Next button
    paginationHtml += `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
        <a class="page-link" href="#" onclick="changePage(${currentPage + 1})">Next</a>
    </li>`;
    
    paginationHtml += '</ul></nav>';
    paginationEl.innerHTML = paginationHtml;
}

async function changePage(page) {
    const records = (await getCachedData('records', 'fd_records')) || [];
    displayFDRecords(records, page);
}

function changeRecordsPerPage(newSize) {
    recordsPerPage = parseInt(newSize);
    localStorage.setItem('recordsPerPage', recordsPerPage);
    currentPage = 1; // Reset to first page when changing page size
    loadFDRecords(); // Reload with new page size
}

function applyRecordFilters(records) {
    if (!records) return [];
    
    // Apply search filter
    const searchQuery = document.getElementById('searchRecords')?.value;
    if (searchQuery) {
        records = searchRecords(records, searchQuery);
    }
    
    // Apply status filter
    if (recordFilter !== 'all') {
        records = records.filter(record => {
            const maturityDate = record.maturityDate || calculateMaturityDate(
                record.startDate, record.duration, record.durationUnit
            );
            const daysRemaining = calculateDaysRemaining(maturityDate);
            const status = getRecordStatus(daysRemaining);
            
            switch (recordFilter) {
                case 'active':
                    return status === 'Active';
                case 'expiring':
                    return status === 'Expiring Soon';
                default:
                    return true;
            }
        });
    }
    
    // Apply account holder enabled filter (async filtering handled in loadFDRecords)
    // This ensures disabled account holders are never shown
    
    return records;
}

function setRecordFilter(filter, event) {
    recordFilter = filter;
    
    // Update button states
    document.querySelectorAll('.btn-group button').forEach(btn => {
        btn.classList.remove('active');
    });
    
    if (event && event.target) {
        event.target.classList.add('active');
    }
    
    loadFDRecords();
}

// ===================================
// AI-Powered Natural Language Search
// ===================================

let searchTimeout;
let currentSearchResults = [];

async function performSmartSearch() {
    const query = document.getElementById('searchRecords').value;
    const searchHint = document.getElementById('searchHint');
    
    // Clear previous timeout
    if (searchTimeout) clearTimeout(searchTimeout);
    
    if (!query || query.length < 2) {
        // Reset to normal filtering
        filterRecords();
        searchHint.textContent = 'Try: "highest amount", "nibl bank", "maturing next week"';
        return;
    }
    
    // Check if it's a natural language query
    const isNaturalLanguage = /^(show|find|search|list|get|what|which)/i.test(query) || 
                              /(\b(next|this|last)\s+(week|month|year)|maturing|expiring|highest|lowest|top|first|amount|rate|bank|holder)/i.test(query);
    
    if (isNaturalLanguage && typeof aiFeatures !== 'undefined') {
        searchTimeout = setTimeout(async () => {
            try {
                searchHint.textContent = '🤖 AI is searching...';
                const results = await aiFeatures.naturalLanguageSearch(query);
                displaySmartSearchResults(results);
                searchHint.textContent = `Found ${results.totalCount} results • ${results.suggestions[0] || ''}`;
            } catch (error) {
                console.error('Smart search failed:', error);
                // Fallback to traditional search
                filterRecords();
                searchHint.textContent = 'Using traditional search (AI unavailable)';
            }
        }, 500);
    } else {
        // Use traditional search
        filterRecords();
        searchHint.textContent = 'Traditional search • Try natural language for better results';
    }
}

function displaySmartSearchResults(searchResults) {
    currentSearchResults = searchResults.results;
    
    // Update the records table with search results
    const tbody = document.getElementById('recordsTableBody');
    if (!tbody) return;
    
    if (searchResults.results.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="11" class="text-center text-muted">
                    <div class="py-3">
                        <i class="bi bi-search" style="font-size: 2rem;"></i>
                        <p class="mb-1">No results found for "${searchResults.query}"</p>
                        <small>${searchResults.suggestions.join(' • ')}</small>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    // Display results using existing displayRecords function
    displayRecords(searchResults.results);
    
    // Show search summary
    const searchInfo = document.createElement('div');
    searchInfo.className = 'alert alert-info alert-sm mb-3';
    searchInfo.innerHTML = `
        <strong>🤖 AI Search Results:</strong> 
        Found ${searchResults.totalCount} FDs for "${searchResults.query}"
        ${searchResults.parsed.sort ? ` • Sorted by ${searchResults.parsed.sort.field} ${searchResults.parsed.sort.order}` : ''}
        <button class="btn-close float-end" onclick="this.parentElement.remove()"></button>
    `;
    
    // Remove previous search info
    const existingInfo = document.querySelector('.alert-info');
    if (existingInfo) existingInfo.remove();
    
    // Insert search info before the table
    const table = document.querySelector('#recordsTableBody').closest('.card');
    if (table) {
        table.insertBefore(searchInfo, table.querySelector('.table-responsive'));
    }
}

function showSearchHelp() {
    const helpModal = new bootstrap.Modal(document.getElementById('searchHelpModal'));
    helpModal.show();
}

function tryExampleSearch() {
    // Close the help modal
    const helpModal = bootstrap.Modal.getInstance(document.getElementById('searchHelpModal'));
    helpModal.hide();
    
    // Switch to records tab
    switchTab('records');
    
    // Set example search and trigger it
    const searchInput = document.getElementById('searchRecords');
    searchInput.value = 'highest amount FDs';
    performSmartSearch();
    
    showToast('Try this example search: "highest amount FDs"', 'info');
}

function clearSmartSearch() {
    document.getElementById('searchRecords').value = '';
    document.getElementById('searchHint').textContent = 'Try: "highest amount", "nibl bank", "maturing next week"';
    currentSearchResults = [];
    filterRecords(); // Reset to normal view
    
    // Remove search info
    const existingInfo = document.querySelector('.alert-info');
    if (existingInfo) existingInfo.remove();
}

// Enhanced filterRecords to work with smart search
function filterRecords() {
    const query = document.getElementById('searchRecords').value.toLowerCase();
    const filter = recordFilter || 'all';
    
    // If we have smart search results, use them
    if (currentSearchResults.length > 0 && query.length > 2) {
        displayRecords(currentSearchResults);
        return;
    }
    
    // Traditional filtering
    let records = allRecords || [];
    
    // Apply status filter
    if (filter !== 'all') {
        records = records.filter(record => {
            const daysRemaining = calculateDaysRemaining(record.maturityDate);
            if (filter === 'active') return daysRemaining > 30;
            if (filter === 'expiring') return daysRemaining > 0 && daysRemaining <= 30;
            return true;
        });
    }
    
    // Apply search filter
    if (query) {
        records = records.filter(record => {
            return record.accountHolder?.toLowerCase().includes(query) ||
                   record.bank?.toLowerCase().includes(query) ||
                   record.notes?.toLowerCase().includes(query) ||
                   record.amount?.toString().includes(query) ||
                   record.rate?.toString().includes(query);
        });
    }
    
    displayRecords(records);
}

/**
 * Save FD record (handles both add and edit) with AI validation
 */
async function saveFD(event) {
    if (event) event.preventDefault();
    
    // Get form values
    const accountHolder = document.getElementById('fdAccountHolder')?.value;
    const bank = document.getElementById('fdBank')?.value;
    const amount = parseFloat(document.getElementById('fdAmount')?.value);
    const duration = parseInt(document.getElementById('fdDuration')?.value);
    const durationUnit = document.getElementById('fdDurationUnit')?.value || 'Months';
    const rate = parseFloat(document.getElementById('fdRate')?.value);
    const startDate = document.getElementById('fdStartDate')?.value;
    const certStatus = document.getElementById('fdCertStatus')?.value || 'Not Obtained';
    const fdNumber = document.getElementById('fdNumber')?.value || '';
    const notes = document.getElementById('fdNotes')?.value || '';
    
    // Traditional validation first
    if (!isValidAccountHolder(accountHolder)) {
        showToast('Please select a valid account holder', 'error');
        return;
    }
    
    if (!isValidBank(bank)) {
        showToast('Please enter a valid bank name', 'error');
        return;
    }
    
    if (!isValidAmount(amount)) {
        showToast('Please enter a valid amount (greater than 0)', 'error');
        return;
    }
    
    if (!isValidDuration(duration)) {
        showToast('Please enter a valid duration (1-999)', 'error');
        return;
    }
    
    if (!isValidRate(rate)) {
        showToast('Please enter a valid interest rate (0-100)', 'error');
        return;
    }
    
    if (!isValidDate(startDate)) {
        showToast('Please enter a valid start date', 'error');
        return;
    }
    
    // AI-powered validation and insights
    if (typeof aiFeatures !== 'undefined') {
        try {
            const formData = {
                accountHolder, bank, amount, duration, durationUnit, rate, startDate,
                maturityDate: calculateMaturityDate(startDate, duration, durationUnit)
            };
            
            const aiValidation = await aiFeatures.validateFDInput(formData);
            
            // Show AI warnings and suggestions
            if (aiValidation.warnings.length > 0) {
                const warningMessage = aiValidation.warnings.join('\n• ');
                const proceed = confirm(`⚠️ AI Validation Warnings:\n• ${warningMessage}\n\nProceed anyway?`);
                if (!proceed) return;
            }
            
            if (aiValidation.suggestions.length > 0) {
                const suggestionMessage = aiValidation.suggestions.join('\n• ');
                showSmartSuggestion(`💡 AI Suggestions:\n• ${suggestionMessage}`);
            }
            
            // Learn from user patterns
            aiFeatures.userPatterns.typicalAmounts = aiFeatures.userPatterns.typicalAmounts || [];
            aiFeatures.userPatterns.typicalAmounts.push(amount);
            if (aiFeatures.userPatterns.typicalAmounts.length > 10) {
                aiFeatures.userPatterns.typicalAmounts = aiFeatures.userPatterns.typicalAmounts.slice(-10);
            }
            
            // Update rate history for learning
            if (!aiFeatures.userPatterns.rateHistory) aiFeatures.userPatterns.rateHistory = {};
            if (!aiFeatures.userPatterns.rateHistory[bank]) aiFeatures.userPatterns.rateHistory[bank] = {};
            if (!aiFeatures.userPatterns.rateHistory[bank][duration]) aiFeatures.userPatterns.rateHistory[bank][duration] = [];
            
            aiFeatures.userPatterns.rateHistory[bank][duration].push(rate);
            if (aiFeatures.userPatterns.rateHistory[bank][duration].length > 5) {
                aiFeatures.userPatterns.rateHistory[bank][duration] = aiFeatures.userPatterns.rateHistory[bank][duration].slice(-5);
            }
            
            aiFeatures.saveUserPatterns();
            
        } catch (error) {
            console.error('AI validation failed:', error);
        }
    }
    
    const maturityDate = calculateMaturityDate(startDate, duration, durationUnit);
    const certFile = document.getElementById('fdCertificate')?.files?.[0];
    
    /**
     * Complete the save operation
     */
    const completeSave = async (certData) => {
        try {
            let records = (await getCachedData('records', 'fd_records')) || [];
            
            const record = {
                id: currentEditId || generateId(),
                accountHolder,
                bank,
                amount,
                duration,
                durationUnit,
                rate,
                startDate,
                maturityDate,
                certificateStatus: certStatus,
                fdNumber,
                certificate: certData,
                notes,
                updatedAt: new Date().toISOString()
            };
            
            if (currentEditId) {
                // Update existing record
                const index = records.findIndex(r => r.id === currentEditId);
                if (index !== -1) {
                    record.createdAt = records[index].createdAt; // Preserve original creation date
                    records[index] = record;
                } else {
                    record.createdAt = new Date().toISOString();
                    records.push(record);
                }
            } else {
                // Add new record
                record.createdAt = new Date().toISOString();
                records.push(record);
            }
            
            await saveData('fd_records', records);
            
            // Refresh UI
            loadFDRecords();
            updateDashboard();
            if (typeof updateAnalytics === 'function') await updateAnalytics();
            if (typeof loadCertificates === 'function') loadCertificates();
            
            showToast(currentEditId ? 'FD updated successfully ✓' : 'FD added successfully ✓', 'success');
            
            // Reset form
            resetFDForm();
            
        } catch (error) {
            console.error('Save FD error:', error);
            showToast('Error saving FD. Please try again.', 'error');
        }
    };
    
    // Process certificate if uploaded
    if (certFile) {
        if (certFile.size > 5 * 1024 * 1024) {
            showToast('Certificate file size must be less than 5MB', 'error');
            return;
        }
        
        showToast('Processing certificate...', 'info');
        
        readFileAsBase64(certFile)
            .then(data => {
                completeSave(data);
            })
            .catch(error => {
                console.error('Error reading certificate:', error);
                showToast('Error uploading certificate. Saving without certificate.', 'warning');
                completeSave(null);
            });
    } else {
        // Keep existing certificate if editing
        let existingCert = null;
        if (currentEditId) {
            const records = (await getCachedData('records', 'fd_records')) || [];
            const existing = records.find(r => r.id === currentEditId);
            existingCert = existing?.certificate || null;
        }
        completeSave(existingCert);
    }
}

/**
 * Reset FD form to initial state
 */
function resetFDForm() {
    // Clear draft
    if (typeof clearDraft === 'function') clearDraft();
    
    // Reset form
    const form = document.getElementById('fdForm');
    if (form) form.reset();
    
    // Clear certificate preview
    if (typeof removeCertificatePreview === 'function') removeCertificatePreview();
    
    // Hide smart suggestions
    if (typeof hideSmartSuggestion === 'function') hideSmartSuggestion();
    
    // Reset edit state
    currentEditId = null;
    
    // Update form title
    const formTitle = document.getElementById('formTitle');
    if (formTitle) {
        formTitle.innerHTML = '<i class="bi bi-plus-circle"></i> Add New FD';
    }
    
    // Hide cancel button
    const cancelBtn = document.getElementById('cancelEditBtn');
    if (cancelBtn) {
        cancelBtn.style.display = 'none';
    }
    
    // Set today's date
    const startDateInput = document.getElementById('fdStartDate');
    if (startDateInput) {
        startDateInput.value = new Date().toISOString().split('T')[0];
    }
    
    // Update interest preview
    if (typeof updateInterestPreview === 'function') updateInterestPreview();
    
    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ===================================
// Matured Records Management
// ===================================

/**
 * Check for matured FDs and move them to matured records
 */
async function checkAndMoveMaturedFDs() {
    try {
        const records = (await getCachedData('records', 'fd_records')) || [];
        const maturedRecords = (await getCachedData('maturedRecords', 'fd_matured_records')) || [];
        const today = new Date();
        
        const recordsToMove = [];
        const remainingRecords = [];
        
        for (const record of records) {
            const maturityDate = new Date(record.maturityDate);
            if (maturityDate <= today) {
                // FIX: Spread into a new object instead of mutating the cached record
                // in-place. Direct mutation changes the object that _cache.records holds,
                // so other code reading the cache sees the 'Matured' status before the
                // record has actually been saved/moved — causing phantom state bugs.
                recordsToMove.push({
                    ...record,
                    maturedDate: today.toISOString().split('T')[0],
                    status: 'Matured'
                });
            } else {
                remainingRecords.push(record);
            }
        }
        
        if (recordsToMove.length > 0) {
            // Update active records
            await saveData('fd_records', remainingRecords);
            
            // Add to matured records
            const updatedMaturedRecords = [...maturedRecords, ...recordsToMove];
            await saveData('fd_matured_records', updatedMaturedRecords);
            
            showToast(`Moved ${recordsToMove.length} matured FD(s) to matured records`, 'info');
        }
    } catch (error) {
        console.error('Error checking matured FDs:', error);
    }
}

/**
 * Load matured FD records
 */
async function loadMaturedFDRecords() {
    try {
        let maturedRecords = (await getCachedData('maturedRecords', 'fd_matured_records')) || [];
        
        // Filter out records for disabled account holders
        maturedRecords = await filterRecordsByAccountHolderStatus(maturedRecords);
        
        displayMaturedFDRecords(maturedRecords, 1);
    } catch (error) {
        console.error('Error loading matured FD records:', error);
    }
}

/**
 * Display matured FD records in table
 */
function displayMaturedFDRecords(records, page = 1) {
    const tbody = document.getElementById('maturedRecordsTableBody');
    if (!tbody) return;
    
    if (!records || records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted">No matured records found</td></tr>';
        return;
    }
    
    // Sort by matured date (newest first)
    records.sort((a, b) => new Date(b.maturedDate || b.maturityDate) - new Date(a.maturedDate || a.maturityDate));
    
    // Pagination
    const totalPages = Math.ceil(records.length / recordsPerPage);
    const startIndex = (page - 1) * recordsPerPage;
    const endIndex = startIndex + recordsPerPage;
    const paginatedRecords = records.slice(startIndex, endIndex);
    
    tbody.innerHTML = paginatedRecords.map(record => {
        const interest = calculateInterestForRecord(record);
        const maturedDate = record.maturedDate || record.maturityDate;
        
        // Escape all user-provided data
        const safeId = escapeHtml(record.id);
        const safeHolder = escapeHtml(record.accountHolder);
        const safeBank = escapeHtml(record.bank);
        const safeUnit = escapeHtml(record.durationUnit);
        
        return `
            <tr>
                <td><input type="checkbox" class="matured-record-checkbox" value="${safeId}"></td>
                <td>${safeHolder}</td>
                <td>${safeBank}</td>
                <td>${formatCurrency(record.amount)}</td>
                <td>${record.duration} ${safeUnit}</td>
                <td>${record.rate}%</td>
                <td>${formatDate(record.startDate)}</td>
                <td>${formatDate(record.maturityDate)}</td>
                <td>${formatDate(maturedDate)}</td>
                <td>${formatCurrency(interest)}</td>
                <td>
                    <button class="btn btn-sm btn-info" onclick="viewMaturedFD('${safeId}')" title="View">
                        <i class="bi bi-eye-fill"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteMaturedFD('${safeId}')" title="Delete">
                        <i class="bi bi-trash-fill"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    // Update pagination
    updateMaturedRecordsPagination(totalPages, page);
}

/**
 * Update pagination for matured records
 */
function updateMaturedRecordsPagination(totalPages, currentPage) {
    const pagination = document.getElementById('maturedRecordsPagination');
    if (!pagination) return;
    
    let html = '';
    
    if (totalPages > 1) {
        // FIX: The old code embedded `maturedRecords` (a local variable from
        // displayMaturedFDRecords) directly into onclick="..." strings. At click
        // time that variable is out of scope and undefined, crashing every page
        // button. Use loadMaturedFDRecords(page) instead — it re-fetches from
        // cache (fast, no decrypt) and re-renders the correct page.
        html += `<button class="btn btn-sm btn-outline-primary me-1" onclick="loadMaturedFDRecordsPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''}>Previous</button>`;
        
        for (let i = 1; i <= totalPages; i++) {
            if (i === currentPage) {
                html += `<button class="btn btn-sm btn-primary me-1">${i}</button>`;
            } else {
                html += `<button class="btn btn-sm btn-outline-primary me-1" onclick="loadMaturedFDRecordsPage(${i})">${i}</button>`;
            }
        }
        
        html += `<button class="btn btn-sm btn-outline-primary" onclick="loadMaturedFDRecordsPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''}>Next</button>`;
    }
    
    pagination.innerHTML = html;
}

// Helper called by pagination buttons — fetches from cache and renders the requested page
async function loadMaturedFDRecordsPage(page) {
    try {
        let maturedRecords = (await getCachedData('maturedRecords', 'fd_matured_records')) || [];
        maturedRecords = await filterRecordsByAccountHolderStatus(maturedRecords);
        displayMaturedFDRecords(maturedRecords, page);
    } catch (error) {
        console.error('Error loading matured records page:', error);
    }
}

/**
 * View matured FD details
 */
async function viewMaturedFD(id) {
    const maturedRecords = (await getCachedData('maturedRecords', 'fd_matured_records')) || [];
    const record = maturedRecords.find(r => r.id === id);
    
    if (!record) {
        showToast('Matured record not found', 'error');
        return;
    }
    
    // Show record details in a modal or alert
    const interest = calculateInterestForRecord(record);
    const details = `
Account Holder: ${record.accountHolder}
Bank: ${record.bank}
Amount: ${formatCurrency(record.amount)}
Duration: ${record.duration} ${record.durationUnit}
Rate: ${record.rate}%
Start Date: ${formatDate(record.startDate)}
Maturity Date: ${formatDate(record.maturityDate)}
Matured Date: ${formatDate(record.maturedDate || record.maturityDate)}
Expected Interest: ${formatCurrency(interest)}
Maturity Amount: ${formatCurrency(record.amount + interest)}
Notes: ${record.notes || 'N/A'}
    `;
    
    alert(details.trim());
}

/**
 * Delete matured FD record
 */
async function deleteMaturedFD(id) {
    if (!confirm('Are you sure you want to delete this matured FD record?')) {
        return;
    }
    
    try {
        const maturedRecords = (await getCachedData('maturedRecords', 'fd_matured_records')) || [];
        const filteredRecords = maturedRecords.filter(r => r.id !== id);
        
        await saveData('fd_matured_records', filteredRecords);
        loadMaturedFDRecords();
        showToast('Matured record deleted successfully', 'success');
    } catch (error) {
        console.error('Error deleting matured record:', error);
        showToast('Error deleting matured record', 'error');
    }
}

/**
 * Restore matured FD to active records (for manual restoration)
 */
async function restoreMaturedFD(id) {
    if (!confirm('Are you sure you want to restore this matured FD to active records?')) {
        return;
    }
    
    try {
        const maturedRecords = (await getCachedData('maturedRecords', 'fd_matured_records')) || [];
        const activeRecords = (await getCachedData('records', 'fd_records')) || [];
        
        const recordToRestore = maturedRecords.find(r => r.id === id);
        if (!recordToRestore) {
            showToast('Matured record not found', 'error');
            return;
        }
        
        // Remove matured status and date
        delete recordToRestore.maturedDate;
        recordToRestore.status = 'Active';
        
        // Add to active records
        activeRecords.push(recordToRestore);
        await saveData('fd_records', activeRecords);
        
        // Remove from matured records
        const filteredMaturedRecords = maturedRecords.filter(r => r.id !== id);
        await saveData('fd_matured_records', filteredMaturedRecords);
        
        loadMaturedFDRecords();
        loadFDRecords();
        showToast('FD restored to active records successfully', 'success');
    } catch (error) {
        console.error('Error restoring matured FD:', error);
        showToast('Error restoring matured FD', 'error');
    }
}

// ===================================
// Matured Records Table Functions
// ===================================

/**
 * Filter matured records based on search input
 */
function filterMaturedRecords() {
    const searchInput = document.getElementById('searchMaturedRecords');
    const searchTerm = searchInput?.value?.toLowerCase() || '';
    
    if (!searchTerm) {
        loadMaturedFDRecords();
        return;
    }
    
    // This will need to be implemented to filter the displayed records
    loadMaturedFDRecords();
}

/**
 * Toggle select all matured records
 */
function toggleSelectAllMatured() {
    const selectAll = document.getElementById('selectAllMatured');
    const checkboxes = document.querySelectorAll('.matured-record-checkbox');
    
    checkboxes.forEach(checkbox => {
        checkbox.checked = selectAll.checked;
    });
    
    updateDeleteSelectedMaturedButton();
}

/**
 * Update delete selected button state for matured records
 */
function updateDeleteSelectedMaturedButton() {
    const checkboxes = document.querySelectorAll('.matured-record-checkbox:checked');
    const deleteBtn = document.getElementById('deleteSelectedMaturedBtn');
    
    if (deleteBtn) {
        deleteBtn.disabled = checkboxes.length === 0;
    }
}

/**
 * Delete selected matured records
 */
async function deleteSelectedMatured() {
    const checkboxes = document.querySelectorAll('.matured-record-checkbox:checked');
    
    if (checkboxes.length === 0) {
        showToast('No matured records selected', 'warning');
        return;
    }
    
    if (!confirm(`Are you sure you want to delete ${checkboxes.length} matured record(s)?`)) {
        return;
    }
    
    try {
        const maturedRecords = (await getCachedData('maturedRecords', 'fd_matured_records')) || [];
        const idsToDelete = Array.from(checkboxes).map(cb => cb.value);
        
        const filteredRecords = maturedRecords.filter(r => !idsToDelete.includes(r.id));
        
        await saveData('fd_matured_records', filteredRecords);
        loadMaturedFDRecords();
        showToast(`Deleted ${checkboxes.length} matured record(s) successfully`, 'success');
    } catch (error) {
        console.error('Error deleting selected matured records:', error);
        showToast('Error deleting matured records', 'error');
    }
}

/**
 * Change records per page for matured records
 */
function changeMaturedRecordsPerPage(value) {
    recordsPerPage = parseInt(value);
    localStorage.setItem('recordsPerPage', value);
    loadMaturedFDRecords();
}

/**
 * Export matured records to Excel
 */
async function exportMaturedToExcel() {
    try {
        const maturedRecords = (await getCachedData('maturedRecords', 'fd_matured_records')) || [];
        
        if (maturedRecords.length === 0) {
            showToast('No matured records to export', 'warning');
            return;
        }
        
        // Create CSV content
        let csvContent = 'Account Holder,Bank,Amount,Duration,Rate (%),Start Date,Maturity Date,Matured Date,Interest,Maturity Amount,Notes\n';
        
        maturedRecords.forEach(record => {
            const interest = calculateInterestForRecord(record);
            const maturityAmount = record.amount + interest;
            const maturedDate = record.maturedDate || record.maturityDate;
            
            csvContent += `"${record.accountHolder}","${record.bank}",${record.amount},"${record.duration} ${record.durationUnit}",${record.rate},"${record.startDate}","${record.maturityDate}","${maturedDate}",${interest},${maturityAmount},"${record.notes || ''}"\n`;
        });
        
        // Create and download file
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `matured_fd_records_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        showToast('Matured records exported successfully', 'success');
    } catch (error) {
        console.error('Error exporting matured records:', error);
        showToast('Error exporting matured records', 'error');
    }
}

// Add event listener for matured tab to load records when tab is opened
document.addEventListener('DOMContentLoaded', function() {
    // Add event listener for matured tab
    const maturedTab = document.getElementById('matured-tab');
    if (maturedTab) {
        maturedTab.addEventListener('shown.bs.tab', function() {
            loadMaturedFDRecords();
        });
    }
    
    // Add event listeners for matured record checkboxes
    document.addEventListener('change', function(e) {
        if (e.target.classList.contains('matured-record-checkbox')) {
            updateDeleteSelectedMaturedButton();
        }
    });
});

async function editFD(id) {
    const records = (await getCachedData('records', 'fd_records')) || [];
    const record = records.find(r => r.id === id);
    
    if (!record) {
        showToast('Record not found', 'error');
        return;
    }
    
    currentEditId = id;
    
    // Populate form fields
    const fields = {
        'fdAccountHolder': record.accountHolder,
        'fdBank': record.bank,
        'fdAmount': record.amount,
        'fdDuration': record.duration,
        'fdDurationUnit': record.durationUnit || 'Months',
        'fdRate': record.rate,
        'fdStartDate': record.startDate,
        'fdCertStatus': record.certificateStatus || 'Not Obtained',
        'fdNumber': record.fdNumber || '',
        'fdNotes': record.notes || ''
    };
    
    Object.keys(fields).forEach(fieldId => {
        const element = document.getElementById(fieldId);
        if (element) {
            element.value = fields[fieldId];
        }
    });
    
    // Update form title
    const formTitle = document.getElementById('formTitle');
    if (formTitle) {
        formTitle.innerHTML = '<i class="bi bi-pencil"></i> Edit FD';
    }
    
    // Show cancel button
    const cancelBtn = document.getElementById('cancelEditBtn');
    if (cancelBtn) {
        cancelBtn.style.display = 'inline-block';
    }
    
    // Show certificate preview if exists
    if (record.certificate && typeof showCertificatePreview === 'function') {
        showCertificatePreview(record.certificate);
    }
    
    // Toggle certificate upload section
    if (typeof toggleCertificateUpload === 'function') {
        toggleCertificateUpload();
    }
    
    // Scroll to form
    const formCard = document.querySelector('#records .card');
    if (formCard) {
        formCard.scrollIntoView({ behavior: 'smooth' });
    }
    
    // Update interest preview
    if (typeof updateInterestPreview === 'function') updateInterestPreview();
}

function cancelEdit() {
    currentEditId = null;
    resetFDForm();
    showToast('Edit cancelled', 'info');
}

async function deleteFD(id) {
    if (!confirm('Are you sure you want to delete this FD record?')) {
        return;
    }
    
    let records = (await getCachedData('records', 'fd_records')) || [];
    const recordToDelete = records.find(r => r.id === id);
    records = records.filter(r => r.id !== id);
    await saveData('fd_records', records);
    
    loadFDRecords();
    await updateDashboard();
    if (typeof updateAnalytics === 'function') await updateAnalytics();
    
    const bankInfo = recordToDelete ? ` (${recordToDelete.bank})` : '';
    showToast(`FD deleted successfully${bankInfo}`, 'success');
}

async function deleteSelected() {
    const checkboxes = document.querySelectorAll('.record-checkbox:checked');
    
    if (checkboxes.length === 0) {
        showToast('Please select records to delete', 'warning');
        return;
    }
    
    if (!confirm(`Delete ${checkboxes.length} selected record(s)?`)) {
        return;
    }
    
    const idsToDelete = Array.from(checkboxes).map(cb => cb.value);
    let records = (await getCachedData('records', 'fd_records')) || [];
    records = records.filter(r => !idsToDelete.includes(r.id));
    await saveData('fd_records', records);
    
    loadFDRecords();
    await updateDashboard();
    if (typeof updateAnalytics === 'function') updateAnalytics();
    
    showToast(`${checkboxes.length} record(s) deleted`, 'success');
    
    // Reset selection state
    const selectAll = document.getElementById('selectAll');
    if (selectAll) selectAll.checked = false;
    
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    if (deleteBtn) deleteBtn.disabled = true;
}

function toggleSelectAll() {
    const selectAll = document.getElementById('selectAll');
    const isChecked = selectAll?.checked || false;
    
    document.querySelectorAll('.record-checkbox').forEach(cb => {
        cb.checked = isChecked;
    });
    
    updateSelectAllState();
}

function updateSelectAllState() {
    const checkboxes = document.querySelectorAll('.record-checkbox');
    const checkedBoxes = document.querySelectorAll('.record-checkbox:checked');
    
    const selectAll = document.getElementById('selectAll');
    if (selectAll) {
        selectAll.checked = checkboxes.length > 0 && checkboxes.length === checkedBoxes.length;
        selectAll.indeterminate = checkedBoxes.length > 0 && checkedBoxes.length < checkboxes.length;
    }
    
    const deleteBtn = document.getElementById('deleteSelectedBtn');
    if (deleteBtn) {
        deleteBtn.disabled = checkedBoxes.length === 0;
    }
}

// ===================================
// Bank Autocomplete
// ===================================

async function setupBankAutocomplete() {
    const bankInput = document.getElementById('fdBank');
    const datalist = document.getElementById('bankSuggestions');
    
    if (!bankInput || !datalist) return;
    
    // Populate initial suggestions
    const banks = await getAllBanks();
    datalist.innerHTML = '';
    banks.forEach(bank => {
        const option = document.createElement('option');
        option.value = bank;
        datalist.appendChild(option);
    });
    
    // Update suggestions on input
    bankInput.addEventListener('input', async function() {
        const suggestions = await getAllBanks();
        datalist.innerHTML = '';
        suggestions.forEach(bank => {
            const option = document.createElement('option');
            option.value = bank;
            datalist.appendChild(option);
        });
        
        // Trigger rate suggestion if function exists
        if (typeof suggestBankRate === 'function') {
            suggestBankRate();
        }
    });
}

// ===================================
// Table Sorting
// ===================================

let sortColumn = '';
let sortAscending = true;

async function sortTable(column) {
    if (sortColumn === column) {
        sortAscending = !sortAscending;
    } else {
        sortColumn = column;
        sortAscending = true;
    }
    
    let records = (await getCachedData('records', 'fd_records')) || [];
    
    records = records.sort((a, b) => {
        let valA, valB;
        
        switch (column) {
            case 'holder':
                valA = (a.accountHolder || '').toLowerCase();
                valB = (b.accountHolder || '').toLowerCase();
                break;
            case 'bank':
                valA = (a.bank || '').toLowerCase();
                valB = (b.bank || '').toLowerCase();
                break;
            case 'amount':
                valA = parseFloat(a.amount) || 0;
                valB = parseFloat(b.amount) || 0;
                break;
            case 'rate':
                valA = parseFloat(a.rate) || 0;
                valB = parseFloat(b.rate) || 0;
                break;
            case 'startDate':
                valA = a.startDate ? new Date(a.startDate).getTime() : 0;
                valB = b.startDate ? new Date(b.startDate).getTime() : 0;
                if (isNaN(valA)) valA = 0;
                if (isNaN(valB)) valB = 0;
                break;
            case 'daysRemaining':
                const matA = a.maturityDate || calculateMaturityDate(a.startDate, a.duration, a.durationUnit);
                const matB = b.maturityDate || calculateMaturityDate(b.startDate, b.duration, b.durationUnit);
                valA = calculateDaysRemaining(matA) || 0;
                valB = calculateDaysRemaining(matB) || 0;
                break;
            case 'earnedToDate':
                valA = calculateEarnedToDate(a);
                valB = calculateEarnedToDate(b);
                break;
            default:
                return 0;
        }
        
        if (valA < valB) return sortAscending ? -1 : 1;
        if (valA > valB) return sortAscending ? 1 : -1;
        return 0;
    });
    
    displayFDRecords(records, currentPage);
}

// ===================================
// Sample Data Loader
// ===================================

function loadSampleData() {
    const warningMessage = `⚠️ WARNING: This will:
1. Replace your current PIN with demo PIN: 1234
2. Replace all existing account holders
3. Replace all existing FD records

Are you sure you want to continue?`;

    if (!confirm(warningMessage)) {
        return;
    }
    
    try {
        const sampleHolders = ['Ram Sharma', 'Sita Thapa'];
        const sampleRecords = [
            {
                id: generateId(),
                accountHolder: 'Ram Sharma',
                bank: 'Nabil Bank Limited',
                amount: 100000,
                duration: 12,
                durationUnit: 'Months',
                rate: 9.25,
                startDate: '2024-01-15',
                maturityDate: '2025-01-15',
                certificateStatus: 'Obtained',
                notes: 'Sample FD - Regular deposit',
                createdAt: new Date().toISOString()
            },
            {
                id: generateId(),
                accountHolder: 'Sita Thapa',
                bank: 'Global IME Bank Limited',
                amount: 250000,
                duration: 24,
                durationUnit: 'Months',
                rate: 10.0,
                startDate: '2024-02-01',
                maturityDate: '2026-02-01',
                certificateStatus: 'Obtained',
                notes: 'Sample FD - Long term investment',
                createdAt: new Date().toISOString()
            },
            {
                id: generateId(),
                accountHolder: 'Ram Sharma',
                bank: 'NIC Asia Bank Limited',
                amount: 150000,
                duration: 6,
                durationUnit: 'Months',
                rate: 8.25,
                startDate: '2024-06-01',
                maturityDate: '2024-12-01',
                certificateStatus: 'Not Obtained',
                notes: 'Sample FD - Short term',
                createdAt: new Date().toISOString()
            }
        ];
        
        // Create demo PIN — must initialize encryption key before any saveData calls
        const demoPin = '1234';
        const hash = CryptoJS.SHA256(demoPin).toString();
        localStorage.setItem('fd_pin', hash);
        pinHash = hash;

        // Initialize encryption key with demo PIN, then save data
        initDataManager(demoPin).then(async () => {
            await Promise.all([
                saveData('fd_account_holders', sampleHolders),
                saveData('fd_records', sampleRecords),
                saveData('fd_templates', []),
                saveData('fd_calculations', [])
            ]);
            showToast('✅ Sample data loaded! PIN changed to: 1234', 'success');
            setTimeout(() => { location.reload(); }, 2000);
        }).catch(error => {
            console.error('Error initializing encryption for sample data:', error);
            showToast('❌ Failed to load sample data', 'error');
        });
    } catch (error) {
        console.error('Error loading sample data:', error);
        showToast('❌ Failed to load sample data', 'error');
    }
}

// ===================================
// Loading States
// ===================================

function showLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'flex';
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.style.display = 'none';
}

// ===================================
// AI-Enhanced Notifications for Expiring FDs
// ===================================

async function checkExpiringFDs() {
    // Require PIN before accessing encrypted data
    if (!pinHash) return;

    // Wait for DOM to be ready and AI features to be available
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(checkExpiringFDs, 1000);
        });
        return;
    }
    
    // Wait a bit more for AI features to load
    setTimeout(async () => {
        // Always check for expiring FDs - critical for user awareness
        const records = (await getCachedData('records', 'fd_records')) || [];
        const expiringSoon = records.filter(record => {
            const maturityDate = record.maturityDate || calculateMaturityDate(
                record.startDate, record.duration, record.durationUnit
            );
            const daysRemaining = calculateDaysRemaining(maturityDate);
            return daysRemaining !== null && daysRemaining <= 30 && daysRemaining > 0;
        });
        
        // Always show browser notifications for expiring FDs (critical alerts)
        if (expiringSoon.length > 0 && 'Notification' in window) {
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                // Use AI for intelligent notifications
                if (typeof aiFeatures !== 'undefined') {
                    try {
                        // Create smart notifications for each expiring FD
                        for (const record of expiringSoon) {
                            const maturityDate = record.maturityDate || calculateMaturityDate(
                                record.startDate, record.duration, record.durationUnit
                            );
                            const daysRemaining = calculateDaysRemaining(maturityDate);
                            
                            const notification = await aiFeatures.createSmartNotification('maturity_reminder', {
                                ...record,
                                daysRemaining,
                                maturityDate
                            });
                            
                            // Always show browser notification for expiring FDs (critical)
                            if (notification && notification.priority > 50) {
                                const daysToMaturity = aiFeatures.calculateDaysToMaturity(maturityDate);
                                const notificationBody = notification.message;
                                
                                new Notification('FD Manager Pro - Smart Alert', {
                                    body: notificationBody,
                                    icon: 'images/icon-192x192.png',
                                    tag: `maturity_${record.id}`,
                                    requireInteraction: daysToMaturity <= 3
                                });
                                
                                // Show in-app notification (always helpful for expiring FDs)
                                if (notification) {
                                    showSmartNotification(notification);
                                }
                            }
                        }
                        
                        // Show summary notification
                        if (expiringSoon.length > 1) {
                            const summaryNotification = await aiFeatures.createSmartNotification('portfolio_alert', {
                                type: 'maturity_summary',
                                count: expiringSoon.length,
                                severity: expiringSoon.some(r => calculateDaysRemaining(r.maturityDate) <= 7) ? 'high' : 'medium'
                            });
                            
                            // FIX: createSmartNotification returns null when smartNotifications
                            // is disabled in settings — guard before accessing .message
                            if (summaryNotification) {
                                new Notification('FD Manager Pro - Portfolio Summary', {
                                    body: summaryNotification.message,
                                    icon: 'images/icon-192x192.png'
                                });
                            }
                        }
                        
                    } catch (error) {
                        console.error('AI notification failed, using fallback:', error);
                        // Fallback to traditional notification
                        new Notification('FD Manager Pro', {
                            body: `${expiringSoon.length} FD(s) expiring within 30 days`,
                            icon: 'images/icon-192x192.png'
                        });
                    }
                } else {
                    // Traditional notification fallback
                    new Notification('FD Manager Pro', {
                        body: `${expiringSoon.length} FD(s) expiring within 30 days`,
                        icon: 'images/icon-192x192.png'
                    });
                }
            }
        }
    }, 2000); // 2 second delay to ensure everything is loaded
}

// Show smart in-app notification
function showSmartNotification(notification) {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            showSmartNotification(notification);
        });
        return;
    }
    
    let notificationContainer = document.getElementById('smartNotificationContainer');
    if (!notificationContainer) {
        // Create container if it doesn't exist
        notificationContainer = document.createElement('div');
        notificationContainer.id = 'smartNotificationContainer';
        notificationContainer.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 9999;
            max-width: 400px;
        `;
        
        // Safely append to body
        if (document.body) {
            document.body.appendChild(notificationContainer);
        } else {
            // If body is not ready, wait for it
            document.addEventListener('DOMContentLoaded', () => {
                document.body.appendChild(notificationContainer);
                showNotificationElement(notificationContainer, notification);
            });
            return;
        }
    }
    
    showNotificationElement(notificationContainer, notification);
}

function showNotificationElement(container, notification) {
    const notificationElement = document.createElement('div');
    notificationElement.className = `alert alert-${notification.priority > 80 ? 'danger' : notification.priority > 60 ? 'warning' : 'info'} alert-dismissible fade show`;
    notificationElement.style.cssText = `
        margin-bottom: 10px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        border-left: 4px solid ${notification.priority > 80 ? '#dc3545' : notification.priority > 60 ? '#ffc107' : '#17a2b8'};
    `;
    
    let actionsHtml = '';
    if (notification.actions && notification.actions.length > 0) {
        actionsHtml = '<div class="mt-2">' + 
            notification.actions.map(action => 
                `<button class="btn btn-sm ${action.primary ? 'btn-primary' : 'btn-outline-secondary'} me-1" onclick="handleNotificationAction('${action.action}', '${notification.id}')">${action.label}</button>`
            ).join('') + '</div>';
    }
    
    notificationElement.innerHTML = `
        <div class="d-flex justify-content-between align-items-start">
            <div>
                <strong>🤖 Smart Alert</strong><br>
                <small>${notification.message}</small>
                ${actionsHtml}
            </div>
            <button type="button" class="btn-close" onclick="this.parentElement.parentElement.remove()"></button>
        </div>
    `;
    
    container.appendChild(notificationElement);
    
    // Auto-remove after 10 seconds
    setTimeout(() => {
        if (notificationElement.parentElement) {
            notificationElement.remove();
        }
    }, 10000);
}

// Handle notification actions
function handleNotificationAction(action, notificationId) {
    switch (action) {
        case 'view':
            // Switch to records tab and filter the specific FD
            switchTab('records');
            break;
        case 'renewal_reminder':
            showToast('Renewal reminder set! We\'ll notify you 7 days before maturity.', 'success');
            break;
        case 'mark_collected':
            showToast('Certificate marked as collected!', 'success');
            break;
        case 'snooze':
            showToast('Notification snoozed for 24 hours', 'info');
            break;
        default:
            console.log('Unknown action:', action);
    }
    
    // Remove the notification
    const notificationElement = document.querySelector(`[data-notification-id="${notificationId}"]`);
    if (notificationElement) {
        notificationElement.remove();
    }
}

console.log('[FD Manager Nepal] App.js Part 1 loaded successfully');

// Check and display AI status
function checkAIStatus() {
    const aiStatusElement = document.getElementById('aiStatus');
    if (aiStatusElement) {
        if (typeof aiFeatures !== 'undefined') {
            aiStatusElement.style.display = 'inline-block';
            aiStatusElement.className = 'badge bg-success me-2';
            aiStatusElement.innerHTML = '<i class="bi bi-robot"></i> AI Active';
            
            // Test AI features
            setTimeout(() => {
                try {
                    aiFeatures.smartBankRecognition('test').then(result => {
                        if (result) {
                            aiStatusElement.innerHTML = '<i class="bi bi-robot"></i> AI Ready';
                        }
                    }).catch(() => {
                        aiStatusElement.className = 'badge bg-warning me-2';
                        aiStatusElement.innerHTML = '<i class="bi bi-robot"></i> AI Partial';
                    });
                } catch (error) {
                    aiStatusElement.className = 'badge bg-warning me-2';
                    aiStatusElement.innerHTML = '<i class="bi bi-robot"></i> AI Limited';
                }
            }, 1000);
        } else {
            aiStatusElement.style.display = 'inline-block';
            aiStatusElement.className = 'badge bg-secondary me-2';
            aiStatusElement.innerHTML = '<i class="bi bi-robot"></i> AI Off';
        }
    }
}

// Check AI status after page loads
setTimeout(checkAIStatus, 2000);

// ===================================
// AI Analytics & Notifications Management
// ===================================

// AI Settings Management
function saveAISettings() {
    const settings = {
        smartRecognition: document.getElementById('aiSmartRecognition').checked,
        ratePrediction: document.getElementById('aiRatePrediction').checked,
        formValidation: document.getElementById('aiFormValidation').checked,
        smartNotifications: document.getElementById('aiSmartNotifications').checked,
        notificationTiming: document.getElementById('notificationTiming').value,
        browserNotifications: document.getElementById('browserNotifications').checked,
        inAppNotifications: document.getElementById('inAppNotifications').checked
    };
    
    // Save to localStorage
    localStorage.setItem('fd_ai_settings', JSON.stringify(settings));
    
    // Update AI features if available
    if (typeof aiFeatures !== 'undefined') {
        aiFeatures.updateSettings(settings);
    }
    
    showToast('AI settings saved successfully!', 'success');
    refreshNotifications();
}

function loadAISettings() {
    const stored = localStorage.getItem('fd_ai_settings');
    if (stored) {
        const settings = JSON.parse(stored);
        
        // Update UI
        document.getElementById('aiSmartRecognition').checked = settings.smartRecognition !== false;
        document.getElementById('aiRatePrediction').checked = settings.ratePrediction !== false;
        document.getElementById('aiFormValidation').checked = settings.formValidation !== false;
        document.getElementById('aiSmartNotifications').checked = settings.smartNotifications !== false;
        document.getElementById('notificationTiming').value = settings.notificationTiming || 'standard';
        document.getElementById('browserNotifications').checked = settings.browserNotifications !== false;
        document.getElementById('inAppNotifications').checked = settings.inAppNotifications !== false;
        
        // Update AI features
        if (typeof aiFeatures !== 'undefined') {
            aiFeatures.updateSettings(settings);
        }
    }
}

// Notification History Management
function refreshNotifications() {
    const tbody = document.getElementById('notificationHistoryTable');
    if (!tbody) return;
    
    // Get notification history from AI features or localStorage
    let notifications = [];
    if (typeof aiFeatures !== 'undefined') {
        notifications = aiFeatures.notificationHistory || [];
    } else {
        const stored = localStorage.getItem('fd_notification_history');
        notifications = stored ? JSON.parse(stored) : [];
    }
    
    // Sort by timestamp (newest first)
    notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    // Limit to last 20 notifications
    notifications = notifications.slice(0, 20);
    
    if (notifications.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center text-muted">
                    <div class="py-3">
                        <i class="bi bi-bell-slash" style="font-size: 2rem;"></i>
                        <p class="mb-1">No notifications yet</p>
                        <small>AI notifications will appear here</small>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = notifications.map(notification => {
        const time = new Date(notification.timestamp).toLocaleString();
        const priorityClass = notification.priority > 80 ? 'danger' : notification.priority > 60 ? 'warning' : 'info';
        const statusClass = notification.read ? 'secondary' : 'primary';
        const statusText = notification.read ? 'Read' : 'New';
        
        return `
            <tr class="${notification.read ? '' : 'table-active'}">
                <td><small>${time}</small></td>
                <td><span class="badge bg-secondary">${notification.type}</span></td>
                <td>${notification.message}</td>
                <td><span class="badge bg-${priorityClass}">${notification.priority}</span></td>
                <td><span class="badge bg-${statusClass}">${statusText}</span></td>
                <td>
                    <button class="btn btn-sm btn-outline-primary" onclick="viewNotificationDetails('${notification.id}')" title="View">
                        <i class="bi bi-eye"></i>
                    </button>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteNotification('${notification.id}')" title="Delete">
                        <i class="bi bi-trash"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
    
    // Update unread count
    const unreadCount = notifications.filter(n => !n.read).length;
    if (unreadCount > 0) {
        showToast(`${unreadCount} unread notifications`, 'info');
    }
}

function clearNotificationHistory() {
    if (confirm('Are you sure you want to clear all notification history?')) {
        if (typeof aiFeatures !== 'undefined') {
            aiFeatures.notificationHistory = [];
            aiFeatures.saveNotificationHistory();
        } else {
            localStorage.removeItem('fd_notification_history');
        }
        refreshNotifications();
        showToast('Notification history cleared', 'success');
    }
}

function viewNotificationDetails(notificationId) {
    let notification = null;
    
    if (typeof aiFeatures !== 'undefined') {
        notification = aiFeatures.notificationHistory.find(n => n.id === notificationId);
    } else {
        const stored = localStorage.getItem('fd_notification_history');
        const notifications = stored ? JSON.parse(stored) : [];
        notification = notifications.find(n => n.id === notificationId);
    }
    
    if (notification) {
        // Mark as read
        notification.read = true;
        if (typeof aiFeatures !== 'undefined') {
            aiFeatures.saveNotificationHistory();
        } else {
            localStorage.setItem('fd_notification_history', JSON.stringify(
                JSON.parse(localStorage.getItem('fd_notification_history') || '[]')
                    .map(n => n.id === notificationId ? notification : n)
            ));
        }
        
        // Show details modal
        alert(`Notification Details:\n\nType: ${notification.type}\nMessage: ${notification.message}\nPriority: ${notification.priority}\nTime: ${new Date(notification.timestamp).toLocaleString()}`);
        
        refreshNotifications();
    }
}

function deleteNotification(notificationId) {
    if (confirm('Delete this notification?')) {
        if (typeof aiFeatures !== 'undefined') {
            aiFeatures.notificationHistory = aiFeatures.notificationHistory.filter(n => n.id !== notificationId);
            aiFeatures.saveNotificationHistory();
        } else {
            const stored = localStorage.getItem('fd_notification_history');
            const notifications = stored ? JSON.parse(stored) : [];
            notifications.splice(notifications.findIndex(n => n.id === notificationId), 1);
            localStorage.setItem('fd_notification_history', JSON.stringify(notifications));
        }
        refreshNotifications();
        showToast('Notification deleted', 'success');
    }
}

// AI Insights Generation
async function generateAIInsights() {
    const insightsDiv = document.getElementById('aiInsights');
    if (!insightsDiv) return;
    
    try {
        const records = (await getCachedData('records', 'fd_records')) || [];
        
        if (records.length === 0) {
            insightsDiv.innerHTML = `
                <div class="alert alert-warning">
                    <i class="bi bi-info-circle"></i> 
                    No FD records found. Add some FDs to get AI insights.
                </div>
            `;
            return;
        }
        
        // Generate insights using AI or fallback logic
        let insights = [];
        
        if (typeof aiFeatures !== 'undefined') {
            // Use AI to generate insights
            insights = await aiFeatures.generatePortfolioInsights(records);
        } else {
            // Fallback insights
            insights = generateBasicInsights(records);
        }
        
        // Display insights
        insightsDiv.innerHTML = insights.map(insight => `
            <div class="alert alert-${insight.type} alert-sm mb-2">
                <strong>${insight.title}</strong><br>
                <small>${insight.message}</small>
            </div>
        `).join('');
        
    } catch (error) {
        console.error('Error generating AI insights:', error);
        insightsDiv.innerHTML = `
            <div class="alert alert-danger">
                <i class="bi bi-exclamation-triangle"></i> 
                Unable to generate insights at this time.
            </div>
        `;
    }
}

function generateBasicInsights(records) {
    const insights = [];
    const totalInvestment = records.reduce((sum, r) => sum + r.amount, 0);
    const avgRate = records.reduce((sum, r) => sum + r.rate, 0) / records.length;
    
    // Investment concentration insight
    const bankCounts = {};
    records.forEach(r => {
        bankCounts[r.bank] = (bankCounts[r.bank] || 0) + 1;
    });
    const topBank = Object.entries(bankCounts).sort((a, b) => b[1] - a[1])[0];
    
    if (topBank && topBank[1] > records.length * 0.6) {
        insights.push({
            type: 'warning',
            title: '🏦 Bank Concentration',
            message: `${topBank[0]} holds ${topBank[1]} of your ${records.length} FDs (${Math.round(topBank[1]/records.length*100)}%). Consider diversifying.`
        });
    }
    
    // Rate insight
    if (avgRate < 8) {
        insights.push({
            type: 'info',
            title: '📊 Interest Rate Analysis',
            message: `Your average rate is ${avgRate.toFixed(2)}%. Current market rates may offer better returns.`
        });
    } else if (avgRate > 12) {
        insights.push({
            type: 'success',
            title: '🎯 Excellent Rates',
            message: `Your average rate of ${avgRate.toFixed(2)}% is above market average. Great job!`
        });
    }
    
    // Maturity insight
    const expiringSoon = records.filter(r => {
        const days = calculateDaysRemaining(r.maturityDate);
        return days !== null && days <= 90;
    });
    
    if (expiringSoon.length > 0) {
        insights.push({
            type: 'warning',
            title: '⏰ Upcoming Maturities',
            message: `${expiringSoon.length} FD(s) maturing in the next 90 days. Plan for renewal.`
        });
    }
    
    return insights;
}

// Initialize AI analytics when analytics tab is shown
document.addEventListener('DOMContentLoaded', () => {
    // Load AI settings
    loadAISettings();
    
    // Generate insights when analytics tab is clicked
    const analyticsTab = document.querySelector('button[data-bs-target="#analytics"]');
    if (analyticsTab) {
        analyticsTab.addEventListener('shown.bs.tab', () => {
            setTimeout(() => {
                refreshNotifications();
                generateAIInsights();
            }, 100);
        });
    }
});
// ===================================
// FD Manager Pro - Application Part 2
// OCR, Templates, Dashboard
// Nepal Edition - Version 4.0
// ===================================

// ===================================
// Quick Add (OCR) Functions
// ===================================

let ocrExtractedData = null;

async function processOCR() {
    const fileInput = document.getElementById('ocrFile');
    const accountHolder = document.getElementById('ocrAccountHolder').value;
    
    if (!accountHolder) {
        showToast('Please select an account holder first', 'warning');
        return;
    }
    
    if (!fileInput.files || fileInput.files.length === 0) {
        showToast('Please select a file', 'error');
        return;
    }
    
    const file = fileInput.files[0];
    
    // Check file type - PDF and images now supported
    const validTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!validTypes.includes(file.type)) {
        showToast('Invalid file type. Please upload PDF, JPG or PNG only', 'error');
        fileInput.value = '';
        return;
    }
    
    // Check file size (increased to 10MB for PDFs)
    if (file.size > 10 * 1024 * 1024) {
        showToast('File too large. Please use file under 10MB', 'error');
        fileInput.value = '';
        return;
    }
    
    document.getElementById('ocrProgress').style.display = 'block';
    document.getElementById('ocrResults').style.display = 'none';
    
    try {
        showToast('Processing OCR... This may take 15-45 seconds for PDFs', 'info');
        
        // Use enhanced OCR with PDF support
        const result = await window.OCREnhanced.processUploadedFile(file);
        
        if (result) {
            displayOCRResults(result, accountHolder);
        } else {
            showToast('OCR processing failed. Please try with a clearer image or different file.', 'error');
        }
        
    } catch (error) {
        console.error('OCR Error:', error);
        showToast('OCR Error: ' + error.message, 'error');
    } finally {
        document.getElementById('ocrProgress').style.display = 'none';
    }
}

function displayOCRResults(data, accountHolder) {
    // Display extracted data
    document.getElementById('ocrBank').innerHTML = data.bank || 
        '<span class="text-danger">Not detected</span>';
    document.getElementById('ocrAmount').innerHTML = data.amount ? 
        formatCurrency(data.amount) : '<span class="text-danger">Not detected</span>';
    document.getElementById('ocrRate').innerHTML = data.rate ? 
        `${data.rate}%` : '<span class="text-danger">Not detected</span>';
    document.getElementById('ocrStartDate').innerHTML = data.startDate ? 
        formatDate(data.startDate) : '<span class="text-danger">Not detected</span>';
    document.getElementById('ocrMaturityDate').innerHTML = data.maturityDate ? 
        formatDate(data.maturityDate) : '<span class="text-danger">Not detected</span>';
    document.getElementById('ocrDuration').innerHTML = data.duration ? 
        `${data.duration} ${data.duration.unit || 'Months'}` : '<span class="text-danger">Not detected</span>';
    
    // Show certificate preview if available
    if (data.certificateId) {
        window.OCREnhanced.getCertificateById(data.certificateId).then(cert => {
            if (cert && cert.thumbnail) {
                document.getElementById('ocrPreview').src = cert.thumbnail;
            }
        });
    }
    
    // Show validation warnings
    if (data.validation && data.validation.warnings.length > 0) {
        let warningHtml = '<div class="alert alert-warning mt-3"><strong>Warnings:</strong><ul>';
        data.validation.warnings.forEach(warning => {
            warningHtml += `<li>${warning}</li>`;
        });
        warningHtml += '</ul></div>';
        
        const resultsDiv = document.getElementById('ocrResults');
        resultsDiv.innerHTML += warningHtml;
    }
    
    // Store for form filling
    ocrExtractedData = {
        ...data,
        accountHolder
    };
    
    document.getElementById('ocrResults').style.display = 'block';
    
    if (data.confidence >= 75) {
        showToast(`OCR completed with ${data.confidence}% confidence!`, 'success');
    } else {
        showToast(`OCR completed with ${data.confidence}% confidence. Please verify data.`, 'warning');
    }
}

async function confirmOCRData() {
    if (!ocrExtractedData) {
        showToast('No data to save', 'error');
        return;
    }
    
    const accountHolder = document.getElementById('ocrAccountHolder').value;
    
    if (!accountHolder) {
        showToast('Please select an account holder', 'error');
        return;
    }
    
    if (!ocrExtractedData.bank || !ocrExtractedData.amount || !ocrExtractedData.rate) {
        showToast('Incomplete data. Please edit before saving.', 'warning');
        editOCRData();
        return;
    }
    
    const record = {
        id: generateId(),
        accountHolder: accountHolder,
        bank: ocrExtractedData.bank,
        amount: ocrExtractedData.amount,
        duration: ocrExtractedData.duration || 12,
        durationUnit: ocrExtractedData.unit || 'Months',
        rate: ocrExtractedData.rate,
        startDate: ocrExtractedData.startDate || new Date().toISOString().split('T')[0],
        maturityDate: ocrExtractedData.maturityDate || '',
        certificateStatus: 'Obtained',
        notes: 'Added via OCR',
        createdAt: new Date().toISOString()
    };
    
    if (!record.maturityDate) {
        record.maturityDate = calculateMaturityDate(record.startDate, record.duration, record.durationUnit);
    }
    
    let records = (await getCachedData('records', 'fd_records')) || [];
    records.push(record);
    await saveData('fd_records', records);
    
    loadFDRecords();
    updateDashboard();
    updateAnalytics();
    
    showToast('FD added successfully via OCR!', 'success');
    
    cancelOCR();
    switchTab('records');
}

function editOCRData() {
    if (!ocrExtractedData) return;
    
    const accountHolder = document.getElementById('ocrAccountHolder').value;
    
    document.getElementById('fdAccountHolder').value = accountHolder;
    document.getElementById('fdBank').value = ocrExtractedData.bank || '';
    document.getElementById('fdAmount').value = ocrExtractedData.amount || '';
    document.getElementById('fdRate').value = ocrExtractedData.rate || '';
    document.getElementById('fdDuration').value = ocrExtractedData.duration || '';
    
    if (ocrExtractedData.startDate) {
        document.getElementById('fdStartDate').value = ocrExtractedData.startDate;
    }
    
    document.getElementById('fdCertStatus').value = 'Obtained';
    
    updateInterestPreview();
    
    switchTab('records');
    
    showToast('Data loaded into form. Please review and save.', 'info');
}

function cancelOCR() {
    ocrExtractedData = null;
    document.getElementById('ocrFile').value = '';
    document.getElementById('ocrResults').style.display = 'none';
    document.getElementById('ocrProgress').style.display = 'none';
    document.getElementById('ocrAccountHolder').value = '';
}

// ===================================
// Templates Functions
// ===================================

async function loadTemplates() {
    const templates = (await getCachedData('templates', 'fd_templates')) || [];
    displayTemplates(templates);
}

function displayTemplates(templates) {
    const container = document.getElementById('templatesList');
    if (!container) return;
    
    if (templates.length === 0) {
        container.innerHTML = '<p class="text-muted">No templates saved yet</p>';
        return;
    }
    
    container.innerHTML = templates.map(template => `
        <div class="template-card" onclick="applyTemplate('${template.id}')">
            <div class="d-flex justify-content-between align-items-start">
                <div>
                    <h6><i class="bi bi-bookmark-fill"></i> ${template.name}</h6>
                    <p><strong>Bank:</strong> ${template.bank}</p>
                    <p><strong>Duration:</strong> ${template.duration} ${template.durationUnit}</p>
                    <p><strong>Rate:</strong> ${template.rate}%</p>
                </div>
                <button class="btn btn-sm btn-outline-danger" onclick="event.stopPropagation(); deleteTemplate('${template.id}')">
                    <i class="bi bi-trash"></i>
                </button>
            </div>
        </div>
    `).join('');
}

async function saveTemplate(event) {
    event.preventDefault();
    
    const name = document.getElementById('templateName').value.trim();
    const bank = document.getElementById('templateBank').value.trim();
    const duration = parseInt(document.getElementById('templateDuration').value);
    const unit = document.getElementById('templateUnit').value;
    const rate = parseFloat(document.getElementById('templateRate').value);
    
    if (!name || !bank || !duration || !rate) {
        showToast('Please fill all fields', 'error');
        return;
    }
    
    const template = {
        id: generateId(),
        name,
        bank,
        duration,
        durationUnit: unit,
        rate,
        createdAt: new Date().toISOString()
    };
    
    let templates = (await getCachedData('templates', 'fd_templates')) || [];
    templates.push(template);
    await saveData('fd_templates', templates);
    
    loadTemplates();
    
    document.getElementById('templateName').value = '';
    document.getElementById('templateBank').value = '';
    document.getElementById('templateDuration').value = '';
    document.getElementById('templateRate').value = '';
    
    showToast('Template saved successfully!', 'success');
}

async function applyTemplate(templateId) {
    const templates = (await getCachedData('templates', 'fd_templates')) || [];
    const template = templates.find(t => t.id === templateId);
    
    if (!template) return;
    
    document.getElementById('fdBank').value = template.bank;
    document.getElementById('fdDuration').value = template.duration;
    document.getElementById('fdDurationUnit').value = template.durationUnit;
    document.getElementById('fdRate').value = template.rate;
    
    updateInterestPreview();
    
    switchTab('records');
    
    showToast(`Template "${template.name}" applied. Fill remaining fields.`, 'success');
}

async function deleteTemplate(templateId) {
    if (!confirm('Delete this template?')) return;
    
    let templates = (await getCachedData('templates', 'fd_templates')) || [];
    templates = templates.filter(t => t.id !== templateId);
    await saveData('fd_templates', templates);
    
    loadTemplates();
    showToast('Template deleted', 'success');
}

// ===================================
// ===================================
// Dashboard Functions
// ===================================

async function updateDashboard() {
    // First check for any matured FDs and move them
    await checkAndMoveMaturedFDs();
    
    const selectedHolder = document.getElementById('dashboardHolderFilter')?.value;
    let records = (await getCachedData('records', 'fd_records')) || [];
    
    // Filter out records for disabled account holders
    records = await filterRecordsByAccountHolderStatus(records);
    
    if (selectedHolder) {
        records = records.filter(r => r.accountHolder === selectedHolder);
    }
    
    const totalInvestment = sumBy(records, 'amount');
    const totalInterest = records.reduce((sum, record) => {
        return sum + calculateInterestForRecord(record);
    }, 0);
    
    const activeFDs = records.filter(record => {
        const maturityDate = record.maturityDate || calculateMaturityDate(
            record.startDate, record.duration, record.durationUnit
        );
        return calculateDaysRemaining(maturityDate) > 0;
    }).length;
    
    const expiringSoon = records.filter(record => {
        const maturityDate = record.maturityDate || calculateMaturityDate(
            record.startDate, record.duration, record.durationUnit
        );
        const days = calculateDaysRemaining(maturityDate);
        return days >= 0 && days <= 30;
    }).length;
    
    document.getElementById('totalInvestment').textContent = formatCurrency(totalInvestment);
    document.getElementById('totalInterest').textContent = formatCurrency(totalInterest);
    document.getElementById('activeFDs').textContent = activeFDs;
    document.getElementById('expiringSoon').textContent = expiringSoon;
    
    updateUpcomingMaturities(records);
    updateMaturityCountdown(records);
    updatePortfolioChart(records);
}

function updateUpcomingMaturities(records) {
    const container = document.getElementById('upcomingMaturities');
    if (!container) return;
    
    const upcoming = records.filter(record => {
        const maturityDate = record.maturityDate || calculateMaturityDate(
            record.startDate, record.duration, record.durationUnit
        );
        const days = calculateDaysRemaining(maturityDate);
        return days >= 0 && days <= 30;
    }).sort((a, b) => {
        const dateA = a.maturityDate || calculateMaturityDate(a.startDate, a.duration, a.durationUnit);
        const dateB = b.maturityDate || calculateMaturityDate(b.startDate, b.duration, b.durationUnit);
        return new Date(dateA) - new Date(dateB);
    });
    
    if (upcoming.length === 0) {
        container.innerHTML = '<p class="text-muted">No FDs maturing in the next 30 days</p>';
        return;
    }
    
    container.innerHTML = `
        <div class="table-responsive">
            <table class="table table-sm">
                <thead>
                    <tr>
                        <th>Account Holder</th>
                        <th>Bank</th>
                        <th>Amount</th>
                        <th>Maturity Date</th>
                        <th>Days Left</th>
                    </tr>
                </thead>
                <tbody>
                    ${upcoming.map(record => {
                        const maturityDate = record.maturityDate || calculateMaturityDate(
                            record.startDate, record.duration, record.durationUnit
                        );
                        const days = calculateDaysRemaining(maturityDate);
                        return `
                            <tr>
                                <td>${record.accountHolder}</td>
                                <td>${record.bank}</td>
                                <td>${formatCurrency(record.amount)}</td>
                                <td>${formatDate(maturityDate)}</td>
                                <td><span class="badge bg-warning">${days} days</span></td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

/**
 * Maturity Countdown Widget
 * Shows a visual countdown to the next maturing FD on the Dashboard.
 */
function updateMaturityCountdown(records) {
    const container = document.getElementById('maturityCountdownWidget');
    const card = document.getElementById('maturityCountdownCard');
    if (!container) return;

    const active = records
        .filter(r => {
            const mat = r.maturityDate || calculateMaturityDate(r.startDate, r.duration, r.durationUnit);
            return calculateDaysRemaining(mat) > 0;
        })
        .map(r => {
            const mat = r.maturityDate || calculateMaturityDate(r.startDate, r.duration, r.durationUnit);
            return Object.assign({}, r, { _matDate: mat, _days: calculateDaysRemaining(mat) });
        })
        .sort((a, b) => a._days - b._days);

    if (active.length === 0) {
        card.style.display = 'none';
        return;
    }
    card.style.display = '';

    const next = active[0];
    const queue = active.slice(1, 5);

    let urgencyClass = 'safe';
    let progressColor = '#198754';
    if (next._days <= 7)       { urgencyClass = 'urgent'; progressColor = '#dc3545'; }
    else if (next._days <= 30) { urgencyClass = 'warning'; progressColor = '#fd7e14'; }

    const totalDays = Math.max(1, Math.round(
        (new Date(next._matDate) - new Date(next.startDate)) / 86400000
    ));
    const elapsedDays = totalDays - next._days;
    const pct = Math.min(100, Math.round((elapsedDays / totalDays) * 100));

    let timeLeftLabel = next._days + ' days';
    if (next._days > 60) {
        const months = Math.floor(next._days / 30);
        const remDays = next._days % 30;
        timeLeftLabel = remDays > 0 ? months + 'm ' + remDays + 'd' : months + ' months';
    }

    const matInterest = calculateInterestForRecord(next);

    const queueHTML = queue.map(function(r) {
        const qStyle = r._days <= 7 ? 'color:#dc3545' : r._days <= 30 ? 'color:#fd7e14' : '';
        const shortBank = r.bank.split(' ')[0];
        return '<div class="countdown-queue-item" title="' + r.accountHolder + ' \u00b7 ' + r.bank + ' \u00b7 ' + formatDate(r._matDate) + '">' +
               '<span class="q-days" style="' + qStyle + '">' + r._days + 'd</span>' +
               '<span class="q-bank">' + shortBank + '</span>' +
               '<span class="q-bank">' + formatCurrency(r.amount) + '</span>' +
               '</div>';
    }).join('');

    const displayDays = next._days <= 60 ? next._days : timeLeftLabel;
    const displayLabel = next._days <= 60 ? 'days to maturity' : 'to maturity';

    container.innerHTML =
        '<div class="countdown-widget">' +
            '<div class="countdown-left ' + urgencyClass + '">' +
                '<div class="countdown-days">' + displayDays + '</div>' +
                '<div class="countdown-label">' + displayLabel + '</div>' +
            '</div>' +
            '<div class="countdown-right flex-grow-1 px-3 py-2">' +
                '<div class="countdown-fd-name">' +
                    '<i class="bi bi-bank2 me-1 text-primary"></i>' + next.bank +
                    '<span class="text-muted fw-normal ms-2 small">\u00b7 ' + next.accountHolder + '</span>' +
                '</div>' +
                '<div class="countdown-fd-details">' +
                    formatCurrency(next.amount) + ' \u00b7 ' + next.rate + '% p.a. \u00b7 matures ' + formatDate(next._matDate) +
                    ' \u00b7 interest at maturity: <strong class="text-success">' + formatCurrency(matInterest) + '</strong>' +
                '</div>' +
                '<div class="countdown-progress-wrap">' +
                    '<div class="countdown-progress">' +
                        '<div class="countdown-progress-bar" style="width:' + pct + '%; background:' + progressColor + ';"></div>' +
                    '</div>' +
                    '<small class="text-muted" style="white-space:nowrap;">' + pct + '% elapsed</small>' +
                '</div>' +
            '</div>' +
            (queue.length > 0 ? '<div class="countdown-queue">' + queueHTML + '</div>' : '') +
        '</div>';
}

/**
 * Calculate interest earned from startDate to today for an active FD.
 * Uses quarterly compounding (standard Nepal bank practice).
 */
function calculateEarnedToDate(record) {
    if (!record || !record.amount || !record.rate || !record.startDate) return 0;

    const start = new Date(record.startDate);
    const today = new Date();
    const matDate = new Date(
        record.maturityDate ||
        calculateMaturityDate(record.startDate, record.duration, record.durationUnit)
    );

    if (today <= start) return 0;
    const effectiveEnd = today < matDate ? today : matDate;

    const daysElapsed = Math.floor((effectiveEnd - start) / 86400000);
    const monthsElapsed = (daysElapsed / 365) * 12;

    return calculateCompoundInterest(record.amount, record.rate, monthsElapsed, 4);
}


function updatePortfolioChart(records) {
    const canvas = document.getElementById('portfolioChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    if (records.length === 0) {
        if (portfolioChart) {
            portfolioChart.destroy();
            portfolioChart = null;
        }
        return;
    }
    
    const bankGroups = groupBy(records, 'bank');
    const labels = Object.keys(bankGroups);
    const data = labels.map(bank => sumBy(bankGroups[bank], 'amount'));
    const colors = getChartColors(labels.length);
    
    if (portfolioChart) {
        portfolioChart.destroy();
    }
    
    portfolioChart = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const label = context.label || '';
                            const value = formatCurrency(context.parsed);
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.parsed / total) * 100).toFixed(1);
                            return `${label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });
}

// ===================================
// Settings Functions
// ===================================

function populateSettings() {
    const settings = JSON.parse(localStorage.getItem('fd_settings') || '{}');
    
    if (document.getElementById('currencySymbol')) {
        document.getElementById('currencySymbol').value = settings.currencySymbol || 'NRs';
    }
    
    if (document.getElementById('darkMode')) {
        document.getElementById('darkMode').checked = settings.darkMode || false;
    }
}

function saveSettings() {
    const settings = {
        currencySymbol: document.getElementById('currencySymbol')?.value || 'NRs',
        darkMode: document.getElementById('darkMode')?.checked || false
    };
    
    localStorage.setItem('fd_settings', JSON.stringify(settings));
    
    currencySymbol = settings.currencySymbol;
    
    loadFDRecords();
    updateDashboard();
    
    showToast('Settings saved successfully', 'success');
}

async function showChangePIN() {
    const oldPIN = prompt('Enter current PIN:');
    
    if (!oldPIN || !isValidPIN(oldPIN)) {
        showToast('Invalid PIN format', 'error');
        return;
    }
    
    const oldHash = CryptoJS.SHA256(oldPIN).toString();
    const savedHash = localStorage.getItem('fd_pin');
    
    if (oldHash !== savedHash) {
        showToast('Incorrect current PIN', 'error');
        return;
    }
    
    const newPIN = prompt('Enter new 4-digit PIN:');
    
    if (!newPIN || !isValidPIN(newPIN)) {
        showToast('Invalid new PIN format', 'error');
        return;
    }
    
    const confirmPIN = prompt('Confirm new PIN:');
    
    if (newPIN !== confirmPIN) {
        showToast('PINs do not match', 'error');
        return;
    }
    
    const newHash = CryptoJS.SHA256(newPIN).toString();
    localStorage.setItem('fd_pin', newHash);
    pinHash = newHash;
    
    // Re-encrypt data with new PIN
    await initDataManager(newPIN);
    
    const holders = await getCachedData('accountHolders', 'fd_account_holders');
    const records = await getCachedData('records', 'fd_records');
    const templates = await getCachedData('templates', 'fd_templates');
    
    await saveData('fd_account_holders', holders);
    await saveData('fd_records', records);
    await saveData('fd_templates', templates);
    
    showToast('PIN changed successfully!', 'success');
}

// ===================================
// Enhanced FD Entry - Automation Features
// ===================================

let draftData = null;
let lastFDData = null;

/**
 * Load draft data
 */
function loadDraft() {
    const draft = localStorage.getItem('fd_draft');
    if (!draft) return;
    
    const data = JSON.parse(draft);
    
    document.getElementById('fdAccountHolder').value = data.accountHolder || '';
    document.getElementById('fdBank').value = data.bank || '';
    document.getElementById('fdAmount').value = data.amount || '';
    document.getElementById('fdDuration').value = data.duration || '';
    document.getElementById('fdDurationUnit').value = data.durationUnit || 'Months';
    document.getElementById('fdRate').value = data.rate || '';
    document.getElementById('fdStartDate').value = data.startDate || '';
    document.getElementById('fdCertStatus').value = data.certStatus || 'Not Obtained';
    document.getElementById('fdNumber').value = data.fdNumber || '';
    document.getElementById('fdNotes').value = data.notes || '';
    
    updateInterestPreview();
    autoCalculateMaturity();
    toggleCertificateUpload();
    
    showToast('Draft loaded successfully', 'success');
}

/**
 * Clear draft
 */
function clearDraft() {
    localStorage.removeItem('fd_draft');
    document.getElementById('loadDraftBtn').style.display = 'none';
}

/**
 * Quick add new account holder
 */
async function quickAddHolder() {
    const name = prompt('Enter account holder name:');
    if (!name || !name.trim()) return;
    
    const holders = (await getCachedData('accountHolders', 'fd_account_holders')) || [];
    if (holders.includes(name.trim())) {
        showToast('Account holder already exists', 'warning');
        return;
    }
    
    holders.push(name.trim());
    await saveData('fd_account_holders', holders);
    loadAccountHolders();
    
    document.getElementById('fdAccountHolder').value = name.trim();
    showToast(`Account holder "${name}" added`, 'success');
}

/**
 * Set today's date
 */
function setTodayDate() {
    if (document.getElementById('useTodayDate').checked) {
        document.getElementById('fdStartDate').value = new Date().toISOString().split('T')[0];
        autoCalculateMaturity();
        saveDraft();
    }
}

/**
 * Set quick duration
 */
function setDuration(duration, unit) {
    document.getElementById('fdDuration').value = duration;
    document.getElementById('fdDurationUnit').value = unit;
    updateInterestPreview();
    autoCalculateMaturity();
    saveDraft();
}

/**
 * Auto-calculate maturity date
 */
function autoCalculateMaturity() {
    const startDate = document.getElementById('fdStartDate').value;
    const duration = parseInt(document.getElementById('fdDuration').value);
    const unit = document.getElementById('fdDurationUnit').value;
    
    if (!startDate || !duration) return;
    
    const maturityDate = calculateMaturityDate(startDate, duration, unit);
    document.getElementById('fdMaturityDate').value = maturityDate;
}

/**
 * Suggest bank rate with AI enhancement
 */
async function suggestBankRate() {
    const bankName = document.getElementById('fdBank').value;
    if (!bankName) {
        document.getElementById('suggestedRate').textContent = '';
        return;
    }
    
    // Use AI smart recognition first
    if (typeof aiFeatures !== 'undefined') {
        try {
            const recognition = await aiFeatures.smartBankRecognition(bankName);
            if (recognition && recognition.confidence > 0.7) {
                // Update bank name if AI found a better match
                if (recognition.fullName !== bankName && recognition.confidence > 0.85) {
                    document.getElementById('fdBank').value = recognition.fullName;
                    showSmartSuggestion(`🤖 AI corrected bank name to: ${recognition.fullName} (${Math.round(recognition.confidence * 100)}% confidence)`);
                }
                
                // Get AI rate prediction
                const duration = parseFloat(document.getElementById('fdDuration').value) || 12;
                const durationUnit = document.getElementById('fdDurationUnit').value || 'Months';
                const amount = parseFloat(document.getElementById('fdAmount').value) || 1000000;
                
                const prediction = await aiFeatures.predictInterestRate(recognition.fullName, duration, durationUnit, amount);
                if (prediction) {
                    const confidenceText = prediction.confidence > 0.8 ? 'High' : prediction.confidence > 0.6 ? 'Medium' : 'Low';
                    document.getElementById('suggestedRate').innerHTML = 
                        `<i class="bi bi-robot"></i> AI Predicted: <strong>${prediction.rate}%</strong> 
                        <span class="badge bg-${prediction.confidence > 0.8 ? 'success' : prediction.confidence > 0.6 ? 'warning' : 'secondary'}">${confidenceText} confidence</span>
                        <a href="#" onclick="fillSuggestedRate(${prediction.rate}); return false;" class="ms-2">Use this</a>`;
                    
                    // Show AI insights if available
                    if (prediction.factors && Object.values(prediction.factors).some(f => f !== 0)) {
                        let insights = '🧠 AI Insights: ';
                        if (prediction.factors.amountAdjustment > 0) insights += `Amount bonus +${prediction.factors.amountAdjustment}% `;
                        if (prediction.factors.userAdjustment !== 0) insights += `Your history ${prediction.factors.userAdjustment > 0 ? '+' : ''}${prediction.factors.userAdjustment}% `;
                        showSmartSuggestion(insights);
                    }
                    return;
                }
            } else if (recognition && recognition.confidence <= 0.7) {
                document.getElementById('suggestedRate').innerHTML = 
                    `<i class="bi bi-question-circle"></i> Low confidence match: ${recognition.fullName} (${Math.round(recognition.confidence * 100)}%)`;
                return;
            }
        } catch (error) {
            console.error('AI rate prediction failed:', error);
        }
    }
    
    // Fallback to traditional method
    const bankRateData = bankRates.find(b => b.bank === bankName);
    if (bankRateData && bankRateData.rates && bankRateData.rates.length > 0) {
        const avgRate = bankRateData.rates.reduce((sum, r) => sum + r.rate, 0) / bankRateData.rates.length;
        document.getElementById('suggestedRate').innerHTML = 
            `<i class="bi bi-info-circle"></i> Typical rate: ${avgRate.toFixed(2)}% 
            <a href="#" onclick="fillSuggestedRate(${avgRate.toFixed(2)}); return false;">Use this</a>`;
    } else {
        document.getElementById('suggestedRate').textContent = '';
    }
}

/**
 * Fill suggested rate
 */
function fillSuggestedRate(rate) {
    document.getElementById('fdRate').value = rate;
    updateInterestPreview();
    saveDraft();
}

/**
 * Validate amount and show in words
 */
function validateAmount() {
    const amount = parseFloat(document.getElementById('fdAmount').value);
    if (!amount) {
        document.getElementById('amountInWords').textContent = '';
        return;
    }
    
    // Convert to words (simplified)
    const inWords = convertAmountToWords(amount);
    document.getElementById('amountInWords').textContent = inWords;
    
    // Show suggestion if amount is unusual
    if (amount < 25000) {
        showSmartSuggestion('⚠️ Amount is below typical minimum (NRs 25,000). Some banks may not accept this.');
    } else if (amount > 10000000) {
        showSmartSuggestion('💡 Large investment! Consider splitting across multiple banks for better safety (DICGC insurance limit).');
    } else {
        hideSmartSuggestion();
    }
}

/**
 * Convert amount to words (simplified)
 */
function convertAmountToWords(amount) {
    if (amount >= 100000) {
        const lakhs = (amount / 100000).toFixed(2);
        return `${lakhs} Lakh`;
    } else if (amount >= 1000) {
        const thousands = (amount / 1000).toFixed(2);
        return `${thousands} Thousand`;
    }
    return '';
}

/**
 * Show smart suggestion
 */
function showSmartSuggestion(message) {
    document.getElementById('smartSuggestions').style.display = 'block';
    document.getElementById('suggestionText').textContent = message;
}

/**
 * Hide smart suggestion
 */
function hideSmartSuggestion() {
    document.getElementById('smartSuggestions').style.display = 'none';
}

/**
 * Enhanced interest preview with TDS
 */
function updateInterestPreview() {
    const amount = parseFloat(document.getElementById('fdAmount').value) || 0;
    const rate = parseFloat(document.getElementById('fdRate').value) || 0;
    const duration = parseInt(document.getElementById('fdDuration').value) || 0;
    const unit = document.getElementById('fdDurationUnit').value;
    
    if (amount && rate && duration) {
        const months = getDurationInMonths(duration, unit);
        
        const quarterly = calculateCompoundInterest(amount, rate, months, 4);
        const monthly = calculateCompoundInterest(amount, rate, months, 12);
        const annual = calculateCompoundInterest(amount, rate, months, 1);
        
        document.getElementById('previewQuarterly').textContent = formatCurrency(quarterly);
        document.getElementById('previewMonthly').textContent = formatCurrency(monthly);
        document.getElementById('previewAnnual').textContent = formatCurrency(annual);
        
        // Maturity amount (using quarterly as default)
        const maturityAmount = amount + quarterly;
        document.getElementById('previewMaturity').textContent = formatCurrency(maturityAmount);
        
        // TDS calculation (5% on interest)
        const tds = quarterly * 0.05;
        const netInterest = quarterly - tds;
        
        document.getElementById('tdsTax').textContent = formatCurrency(tds);
        document.getElementById('netInterest').textContent = formatCurrency(netInterest);
        
        // Rate comparison
        compareWithMarketRate(rate);
    } else {
        document.getElementById('previewQuarterly').textContent = formatCurrency(0);
        document.getElementById('previewMonthly').textContent = formatCurrency(0);
        document.getElementById('previewAnnual').textContent = formatCurrency(0);
        document.getElementById('previewMaturity').textContent = formatCurrency(0);
        document.getElementById('tdsTax').textContent = formatCurrency(0);
        document.getElementById('netInterest').textContent = formatCurrency(0);
    }
}

/**
 * Compare with market rate
 */
function compareWithMarketRate(rate) {
    const avgMarketRate = 9.0; // Average Nepal bank rate
    if (rate > avgMarketRate) {
        document.getElementById('rateComparison').innerHTML = 
            `<i class="bi bi-arrow-up-circle"></i> ${(rate - avgMarketRate).toFixed(2)}% above market average!`;
    } else if (rate < avgMarketRate) {
        document.getElementById('rateComparison').innerHTML = 
            `<i class="bi bi-arrow-down-circle"></i> ${(avgMarketRate - rate).toFixed(2)}% below market average`;
    } else {
        document.getElementById('rateComparison').textContent = '';
    }
}

/**
 * Toggle certificate upload section
 */
function toggleCertificateUpload() {
    const status = document.getElementById('fdCertStatus').value;
    const section = document.getElementById('certificateUploadSection');
    
    if (status === 'Obtained' || status === 'Digital') {
        section.style.display = 'block';
    } else {
        section.style.display = 'none';
    }
}

/**
 * Preview certificate
 */
function previewCertificate(input) {
    if (!input.files || input.files.length === 0) return;
    
    const file = input.files[0];
    
    // Validate size
    if (file.size > 5 * 1024 * 1024) {
        showToast('File too large. Maximum 5MB allowed.', 'error');
        input.value = '';
        return;
    }
    
    const preview = document.getElementById('certificatePreview');
    const previewImage = document.getElementById('certPreviewImage');
    const previewPDF = document.getElementById('certPreviewPDF');
    
    preview.style.display = 'block';
    
    if (file.type === 'application/pdf') {
        previewImage.style.display = 'none';
        previewPDF.style.display = 'block';
        document.getElementById('certFileName').textContent = file.name;
        document.getElementById('certFileSize').textContent = (file.size / 1024).toFixed(2) + ' KB';
    } else {
        previewPDF.style.display = 'none';
        previewImage.style.display = 'block';
        
        const reader = new FileReader();
        reader.onload = function(e) {
            previewImage.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

/**
 * Remove certificate preview
 */
function removeCertificatePreview() {
    document.getElementById('fdCertificate').value = '';
    document.getElementById('certificatePreview').style.display = 'none';
    document.getElementById('certPreviewImage').src = '';
}

/**
 * Add tag to notes
 */
function addTag(tag) {
    const notesField = document.getElementById('fdNotes');
    const currentNotes = notesField.value.trim();
    
    if (currentNotes && !currentNotes.includes(tag)) {
        notesField.value = currentNotes + ', ' + tag;
    } else if (!currentNotes) {
        notesField.value = tag;
    }
    
    saveDraft();
}

/**
 * Clear form
 */
function clearForm() {
    if (!confirm('Clear all form data?')) return;
    
    document.getElementById('fdForm').reset();
    removeCertificatePreview();
    hideSmartSuggestion();
    updateInterestPreview();
    clearDraft();
}

/**
 * Save and add another
 */
function saveAndAddAnother() {
    // Save current FD
    const saved = saveFD(new Event('submit'));
    
    if (saved !== false) {
        // Keep holder and bank, clear rest
        const holder = document.getElementById('fdAccountHolder').value;
        const bank = document.getElementById('fdBank').value;
        
        clearForm();
        
        document.getElementById('fdAccountHolder').value = holder;
        document.getElementById('fdBank').value = bank;
        
        showToast('FD saved! Add another for same holder/bank.', 'success');
    }
}

/**
 * Show quick add modal
 */
async function showQuickAddModal() {
    const holders = (await getCachedData('accountHolders', 'fd_account_holders')) || [];
    const select = document.getElementById('quickHolder');
    
    select.innerHTML = '<option value="">Select Holder</option>';
    holders.forEach(h => {
        const option = document.createElement('option');
        option.value = h;
        option.textContent = h;
        select.appendChild(option);
    });
    
    const modal = new bootstrap.Modal(document.getElementById('quickAddModal'));
    modal.show();
}

/**
 * Save quick FD
 */
async function saveQuickFD(event) {
    event.preventDefault();
    
    const holder = document.getElementById('quickHolder').value;
    const bank = document.getElementById('quickBank').value;
    const amount = parseFloat(document.getElementById('quickAmount').value);
    const rate = parseFloat(document.getElementById('quickRate').value);
    const duration = parseInt(document.getElementById('quickDuration').value);
    const unit = document.getElementById('quickUnit').value;
    
    const startDate = new Date().toISOString().split('T')[0];
    const maturityDate = calculateMaturityDate(startDate, duration, unit);
    
    const record = {
        id: generateId(),
        accountHolder: holder,
        bank: bank,
        amount: amount,
        duration: duration,
        durationUnit: unit,
        rate: rate,
        startDate: startDate,
        maturityDate: maturityDate,
        certificateStatus: 'Not Obtained',
        notes: 'Quick Add',
        createdAt: new Date().toISOString()
    };
    
    let records = (await getCachedData('records', 'fd_records')) || [];
    records.push(record);
    await saveData('fd_records', records);
    
    loadFDRecords();
    await updateDashboard();
    updateAnalytics();
    
    bootstrap.Modal.getInstance(document.getElementById('quickAddModal')).hide();
    document.getElementById('quickAddForm').reset();
    
    showToast('FD added quickly!', 'success');
}

/**
 * Duplicate last FD
 */
async function duplicateLastFD() {
    const records = (await getCachedData('records', 'fd_records')) || [];
    if (records.length === 0) {
        showToast('No FDs to duplicate', 'warning');
        return;
    }
    
    const lastRecord = records[records.length - 1];
    
    document.getElementById('fdAccountHolder').value = lastRecord.accountHolder;
    document.getElementById('fdBank').value = lastRecord.bank;
    document.getElementById('fdAmount').value = lastRecord.amount;
    document.getElementById('fdDuration').value = lastRecord.duration;
    document.getElementById('fdDurationUnit').value = lastRecord.durationUnit;
    document.getElementById('fdRate').value = lastRecord.rate;
    document.getElementById('fdStartDate').value = new Date().toISOString().split('T')[0];
    
    updateInterestPreview();
    autoCalculateMaturity();
    
    showToast('Last FD duplicated. Modify and save.', 'success');
    
    document.querySelector('#records .card').scrollIntoView({ behavior: 'smooth' });
}

/**
 * Show renewal helper
 */
async function showRenewalHelper() {
    const records = (await getCachedData('records', 'fd_records')) || [];
    const select = document.getElementById('renewalFDSelect');
    
    select.innerHTML = '<option value="">Choose FD...</option>';
    records.forEach(r => {
        const maturityDate = r.maturityDate || calculateMaturityDate(r.startDate, r.duration, r.durationUnit);
        const option = document.createElement('option');
        option.value = r.id;
        option.textContent = `${r.bank} - ${formatCurrency(r.amount)} (Matures: ${formatDate(maturityDate)})`;
        select.appendChild(option);
    });
    
    const modal = new bootstrap.Modal(document.getElementById('renewalModal'));
    modal.show();
}

/**
 * Load renewal details
 */
async function loadRenewalDetails() {
    const fdId = document.getElementById('renewalFDSelect').value;
    if (!fdId) {
        document.getElementById('renewalDetails').style.display = 'none';
        return;
    }
    
    const records = (await getCachedData('records', 'fd_records')) || [];
    const record = records.find(r => r.id === fdId);
    
    if (!record) return;
    
    const maturityDate = record.maturityDate || calculateMaturityDate(record.startDate, record.duration, record.durationUnit);
    const interest = calculateInterestForRecord(record);
    
    document.getElementById('renewalOriginalDetails').innerHTML = `
        <strong>${record.bank}</strong><br>
        Amount: ${formatCurrency(record.amount)}<br>
        Rate: ${record.rate}%<br>
        Duration: ${record.duration} ${record.durationUnit}<br>
        Maturity Date: ${formatDate(maturityDate)}<br>
        Expected Interest: ${formatCurrency(interest)}
    `;
    
    document.getElementById('renewalStartDate').value = maturityDate;
    document.getElementById('renewalRate').value = record.rate;
    
    document.getElementById('renewalDetails').style.display = 'block';
}

/**
 * Process renewal
 */
async function processRenewal() {
    const fdId = document.getElementById('renewalFDSelect').value;
    const records = (await getCachedData('records', 'fd_records')) || [];
    const originalRecord = records.find(r => r.id === fdId);
    
    if (!originalRecord) return;
    
    const newStartDate = document.getElementById('renewalStartDate').value;
    const newRate = parseFloat(document.getElementById('renewalRate').value);
    const reinvest = document.getElementById('renewalReinvest').value;
    
    let newAmount = originalRecord.amount;
    if (reinvest === 'yes') {
        const interest = calculateInterestForRecord(originalRecord);
        newAmount = originalRecord.amount + interest;
    }
    
    const newMaturityDate = calculateMaturityDate(newStartDate, originalRecord.duration, originalRecord.durationUnit);
    
    const renewalRecord = {
        id: generateId(),
        accountHolder: originalRecord.accountHolder,
        bank: originalRecord.bank,
        amount: newAmount,
        duration: originalRecord.duration,
        durationUnit: originalRecord.durationUnit,
        rate: newRate,
        startDate: newStartDate,
        maturityDate: newMaturityDate,
        certificateStatus: 'Not Obtained',
        notes: `Renewal of FD from ${formatDate(originalRecord.startDate)}`,
        createdAt: new Date().toISOString()
    };
    
    records.push(renewalRecord);
    await saveData('fd_records', records);
    
    loadFDRecords();
    await updateDashboard();
    updateAnalytics();
    
    bootstrap.Modal.getInstance(document.getElementById('renewalModal')).hide();
    
    showToast('Renewal FD created successfully!', 'success');
}

/**
 * Load recent FD for selected holder
 */
function loadRecentFDForHolder() {
    const holder = document.getElementById('fdAccountHolder').value;
    if (!holder) return;
    
    getData('fd_records').then(records => {
        const holderRecords = (records || []).filter(r => r.accountHolder === holder);
        
        if (holderRecords.length > 0) {
            const recent = holderRecords[holderRecords.length - 1];
            document.getElementById('fdBank').value = recent.bank;
            suggestBankRate();
        }
    }).catch(error => {
        console.error('Error loading recent FD:', error);
    });
}

/**
 * Show bank rate helper
 */
function showBankRateHelper() {
    const bank = document.getElementById('fdBank').value;
    if (!bank) {
        showToast('Please enter bank name first', 'warning');
        return;
    }
    
    const bankData = bankRates.find(b => b.bank === bank);
    if (!bankData) {
        showToast('No rate data available for this bank', 'info');
        return;
    }
    
    let ratesHTML = '<h6>Current Rates for ' + bank + ':</h6><ul>';
    bankData.rates.forEach(r => {
        ratesHTML += `<li>${r.duration} months: ${r.rate}%</li>`;
    });
    ratesHTML += '</ul>';
    
    const alertDiv = document.createElement('div');
    alertDiv.className = 'alert alert-info alert-dismissible fade show';
    alertDiv.innerHTML = ratesHTML + '<button type="button" class="btn-close" data-bs-dismiss="alert"></button>';
    
    document.querySelector('#records .card-body').prepend(alertDiv);
    
    setTimeout(() => {
        alertDiv.remove();
    }, 10000);
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    // Check for draft
    if (localStorage.getItem('fd_draft')) {
        document.getElementById('loadDraftBtn').style.display = 'inline-block';
    }
    
    // Set today's date as default
    const today = new Date().toISOString().split('T')[0];
    if (document.getElementById('fdStartDate')) {
        document.getElementById('fdStartDate').value = today;
    }
});

console.log('[FD Manager Nepal] Enhanced automation features loaded');
// ===================================
// Drag & Drop Certificate Upload
// ===================================

document.addEventListener('DOMContentLoaded', function() {
    const uploadArea = document.getElementById('certUploadArea');
    const fileInput = document.getElementById('fdCertificate');
    
    if (!uploadArea || !fileInput) return;
    
    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });
    
    // Highlight drop area when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
        uploadArea.addEventListener(eventName, highlight, false);
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
        uploadArea.addEventListener(eventName, unhighlight, false);
    });
    
    // Handle dropped files
    uploadArea.addEventListener('drop', handleDrop, false);
    
    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }
    
    function highlight(e) {
        uploadArea.classList.add('dragover');
    }
    
    function unhighlight(e) {
        uploadArea.classList.remove('dragover');
    }
    
    function handleDrop(e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        
        if (files.length > 0) {
            fileInput.files = files;
            previewCertificate(fileInput);
        }
    }
});

// ===================================
// Auto-save with Debouncing
// ===================================

let saveDraftTimeout;

function saveDraft() {
    clearTimeout(saveDraftTimeout);
    
    saveDraftTimeout = setTimeout(() => {
        const formData = {
            accountHolder: document.getElementById('fdAccountHolder')?.value,
            bank: document.getElementById('fdBank')?.value,
            amount: document.getElementById('fdAmount')?.value,
            duration: document.getElementById('fdDuration')?.value,
            durationUnit: document.getElementById('fdDurationUnit')?.value,
            rate: document.getElementById('fdRate')?.value,
            startDate: document.getElementById('fdStartDate')?.value,
            certStatus: document.getElementById('fdCertStatus')?.value,
            fdNumber: document.getElementById('fdNumber')?.value,
            notes: document.getElementById('fdNotes')?.value,
            timestamp: new Date().toISOString()
        };
        
        localStorage.setItem('fd_draft', JSON.stringify(formData));
        
        // Show draft saved indicator
        const loadBtn = document.getElementById('loadDraftBtn');
        if (loadBtn) {
            loadBtn.style.display = 'inline-block';
            loadBtn.innerHTML = '<i class="bi bi-cloud-check"></i> Draft Saved';
            
            setTimeout(() => {
                loadBtn.innerHTML = '<i class="bi bi-arrow-counterclockwise"></i> Load Draft';
            }, 2000);
        }
    }, 1000); // Debounce for 1 second
}

// ===================================
// Keyboard Shortcuts
// ===================================

document.addEventListener('keydown', function(e) {
    // Ctrl+S or Cmd+S to save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        const saveBtn = document.querySelector('#fdForm button[type="submit"]');
        if (saveBtn) {
            saveBtn.click();
        }
    }
    
    // Ctrl+D or Cmd+D to save draft
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        e.preventDefault();
        saveDraft();
        showToast('Draft saved', 'success');
    }
    
    // Esc to clear form
    if (e.key === 'Escape') {
        if (currentEditId) {
            cancelEdit();
        }
    }
});

console.log('[FD Manager Nepal] Drag & drop and keyboard shortcuts enabled');

console.log('[FD Manager Nepal] App-part2.js loaded successfully');
// ===================================
// FD Manager Pro - Application Part 3
// Analytics, Export, Backup, Calculator
// Nepal Edition - Version 4.0
// ===================================

// ===================================
// Analytics Functions
// ===================================

async function updateAnalytics() {
    let records = (await getCachedData('records', 'fd_records')) || [];
    
    // Filter out records for disabled account holders
    records = await filterRecordsByAccountHolderStatus(records);
    
    if (records.length === 0) {
        const canvas = document.getElementById('analyticsChart');
        if (canvas && analyticsChart) {
            analyticsChart.destroy();
            analyticsChart = null;
        }
        document.getElementById('bankAnalysisTable').innerHTML = 
            '<tr><td colspan="5" class="text-center text-muted">No data available</td></tr>';
        return;
    }
    
    const bankGroups = groupBy(records, 'bank');
    const bankStats = Object.keys(bankGroups).map(bank => {
        const bankRecords = bankGroups[bank];
        return {
            bank: bank,
            count: bankRecords.length,
            totalInvestment: sumBy(bankRecords, 'amount'),
            totalInterest: bankRecords.reduce((sum, r) => sum + calculateInterestForRecord(r), 0),
            avgRate: averageBy(bankRecords, 'rate')
        };
    });
    
    document.getElementById('analyticsTotalBanks').textContent = bankStats.length;
    document.getElementById('analyticsTotalFDs').textContent = records.length;
    document.getElementById('analyticsTotalInvestment').textContent = formatCurrency(sumBy(records, 'amount'));
    document.getElementById('analyticsTotalInterest').textContent = formatCurrency(
        records.reduce((sum, r) => sum + calculateInterestForRecord(r), 0)
    );
    document.getElementById('analyticsAvgRate').textContent = averageBy(records, 'rate').toFixed(2) + '%';
    
    updateBankAnalysisTable(bankStats);
    updateAnalyticsChart(bankStats);
}

function updateBankAnalysisTable(bankStats) {
    const tbody = document.getElementById('bankAnalysisTable');
    if (!tbody) return;
    
    tbody.innerHTML = bankStats.map(stat => `
        <tr>
            <td><strong>${stat.bank}</strong></td>
            <td>${stat.count}</td>
            <td>${formatCurrency(stat.totalInvestment)}</td>
            <td>${formatCurrency(stat.totalInterest)}</td>
            <td>${stat.avgRate.toFixed(2)}%</td>
        </tr>
    `).join('');
}

function updateAnalyticsChart(bankStats) {
    const canvas = document.getElementById('analyticsChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    
    const labels = bankStats.map(s => s.bank);
    const data = bankStats.map(s => s.totalInvestment);
    const colors = getChartColors(labels.length);
    
    if (analyticsChart) {
        analyticsChart.destroy();
    }
    
    analyticsChart = new Chart(ctx, {
        type: currentChartType,
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Investment',
                data: data,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return formatCurrency(context.parsed.y || context.parsed);
                        }
                    }
                }
            },
            scales: currentChartType === 'bar' ? {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatCurrency(value);
                        }
                    }
                }
            } : {}
        }
    });
}

function changeChartType(type) {
    currentChartType = type;
    
    document.querySelectorAll('[onclick^="changeChartType"]').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    updateAnalytics();
}

// ===================================
// Enhanced Interest Calculator Functions
// COMPLETE FIXED VERSION
// ===================================

let interestComparisonChartInstance = null;

/**
 * Toggle between manual and existing FD mode
 */
async function toggleCalcMode() {
    const mode = document.getElementById('calcMode').value;
    
    if (mode === 'existing') {
        document.getElementById('existingFDSection').style.display = 'block';
        document.getElementById('manualInputSection').style.display = 'none';
        await loadAccountHoldersForCalc();
    } else {
        document.getElementById('existingFDSection').style.display = 'none';
        document.getElementById('manualInputSection').style.display = 'block';
    }
}

/**
 * Load account holders for calculator
 */
async function loadAccountHoldersForCalc() {
    let holders = (await getCachedData('accountHolders', 'fd_account_holders')) || [];
    
    // Clean up invalid entries first
    holders = cleanupAccountHolders(holders);
    
    // Filter enabled account holders only
    const enabledHolders = holders.filter(holder => {
        if (typeof holder === 'object') {
            return holder.enabled !== false;
        }
        return true; // Default to enabled for old string format
    });
    
    const select = document.getElementById('calcAccountHolder');
    
    if (!select) return;
    
    select.innerHTML = '<option value="">Select Holder</option>';
    enabledHolders.forEach(holder => {
        const holderName = typeof holder === 'object' ? holder.name : holder;
        // Skip invalid entries
        if (!holderName || holderName === '[object Object]' || typeof holderName !== 'string') {
            return;
        }
        const option = document.createElement('option');
        option.value = holderName;
        option.textContent = holderName;
        select.appendChild(option);
    });
}

/**
 * Load FDs for selected holder
 */
async function loadFDsForCalc() {
    const holder = document.getElementById('calcAccountHolder').value;
    const select = document.getElementById('calcFDSelect');
    
    if (!holder || !select) {
        select.innerHTML = '<option value="">Select FD</option>';
        return;
    }
    
    let records = (await getCachedData('records', 'fd_records')) || [];
    
    // Filter out records for disabled account holders
    records = await filterRecordsByAccountHolderStatus(records);
    
    // Filter by selected holder
    records = records.filter(r => r.accountHolder === holder);
    
    select.innerHTML = '<option value="">Select FD</option>';
    records.forEach(r => {
        const option = document.createElement('option');
        option.value = r.id;
        option.textContent = `${r.bank} - ${formatCurrency(r.amount)} @ ${r.rate}% (${r.duration} ${r.durationUnit})`;
        select.appendChild(option);
    });
}

/**
 * Fill calculator from selected FD
 */
async function fillCalcFromFD() {
    const fdId = document.getElementById('calcFDSelect').value;
    if (!fdId) return;
    
    const records = (await getCachedData('records', 'fd_records')) || [];
    const record = records.find(r => r.id === fdId);
    
    if (!record) return;
    
    document.getElementById('calcPrincipal').value = record.amount;
    document.getElementById('calcRate').value = record.rate;
    document.getElementById('calcDuration').value = record.duration;
    document.getElementById('calcUnit').value = record.durationUnit;
    
    // Set date range
    const maturityDate = record.maturityDate || calculateMaturityDate(
        record.startDate, record.duration, record.durationUnit
    );
    document.getElementById('calcFromDate').value = record.startDate;
    document.getElementById('calcToDate').value = maturityDate;
    
    showToast('FD data loaded into calculator', 'success');
}

/**
 * Toggle custom date range
 */
function toggleCalcDateRange() {
    const checked = document.getElementById('calcCustomDateRange').checked;
    document.getElementById('calcDateRangeDiv').style.display = checked ? 'block' : 'none';
}

/**
 * Toggle manual date range
 */
function toggleManualDateRange() {
    const checked = document.getElementById('calcManualDateRange').checked;
    const durationDiv = document.getElementById('calcManualDateRangeDiv');
    const durationInput = document.getElementById('calcDuration').parentElement.parentElement;
    
    if (checked) {
        durationDiv.style.display = 'block';
        durationInput.style.display = 'none';
        
        // Set default dates if empty
        const startInput = document.getElementById('calcManualStartDate');
        const endInput = document.getElementById('calcManualEndDate');
        if (!startInput.value) {
            const today = new Date().toISOString().split('T')[0];
            startInput.value = today;
            const tenDaysLater = new Date();
            tenDaysLater.setDate(tenDaysLater.getDate() + 10);
            endInput.value = tenDaysLater.toISOString().split('T')[0];
        }
    } else {
        durationDiv.style.display = 'none';
        durationInput.style.display = 'block';
    }
}

/**
 * Check if date string is valid
 */
function isValidDate(dateString) {
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
}

/**
 * Calculate duration from custom dates
 */
function calculateDurationFromDates(fromDate, toDate) {
    const start = new Date(fromDate);
    const end = new Date(toDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

/**
 * Main calculation function
 */
async function performCalculation() {
    const mode = document.getElementById('calcMode').value;
    let principal, rate, durationValue, unit;
    
    // Get values based on mode
    principal = parseFloat(document.getElementById('calcPrincipal').value);
    rate = parseFloat(document.getElementById('calcRate').value);
    
    // Check for date range input
    const useDateRange = (mode === 'existing' && document.getElementById('calcCustomDateRange')?.checked) ||
                         (mode === 'manual' && document.getElementById('calcManualDateRange')?.checked);
    
    let fromDate, toDate;
    if (useDateRange) {
        if (mode === 'existing') {
            fromDate = document.getElementById('calcFromDate').value;
            toDate = document.getElementById('calcToDate').value;
            
            if (!isValidDate(fromDate) || !isValidDate(toDate)) {
                return;
            }
            
            // Swap dates if from > to
            if (new Date(fromDate) > new Date(toDate)) {
                [fromDate, toDate] = [toDate, fromDate];
                document.getElementById('calcFromDate').value = fromDate;
                document.getElementById('calcToDate').value = toDate;
            }
            
            // Cap dates to FD term
            const fdId = document.getElementById('calcFDSelect').value;
            const records = (await getCachedData('records', 'fd_records')) || [];
            const record = records.find(r => r.id === fdId);
            if (record) {
                const maturityDate = calculateMaturityDate(record.startDate, record.duration, record.durationUnit);
                const fdStart = new Date(record.startDate);
                const fdEnd = new Date(maturityDate);
                const customFrom = new Date(fromDate);
                const customTo = new Date(toDate);
                
                if (customFrom < fdStart) {
                    fromDate = record.startDate;
                    document.getElementById('calcFromDate').value = fromDate;
                }
                if (customTo > fdEnd) {
                    toDate = maturityDate;
                    document.getElementById('calcToDate').value = toDate;
                }
            }
        } else { // manual
            fromDate = document.getElementById('calcManualStartDate').value;
            toDate = document.getElementById('calcManualEndDate').value;
            
            if (!isValidDate(fromDate) || !isValidDate(toDate)) {
                return;
            }
            
            // Swap dates if from > to
            if (new Date(fromDate) > new Date(toDate)) {
                [fromDate, toDate] = [toDate, fromDate];
                document.getElementById('calcManualStartDate').value = fromDate;
                document.getElementById('calcManualEndDate').value = toDate;
            }
        }
        
        if (!fromDate || !toDate) {
            showToast('Please select both start and end dates', 'error');
            return;
        }
        
        const days = calculateDurationFromDates(fromDate, toDate);
        durationValue = days;
        unit = 'Days';
    } else {
        durationValue = parseInt(document.getElementById('calcDuration').value);
        unit = document.getElementById('calcUnit').value;
    }
    
    const frequency = parseInt(document.getElementById('calcFrequency').value);
    
    // Special handling for existing FD with custom date range
    if (useDateRange && mode === 'existing') {
        const fdId = document.getElementById('calcFDSelect').value;
        const records = (await getCachedData('records', 'fd_records')) || [];
        const record = records.find(r => r.id === fdId);
        
        if (!record) {
            showToast('FD record not found', 'error');
            return;
        }
        
        // Use the new custom date range calculation function
        const interest = calculateInterestForCustomDateRange(record, fromDate, toDate, frequency);
        const maturityAmount = record.amount + calculateInterestForRecord(record); // Full maturity
        const customMaturityAmount = record.amount + interest; // Maturity at custom end date
        
        // Calculate simple interest for comparison (approximate)
        const days = calculateDurationFromDates(fromDate, toDate);
        const months = (days / 365) * 12;
        const simpleInterest = calculateSimpleInterest(record.amount, record.rate, months);
        
        // Display results
        document.getElementById('resultPrincipal').textContent = formatCurrency(record.amount);
        document.getElementById('resultRate').textContent = record.rate + '% p.a.';
        document.getElementById('resultDuration').textContent = `${days} Days (Custom Range)`;
        document.getElementById('resultFrequency').textContent = getFrequencyName(frequency);
        document.getElementById('resultSimple').textContent = formatCurrency(simpleInterest);
        document.getElementById('resultCompound').textContent = formatCurrency(interest);
        document.getElementById('resultMaturity').textContent = formatCurrency(customMaturityAmount);
        document.getElementById('resultDifference').textContent = formatCurrency(interest - simpleInterest);
        
        // Show results
        document.getElementById('calcResults').style.display = 'block';
        document.getElementById('noCalcResults').style.display = 'none';
        
        // Show comparison chart
        showInterestComparison(record.amount, simpleInterest, interest);

        // Success message
        showToast('Custom date range calculation completed!', 'success');
        return;
    }
    
    // Standard calculation for manual mode or existing FD without custom date range
    if (mode === 'existing' && !useDateRange) {
        const fdId = document.getElementById('calcFDSelect').value;
        const records = (await getCachedData('records', 'fd_records')) || [];
        const record = records.find(r => r.id === fdId);
        
        if (record) {
            principal = record.amount;
            rate = record.rate;
            durationValue = record.duration;
            unit = record.durationUnit;
        }
    }
    
    // Validation
    if (!principal || principal <= 0) {
        showToast('Please enter valid principal amount', 'error');
        return;
    }
    
    if (!rate || rate <= 0) {
        showToast('Please enter valid interest rate', 'error');
        return;
    }
    
    if (!durationValue || durationValue <= 0) {
        showToast('Please enter valid duration', 'error');
        return;
    }
    
    // Calculate in months
    let months;
    if (unit === 'Days') {
        months = (durationValue / 365) * 12; // More accurate calculation
    } else if (unit === 'Years') {
        months = durationValue * 12;
    } else {
        months = durationValue;
    }
    
    // Calculate interest
    const simpleInterest = calculateSimpleInterest(principal, rate, months);
    const compoundInterest = calculateCompoundInterest(principal, rate, months, frequency);
    const maturityAmount = principal + compoundInterest;
    const difference = compoundInterest - simpleInterest;
    
    // Display results
    document.getElementById('resultPrincipal').textContent = formatCurrency(principal);
    document.getElementById('resultRate').textContent = rate + '% p.a.';
    document.getElementById('resultDuration').textContent = `${durationValue} ${unit}`;
    document.getElementById('resultFrequency').textContent = getFrequencyName(frequency);
    document.getElementById('resultSimple').textContent = formatCurrency(simpleInterest);
    document.getElementById('resultCompound').textContent = formatCurrency(compoundInterest);
    document.getElementById('resultMaturity').textContent = formatCurrency(maturityAmount);
    document.getElementById('resultDifference').textContent = formatCurrency(difference);
    
    // Show results
    document.getElementById('calcResults').style.display = 'block';
    document.getElementById('noCalcResults').style.display = 'none';
    
    // Show comparison chart
    showInterestComparison(principal, simpleInterest, compoundInterest);

    // Success message
    showToast('Calculation completed successfully!', 'success');
}

/**
 * Show interest comparison chart (FIXED)
 */
function showInterestComparison(principal, simpleInterest, compoundInterest) {
    const comparisonCard = document.getElementById('comparisonCard');
    const canvas = document.getElementById('interestComparisonChart');
    
    if (!canvas) return;
    
    comparisonCard.style.display = 'block';
    
    const ctx = canvas.getContext('2d');
    
    // Destroy existing chart - use window reference for consistency
    if (window.interestComparisonChart && typeof window.interestComparisonChart.destroy === 'function') {
        window.interestComparisonChart.destroy();
        window.interestComparisonChart = null;
    }
    
    // Create new chart
    window.interestComparisonChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Principal', 'Simple Interest', 'Compound Interest'],
            datasets: [{
                label: 'Amount (NRs)',
                data: [principal, simpleInterest, compoundInterest],
                backgroundColor: [
                    'rgba(13, 110, 253, 0.7)',
                    'rgba(255, 193, 7, 0.7)',
                    'rgba(25, 135, 84, 0.7)'
                ],
                borderColor: [
                    'rgb(13, 110, 253)',
                    'rgb(255, 193, 7)',
                    'rgb(25, 135, 84)'
                ],
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return formatCurrency(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatCurrency(value);
                        }
                    }
                }
            }
        }
    });
}

/**
 * Set calculator preset values
 */
function setCalcPreset(amount, rate, duration, unit) {
    document.getElementById('calcMode').value = 'manual';
    toggleCalcMode();
    
    document.getElementById('calcPrincipal').value = amount;
    document.getElementById('calcRate').value = rate;
    document.getElementById('calcDuration').value = duration;
    document.getElementById('calcUnit').value = unit;
    
    showToast('Preset values loaded. Click Calculate to see results.', 'info');
}

/**
 * Print calculation results
 */
function printCalculation() {
    const principal = document.getElementById('resultPrincipal').textContent;
    const rate = document.getElementById('resultRate').textContent;
    const duration = document.getElementById('resultDuration').textContent;
    const frequency = document.getElementById('resultFrequency').textContent;
    const simple = document.getElementById('resultSimple').textContent;
    const compound = document.getElementById('resultCompound').textContent;
    const maturity = document.getElementById('resultMaturity').textContent;
    const difference = document.getElementById('resultDifference').textContent;
    
    const printWindow = window.open('', '', 'height=600,width=800');
    printWindow.document.write(`
        <html>
        <head>
            <title>FD Interest Calculation - FD Manager Pro</title>
            <style>
                body { font-family: Arial, sans-serif; padding: 20px; }
                h2 { color: #0d6efd; border-bottom: 2px solid #0d6efd; padding-bottom: 10px; }
                table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
                th { background-color: #f8f9fa; font-weight: bold; }
                .highlight { background-color: #fff3cd; font-size: 1.2em; font-weight: bold; }
                .footer { margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 0.9em; color: #666; }
            </style>
        </head>
        <body>
            <h2>FD Manager Pro - Nepal Edition</h2>
            <h3>Interest Calculation Report</h3>
            <p><strong>Generated on:</strong> ${new Date().toLocaleString()}</p>
            
            <table>
                <tr><th>Description</th><th>Value</th></tr>
                <tr><td>Principal Amount</td><td>${principal}</td></tr>
                <tr><td>Interest Rate</td><td>${rate}</td></tr>
                <tr><td>Duration</td><td>${duration}</td></tr>
                <tr><td>Compounding Frequency</td><td>${frequency}</td></tr>
                <tr><td>Simple Interest</td><td>${simple}</td></tr>
                <tr><td>Compound Interest</td><td>${compound}</td></tr>
                <tr><td>Extra Earnings (Compound vs Simple)</td><td>${difference}</td></tr>
                <tr class="highlight"><td>Total Maturity Amount</td><td>${maturity}</td></tr>
            </table>
            
            <div class="footer">
                <p><strong>Note:</strong> This is an estimate based on standard calculation formulas. 
                Actual returns may vary based on bank policies, early withdrawal penalties, and tax deductions (TDS).</p>
                <p><strong>Disclaimer:</strong> FD Manager Pro is a calculation tool. Please verify with your bank for exact figures.</p>
            </div>
        </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
}

/**
 * Save calculation to history
 */
function saveCalculationToHistory() {
    // Prepare calculation data
    const calculation = {
        id: generateId(),
        timestamp: new Date().toISOString(),
        mode: document.getElementById('calcMode').value,
        principal: document.getElementById('resultPrincipal').textContent,
        rate: document.getElementById('resultRate').textContent,
        duration: document.getElementById('resultDuration').textContent,
        frequency: document.getElementById('resultFrequency').textContent,
        simpleInterest: document.getElementById('resultSimple').textContent,
        compoundInterest: document.getElementById('resultCompound').textContent,
        maturityAmount: document.getElementById('resultMaturity').textContent,
        difference: document.getElementById('resultDifference').textContent,
        // Additional metadata
        calculationType: document.getElementById('calcCustomDateRange')?.checked ? 'Custom Date Range' : 'Standard',
        fdReference: document.getElementById('calcMode').value === 'existing' ?
            document.getElementById('calcFDSelect').options[document.getElementById('calcFDSelect').selectedIndex]?.text : 'Manual'
    };

    // Store calculation data temporarily for tax modal
    window.pendingCalculation = calculation;

    // Show tax calculation modal
    showTaxCalculationModal(calculation);
}

/**
 * Show tax calculation modal
 */
function showTaxCalculationModal(calculation) {
    // Populate modal with interest data
    document.getElementById('modalCompoundInterest').textContent = calculation.compoundInterest;
    document.getElementById('modalSimpleInterest').textContent = calculation.simpleInterest || '-';

    // Reset tax inputs with default 15% tax rate
    document.getElementById('taxRateInput').value = '15';
    // Trigger calculation for the default rate
    calculateTaxPreview();

    // Get modal element
    const modalElement = document.getElementById('taxCalculationModal');
    const taxRateInput = document.getElementById('taxRateInput');

    // Remove any existing event listeners to prevent duplicates
    const newTaxRateInput = taxRateInput.cloneNode(true);
    taxRateInput.parentNode.replaceChild(newTaxRateInput, taxRateInput);

    // Add event listener for tax rate input
    newTaxRateInput.addEventListener('input', calculateTaxPreview);

    // Focus on tax rate input when modal is shown
    modalElement.addEventListener('shown.bs.modal', function() {
        newTaxRateInput.focus();
        newTaxRateInput.select(); // Select the text for easy replacement
    });

    // Show modal
    const modal = new bootstrap.Modal(modalElement);
    modal.show();
}

/**
 * Calculate tax preview as user types
 */
function calculateTaxPreview() {
    const taxRateInput = document.getElementById('taxRateInput');
    const taxRate = parseFloat(taxRateInput.value) || 0;

    if (!window.pendingCalculation) {
        document.getElementById('taxAmountDisplay').value = '';
        document.getElementById('netInterestDisplay').value = '';
        return;
    }

    const compoundInterest = parseFloat(window.pendingCalculation.compoundInterest.replace(/[^\d.,-]/g, '').replace(/,/g, '')) || 0;
    const taxAmount = (compoundInterest * taxRate) / 100;
    const netInterest = compoundInterest - taxAmount;

    document.getElementById('taxAmountDisplay').value = taxRate > 0 ? formatCurrency(taxAmount.toString()) : '';
    document.getElementById('netInterestDisplay').value = taxRate > 0 ? formatCurrency(netInterest.toString()) : '';
}

/**
 * Save calculation with tax details
 */
function saveCalculationWithTax() {
    if (!window.pendingCalculation) {
        showToast('No calculation data available', 'error');
        return;
    }

    const taxRate = parseFloat(document.getElementById('taxRateInput').value) || 0;
    const compoundInterest = parseFloat(window.pendingCalculation.compoundInterest.replace(/[^\d.,-]/g, '').replace(/,/g, '')) || 0;
    const taxAmount = (compoundInterest * taxRate) / 100;
    const netInterest = compoundInterest - taxAmount;

    // Add tax details to calculation
    const calculationWithTax = {
        ...window.pendingCalculation,
        taxRate: taxRate > 0 ? taxRate.toString() : '',
        taxAmount: taxRate > 0 ? formatCurrency(taxAmount.toString()) : '',
        netInterest: taxRate > 0 ? formatCurrency(netInterest.toString()) : ''
    };

    // Save to history
    let history = JSON.parse(localStorage.getItem('calc_history') || '[]');
    history.unshift(calculationWithTax); // Add to beginning

    // Keep only last 50 calculations
    if (history.length > 50) {
        history = history.slice(0, 50);
    }

    localStorage.setItem('calc_history', JSON.stringify(history));
    displayCalculationHistory();

    // Close modal and show success message
    const modal = bootstrap.Modal.getInstance(document.getElementById('taxCalculationModal'));
    modal.hide();

    showToast('Calculation saved with tax details', 'success');

    // Clear pending calculation
    window.pendingCalculation = null;
}

/**
 * Export calculation history to Excel
 */
function exportCalculationsToExcel() {
    const history = JSON.parse(localStorage.getItem('calc_history') || '[]');

    if (history.length === 0) {
        showToast('No calculations to export', 'warning');
        return;
    }

    try {
        const excelData = history.map(calc => ({
            'Date & Time': formatDate(calc.timestamp),
            'Mode': calc.mode === 'existing' ? 'Existing FD' : 'Manual',
            'FD Reference': calc.fdReference || 'N/A',
            'Calculation Type': calc.calculationType || 'Standard',
            'Principal Amount': calc.principal,
            'Interest Rate': calc.rate,
            'Duration': calc.duration,
            'Compounding Frequency': calc.frequency,
            'Simple Interest': calc.simpleInterest,
            'Compound Interest': calc.compoundInterest,
            'Maturity Amount': calc.maturityAmount,
            'Extra Earnings': calc.difference,
            'Tax Rate (%)': calc.taxRate || '0',
            'Tax Amount': calc.taxAmount || '0',
            'Net Interest (After Tax)': calc.netInterest || calc.compoundInterest
        }));

        exportToExcelFile(excelData, 'FD_Calculations.xlsx');
        showToast('Calculations exported to Excel successfully', 'success');

    } catch (error) {
        console.error('Excel export error:', error);
        showToast('Excel export failed. Please try again.', 'error');
    }
}

/**
 * Display calculation history
 */
function displayCalculationHistory() {
    const history = JSON.parse(localStorage.getItem('calc_history') || '[]');
    const container = document.getElementById('calculationHistory');

    if (!container) return;

    if (history.length === 0) {
        container.innerHTML = '<div class="text-center text-muted py-4"><i class="bi bi-calculator display-4"></i><p class="mt-2">No saved calculations yet</p><small>Click "Save" after performing calculations to store them here</small></div>';
        return;
    }

    container.innerHTML = `
        <div class="table-responsive">
            <table class="table table-striped table-hover">
                <thead class="table-dark">
                    <tr>
                        <th>Date & Time</th>
                        <th>Principal</th>
                        <th>Rate</th>
                        <th>Duration</th>
                        <th>Simple Interest</th>
                        <th>Compound Interest</th>
                        <th>Maturity Amount</th>
                        <th>Tax Rate</th>
                        <th>Tax Amount</th>
                        <th>Net Interest</th>
                        <th>Type</th>
                        <th>Reference</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${history.map(calc => `
                        <tr>
                            <td class="small">${formatDate(calc.timestamp)}</td>
                            <td class="fw-bold">${calc.principal}</td>
                            <td>${calc.rate}</td>
                            <td>${calc.duration}</td>
                            <td class="text-info">${calc.simpleInterest || '-'}</td>
                            <td class="text-success">${calc.compoundInterest}</td>
                            <td class="fw-bold text-primary">${calc.maturityAmount}</td>
                            <td class="text-warning">${calc.taxRate ? calc.taxRate + '%' : '-'}</td>
                            <td class="text-danger">${calc.taxAmount || '-'}</td>
                            <td class="fw-bold text-success">${calc.netInterest || '-'}</td>
                            <td><span class="badge bg-secondary">${calc.calculationType || 'Standard'}</span></td>
                            <td class="small text-muted">${calc.fdReference && calc.fdReference !== 'Manual' ? calc.fdReference : '-'}</td>
                            <td>
                                <button class="btn btn-sm btn-outline-danger" onclick="deleteCalculationHistory('${calc.id}')" title="Delete this calculation">
                                    <i class="bi bi-trash"></i>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
        <div class="d-flex justify-content-between align-items-center mt-2">
            <small class="text-muted">Showing ${history.length} saved calculation${history.length !== 1 ? 's' : ''}</small>
            <button class="btn btn-sm btn-outline-danger" onclick="clearCalculationHistory()">
                <i class="bi bi-trash-fill"></i> Clear All
            </button>
        </div>
    `;
}

/**
 * Delete calculation from history
 */
function deleteCalculationHistory(id) {
    let history = JSON.parse(localStorage.getItem('calc_history') || '[]');
    history = history.filter(c => c.id !== id);
    localStorage.setItem('calc_history', JSON.stringify(history));
    displayCalculationHistory();
}

/**
 * Clear all calculation history
 */
function clearCalculationHistory() {
    if (!confirm('Clear all calculation history?')) return;
    
    localStorage.setItem('calc_history', '[]');
    displayCalculationHistory();
    showToast('History cleared', 'success');
}

/**
 * Filter calculation history by search term.
 * Called by the calcSearch input in the Calculator tab.
 */
function filterCalculations() {
    const query = (document.getElementById('calcSearch')?.value || '').toLowerCase().trim();
    const allCalcs = JSON.parse(localStorage.getItem('calc_history') || '[]');
    const countEl = document.getElementById('calcCount');

    if (!query) {
        displayCalculationHistory();
        if (countEl) countEl.textContent = allCalcs.length + ' calculation' + (allCalcs.length !== 1 ? 's' : '');
        return;
    }

    const filtered = allCalcs.filter(c =>
        (c.principal || '').toLowerCase().includes(query) ||
        (c.rate || '').toLowerCase().includes(query) ||
        (c.duration || '').toLowerCase().includes(query) ||
        (c.fdReference || '').toLowerCase().includes(query) ||
        (c.calculationType || '').toLowerCase().includes(query) ||
        (c.maturityAmount || '').toLowerCase().includes(query)
    );

    const container = document.getElementById('calculationHistory');
    if (!container) return;

    if (filtered.length === 0) {
        container.innerHTML = '<tr><td colspan="13" class="text-center text-muted py-3">No calculations match your search</td></tr>';
        if (countEl) countEl.textContent = '0 results';
        return;
    }

    if (countEl) countEl.textContent = filtered.length + ' of ' + allCalcs.length + ' calculations';

    // Re-use displayCalculationHistory logic but on filtered set
    const tempKey = '__filtered_calc_history__';
    localStorage.setItem(tempKey, JSON.stringify(filtered));
    const origGet = localStorage.getItem.bind(localStorage);
    const origKey = 'calc_history';
    // Temporarily swap for display then restore
    const saved = localStorage.getItem(origKey);
    localStorage.setItem(origKey, JSON.stringify(filtered));
    displayCalculationHistory();
    localStorage.setItem(origKey, saved);
}

/**
 * toggleCustomMaturity — called when duration unit changes.
 * (autoCalculateMaturity already handles the logic; this is a no-op
 * stub so the onchange handler doesn't throw a ReferenceError.)
 */
function toggleCustomMaturity() {
    // autoCalculateMaturity() handles all maturity date recalculation.
    // This stub exists only to prevent ReferenceError from the onchange binding.
}

// ─── Principal Choice Modal ───────────────────────────────────────────────────
// The modal is shown when a custom date range starts after the FD's start date,
// offering the user a choice between original principal vs compounded principal.

let _pendingPrincipalChoice = null; // { original, compounded, callback }

/**
 * Show the principal choice modal with two options.
 * @param {number} original    - The FD's original principal
 * @param {number} compounded  - Principal compounded to the range start date
 * @param {Function} callback  - Called with the chosen principal value
 */
function showPrincipalChoiceModal(original, compounded, callback) {
    _pendingPrincipalChoice = { original, compounded, callback };
    document.getElementById('originalPrincipalDisplay').textContent = formatCurrency(original);
    document.getElementById('compoundedPrincipalDisplay').textContent = formatCurrency(compounded);
    const modal = new bootstrap.Modal(document.getElementById('principalChoiceModal'));
    modal.show();
}

/** Called by "Use Original Principal" button in the modal. */
function useOriginalPrincipal() {
    if (_pendingPrincipalChoice) {
        _pendingPrincipalChoice.callback(_pendingPrincipalChoice.original);
        _pendingPrincipalChoice = null;
    }
}

/** Called by "Use Compounded Principal" button in the modal. */
function useCompoundedPrincipal() {
    if (_pendingPrincipalChoice) {
        _pendingPrincipalChoice.callback(_pendingPrincipalChoice.compounded);
        _pendingPrincipalChoice = null;
    }
}

// Keep backward compatibility
async function calculateInterest() {
    await performCalculation();
}

// Load calculation history on page load
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(() => {
        displayCalculationHistory();
    }, 1000);
});
// ===================================
// Certificate Functions
// ===================================

async function loadCertificates() {
    let records = (await getCachedData('records', 'fd_records')) || [];
    
    // Filter out records for disabled account holders
    records = await filterRecordsByAccountHolderStatus(records);
    
    const recordsWithCerts = records.filter(r => r.certificate);
    
    const container = document.getElementById('certificatesGallery');
    if (!container) return;
    
    if (recordsWithCerts.length === 0) {
        container.innerHTML = '<div class="col-12 text-center text-muted"><p>No certificates uploaded yet</p></div>';
        return;
    }
    
    container.innerHTML = recordsWithCerts.map(record => {
        const isPDF = record.certificate?.startsWith('data:application/pdf');
        
        return `
            <div class="col-md-3 col-sm-6 mb-3">
                <div class="card">
                    <div class="card-body text-center">
                        ${isPDF ? 
                            '<i class="bi bi-file-pdf-fill" style="font-size: 5rem; color: #dc3545;"></i>' :
                            `<img src="${record.certificate}" style="max-width:100%; max-height:200px;" alt="Certificate">`
                        }
                        <h6 class="mt-2">${record.bank}</h6>
                        <p class="mb-1"><strong>${record.accountHolder}</strong></p>
                        <p class="mb-0">${formatCurrency(record.amount)}</p>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// ===================================
// ===================================
// ===================================
// Export Functions
// ===================================

async function exportAllPDF() {
    let records = (await getCachedData('records', 'fd_records')) || [];
    
    // Filter out records for disabled account holders
    records = await filterRecordsByAccountHolderStatus(records);
    
    if (records.length === 0) {
        showToast('No records to export', 'warning');
        return;
    }
    
    try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        
        let yPos = 20;
        
        doc.setFontSize(18);
        doc.setFont(undefined, 'bold');
        doc.text('FD Manager Pro - Records Report', 105, yPos, { align: 'center' });
        yPos += 10;
        
        doc.setFontSize(10);
        doc.setFont(undefined, 'normal');
        doc.text(`Generated: ${formatDate(new Date().toISOString())}`, 105, yPos, { align: 'center' });
        yPos += 15;
        
        records.forEach((record, index) => {
            if (yPos > 270) {
                doc.addPage();
                yPos = 20;
            }
            
            const maturityDate = record.maturityDate || calculateMaturityDate(
                record.startDate, record.duration, record.durationUnit
            );
            const interest = calculateInterestForRecord(record);
            
            doc.setFontSize(12);
            doc.setFont(undefined, 'bold');
            doc.text(`${index + 1}. ${record.bank}`, 20, yPos);
            yPos += 7;
            
            doc.setFontSize(10);
            doc.setFont(undefined, 'normal');
            doc.text(`Account Holder: ${record.accountHolder}`, 25, yPos);
            yPos += 5;
            doc.text(`Amount: ${formatCurrency(record.amount)} | Rate: ${record.rate}%`, 25, yPos);
            yPos += 5;
            doc.text(`Duration: ${record.duration} ${record.durationUnit}`, 25, yPos);
            yPos += 5;
            doc.text(`Start: ${formatDate(record.startDate)} | Maturity: ${formatDate(maturityDate)}`, 25, yPos);
            yPos += 5;
            doc.text(`Expected Interest: ${formatCurrency(interest)}`, 25, yPos);
            yPos += 10;
        });
        
        doc.save('FD_Records_All.pdf');
        showToast('PDF exported successfully', 'success');
        
    } catch (error) {
        console.error('PDF export error:', error);
        showToast('PDF export failed. Please try again.', 'error');
    }
}

async function exportToExcel() {
    let records = (await getCachedData('records', 'fd_records')) || [];
    
    // Filter out records for disabled account holders
    records = await filterRecordsByAccountHolderStatus(records);
    
    if (records.length === 0) {
        showToast('No records to export', 'warning');
        return;
    }
    
    try {
        const excelData = records.map(record => {
            const maturityDate = record.maturityDate || calculateMaturityDate(
                record.startDate, record.duration, record.durationUnit
            );
            const interest = calculateInterestForRecord(record);
            
            return {
                'Account Holder': record.accountHolder,
                'Bank': record.bank,
                'Amount': record.amount,
                'Duration': `${record.duration} ${record.durationUnit}`,
                'Rate (%)': record.rate,
                'Start Date': formatDate(record.startDate),
                'Maturity Date': formatDate(maturityDate),
                'Expected Interest': interest,
                'Certificate Status': record.certificateStatus || 'Not Obtained',
                'Notes': record.notes || ''
            };
        });
        
        exportToExcelFile(excelData, 'FD_Records.xlsx');
        showToast('Excel file exported successfully', 'success');
        
    } catch (error) {
        console.error('Excel export error:', error);
        showToast('Excel export failed. Please try again.', 'error');
    }
}

// ===================================
// Duplicate Detection & Matching
// ===================================

/**
 * Check if two records are duplicates based on key fields
 * @param {Object} record1 
 * @param {Object} record2 
 * @returns {boolean}
 */
function areRecordsDuplicate(record1, record2) {
    // FIX: .toLowerCase() on a null/undefined field throws a TypeError, which
    // propagates up through analyzeImportData → restoreDataSmart and kills the
    // entire restore flow (leaving the modal in a broken half-open state).
    // Guard every field access before comparing.
    const h1 = (record1.accountHolder || '').toLowerCase().trim();
    const h2 = (record2.accountHolder || '').toLowerCase().trim();
    const b1 = (record1.bank || '').toLowerCase().trim();
    const b2 = (record2.bank || '').toLowerCase().trim();

    return (
        h1 === h2 &&
        b1 === b2 &&
        parseFloat(record1.amount) === parseFloat(record2.amount) &&
        record1.startDate === record2.startDate
    );
}

/**
 * Find duplicate record in existing records
 * @param {Object} newRecord 
 * @param {Array} existingRecords 
 * @returns {Object|null} - Returns the matching record or null
 */
function findDuplicateRecord(newRecord, existingRecords) {
    return existingRecords.find(existing => areRecordsDuplicate(newRecord, existing)) || null;
}

/**
 * Analyze import data and categorize records
 * @param {Array} importRecords - Records to import
 * @param {Array} existingRecords - Current records in system
 * @returns {Object} - Categorized records
 */
function analyzeImportData(importRecords, existingRecords) {
    const analysis = {
        newRecords: [],
        duplicates: [],
        updated: [],
        invalid: []
    };
    
    importRecords.forEach((importRecord, index) => {
        // Validate required fields
        if (!importRecord.accountHolder || !importRecord.bank || 
            !importRecord.amount || !importRecord.rate || !importRecord.startDate) {
            analysis.invalid.push({
                record: importRecord,
                index: index + 1,
                reason: 'Missing required fields'
            });
            return;
        }
        
        // Validate amount and rate
        if (!isValidAmount(importRecord.amount) || !isValidRate(importRecord.rate)) {
            analysis.invalid.push({
                record: importRecord,
                index: index + 1,
                reason: 'Invalid amount or rate'
            });
            return;
        }
        
        // Check for duplicates
        const duplicate = findDuplicateRecord(importRecord, existingRecords);
        
        if (duplicate) {
            // Check if there are any differences (for update detection)
            const hasDifferences = (
                duplicate.rate !== importRecord.rate ||
                duplicate.duration !== importRecord.duration ||
                duplicate.certificateStatus !== importRecord.certificateStatus ||
                duplicate.notes !== importRecord.notes
            );
            
            if (hasDifferences) {
                analysis.updated.push({
                    existing: duplicate,
                    imported: importRecord,
                    index: index + 1
                });
            } else {
                analysis.duplicates.push({
                    record: importRecord,
                    existing: duplicate,
                    index: index + 1
                });
            }
        } else {
            analysis.newRecords.push({
                record: importRecord,
                index: index + 1
            });
        }
    });
    
    return analysis;
}

// ===================================
// Import Preview Dialog
// ===================================

/**
 * Show import preview with detailed analysis
 * @param {Object} analysis - Analysis result from analyzeImportData
 * @param {Function} callback - Function to call with user choice
 */
function showImportPreview(analysis, callback) {
    const totalRecords = analysis.newRecords.length + analysis.duplicates.length + 
                        analysis.updated.length + analysis.invalid.length;
    
    // Create modal HTML
    const modalHtml = `
        <div class="modal fade" id="importPreviewModal" tabindex="-1" data-bs-backdrop="static" data-bs-keyboard="false">
            <div class="modal-dialog modal-xl modal-dialog-scrollable">
                <div class="modal-content">
                    <div class="modal-header bg-primary text-white">
                        <h5 class="modal-title">
                            <i class="bi bi-file-earmark-check"></i> Import Preview & Analysis
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <!-- Summary Cards -->
                        <div class="row g-3 mb-4">
                            <div class="col-md-3">
                                <div class="card border-success">
                                    <div class="card-body text-center">
                                        <h3 class="text-success mb-0">${analysis.newRecords.length}</h3>
                                        <small class="text-muted">New Records</small>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card border-warning">
                                    <div class="card-body text-center">
                                        <h3 class="text-warning mb-0">${analysis.duplicates.length}</h3>
                                        <small class="text-muted">Duplicates</small>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card border-info">
                                    <div class="card-body text-center">
                                        <h3 class="text-info mb-0">${analysis.updated.length}</h3>
                                        <small class="text-muted">Updates Available</small>
                                    </div>
                                </div>
                            </div>
                            <div class="col-md-3">
                                <div class="card border-danger">
                                    <div class="card-body text-center">
                                        <h3 class="text-danger mb-0">${analysis.invalid.length}</h3>
                                        <small class="text-muted">Invalid Records</small>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Import Options -->
                        <div class="card mb-4 border-primary">
                            <div class="card-header bg-primary text-white">
                                <strong>Import Options</strong>
                            </div>
                            <div class="card-body">
                                <div class="form-check mb-2">
                                    <input class="form-check-input" type="radio" name="importOption" 
                                           id="importNewOnly" value="new" checked>
                                    <label class="form-check-label" for="importNewOnly">
                                        <strong>Import New Only</strong> - Add only ${analysis.newRecords.length} new records (Recommended)
                                    </label>
                                </div>
                                <div class="form-check mb-2">
                                    <input class="form-check-input" type="radio" name="importOption" 
                                           id="importNewAndUpdate" value="newAndUpdate">
                                    <label class="form-check-label" for="importNewAndUpdate">
                                        <strong>Import New + Update Existing</strong> - Add ${analysis.newRecords.length} new + update ${analysis.updated.length} existing
                                    </label>
                                </div>
                                <div class="form-check mb-2">
                                    <input class="form-check-input" type="radio" name="importOption" 
                                           id="importAll" value="all">
                                    <label class="form-check-label" for="importAll">
                                        <strong>Import All (Including Duplicates)</strong> - Import all ${totalRecords} records
                                    </label>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Detailed Lists -->
                        <div class="accordion" id="importDetailsAccordion">
                            ${generateNewRecordsSection(analysis.newRecords)}
                            ${generateDuplicatesSection(analysis.duplicates)}
                            ${generateUpdatesSection(analysis.updated)}
                            ${generateInvalidSection(analysis.invalid)}
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            <i class="bi bi-x-circle"></i> Cancel Import
                        </button>
                        <button type="button" class="btn btn-primary" id="confirmImportBtn">
                            <i class="bi bi-check-circle"></i> Proceed with Import
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Remove existing modal if present
    const existingModal = document.getElementById('importPreviewModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    // Add modal to body
    document.body.insertAdjacentHTML('beforeend', modalHtml);
    
    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('importPreviewModal'));
    modal.show();

    // FIX: Using addEventListener here would accumulate a new click handler every
    // time the preview is opened (e.g. user cancels and re-imports). On the second
    // open the callback fires twice — once for each listener. Use onclick instead
    // so it is always replaced, never stacked.
    const confirmBtn = document.getElementById('confirmImportBtn');
    confirmBtn.onclick = function() {
        const selectedOption = document.querySelector('input[name="importOption"]:checked').value;
        // Null the handler immediately to prevent any double-fire from rapid clicks
        confirmBtn.onclick = null;
        modal.hide();
        callback(selectedOption, analysis);
    };
    
    // Cleanup on modal close
    document.getElementById('importPreviewModal').addEventListener('hidden.bs.modal', function() {
        this.remove();
    });
}

/**
 * Generate HTML for new records section
 */
function generateNewRecordsSection(newRecords) {
    if (newRecords.length === 0) {
        return `
            <div class="accordion-item">
                <h2 class="accordion-header">
                    <button class="accordion-button collapsed" type="button" disabled>
                        <i class="bi bi-plus-circle text-success me-2"></i> 
                        New Records (0)
                    </button>
                </h2>
            </div>
        `;
    }
    
    const recordsList = newRecords.map(item => `
        <tr>
            <td>${item.index}</td>
            <td>${item.record.accountHolder}</td>
            <td>${item.record.bank}</td>
            <td>${formatCurrency(item.record.amount)}</td>
            <td>${item.record.rate}%</td>
            <td>${formatDate(item.record.startDate)}</td>
        </tr>
    `).join('');
    
    return `
        <div class="accordion-item">
            <h2 class="accordion-header">
                <button class="accordion-button" type="button" data-bs-toggle="collapse" 
                        data-bs-target="#newRecordsCollapse">
                    <i class="bi bi-plus-circle text-success me-2"></i> 
                    New Records (${newRecords.length}) - Will be Added
                </button>
            </h2>
            <div id="newRecordsCollapse" class="accordion-collapse collapse show">
                <div class="accordion-body">
                    <div class="table-responsive">
                        <table class="table table-sm table-hover">
                            <thead class="table-success">
                                <tr>
                                    <th>#</th>
                                    <th>Account Holder</th>
                                    <th>Bank</th>
                                    <th>Amount</th>
                                    <th>Rate</th>
                                    <th>Start Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${recordsList}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Generate HTML for duplicates section
 */
function generateDuplicatesSection(duplicates) {
    if (duplicates.length === 0) {
        return `
            <div class="accordion-item">
                <h2 class="accordion-header">
                    <button class="accordion-button collapsed" type="button" disabled>
                        <i class="bi bi-exclamation-triangle text-warning me-2"></i> 
                        Duplicate Records (0)
                    </button>
                </h2>
            </div>
        `;
    }
    
    const recordsList = duplicates.map(item => `
        <tr>
            <td>${item.index}</td>
            <td>${item.record.accountHolder}</td>
            <td>${item.record.bank}</td>
            <td>${formatCurrency(item.record.amount)}</td>
            <td>${item.record.rate}%</td>
            <td>${formatDate(item.record.startDate)}</td>
            <td><span class="badge bg-warning">Exact Match</span></td>
        </tr>
    `).join('');
    
    return `
        <div class="accordion-item">
            <h2 class="accordion-header">
                <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" 
                        data-bs-target="#duplicatesCollapse">
                    <i class="bi bi-exclamation-triangle text-warning me-2"></i> 
                    Duplicate Records (${duplicates.length}) - Already Exist
                </button>
            </h2>
            <div id="duplicatesCollapse" class="accordion-collapse collapse">
                <div class="accordion-body">
                    <div class="alert alert-warning">
                        <i class="bi bi-info-circle"></i> These records already exist in your database with identical data.
                    </div>
                    <div class="table-responsive">
                        <table class="table table-sm table-hover">
                            <thead class="table-warning">
                                <tr>
                                    <th>#</th>
                                    <th>Account Holder</th>
                                    <th>Bank</th>
                                    <th>Amount</th>
                                    <th>Rate</th>
                                    <th>Start Date</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${recordsList}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Generate HTML for updates section
 */
function generateUpdatesSection(updates) {
    if (updates.length === 0) {
        return `
            <div class="accordion-item">
                <h2 class="accordion-header">
                    <button class="accordion-button collapsed" type="button" disabled>
                        <i class="bi bi-arrow-repeat text-info me-2"></i> 
                        Updates Available (0)
                    </button>
                </h2>
            </div>
        `;
    }
    
    const recordsList = updates.map(item => {
        const changes = [];
        if (item.existing.rate !== item.imported.rate) {
            changes.push(`Rate: ${item.existing.rate}% → ${item.imported.rate}%`);
        }
        if (item.existing.duration !== item.imported.duration) {
            changes.push(`Duration: ${item.existing.duration} → ${item.imported.duration}`);
        }
        if (item.existing.certificateStatus !== item.imported.certificateStatus) {
            changes.push(`Status: ${item.existing.certificateStatus} → ${item.imported.certificateStatus}`);
        }
        if (item.existing.notes !== item.imported.notes) {
            changes.push('Notes updated');
        }
        
        return `
            <tr>
                <td>${item.index}</td>
                <td>${item.imported.accountHolder}</td>
                <td>${item.imported.bank}</td>
                <td>${formatCurrency(item.imported.amount)}</td>
                <td><small>${changes.join(', ')}</small></td>
            </tr>
        `;
    }).join('');
    
    return `
        <div class="accordion-item">
            <h2 class="accordion-header">
                <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" 
                        data-bs-target="#updatesCollapse">
                    <i class="bi bi-arrow-repeat text-info me-2"></i> 
                    Updates Available (${updates.length}) - Modified Data
                </button>
            </h2>
            <div id="updatesCollapse" class="accordion-collapse collapse">
                <div class="accordion-body">
                    <div class="alert alert-info">
                        <i class="bi bi-info-circle"></i> These records exist but have different values. You can update them with new data.
                    </div>
                    <div class="table-responsive">
                        <table class="table table-sm table-hover">
                            <thead class="table-info">
                                <tr>
                                    <th>#</th>
                                    <th>Account Holder</th>
                                    <th>Bank</th>
                                    <th>Amount</th>
                                    <th>Changes</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${recordsList}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Generate HTML for invalid records section
 */
function generateInvalidSection(invalid) {
    if (invalid.length === 0) {
        return `
            <div class="accordion-item">
                <h2 class="accordion-header">
                    <button class="accordion-button collapsed" type="button" disabled>
                        <i class="bi bi-x-circle text-danger me-2"></i> 
                        Invalid Records (0)
                    </button>
                </h2>
            </div>
        `;
    }
    
    const recordsList = invalid.map(item => `
        <tr>
            <td>${item.index}</td>
            <td>${item.record.accountHolder || 'N/A'}</td>
            <td>${item.record.bank || 'N/A'}</td>
            <td>${item.record.amount || 'N/A'}</td>
            <td><span class="badge bg-danger">${item.reason}</span></td>
        </tr>
    `).join('');
    
    return `
        <div class="accordion-item">
            <h2 class="accordion-header">
                <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" 
                        data-bs-target="#invalidCollapse">
                    <i class="bi bi-x-circle text-danger me-2"></i> 
                    Invalid Records (${invalid.length}) - Cannot Import
                </button>
            </h2>
            <div id="invalidCollapse" class="accordion-collapse collapse">
                <div class="accordion-body">
                    <div class="alert alert-danger">
                        <i class="bi bi-exclamation-octagon"></i> These records have errors and cannot be imported.
                    </div>
                    <div class="table-responsive">
                        <table class="table table-sm table-hover">
                            <thead class="table-danger">
                                <tr>
                                    <th>#</th>
                                    <th>Account Holder</th>
                                    <th>Bank</th>
                                    <th>Amount</th>
                                    <th>Error</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${recordsList}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// ===================================
// Enhanced CSV Import with Duplicate Detection
// ===================================

/**
 * Handle CSV import with duplicate detection and preview
 */
/**
 * Prepare record for import with all necessary fields
 */
function prepareRecordForImport(record) {
    const fdRecord = {
        id: generateId(),
        accountHolder: record.accountHolder,
        bank: record.bank,
        amount: parseFloat(record.amount),
        duration: parseInt(record.duration),
        durationUnit: record.durationUnit,
        rate: parseFloat(record.rate),
        startDate: record.startDate,
        maturityDate: record.maturityDate,
        certificateStatus: record.certificateStatus,
        notes: record.notes,
        createdAt: new Date().toISOString()
    };
    
    // Calculate maturity date if not provided
    if (!fdRecord.maturityDate && fdRecord.startDate && fdRecord.duration) {
        fdRecord.maturityDate = calculateMaturityDate(
            fdRecord.startDate,
            fdRecord.duration,
            fdRecord.durationUnit
        );
    }
    
    return fdRecord;
}

// ===================================
// Enhanced Backup Restore with Duplicate Detection
// ===================================

/**
 * Restore backup with duplicate detection
 */
function restoreDataSmart(fileArg) {
    // Accept a File object directly (from triggerJSONImport) or fall back to the settings input
    const file = fileArg instanceof File
        ? fileArg
        : (document.getElementById('restoreFile')?.files[0] || null);

    if (!file) {
        showToast('Please select a backup file', 'warning');
        return;
    }

    const reader = new FileReader();

    reader.onload = function(e) {
        // FIX: async FileReader.onload callbacks swallow rejections that occur
        // after the first `await` — they never reach the catch block below.
        // Wrapping in an immediately-invoked async IIFE and chaining .catch()
        // ensures all rejections are handled.
        (async function() {
            const data = JSON.parse(e.target.result);

            // Validate backup file
            if (!data.version || !data.records) {
                throw new Error('Invalid backup file format');
            }
            
            // Validate records have required fields
            const invalidRecords = data.records.filter(r => 
                !r.accountHolder || !r.bank || !r.amount || !r.rate || !r.startDate
            );
            if (invalidRecords.length > 0) {
                throw new Error(`Invalid backup file: ${invalidRecords.length} records missing required fields`);
            }

            const importRecords = data.records || [];
            const existingRecordsRaw = await getCachedData('records', 'fd_records');
            const existingRecords = Array.isArray(existingRecordsRaw) ? existingRecordsRaw : [];

            // Analyze import data
            const analysis = analyzeImportData(importRecords, existingRecords);

            // Show preview dialog
            showImportPreview(analysis, async function(selectedOption, analysisData) {
                await processSmartRestore(selectedOption, analysisData, data, null);
            });
        })().catch(function(error) {
            console.error('Restore error:', error);
            showToast('Invalid backup file. Please check the file format.', 'error');
        });
    };

    reader.onerror = function() {
        showToast('Failed to read file. Please try again.', 'error');
    };

    reader.readAsText(file);
}

/**
 * Process restore based on user selection
 */
async function processSmartRestore(option, analysis, backupData, fileInput) {
    try {
        // Show loading indicator
        showToast('🔄 Processing restore... Please wait', 'info');
        
        // Use setTimeout to allow UI to update
        await new Promise(resolve => setTimeout(resolve, 100));
        
        let recordsRaw = await getCachedData('records', 'fd_records');
        let maturedRecordsRaw = await getCachedData('maturedRecords', 'fd_matured_records');
        let holdersRaw = await getCachedData('accountHolders', 'fd_account_holders');
        let templatesRaw = await getCachedData('templates', 'fd_templates');
        
        let records = Array.isArray(recordsRaw) ? recordsRaw : [];
        let maturedRecords = Array.isArray(maturedRecordsRaw) ? maturedRecordsRaw : [];
        let holders = Array.isArray(holdersRaw) ? holdersRaw : [];
        let templates = Array.isArray(templatesRaw) ? templatesRaw : [];

        // Capture counts BEFORE any modifications (used in success message)
        const beforeCount = records.length;
        const beforeMaturedCount = maturedRecords.length;
        
        let addedCount = 0;
        let updatedCount = 0;
        
        // Process based on selected option
        if (option === 'new') {
            // Process in chunks to prevent hanging
            const chunkSize = 50;
            for (let i = 0; i < analysis.newRecords.length; i += chunkSize) {
                const chunk = analysis.newRecords.slice(i, i + chunkSize);
                chunk.forEach(item => {
                    const record = { ...item.record, id: generateId(), createdAt: new Date().toISOString() };
                    records.push(record);
                    addedCount++;
                });
                
                // Allow UI to breathe between chunks
                if (i + chunkSize < analysis.newRecords.length) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }
            
        } else if (option === 'newAndUpdate') {
            const chunkSize = 50;

            // Add new records (was completely missing — silent data loss bug)
            for (let i = 0; i < analysis.newRecords.length; i += chunkSize) {
                const chunk = analysis.newRecords.slice(i, i + chunkSize);
                chunk.forEach(item => {
                    const record = { ...item.record, id: generateId(), createdAt: new Date().toISOString() };
                    records.push(record);
                    addedCount++;
                });
                if (i + chunkSize < analysis.newRecords.length) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }

            // Update existing records
            for (let i = 0; i < analysis.updated.length; i += chunkSize) {
                const chunk = analysis.updated.slice(i, i + chunkSize);
                chunk.forEach(item => {
                    const existingIndex = records.findIndex(r => r.id === item.existing.id);
                    if (existingIndex !== -1) {
                        records[existingIndex] = {
                            ...item.imported,
                            id: item.existing.id,
                            createdAt: item.existing.createdAt,
                            updatedAt: new Date().toISOString()
                        };
                        updatedCount++;
                    }
                });
                if (i + chunkSize < analysis.updated.length) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }
            
        } else if (option === 'all') {
            // Process in chunks to prevent hanging
            const allRecords = [...analysis.newRecords, ...analysis.duplicates, ...analysis.updated];
            const chunkSize = 50;
            for (let i = 0; i < allRecords.length; i += chunkSize) {
                const chunk = allRecords.slice(i, i + chunkSize);
                chunk.forEach(item => {
                    const record = {
                        ...(item.record || item.imported),
                        id: generateId(),
                        createdAt: new Date().toISOString()
                    };
                    records.push(record);
                    addedCount++;
                });
                
                // Allow UI to breathe between chunks
                if (i + chunkSize < allRecords.length) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }
        }
        
        // Merge account holders — handle both string and {name,enabled} object formats
        const importedHolders = backupData.accountHolders || [];
        const existingNames = new Set(
            holders.map(h => (typeof h === 'object' ? h.name : h).toLowerCase().trim())
        );
        importedHolders.forEach(h => {
            const name = (typeof h === 'object' ? h.name : h).trim();
            if (name && !existingNames.has(name.toLowerCase())) {
                // Normalise to object format so the rest of the app works correctly
                holders.push({ name: name, enabled: true });
                existingNames.add(name.toLowerCase());
            }
        });
        
        // Merge templates
        const importedTemplates = backupData.templates || [];
        importedTemplates.forEach(template => {
            if (!templates.find(t => t.name === template.name)) {
                templates.push({ ...template, id: generateId() });
            }
        });
        
        // Merge matured records — keep original IDs for correct dedup on repeated restores
        const importedMaturedRecords = backupData.maturedRecords || [];
        const existingMaturedIds = new Set(maturedRecords.map(r => r.id));
        const chunkSize = 20;
        for (let i = 0; i < importedMaturedRecords.length; i += chunkSize) {
            const chunk = importedMaturedRecords.slice(i, i + chunkSize);
            chunk.forEach(record => {
                if (record.id && !existingMaturedIds.has(record.id)) {
                    // Keep the original ID — rebasing to a new ID broke dedup on second restore
                    maturedRecords.push({ ...record });
                    existingMaturedIds.add(record.id);
                } else if (!record.id) {
                    // No ID at all (corrupted record) — assign a new one
                    const newId = generateId();
                    maturedRecords.push({ ...record, id: newId });
                    existingMaturedIds.add(newId);
                }
            });
            if (i + chunkSize < importedMaturedRecords.length) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
        
        // Save all data — including calculations and comparisons from backup
        await saveData('fd_account_holders', holders);
        await saveData('fd_records', records);
        await saveData('fd_templates', templates);
        await saveData('fd_matured_records', maturedRecords);

        // Restore calculations (merge, not replace)
        if (backupData.calculations && backupData.calculations.length > 0) {
            const existingCalcs = (await getCachedData('calculations', 'fd_calculations')) || [];
            const existingCalcIds = new Set(existingCalcs.map(c => c.id));
            const newCalcs = backupData.calculations.filter(c => c.id && !existingCalcIds.has(c.id));
            await saveData('fd_calculations', [...existingCalcs, ...newCalcs]);
        }

        // Restore comparisons (merge, not replace)
        if (backupData.comparisons && backupData.comparisons.length > 0) {
            const existingComps = (await getCachedData('comparisons', 'fd_comparisons')) || [];
            const existingCompIds = new Set(existingComps.map(c => c.id));
            const newComps = backupData.comparisons.filter(c => c.id && !existingCompIds.has(c.id));
            await saveData('fd_comparisons', [...existingComps, ...newComps]);
        }

        if (backupData.settings) {
            localStorage.setItem('fd_settings', JSON.stringify(backupData.settings));
        }
        
        // CRITICAL: Invalidate cache after all data modifications to prevent stale data
        _cache.invalidate();
        
        // Show success message
        let message = ' Restore completed successfully!\n\n';
        message += ` Before: ${beforeCount} active, ${beforeMaturedCount} matured records\n`;
        message += ` After: ${records.length} active, ${maturedRecords.length} matured records\n`;
        message += ` Added: ${addedCount} records\n`;
        if (updatedCount > 0) {
            message += `🔄 Updated: ${updatedCount} records\n`;
        }
        message += `📋 Matured records restored: ${(backupData.maturedRecords || []).length}\n`;
        message += '\nReloading...';
        
        alert(message);
        showToast('Restore completed. Reloading...', 'success');
        
        if (fileInput) {
            fileInput.value = '';
        }
        
        setTimeout(() => {
            location.reload();
        }, 1500);
        
    } catch (error) {
        console.error('Restore processing error:', error);
        showToast('Error processing restore. Please try again.', 'error');
    }
}

// Keep existing export functions unchanged
// ... (exportAllPDF, exportToExcel, backupData, clearAllData, etc

async function clearAllData() {
    const confirmation = prompt('⚠️ WARNING: This will delete ALL FD data!\n\nType "DELETE" to confirm:');
    
    if (confirmation !== 'DELETE') {
        showToast('Clear data cancelled', 'info');
        return;
    }
    
    const finalConfirm = confirm('This is your LAST CHANCE!\n\nProceed with deleting ALL data?');
    
    if (!finalConfirm) {
        showToast('Clear data cancelled', 'info');
        return;
    }
    
    try {
        await Promise.all([
            saveData('fd_account_holders', []),
            saveData('fd_records', []),
            saveData('fd_matured_records', []),
            saveData('fd_templates', []),
            saveData('fd_calculations', []),
            saveData('fd_comparisons', [])
        ]);
        
        // Invalidate cache after clearing all data
        _cache.invalidate();
        
        showToast('All data cleared successfully', 'success');
    } catch (error) {
        console.error('Error clearing data:', error);
        showToast('Error clearing data. Please try again.', 'error');
        return;
    }
    
    setTimeout(() => { location.reload(); }, 1000);
}

// (calculateInterest alias defined earlier in file)

// ===================================
// Additional Utility Functions
// ===================================

/**
 * Calculate interest for a custom date range on an existing FD record
 * @param {object} record - FD record object
 * @param {string} fromDate - Start date for calculation (YYYY-MM-DD)
 * @param {string} toDate - End date for calculation (YYYY-MM-DD)
 * @param {number} frequency - Compounding frequency (1, 4, 12, 365, 0)
 * @returns {number} - Interest amount for the custom period
 */
function calculateInterestForCustomDateRange(record, fromDate, toDate, frequency = 4) {
    if (!record || !record.amount || !record.rate || !fromDate || !toDate) return 0;
    
    const recordStart = new Date(record.startDate);
    const recordEnd = new Date(record.maturityDate || calculateMaturityDate(record.startDate, record.duration, record.durationUnit));
    const customStart = new Date(fromDate);
    const customEnd = new Date(toDate);
    
    // Ensure dates are within FD term
    const effectiveStart = customStart < recordStart ? recordStart : customStart;
    const effectiveEnd = customEnd > recordEnd ? recordEnd : customEnd;
    
    if (effectiveStart >= effectiveEnd) return 0;
    
    // Calculate maturity amount at effective start date
    let maturityAtStart = record.amount;
    if (effectiveStart > recordStart) {
        const daysToStart = calculateDurationFromDates(record.startDate, effectiveStart);
        const monthsToStart = (daysToStart / 365) * 12;
        maturityAtStart = record.amount + calculateCompoundInterest(record.amount, record.rate, monthsToStart, frequency);
    }
    
    // Calculate maturity amount at effective end date
    const daysToEnd = calculateDurationFromDates(record.startDate, effectiveEnd);
    const monthsToEnd = (daysToEnd / 365) * 12;
    const maturityAtEnd = record.amount + calculateCompoundInterest(record.amount, record.rate, monthsToEnd, frequency);
    
    // Interest for custom period is the difference
    return maturityAtEnd - maturityAtStart;
}

/**
 * Get frequency name for display
 * @param {number} frequency - Compounding frequency
 * @returns {string} - Frequency name
 */
function getFrequencyName(frequency) {
    const frequencyNames = {
        4: 'Quarterly (4/year)',
        12: 'Monthly (12/year)',
        1: 'Annually (1/year)',
        365: 'Daily (365/year)',
        0: 'At Maturity (Simple)'
    };
    return frequencyNames[frequency] || 'Unknown';
}

/**
 * Export data to Excel file
 * @param {Array} data - Array of objects to export
 * @param {string} filename - Name of the Excel file
 */
function exportToExcelFile(data, filename) {
    if (typeof XLSX === 'undefined') {
        showToast('Excel library not loaded. Please refresh the page.', 'error');
        return;
    }

    try {
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'FD Records');
        XLSX.writeFile(workbook, filename);
    } catch (error) {
        console.error('Excel export error:', error);
        showToast('Excel export failed: ' + error.message, 'error');
    }
}

console.log('[FD Manager Nepal] Import functions loaded - ADD ONLY mode available');
console.log('[FD Manager Nepal] App-part3.js loaded successfully');