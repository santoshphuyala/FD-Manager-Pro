// ===================================
// FD Manager Pro - Main Application
// Part 1: Core & Authentication
// Nepal Edition - Version 4.0 (Corrected)
// ===================================

// ===================================
// Initialization
// ===================================

document.addEventListener('DOMContentLoaded', function() {
    checkLogin();
    loadSettings();
    initializeEventListeners();
});

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

function setupPin() {
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
    pinHash = hash;
    
    showToast('PIN created successfully!', 'success');
    
    // Initialize empty data
    saveData('fd_account_holders', []);
    saveData('fd_records', []);
    saveData('fd_templates', []);
    saveData('fd_comparisons', []);
    saveData('fd_calculations', []);
    
    setTimeout(() => {
        const loginScreen = document.getElementById('loginScreen');
        const mainApp = document.getElementById('mainApp');
        
        if (loginScreen) loginScreen.style.display = 'none';
        if (mainApp) mainApp.style.display = 'block';
        
        initializeApp();
    }, 500);
}

function login() {
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
        
        const loginPin = document.getElementById('loginPin');
        if (loginPin) loginPin.value = '';
        
        checkLogin();
        showToast('Logged out successfully', 'info');
    }
}

function showResetConfirm() {
    const confirmation = prompt('⚠️ WARNING: This will delete ALL data!\n\nType "RESET" to confirm:');
    
    if (confirmation === 'RESET') {
        localStorage.clear();
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

function initializeApp() {
    try {
        loadAccountHolders();
        loadFDRecords();
        loadTemplates();
        updateDashboard();
        updateAnalytics();
        populateSettings();
        
        // Load certificates if function exists
        if (typeof loadCertificates === 'function') {
            loadCertificates();
        }
        
        showToast('Welcome to FD Manager Pro - Nepal Edition!', 'success');
    } catch (error) {
        console.error('App initialization error:', error);
        showToast('Error loading data. Please refresh.', 'error');
    }
}

function initializeEventListeners() {
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
    setupBankAutocomplete();
    
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

function loadAccountHolders() {
    const holders = getData('fd_account_holders') || [];
    
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
            
            holders.forEach(holder => {
                const option = document.createElement('option');
                option.value = holder;
                option.textContent = holder;
                select.appendChild(option);
            });
            
            // Restore previous selection if valid
            if (currentValue && holders.includes(currentValue)) {
                select.value = currentValue;
            }
        }
    });
    
    updateAccountHoldersList(holders);
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
    
    holders.forEach(holder => {
        const div = document.createElement('div');
        div.className = 'account-holder-item';
        
        const span = document.createElement('span');
        span.innerHTML = '<i class="bi bi-person-fill"></i> ';
        span.appendChild(document.createTextNode(holder));
        
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-outline-danger';
        btn.innerHTML = '<i class="bi bi-trash"></i>';
        btn.onclick = () => deleteAccountHolder(holder);
        
        div.appendChild(span);
        div.appendChild(btn);
        container.appendChild(div);
    });
}

function addAccountHolder(event) {
    if (event) event.preventDefault();
    
    const input = document.getElementById('newAccountHolder');
    const name = input?.value?.trim();
    
    if (!name) {
        showToast('Please enter a name', 'error');
        return;
    }
    
    const holders = getData('fd_account_holders') || [];
    
    // Case-insensitive duplicate check
    if (holders.some(h => h.toLowerCase() === name.toLowerCase())) {
        showToast('Account holder already exists', 'error');
        return;
    }
    
    holders.push(name);
    saveData('fd_account_holders', holders);
    
    loadAccountHolders();
    if (input) input.value = '';
    
    showToast(`Account holder "${name}" added successfully`, 'success');
}

function deleteAccountHolder(name) {
    if (!confirm(`Delete account holder "${name}"?\n\nThis will also delete all associated FD records.`)) {
        return;
    }
    
    let holders = getData('fd_account_holders') || [];
    holders = holders.filter(h => h !== name);
    saveData('fd_account_holders', holders);
    
    let records = getData('fd_records') || [];
    const deletedCount = records.filter(r => r.accountHolder === name).length;
    records = records.filter(r => r.accountHolder !== name);
    saveData('fd_records', records);
    
    loadAccountHolders();
    loadFDRecords();
    updateDashboard();
    
    showToast(`Account holder "${name}" deleted (${deletedCount} records removed)`, 'success');
}

// ===================================
// FD Records Management
// ===================================

function loadFDRecords() {
    const records = getData('fd_records') || [];
    displayFDRecords(records);
}

function displayFDRecords(records) {
    const tbody = document.getElementById('recordsTableBody');
    if (!tbody) return;
    
    if (!records || records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="text-center text-muted">No records found</td></tr>';
        return;
    }
    
    records = applyRecordFilters(records);
    
    if (records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="text-center text-muted">No matching records found</td></tr>';
        return;
    }
    
    tbody.innerHTML = records.map(record => {
        const maturityDate = record.maturityDate || calculateMaturityDate(
            record.startDate, record.duration, record.durationUnit
        );
        
        const daysRemaining = calculateDaysRemaining(maturityDate);
        const status = getRecordStatus(daysRemaining);
        const interest = calculateInterestForRecord(record);
        const displayDays = daysRemaining !== null && daysRemaining > 0 ? daysRemaining : '0';
        
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
                case 'matured':
                    return status === 'Matured';
                default:
                    return true;
            }
        });
    }
    
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

function filterRecords() {
    loadFDRecords();
}

/**
 * Save FD record (handles both add and edit)
 */
function saveFD(event) {
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
    
    // Validation
    if (!accountHolder) {
        showToast('Please select an account holder', 'error');
        return;
    }
    
    if (!bank || !amount || !duration || !rate || !startDate) {
        showToast('Please fill all required fields', 'error');
        return;
    }
    
    if (!isValidAmount(amount)) {
        showToast('Please enter a valid amount', 'error');
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
    
    const maturityDate = calculateMaturityDate(startDate, duration, durationUnit);
    const certFile = document.getElementById('fdCertificate')?.files?.[0];
    
    /**
     * Complete the save operation
     */
    const completeSave = (certData) => {
        try {
            let records = getData('fd_records') || [];
            
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
            
            saveData('fd_records', records);
            
            // Refresh UI
            loadFDRecords();
            updateDashboard();
            if (typeof updateAnalytics === 'function') updateAnalytics();
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
            const records = getData('fd_records') || [];
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

function editFD(id) {
    const records = getData('fd_records') || [];
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

function deleteFD(id) {
    if (!confirm('Are you sure you want to delete this FD record?')) {
        return;
    }
    
    let records = getData('fd_records') || [];
    const recordToDelete = records.find(r => r.id === id);
    records = records.filter(r => r.id !== id);
    saveData('fd_records', records);
    
    loadFDRecords();
    updateDashboard();
    if (typeof updateAnalytics === 'function') updateAnalytics();
    
    const bankInfo = recordToDelete ? ` (${recordToDelete.bank})` : '';
    showToast(`FD deleted successfully${bankInfo}`, 'success');
}

function deleteSelected() {
    const checkboxes = document.querySelectorAll('.record-checkbox:checked');
    
    if (checkboxes.length === 0) {
        showToast('Please select records to delete', 'warning');
        return;
    }
    
    if (!confirm(`Delete ${checkboxes.length} selected record(s)?`)) {
        return;
    }
    
    const idsToDelete = Array.from(checkboxes).map(cb => cb.value);
    let records = getData('fd_records') || [];
    records = records.filter(r => !idsToDelete.includes(r.id));
    saveData('fd_records', records);
    
    loadFDRecords();
    updateDashboard();
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
// Interest Preview (Basic version - enhanced version in Part 2)
// ===================================

function updateInterestPreview() {
    const amount = parseFloat(document.getElementById('fdAmount')?.value) || 0;
    const rate = parseFloat(document.getElementById('fdRate')?.value) || 0;
    const duration = parseInt(document.getElementById('fdDuration')?.value) || 0;
    const unit = document.getElementById('fdDurationUnit')?.value || 'Months';
    
    const previewQuarterly = document.getElementById('previewQuarterly');
    const previewMonthly = document.getElementById('previewMonthly');
    const previewAnnual = document.getElementById('previewAnnual');
    
    if (amount && rate && duration) {
        const months = getDurationInMonths(duration, unit);
        
        const quarterly = calculateCompoundInterest(amount, rate, months, 4);
        const monthly = calculateCompoundInterest(amount, rate, months, 12);
        const annual = calculateCompoundInterest(amount, rate, months, 1);
        
        if (previewQuarterly) previewQuarterly.textContent = formatCurrency(quarterly);
        if (previewMonthly) previewMonthly.textContent = formatCurrency(monthly);
        if (previewAnnual) previewAnnual.textContent = formatCurrency(annual);
    } else {
        if (previewQuarterly) previewQuarterly.textContent = formatCurrency(0);
        if (previewMonthly) previewMonthly.textContent = formatCurrency(0);
        if (previewAnnual) previewAnnual.textContent = formatCurrency(0);
    }
}

// ===================================
// Bank Autocomplete
// ===================================

function setupBankAutocomplete() {
    const bankInput = document.getElementById('fdBank');
    const datalist = document.getElementById('bankSuggestions');
    
    if (!bankInput || !datalist) return;
    
    // Populate initial suggestions
    const banks = getAllBanks();
    datalist.innerHTML = '';
    banks.forEach(bank => {
        const option = document.createElement('option');
        option.value = bank;
        datalist.appendChild(option);
    });
    
    // Update suggestions on input
    bankInput.addEventListener('input', function() {
        const suggestions = getAllBanks();
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

function sortTable(column) {
    if (sortColumn === column) {
        sortAscending = !sortAscending;
    } else {
        sortColumn = column;
        sortAscending = true;
    }
    
    let records = getData('fd_records') || [];
    
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
            default:
                return 0;
        }
        
        if (valA < valB) return sortAscending ? -1 : 1;
        if (valA > valB) return sortAscending ? 1 : -1;
        return 0;
    });
    
    displayFDRecords(records);
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
        
        // Create demo PIN
        const demoPin = '1234';
        const hash = CryptoJS.SHA256(demoPin).toString();
        localStorage.setItem('fd_pin', hash);
        pinHash = hash;
        
        // Save sample data
        saveData('fd_account_holders', sampleHolders);
        saveData('fd_records', sampleRecords);
        saveData('fd_templates', []);
        saveData('fd_calculations', []);
        
        showToast('✅ Sample data loaded! PIN changed to: 1234', 'success');
        
        setTimeout(() => {
            location.reload();
        }, 2000);
    } catch (error) {
        console.error('Error loading sample data:', error);
        showToast('❌ Failed to load sample data', 'error');
    }
}

console.log('[FD Manager Nepal] App.js Part 1 loaded successfully');