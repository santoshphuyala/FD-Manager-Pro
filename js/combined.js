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
        return;
    }
    
    if (pin !== confirmPin) {
        showToast('PINs do not match', 'error');
        return;
    }
    
    const hash = CryptoJS.SHA256(pin).toString();
    localStorage.setItem('fd_pin', hash);
    pinHash = hash;
    
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
    showLoading();
    try {
        await loadAccountHolders();
        await loadFDRecords();
        await loadTemplates();
        await updateDashboard();
        if (typeof updateAnalytics === 'function') await updateAnalytics();
        populateSettings();
        
        // Load certificates if function exists
        if (typeof loadCertificates === 'function') {
            await loadCertificates();
        }
        
        // Check for expiring FDs
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
    const holders = (await getData('fd_account_holders')) || [];
    
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

async function addAccountHolder(event) {
    if (event) event.preventDefault();
    
    const input = document.getElementById('newAccountHolder');
    const name = input?.value?.trim();
    
    if (!name) {
        showToast('Please enter a name', 'error');
        return;
    }
    
    const holders = (await getData('fd_account_holders')) || [];
    
    // Case-insensitive duplicate check
    if (holders.some(h => h.toLowerCase() === name.toLowerCase())) {
        showToast('Account holder already exists', 'error');
        return;
    }
    
    holders.push(name);
    await saveData('fd_account_holders', holders);
    
    loadAccountHolders();
    if (input) input.value = '';
    
    showToast(`Account holder "${name}" added successfully`, 'success');
}

async function deleteAccountHolder(name) {
    if (!confirm(`Delete account holder "${name}"?\n\nThis will also delete all associated FD records.`)) {
        return;
    }
    
    let holders = (await getData('fd_account_holders')) || [];
    holders = holders.filter(h => h !== name);
    await saveData('fd_account_holders', holders);
    
    let records = (await getData('fd_records')) || [];
    const deletedCount = records.filter(r => r.accountHolder === name).length;
    records = records.filter(r => r.accountHolder !== name);
    await saveData('fd_records', records);
    
    loadAccountHolders();
    loadFDRecords();
    updateDashboard();
    
    showToast(`Account holder "${name}" deleted (${deletedCount} records removed)`, 'success');
}

// ===================================
// FD Records Management
// ===================================

async function loadFDRecords() {
    const records = (await getData('fd_records')) || [];
    
    // Update the page size selector to reflect current setting
    const selector = document.getElementById('recordsPerPageSelect');
    if (selector) {
        selector.value = recordsPerPage;
    }
    
    displayFDRecords(records, 1);
}

function displayFDRecords(records, page = 1) {
    currentPage = page;
    const tbody = document.getElementById('recordsTableBody');
    if (!tbody) return;
    
    if (!records || records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="text-center text-muted">No records found</td></tr>';
        document.getElementById('recordsPagination').innerHTML = '';
        return;
    }
    
    records = applyRecordFilters(records);
    
    if (records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="text-center text-muted">No matching records found</td></tr>';
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
    const records = (await getData('fd_records')) || [];
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
    
    // Validation
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
    
    const maturityDate = calculateMaturityDate(startDate, duration, durationUnit);
    const certFile = document.getElementById('fdCertificate')?.files?.[0];
    
    /**
     * Complete the save operation
     */
    const completeSave = async (certData) => {
        try {
            let records = (await getData('fd_records')) || [];
            
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
            const records = (await getData('fd_records')) || [];
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

async function editFD(id) {
    const records = (await getData('fd_records')) || [];
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
    
    let records = (await getData('fd_records')) || [];
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
    let records = (await getData('fd_records')) || [];
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
    
    let records = (await getData('fd_records')) || [];
    
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
// Notifications for Expiring FDs
// ===================================

async function checkExpiringFDs() {
    if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            const records = (await getData('fd_records')) || [];
            const expiringSoon = records.filter(record => {
                const maturityDate = record.maturityDate || calculateMaturityDate(
                    record.startDate, record.duration, record.durationUnit
                );
                const daysRemaining = calculateDaysRemaining(maturityDate);
                return daysRemaining !== null && daysRemaining <= 30 && daysRemaining > 0;
            });
            
            if (expiringSoon.length > 0) {
                new Notification('FD Manager Pro', {
                    body: `${expiringSoon.length} FD(s) expiring within 30 days`,
                    icon: 'images/icon-192x192.png'
                });
            }
        }
    }
}

console.log('[FD Manager Nepal] App.js Part 1 loaded successfully');
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
    
    // Check file type - PDF NOT SUPPORTED
    if (file.type === 'application/pdf') {
        showToast('❌ PDF files are not supported for OCR. Please upload JPG or PNG image.', 'error');
        fileInput.value = '';
        return;
    }
    
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!validTypes.includes(file.type)) {
        showToast('Invalid file type. Please upload JPG or PNG only', 'error');
        fileInput.value = '';
        return;
    }
    
    // Check file size
    if (file.size > 5 * 1024 * 1024) {
        showToast('File too large. Please use image under 5MB', 'error');
        fileInput.value = '';
        return;
    }
    
    document.getElementById('ocrProgress').style.display = 'block';
    document.getElementById('ocrResults').style.display = 'none';
    
    try {
        let imageData = await readFileAsBase64(file);
        
        showToast('Processing OCR... This may take 15-30 seconds', 'info');
        
        const text = await window.OCREnhanced.performSimpleOCR(imageData);
        
        console.log('=== OCR Text ===');
        console.log(text);
        console.log('================');
        
        const extractedData = window.OCREnhanced.extractFDDataAdvanced(text);
        const validation = window.OCREnhanced.validateAndSuggest(extractedData);
        
        ocrExtractedData = extractedData;
        
        displayOCRResults(extractedData, validation, imageData);
        
        document.getElementById('ocrProgress').style.display = 'none';
        document.getElementById('ocrResults').style.display = 'block';
        
        if (extractedData.confidence >= 75) {
            showToast(`OCR completed with ${extractedData.confidence}% confidence!`, 'success');
        } else {
            showToast(`OCR completed with ${extractedData.confidence}% confidence. Please verify data.`, 'warning');
        }
        
    } catch (error) {
        console.error('OCR processing failed:', error);
        showToast(error.message || 'OCR processing failed. Please try with a clearer image or enter manually.', 'error');
        document.getElementById('ocrProgress').style.display = 'none';
        fileInput.value = '';
    }
}function displayOCRResults(data, validation, imageData) {
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
        `${data.duration} ${data.unit}` : '<span class="text-danger">Not detected</span>';
    
    document.getElementById('ocrPreview').src = imageData;
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
    
    let records = (await getData('fd_records')) || [];
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
    const templates = (await getData('fd_templates')) || [];
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
    
    let templates = (await getData('fd_templates')) || [];
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
    const templates = (await getData('fd_templates')) || [];
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
    
    let templates = (await getData('fd_templates')) || [];
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
    const selectedHolder = document.getElementById('dashboardHolderFilter')?.value;
    let records = (await getData('fd_records')) || [];
    
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
    
    const holders = await getData('fd_account_holders');
    const records = await getData('fd_records');
    const templates = await getData('fd_templates');
    
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
 * Auto-save form data as draft
 */
function saveDraft() {
    const formData = {
        accountHolder: document.getElementById('fdAccountHolder').value,
        bank: document.getElementById('fdBank').value,
        amount: document.getElementById('fdAmount').value,
        duration: document.getElementById('fdDuration').value,
        durationUnit: document.getElementById('fdDurationUnit').value,
        rate: document.getElementById('fdRate').value,
        startDate: document.getElementById('fdStartDate').value,
        certStatus: document.getElementById('fdCertStatus').value,
        fdNumber: document.getElementById('fdNumber').value,
        notes: document.getElementById('fdNotes').value
    };
    
    localStorage.setItem('fd_draft', JSON.stringify(formData));
    document.getElementById('loadDraftBtn').style.display = 'inline-block';
}

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
    
    const holders = (await getData('fd_account_holders')) || [];
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
 * Suggest bank rate
 */
function suggestBankRate() {
    const bankName = document.getElementById('fdBank').value;
    if (!bankName) return;
    
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
    const holders = (await getData('fd_account_holders')) || [];
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
    
    let records = (await getData('fd_records')) || [];
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
    const records = (await getData('fd_records')) || [];
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
    const records = (await getData('fd_records')) || [];
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
    
    const records = (await getData('fd_records')) || [];
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
    const records = (await getData('fd_records')) || [];
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
    const records = (await getData('fd_records')) || [];
    
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
    const holders = (await getData('fd_account_holders')) || [];
    const select = document.getElementById('calcAccountHolder');
    
    if (!select) return;
    
    select.innerHTML = '<option value="">Select Holder</option>';
    holders.forEach(holder => {
        const option = document.createElement('option');
        option.value = holder;
        option.textContent = holder;
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
    
    let records = (await getData('fd_records')) || [];
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
    
    const records = (await getData('fd_records')) || [];
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
            const records = (await getData('fd_records')) || [];
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
        const records = (await getData('fd_records')) || [];
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
        const records = (await getData('fd_records')) || [];
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
    
    // Destroy existing chart - FIXED
    if (interestComparisonChartInstance) {
        interestComparisonChartInstance.destroy();
        interestComparisonChartInstance = null;
    }
    
    // Create new chart
    interestComparisonChartInstance = new Chart(ctx, {
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
    const records = (await getData('fd_records')) || [];
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

function exportAllPDF() {
    const records = getData('fd_records') || [];
    
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

function exportToExcel() {
    const records = getData('fd_records') || [];
    
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
    // Match criteria: same account holder, bank, amount, and start date
    return (
        record1.accountHolder.toLowerCase().trim() === record2.accountHolder.toLowerCase().trim() &&
        record1.bank.toLowerCase().trim() === record2.bank.toLowerCase().trim() &&
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
    
    // Handle confirm button
    document.getElementById('confirmImportBtn').addEventListener('click', function() {
        const selectedOption = document.querySelector('input[name="importOption"]:checked').value;
        modal.hide();
        callback(selectedOption, analysis);
    });
    
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
function restoreDataSmart() {
    const fileInput = document.getElementById('restoreFile');
    const file = fileInput.files[0];
    
    if (!file) {
        showToast('Please select a backup file', 'warning');
        return;
    }
    
    const reader = new FileReader();
    
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            // Validate backup file
            if (!data.version || !data.records) {
                throw new Error('Invalid backup file format');
            }
            
            const importRecords = data.records || [];
            const existingRecordsRaw = await getData('fd_records');
            const existingRecords = Array.isArray(existingRecordsRaw) ? existingRecordsRaw : [];
            
            // Analyze import data
            const analysis = analyzeImportData(importRecords, existingRecords);
            
            // Show preview dialog
            showImportPreview(analysis, async function(selectedOption, analysisData) {
                await processSmartRestore(selectedOption, analysisData, data, fileInput);
            });
            
        } catch (error) {
            console.error('Restore error:', error);
            showToast('Invalid backup file. Please check the file format.', 'error');
            fileInput.value = '';
        }
    };
    
    reader.readAsText(file);
}

/**
 * Process restore based on user selection
 */
async function processSmartRestore(option, analysis, backupData, fileInput) {
    try {
        let recordsRaw = await getData('fd_records');
        let holdersRaw = await getData('fd_account_holders');
        let templatesRaw = await getData('fd_templates');
        
        let records = Array.isArray(recordsRaw) ? recordsRaw : [];
        let holders = Array.isArray(holdersRaw) ? holdersRaw : [];
        let templates = Array.isArray(templatesRaw) ? templatesRaw : [];
        
        const beforeCount = records.length;
        let addedCount = 0;
        let updatedCount = 0;
        
        // Process based on selected option
        if (option === 'new') {
            analysis.newRecords.forEach(item => {
                const record = { ...item.record, id: generateId(), createdAt: new Date().toISOString() };
                records.push(record);
                addedCount++;
            });
            
        } else if (option === 'newAndUpdate') {
            analysis.newRecords.forEach(item => {
                const record = { ...item.record, id: generateId(), createdAt: new Date().toISOString() };
                records.push(record);
                addedCount++;
            });
            
            analysis.updated.forEach(item => {
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
            
        } else if (option === 'all') {
            [...analysis.newRecords, ...analysis.duplicates, ...analysis.updated].forEach(item => {
                const record = {
                    ...(item.record || item.imported),
                    id: generateId(),
                    createdAt: new Date().toISOString()
                };
                records.push(record);
                addedCount++;
            });
        }
        
        // Merge account holders
        const importedHolders = backupData.accountHolders || [];
        holders = [...new Set([...holders, ...importedHolders])];
        
        // Merge templates
        const importedTemplates = backupData.templates || [];
        importedTemplates.forEach(template => {
            if (!templates.find(t => t.name === template.name)) {
                templates.push({ ...template, id: generateId() });
            }
        });
        
        // Save data
        saveData('fd_account_holders', holders);
        saveData('fd_records', records);
        saveData('fd_templates', templates);
        
        if (backupData.settings) {
            localStorage.setItem('fd_settings', JSON.stringify(backupData.settings));
        }
        
        // Show success message
        let message = '✅ Restore completed successfully!\n\n';
        message += `📊 Before: ${beforeCount} records\n`;
        message += `📊 After: ${records.length} records\n`;
        message += `➕ Added: ${addedCount} records\n`;
        if (updatedCount > 0) {
            message += `🔄 Updated: ${updatedCount} records\n`;
        }
        message += '\nReloading page...';
        
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

function clearAllData() {
    const confirmation = prompt('⚠️ WARNING: This will delete ALL FD data!\n\nType "DELETE" to confirm:');
    
    if (confirmation !== 'DELETE') {
        showToast('Clear data cancelled', 'info');
        return;
    }
    
    // Final confirmation
    const finalConfirm = confirm('This is your LAST CHANCE!\n\nProceed with deleting ALL data?');
    
    if (!finalConfirm) {
        showToast('Clear data cancelled', 'info');
        return;
    }
    
    saveData('fd_account_holders', []);
    saveData('fd_records', []);
    saveData('fd_templates', []);
    
    showToast('All data cleared successfully', 'success');
    
    setTimeout(() => {
        location.reload();
    }, 1000);
}

// ===================================
// Interest Calculator Functions
// ===================================

function setCalcPreset(amount, rate, duration, unit) {
    document.getElementById('calcPrincipal').value = amount;
    document.getElementById('calcRate').value = rate;
    document.getElementById('calcDuration').value = duration;
    document.getElementById('calcUnit').value = unit;
    
    showToast('Preset values loaded. Click Calculate to see results.', 'info');
}

function showInterestComparison(principal, simpleInterest, compoundInterest) {
    const comparisonCard = document.getElementById('comparisonCard');
    const canvas = document.getElementById('interestComparisonChart');
    
    if (!canvas) return;
    
    comparisonCard.style.display = 'block';
    
    const ctx = canvas.getContext('2d');
    
    // Destroy existing chart
    if (window.interestComparisonChart && typeof window.interestComparisonChart.destroy === 'function') {
        window.interestComparisonChart.destroy();
    }
    
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

function printCalculation() {
    const principal = document.getElementById('resultPrincipal').textContent;
    const rate = document.getElementById('resultRate').textContent;
    const duration = document.getElementById('resultDuration').textContent;
    const simple = document.getElementById('resultSimple').textContent;
    const compound = document.getElementById('resultCompound').textContent;
    const maturity = document.getElementById('resultMaturity').textContent;
    
    const printWindow = window.open('', '', 'height=600,width=800');
    printWindow.document.write('<html><head><title>FD Interest Calculation</title>');
    printWindow.document.write('<style>');
    printWindow.document.write('body { font-family: Arial, sans-serif; padding: 20px; }');
    printWindow.document.write('h2 { color: #0d6efd; }');
    printWindow.document.write('table { width: 100%; border-collapse: collapse; margin: 20px 0; }');
    printWindow.document.write('th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }');
    printWindow.document.write('th { background-color: #f8f9fa; }');
    printWindow.document.write('.highlight { background-color: #fff3cd; font-weight: bold; }');
    printWindow.document.write('</style></head><body>');
    printWindow.document.write('<h2>FD Manager Pro - Interest Calculation</h2>');
    printWindow.document.write('<p>Generated on: ' + new Date().toLocaleDateString() + '</p>');
    printWindow.document.write('<table>');
    printWindow.document.write('<tr><th>Description</th><th>Value</th></tr>');
    printWindow.document.write('<tr><td>Principal Amount</td><td>' + principal + '</td></tr>');
    printWindow.document.write('<tr><td>Interest Rate</td><td>' + rate + '</td></tr>');
    printWindow.document.write('<tr><td>Duration</td><td>' + duration + '</td></tr>');
    printWindow.document.write('<tr><td>Simple Interest</td><td>' + simple + '</td></tr>');
    printWindow.document.write('<tr><td>Compound Interest</td><td>' + compound + '</td></tr>');
    printWindow.document.write('<tr class="highlight"><td>Total Maturity Amount</td><td>' + maturity + '</td></tr>');
    printWindow.document.write('</table>');
    printWindow.document.write('<p><small>Note: This is an estimate. Actual returns may vary.</small></p>');
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.print();
}

// Backward compatibility
async function calculateInterest() {
    await performCalculation();
}

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
