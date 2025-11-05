// ===================================
// FD Manager Pro - Utility Functions
// Nepal Edition - Version 4.0
// ===================================
// TEMPORARY DEBUG - Remove after fixing
console.log('=== UTILS.JS LOADING ===');
console.log('showToast function:', typeof showToast);
// Global Variables
let pinHash = '';
let currentEditId = null;
let currentChartType = 'pie';
let portfolioChart = null;
let analyticsChart = null;
let recordFilter = 'all';

// Currency symbol from settings (Default: NRs for Nepal)
let currencySymbol = 'NRs';

// Nepal Commercial Banks Database
const bankDatabase = [
    'Nepal Bank Limited',
    'Rastriya Banijya Bank',
    'Agriculture Development Bank',
    'Nabil Bank Limited',
    'Nepal Investment Bank Limited',
    'Standard Chartered Bank Nepal',
    'Himalayan Bank Limited',
    'Nepal SBI Bank Limited',
    'Nepal Bangladesh Bank Limited',
    'Everest Bank Limited',
    'Kumari Bank Limited',
    'Laxmi Sunrise Bank Limited',
    'Citizens Bank International Limited',
    'Prime Commercial Bank Limited',
    'Sunrise Bank Limited',
    'Century Commercial Bank Limited',
    'Sanima Bank Limited',
    'Machhapuchchhre Bank Limited',
    'NIC Asia Bank Limited',
    'Global IME Bank Limited',
    'NMB Bank Limited',
    'Prabhu Bank Limited',
    'Siddhartha Bank Limited',
    'Bank of Kathmandu Limited',
    'Civil Bank Limited',
    'Nepal Credit and Commerce Bank Limited'
];

// Bank rate patterns for OCR
const bankPatterns = [
    { name: 'Nepal Bank Limited', pattern: /nepal\s*bank(?!\s*(investment|sbi|bangladesh))/i },
    { name: 'Rastriya Banijya Bank', pattern: /rastriya\s*banijya|rbb/i },
    { name: 'Agriculture Development Bank', pattern: /agriculture\s*development|adbl?/i },
    { name: 'Nabil Bank Limited', pattern: /nabil/i },
    { name: 'Nepal Investment Bank Limited', pattern: /nepal\s*investment|nibl/i },
    { name: 'Standard Chartered Bank Nepal', pattern: /standard\s*chartered|scbnl/i },
    { name: 'Himalayan Bank Limited', pattern: /himalayan\s*bank|hbl/i },
    { name: 'Nepal SBI Bank Limited', pattern: /nepal\s*sbi|nsbi/i },
    { name: 'Everest Bank Limited', pattern: /everest\s*bank|ebl/i },
    { name: 'Kumari Bank Limited', pattern: /kumari/i },
    { name: 'NIC Asia Bank Limited', pattern: /nic\s*asia|nicasia/i },
    { name: 'Global IME Bank Limited', pattern: /global\s*ime|gibl/i },
    { name: 'NMB Bank Limited', pattern: /nmb\s*bank/i },
    { name: 'Prabhu Bank Limited', pattern: /prabhu/i },
    { name: 'Siddhartha Bank Limited', pattern: /siddhartha|sbl/i },
    { name: 'Sanima Bank Limited', pattern: /sanima/i }
];

// Nepal Bank Interest Rates Database
const bankRates = [
    {
        bank: 'Nabil Bank Limited',
        rates: [
            { duration: 6, rate: 7.75, minAmount: 25000 },
            { duration: 12, rate: 9.25, minAmount: 25000 },
            { duration: 24, rate: 9.75, minAmount: 25000 }
        ]
    },
    {
        bank: 'Nepal Investment Bank Limited',
        rates: [
            { duration: 6, rate: 8.0, minAmount: 25000 },
            { duration: 12, rate: 9.5, minAmount: 25000 },
            { duration: 24, rate: 10.0, minAmount: 25000 }
        ]
    },
    {
        bank: 'Global IME Bank Limited',
        rates: [
            { duration: 6, rate: 8.0, minAmount: 25000 },
            { duration: 12, rate: 9.5, minAmount: 25000 },
            { duration: 24, rate: 10.0, minAmount: 25000 }
        ]
    }
];

// ===================================
// Encryption & Storage Functions
// ===================================

function encrypt(data, key) {
    return CryptoJS.AES.encrypt(JSON.stringify(data), key).toString();
}

function decrypt(encryptedData, key) {
    try {
        const bytes = CryptoJS.AES.decrypt(encryptedData, key);
        return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
    } catch (error) {
        console.error('Decryption error:', error);
        return null;
    }
}

function saveData(key, data) {
    const encrypted = encrypt(data, pinHash);
    localStorage.setItem(key, encrypted);
}

function getData(key) {
    const encrypted = localStorage.getItem(key);
    if (!encrypted) return null;
    return decrypt(encrypted, pinHash);
}

// ===================================
// Date & Time Functions
// ===================================

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}

function calculateMaturityDate(startDate, duration, unit) {
    const start = new Date(startDate);
    let maturity = new Date(start);
    
    if (unit === 'Months') {
        maturity.setMonth(maturity.getMonth() + parseInt(duration));
    } else if (unit === 'Years') {
        maturity.setFullYear(maturity.getFullYear() + parseInt(duration));
    }
    
    return maturity.toISOString().split('T')[0];
}

function calculateDaysRemaining(maturityDate) {
    const today = new Date();
    const maturity = new Date(maturityDate);
    const diffTime = maturity - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

function getDurationInMonths(duration, unit) {
    if (unit === 'Years') {
        return duration * 12;
    }
    return duration;
}

// ===================================
// Interest Calculation Functions
// ===================================

function calculateSimpleInterest(principal, rate, timeInMonths) {
    const timeInYears = timeInMonths / 12;
    return (principal * rate * timeInYears) / 100;
}

function calculateCompoundInterest(principal, rate, timeInMonths, frequency = 4) {
    const timeInYears = timeInMonths / 12;
    
    if (frequency === 0) {
        return calculateSimpleInterest(principal, rate, timeInMonths);
    }
    
    const ratePerPeriod = rate / (frequency * 100);
    const numberOfPeriods = frequency * timeInYears;
    
    const maturityAmount = principal * Math.pow(1 + ratePerPeriod, numberOfPeriods);
    return maturityAmount - principal;
}

function calculateInterestForRecord(record) {
    const durationMonths = getDurationInMonths(record.duration, record.durationUnit);
    return calculateCompoundInterest(record.amount, record.rate, durationMonths, 4);
}

// ===================================
// Formatting Functions
// ===================================

function formatCurrency(amount) {
    if (!amount && amount !== 0) return currencySymbol + ' 0';
    return currencySymbol + ' ' + amount.toLocaleString('en-NP', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
}

function formatNumber(num) {
    if (!num && num !== 0) return '0';
    return num.toLocaleString('en-NP', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
}

// ===================================
// Toast Notification System (FIXED - NULL-SAFE)
// ===================================

/**
 * Show toast notification with auto-create functionality
 * @param {string} message - The message to display
 * @param {string} type - Toast type: 'success', 'error', 'warning', 'info', 'primary'
 */
function showToast(message, type = 'info') {
    // Ensure DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => showToast(message, type));
        return;
    }

    try {
        // Check if Bootstrap is available
        if (typeof bootstrap !== 'undefined' && bootstrap.Toast) {
            showBootstrapToast(message, type);
        } else {
            showSimpleToast(message, type);
        }
    } catch (error) {
        console.error('Toast error:', error);
        // Fallback to console if everything fails
        console.log(`[${type.toUpperCase()}] ${message}`);
        showSimpleToast(message, type);
    }
}

/**
 * Bootstrap Toast Implementation
 */
function showBootstrapToast(message, type = 'info') {
    try {
        let toastContainer = document.getElementById('toastContainer');
        
        // Create container if it doesn't exist
        if (!toastContainer) {
            toastContainer = document.createElement('div');
            toastContainer.id = 'toastContainer';
            toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
            toastContainer.style.zIndex = '9999';
            
            // Ensure body exists before appending
            if (document.body) {
                document.body.appendChild(toastContainer);
            } else {
                throw new Error('Document body not ready');
            }
        }
        
        // Create unique toast ID
        const toastId = 'toast_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const toastElement = document.createElement('div');
        toastElement.id = toastId;
        toastElement.className = `toast align-items-center text-white bg-${getToastColorClass(type)} border-0`;
        toastElement.setAttribute('role', 'alert');
        toastElement.setAttribute('aria-live', 'assertive');
        toastElement.setAttribute('aria-atomic', 'true');
        
        toastElement.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">
                    ${getToastIcon(type)} ${escapeHtml(message)}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        `;
        
        toastContainer.appendChild(toastElement);
        
        // Initialize Bootstrap toast
        const toast = new bootstrap.Toast(toastElement, {
            autohide: true,
            delay: type === 'error' || type === 'danger' ? 5000 : 3000
        });
        
        toast.show();
        
        // Clean up after hiding
        toastElement.addEventListener('hidden.bs.toast', () => {
            if (toastElement.parentElement) {
                toastElement.remove();
            }
        });
    } catch (error) {
        console.error('Bootstrap toast failed:', error);
        showSimpleToast(message, type);
    }
}

/**
 * Simple fallback toast (no Bootstrap required)
 */
function showSimpleToast(message, type = 'info') {
    try {
        // Ensure body exists
        if (!document.body) {
            console.log(`[${type.toUpperCase()}] ${message}`);
            return;
        }

        let container = document.getElementById('simpleToastContainer');
        
        if (!container) {
            container = document.createElement('div');
            container.id = 'simpleToastContainer';
            container.style.cssText = `
                position: fixed;
                bottom: 20px;
                right: 20px;
                z-index: 9999;
                max-width: 350px;
                pointer-events: none;
            `;
            document.body.appendChild(container);
            addToastAnimationStyles();
        }
        
        const toast = document.createElement('div');
        const colors = {
            success: '#198754',
            error: '#dc3545',
            danger: '#dc3545',
            warning: '#ffc107',
            info: '#0dcaf0',
            primary: '#0d6efd'
        };
        
        const textColors = { 
            warning: '#000',
            info: '#000'
        };
        
        toast.style.cssText = `
            background-color: ${colors[type] || colors.info};
            color: ${textColors[type] || '#fff'};
            padding: 12px 20px;
            margin-bottom: 10px;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            animation: slideIn 0.3s ease-out;
            cursor: pointer;
            font-size: 14px;
            line-height: 1.5;
            max-width: 350px;
            word-wrap: break-word;
            pointer-events: auto;
        `;
        
        toast.innerHTML = `${getToastIcon(type)} ${escapeHtml(message)}`;
        toast.onclick = () => removeToast(toast);
        
        container.appendChild(toast);
        
        const delay = type === 'error' || type === 'danger' ? 5000 : 3000;
        setTimeout(() => removeToast(toast), delay);
        
    } catch (error) {
        console.error('Simple toast failed:', error);
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

/**
 * Remove toast with animation
 */
function removeToast(toast) {
    if (!toast || !toast.parentElement) return;
    
    try {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
            if (toast && toast.parentElement) {
                toast.remove();
            }
        }, 300);
    } catch (error) {
        console.error('Toast removal failed:', error);
    }
}

/**
 * Add toast animation styles to document
 */
function addToastAnimationStyles() {
    if (document.getElementById('toastAnimationStyles')) return;
    
    try {
        const style = document.createElement('style');
        style.id = 'toastAnimationStyles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(400px); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0); opacity: 1; }
                to { transform: translateX(400px); opacity: 0; }
            }
        `;
        
        if (document.head) {
            document.head.appendChild(style);
        }
    } catch (error) {
        console.error('Failed to add toast styles:', error);
    }
}

/**
 * Get Bootstrap color class for toast type
 */
function getToastColorClass(type) {
    const colors = {
        'success': 'success',
        'error': 'danger',
        'danger': 'danger',
        'warning': 'warning',
        'info': 'info',
        'primary': 'primary'
    };
    return colors[type] || 'info';
}

/**
 * Get icon for toast type
 */
function getToastIcon(type) {
    const icons = {
        'success': '<i class="bi bi-check-circle-fill me-2"></i>',
        'error': '<i class="bi bi-exclamation-circle-fill me-2"></i>',
        'danger': '<i class="bi bi-exclamation-circle-fill me-2"></i>',
        'warning': '<i class="bi bi-exclamation-triangle-fill me-2"></i>',
        'info': '<i class="bi bi-info-circle-fill me-2"></i>',
        'primary': '<i class="bi bi-bell-fill me-2"></i>'
    };
    return icons[type] || icons.info;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (text == null) return '';
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

/**
 * Safe toast wrapper (never throws errors)
 */
function safeShowToast(message, type = 'info') {
    try {
        showToast(message, type);
    } catch (error) {
        console.error('Toast completely failed:', error);
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

// Alias for compatibility
window.showToast = showToast;

// ===================================
// Tab Navigation
// ===================================

function switchTab(tabId) {
    const tab = document.getElementById(tabId + '-tab');
    if (tab) {
        const bsTab = new bootstrap.Tab(tab);
        bsTab.show();
    }
}

// ===================================
// Theme Toggle
// ===================================

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    
    const settings = JSON.parse(localStorage.getItem('fd_settings') || '{}');
    settings.darkMode = isDark;
    localStorage.setItem('fd_settings', JSON.stringify(settings));
    
    const icon = document.querySelector('[onclick="toggleTheme()"] i');
    if (icon) {
        icon.className = isDark ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill';
    }
    
    if (portfolioChart) updateDashboard();
    if (analyticsChart) updateAnalytics();
}

// ===================================
// Validation Functions
// ===================================

function isValidPIN(pin) {
    return /^\d{4}$/.test(pin);
}

function isValidAmount(amount) {
    return !isNaN(amount) && amount > 0;
}

function isValidRate(rate) {
    return !isNaN(rate) && rate >= 0 && rate <= 100;
}

// ===================================
// Search & Filter Functions
// ===================================

function searchRecords(records, query) {
    if (!query) return records;
    
    query = query.toLowerCase();
    return records.filter(record => {
        return (record.bank && record.bank.toLowerCase().includes(query)) ||
               (record.accountHolder && record.accountHolder.toLowerCase().includes(query)) ||
               (record.amount && String(record.amount).includes(query));
    });
}

// ===================================
// Array & Object Utilities
// ===================================

function groupBy(array, key) {
    return array.reduce((result, item) => {
        const group = item[key];
        if (!result[group]) {
            result[group] = [];
        }
        result[group].push(item);
        return result;
    }, {});
}

function sumBy(array, key) {
    return array.reduce((sum, item) => sum + (item[key] || 0), 0);
}

function averageBy(array, key) {
    if (array.length === 0) return 0;
    return sumBy(array, key) / array.length;
}

// ===================================
// Status Helpers
// ===================================

function getRecordStatus(daysRemaining) {
    if (daysRemaining < 0) return 'Matured';
    if (daysRemaining <= 15) return 'Expiring Soon';
    return 'Active';
}

function getStatusBadgeClass(status) {
    switch (status) {
        case 'Active':
            return 'status-badge status-active';
        case 'Expiring Soon':
            return 'status-badge status-expiring';
        case 'Matured':
            return 'status-badge status-matured';
        default:
            return 'status-badge';
    }
}

// ===================================
// Random ID Generator
// ===================================

function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ===================================
// Debounce Function
// ===================================

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// ===================================
// Initialize Settings
// ===================================

function loadSettings() {
    const settings = JSON.parse(localStorage.getItem('fd_settings') || '{}');
    currencySymbol = settings.currencySymbol || 'NRs';
    
    if (settings.darkMode) {
        document.body.classList.add('dark-mode');
    }
    
    return settings;
}

// ===================================
// CSV Functions
// ===================================

function parseCSV(csvText) {
    const lines = csvText.split('\n').filter(line => line.trim());
    if (lines.length < 2) return [];
    
    const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
    const records = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const record = {};
        
        headers.forEach((header, index) => {
            record[header] = values[index] || '';
        });
        
        records.push(record);
    }
    
    return records;
}

function generateCSVFromRecords(records) {
    if (!records || records.length === 0) return '';
    
    const headers = [
        'accountholder',
        'bank',
        'amount',
        'duration',
        'unit',
        'rate',
        'startdate',
        'maturitydate',
        'certificatestatus',
        'notes'
    ];
    
    let csv = headers.join(',') + '\n';
    
    records.forEach(record => {
        const maturityDate = record.maturityDate || calculateMaturityDate(
            record.startDate, record.duration, record.durationUnit
        );
        
        const row = [
            record.accountHolder || '',
            record.bank || '',
            record.amount || 0,
            record.duration || 0,
            record.durationUnit || 'Months',
            record.rate || 0,
            record.startDate || '',
            maturityDate || '',
            record.certificateStatus || 'Not Obtained',
            (record.notes || '').replace(/,/g, ';')
        ];
        
        csv += row.join(',') + '\n';
    });
    
    return csv;
}

function downloadFile(data, filename, type) {
    const blob = new Blob([data], { type: type });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

// ===================================
// File Handling
// ===================================

function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// ===================================
// Export to Excel
// ===================================

function exportToExcelFile(data, filename) {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'FD Records');
    XLSX.writeFile(workbook, filename);
}

// ===================================
// Chart Colors
// ===================================

function getChartColors(count) {
    const colors = [
        '#0d6efd', '#6f42c1', '#d63384', '#dc3545', '#fd7e14',
        '#ffc107', '#198754', '#20c997', '#0dcaf0', '#6c757d'
    ];
    return colors.slice(0, count);
}

// ===================================
// Bank Autocomplete
// ===================================

function getAllBanks() {
    const records = getData('fd_records') || [];
    const historyBanks = [...new Set(records.map(r => r.bank))];
    const allBanks = [...new Set([...historyBanks, ...bankDatabase])];
    return allBanks.sort();
}
// =====================================================
// SIMPLE BACKUP & EXPORT FUNCTIONS (No Duplicates)
// =====================================================

/**
 * Create full backup of all data
 * Note: Smart restore is in app.js
 */
function backupData() {
    try {
        // Use correct localStorage keys from app.js
        const fd_records = localStorage.getItem('fd_records');
        const fd_account_holders = localStorage.getItem('fd_account_holders');
        const fd_templates = localStorage.getItem('fd_templates');
        const fd_settings = localStorage.getItem('fd_settings');
        const fd_calculations = localStorage.getItem('fd_calculations');
        const fd_comparisons = localStorage.getItem('fd_comparisons');
        const fd_pin = localStorage.getItem('fd_pin');

        const backupObject = {
            version: '4.0',
            timestamp: new Date().toISOString(),
            records: fd_records ? JSON.parse(CryptoJS.AES.decrypt(fd_records, fd_pin).toString(CryptoJS.enc.Utf8)) : [],
            accountHolders: fd_account_holders ? JSON.parse(CryptoJS.AES.decrypt(fd_account_holders, fd_pin).toString(CryptoJS.enc.Utf8)) : [],
            templates: fd_templates ? JSON.parse(CryptoJS.AES.decrypt(fd_templates, fd_pin).toString(CryptoJS.enc.Utf8)) : [],
            settings: fd_settings ? JSON.parse(fd_settings) : {},
            calculations: fd_calculations ? JSON.parse(CryptoJS.AES.decrypt(fd_calculations, fd_pin).toString(CryptoJS.enc.Utf8)) : [],
            comparisons: fd_comparisons ? JSON.parse(CryptoJS.AES.decrypt(fd_comparisons, fd_pin).toString(CryptoJS.enc.Utf8)) : []
        };

        const dataStr = JSON.stringify(backupObject, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        link.download = `FD-Manager-Backup-${timestamp}.json`;
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);

        showToast('✅ Backup downloaded successfully!', 'success');
        console.log('[FD Manager] Backup created successfully');
    } catch (error) {
        console.error('[FD Manager] Backup error:', error);
        showToast('❌ Error creating backup: ' + error.message, 'danger');
    }
}

/**
 /**
 * Export all FD records to CSV
 * Headers match import format for seamless re-import
 */
function exportAllToCSV() {
    try {
        console.log('[FD Manager] Starting CSV export...');
        
        let records = [];
        
        // Try using getData() from app.js first
        if (typeof getData === 'function') {
            records = getData('fd_records') || [];
            console.log(`[FD Manager] Loaded ${records.length} records using getData()`);
        } else {
            // Fallback: manual decryption
            const encryptedData = localStorage.getItem('fd_records');
            const userPIN = localStorage.getItem('fd_pin');
            
            if (!encryptedData || !userPIN) {
                showToast('⚠️ No FD records found to export', 'warning');
                return;
            }
            
            try {
                const decryptedData = CryptoJS.AES.decrypt(encryptedData, userPIN).toString(CryptoJS.enc.Utf8);
                records = JSON.parse(decryptedData);
                console.log(`[FD Manager] Decrypted ${records.length} records`);
            } catch (decryptError) {
                console.error('[FD Manager] Decryption failed:', decryptError);
                showToast('❌ Error: Unable to decrypt data', 'danger');
                return;
            }
        }
        
        // Validate records
        if (!Array.isArray(records) || records.length === 0) {
            showToast('⚠️ No records available to export', 'warning');
            return;
        }

        // Build CSV content with headers matching import format
        let csv = '\uFEFF'; // UTF-8 BOM for Excel
        
        // Headers - MUST MATCH import parser expectations
        csv += 'accountHolder,bank,amount,duration,unit,rate,startDate,maturityDate,certificateStatus,notes\n';
        
        // Data rows
        records.forEach(r => {
            const row = [
                csvEscape(r.accountHolder),
                csvEscape(r.bank),
                r.amount || 0,
                r.duration || '',
                r.durationUnit || r.unit || 'Months',
                r.rate || 0,
                r.startDate || '',
                r.maturityDate || '',
                csvEscape(r.certificateStatus || 'Not Obtained'),
                csvEscape(r.notes || '')
            ];
            csv += row.join(',') + '\n';
        });

        // Download file
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        
        link.setAttribute('href', url);
        link.setAttribute('download', `FD-Records-${new Date().toISOString().slice(0,10)}.csv`);
        link.style.visibility = 'hidden';
        
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        URL.revokeObjectURL(url);

        showToast(`✅ Successfully exported ${records.length} records to CSV!`, 'success');
        console.log(`[FD Manager] CSV export successful: ${records.length} records`);
        
    } catch (error) {
        console.error('[FD Manager] CSV export error:', error);
        showToast('❌ Export failed: ' + error.message, 'danger');
    }
}

/**
 * Helper to escape CSV values
 */
function csvEscape(val) {
    if (!val) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

console.log('[FD Manager] Backup & Export functions loaded (Import/Restore in app.js)');

// ===================================
// Initialize
// ===================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('[FD Manager Nepal] Utilities loaded successfully');
});