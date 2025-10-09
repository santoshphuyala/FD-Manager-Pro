// ===================================
// FD Manager Pro - Utility Functions
// Nepal Edition - Version 4.0
// ===================================

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
// Toast Notification
// ===================================

function showToast(message, type = 'info') {
    const toastEl = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    
    toastMessage.textContent = message;
    
    toastEl.className = 'toast';
    if (type === 'success') {
        toastEl.classList.add('bg-success', 'text-white');
    } else if (type === 'error') {
        toastEl.classList.add('bg-danger', 'text-white');
    } else if (type === 'warning') {
        toastEl.classList.add('bg-warning');
    }
    
    const toast = new bootstrap.Toast(toastEl);
    toast.show();
}

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

// ===================================
// Initialize
// ===================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('[FD Manager Nepal] Utilities loaded successfully');
});