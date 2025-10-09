// ===================================
// FD Manager Pro - Main Application
// Part 1: Core & Authentication
// Nepal Edition - Version 4.0
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
    
    if (!savedPin) {
        document.getElementById('loginForm').style.display = 'none';
        document.getElementById('setupForm').style.display = 'block';
    } else {
        document.getElementById('loginForm').style.display = 'block';
        document.getElementById('setupForm').style.display = 'none';
    }
    
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('mainApp').style.display = 'none';
}

function setupPin() {
    const pin = document.getElementById('setupPin').value;
    const confirmPin = document.getElementById('confirmPin').value;
    
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
    
    saveData('fd_account_holders', []);
    saveData('fd_records', []);
    saveData('fd_templates', []);
    saveData('fd_comparisons', []);
    saveData('fd_calculations', []);
    
    setTimeout(() => {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('mainApp').style.display = 'block';
        initializeApp();
    }, 500);
}

function login() {
    const pin = document.getElementById('loginPin').value;
    
    if (!isValidPIN(pin)) {
        showToast('Invalid PIN format', 'error');
        return;
    }
    
    const hash = CryptoJS.SHA256(pin).toString();
    const savedHash = localStorage.getItem('fd_pin');
    
    if (hash !== savedHash) {
        showToast('Incorrect PIN', 'error');
        document.getElementById('loginPin').value = '';
        return;
    }
    
    pinHash = hash;
    
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('mainApp').style.display = 'block';
    
    initializeApp();
}

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        pinHash = '';
        currentEditId = null;
        document.getElementById('loginPin').value = '';
        checkLogin();
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
    }
}

// ===================================
// App Initialization
// ===================================

function initializeApp() {
    loadAccountHolders();
    loadFDRecords();
    loadTemplates();
    updateDashboard();
    updateAnalytics();
    populateSettings();
    
    showToast('Welcome to FD Manager Pro - Nepal Edition!', 'success');
}

function initializeEventListeners() {
    document.getElementById('loginPin')?.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') login();
    });
    
    document.getElementById('setupPin')?.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') document.getElementById('confirmPin').focus();
    });
    
    document.getElementById('confirmPin')?.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') setupPin();
    });
    
    setupBankAutocomplete();
    
    const searchInput = document.getElementById('searchRecords');
    if (searchInput) {
        searchInput.addEventListener('input', debounce(filterRecords, 300));
    }
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
            
            select.value = currentValue;
        }
    });
    
    updateAccountHoldersList(holders);
}

function updateAccountHoldersList(holders) {
    const container = document.getElementById('accountHoldersList');
    if (!container) return;
    
    if (holders.length === 0) {
        container.innerHTML = '<p class="text-muted">No account holders added yet</p>';
        return;
    }
    
    container.innerHTML = holders.map(holder => `
        <div class="account-holder-item">
            <span><i class="bi bi-person-fill"></i> ${holder}</span>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteAccountHolder('${holder}')">
                <i class="bi bi-trash"></i>
            </button>
        </div>
    `).join('');
}

function addAccountHolder(event) {
    event.preventDefault();
    
    const input = document.getElementById('newAccountHolder');
    const name = input.value.trim();
    
    if (!name) {
        showToast('Please enter a name', 'error');
        return;
    }
    
    const holders = getData('fd_account_holders') || [];
    
    if (holders.includes(name)) {
        showToast('Account holder already exists', 'error');
        return;
    }
    
    holders.push(name);
    saveData('fd_account_holders', holders);
    
    loadAccountHolders();
    input.value = '';
    
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
    records = records.filter(r => r.accountHolder !== name);
    saveData('fd_records', records);
    
    loadAccountHolders();
    loadFDRecords();
    updateDashboard();
    
    showToast(`Account holder "${name}" deleted`, 'success');
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
    
    if (records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" class="text-center text-muted">No records found</td></tr>';
        return;
    }
    
    records = applyRecordFilters(records);
    
    tbody.innerHTML = records.map(record => {
        const maturityDate = record.maturityDate || calculateMaturityDate(
            record.startDate, record.duration, record.durationUnit
        );
        
        const daysRemaining = calculateDaysRemaining(maturityDate);
        const status = getRecordStatus(daysRemaining);
        const interest = calculateInterestForRecord(record);
        
        return `
            <tr>
                <td><input type="checkbox" class="record-checkbox" value="${record.id}" onchange="updateSelectAllState()"></td>
                <td>${record.accountHolder}</td>
                <td>${record.bank}</td>
                <td>${formatCurrency(record.amount)}</td>
                <td>${record.duration} ${record.durationUnit}</td>
                <td>${record.rate}%</td>
                <td>${formatDate(record.startDate)}</td>
                <td>${formatDate(maturityDate)}</td>
                <td>${daysRemaining > 0 ? daysRemaining : '0'}</td>
                <td>${formatCurrency(interest)}</td>
                <td><span class="${getStatusBadgeClass(status)}">${status}</span></td>
                <td>
                    <button class="btn btn-sm btn-primary" onclick="editFD('${record.id}')" title="Edit">
                        <i class="bi bi-pencil-fill"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteFD('${record.id}')" title="Delete">
                        <i class="bi bi-trash-fill"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

function applyRecordFilters(records) {
    const searchQuery = document.getElementById('searchRecords')?.value;
    if (searchQuery) {
        records = searchRecords(records, searchQuery);
    }
    
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

function setRecordFilter(filter) {
    recordFilter = filter;
    
    document.querySelectorAll('.btn-group button').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    loadFDRecords();
}

function filterRecords() {
    loadFDRecords();
}

function saveFD(event) {
    event.preventDefault();
    
    const accountHolder = document.getElementById('fdAccountHolder').value;
    const bank = document.getElementById('fdBank').value;
    const amount = parseFloat(document.getElementById('fdAmount').value);
    const duration = parseInt(document.getElementById('fdDuration').value);
    const durationUnit = document.getElementById('fdDurationUnit').value;
    const rate = parseFloat(document.getElementById('fdRate').value);
    const startDate = document.getElementById('fdStartDate').value;
    const certStatus = document.getElementById('fdCertStatus').value;
    const fdNumber = document.getElementById('fdNumber').value;
    const notes = document.getElementById('fdNotes').value;
    
    if (!accountHolder) {
        showToast('Please select an account holder', 'error');
        return false;
    }
    
    if (!bank || !amount || !duration || !rate || !startDate) {
        showToast('Please fill all required fields', 'error');
        return false;
    }
    
    if (!isValidAmount(amount) || !isValidRate(rate)) {
        showToast('Please enter valid amount and rate', 'error');
        return false;
    }
    
    const maturityDate = calculateMaturityDate(startDate, duration, durationUnit);
    
    // Handle certificate upload
    const certFile = document.getElementById('fdCertificate').files[0];
    
    const saveFDRecord = (certData) => {
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
            fdNumber: fdNumber || '',
            certificate: certData,
            notes,
            createdAt: currentEditId ? undefined : new Date().toISOString(),
            updatedAt: currentEditId ? new Date().toISOString() : undefined
        };
        
        let records = getData('fd_records') || [];
        
        if (currentEditId) {
            const index = records.findIndex(r => r.id === currentEditId);
            if (index !== -1) {
                records[index] = { ...records[index], ...record };
            }
        } else {
            records.push(record);
        }
        
        saveData('fd_records', records);
        loadFDRecords();
        updateDashboard();
        updateAnalytics();
        loadCertificates();
        
        showToast(currentEditId ? 'FD updated successfully ✓' : 'FD added successfully ✓', 'success');
        
        // Clear draft
        clearDraft();
        
        // Reset form
        document.getElementById('fdForm').reset();
        removeCertificatePreview();
        hideSmartSuggestion();
        currentEditId = null;
        document.getElementById('formTitle').innerHTML = '<i class="bi bi-plus-circle"></i> Add New FD';
        document.getElementById('cancelEditBtn').style.display = 'none';
        
        // Set today's date again
        document.getElementById('fdStartDate').value = new Date().toISOString().split('T')[0];
        updateInterestPreview();
        
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
        
        return true;
    };
    
    // Process certificate if uploaded
    if (certFile) {
        if (certFile.size > 5 * 1024 * 1024) {
            showToast('Certificate file size must be less than 5MB', 'error');
            return false;
        }
        
        readFileAsBase64(certFile).then(data => {
            saveFDRecord(data);
        }).catch(error => {
            console.error('Error reading certificate:', error);
            showToast('Error uploading certificate', 'error');
            return false;
        });
    } else {
        // Keep existing certificate if editing
        if (currentEditId) {
            const records = getData('fd_records') || [];
            const existing = records.find(r => r.id === currentEditId);
            const certificateData = existing?.certificate;
            saveFDRecord(certificateData);
        } else {
            saveFDRecord(null);
        }
    }
    
    return true;
}
function editFD(id) {
    const records = getData('fd_records') || [];
    const record = records.find(r => r.id === id);
    
    if (!record) return;
    
    currentEditId = id;
    
    document.getElementById('fdAccountHolder').value = record.accountHolder;
    document.getElementById('fdBank').value = record.bank;
    document.getElementById('fdAmount').value = record.amount;
    document.getElementById('fdDuration').value = record.duration;
    document.getElementById('fdDurationUnit').value = record.durationUnit;
    document.getElementById('fdRate').value = record.rate;
    document.getElementById('fdStartDate').value = record.startDate;
    document.getElementById('fdCertStatus').value = record.certificateStatus || 'Not Obtained';
    document.getElementById('fdNotes').value = record.notes || '';
    
    document.getElementById('formTitle').textContent = 'Edit FD';
    document.getElementById('cancelEditBtn').style.display = 'inline-block';
    
    document.querySelector('#records .card').scrollIntoView({ behavior: 'smooth' });
    
    updateInterestPreview();
}

function cancelEdit() {
    currentEditId = null;
    document.getElementById('fdForm').reset();
    document.getElementById('formTitle').textContent = 'Add New FD';
    document.getElementById('cancelEditBtn').style.display = 'none';
}

function deleteFD(id) {
    if (!confirm('Are you sure you want to delete this FD record?')) {
        return;
    }
    
    let records = getData('fd_records') || [];
    records = records.filter(r => r.id !== id);
    saveData('fd_records', records);
    
    loadFDRecords();
    updateDashboard();
    updateAnalytics();
    
    showToast('FD deleted successfully', 'success');
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
    updateAnalytics();
    
    showToast(`${checkboxes.length} record(s) deleted`, 'success');
    
    document.getElementById('selectAll').checked = false;
    document.getElementById('deleteSelectedBtn').disabled = true;
}

function toggleSelectAll() {
    const selectAll = document.getElementById('selectAll').checked;
    document.querySelectorAll('.record-checkbox').forEach(cb => {
        cb.checked = selectAll;
    });
    updateSelectAllState();
}

function updateSelectAllState() {
    const checkboxes = document.querySelectorAll('.record-checkbox');
    const checkedBoxes = document.querySelectorAll('.record-checkbox:checked');
    
    document.getElementById('selectAll').checked = 
        checkboxes.length > 0 && checkboxes.length === checkedBoxes.length;
    
    document.getElementById('deleteSelectedBtn').disabled = checkedBoxes.length === 0;
}

// ===================================
// Interest Preview
// ===================================

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
    } else {
        document.getElementById('previewQuarterly').textContent = formatCurrency(0);
        document.getElementById('previewMonthly').textContent = formatCurrency(0);
        document.getElementById('previewAnnual').textContent = formatCurrency(0);
    }
}

function toggleCustomMaturity() {
    updateInterestPreview();
}

// ===================================
// Bank Autocomplete
// ===================================

function setupBankAutocomplete() {
    const bankInput = document.getElementById('fdBank');
    const datalist = document.getElementById('bankSuggestions');
    
    if (!bankInput || !datalist) return;
    
    bankInput.addEventListener('input', function() {
        const suggestions = getAllBanks();
        
        datalist.innerHTML = '';
        suggestions.forEach(bank => {
            const option = document.createElement('option');
            option.value = bank;
            datalist.appendChild(option);
        });
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
                valA = a.accountHolder;
                valB = b.accountHolder;
                break;
            case 'bank':
                valA = a.bank;
                valB = b.bank;
                break;
            case 'amount':
                valA = a.amount;
                valB = b.amount;
                break;
            case 'rate':
                valA = a.rate;
                valB = b.rate;
                break;
            case 'startDate':
                valA = new Date(a.startDate);
                valB = new Date(b.startDate);
                break;
            case 'daysRemaining':
                const matA = a.maturityDate || calculateMaturityDate(a.startDate, a.duration, a.durationUnit);
                const matB = b.maturityDate || calculateMaturityDate(b.startDate, b.duration, b.durationUnit);
                valA = calculateDaysRemaining(matA);
                valB = calculateDaysRemaining(matB);
                break;
            default:
                return 0;
        }
        
        if (typeof valA === 'string') {
            valA = valA.toLowerCase();
            valB = valB.toLowerCase();
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
    if (confirm('This will load 3 sample FD records for testing. Continue?')) {
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
        
        // Create PIN 1234 for demo
        const demoPin = '1234';
        const hash = CryptoJS.SHA256(demoPin).toString();
        localStorage.setItem('fd_pin', hash);
        pinHash = hash;
        
        // Save sample data
        saveData('fd_account_holders', sampleHolders);
        saveData('fd_records', sampleRecords);
        saveData('fd_templates', []);
        
        showToast('Sample data loaded! Use PIN: 1234 to login', 'success');
        
        setTimeout(() => {
            location.reload();
        }, 2000);
    }
}

console.log('[FD Manager Nepal] App.js loaded successfully');