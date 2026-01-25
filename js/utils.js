// ===================================
// FD Manager Pro - Utility Functions
// Nepal Edition - Version 4.0 (Corrected)
// ===================================

// ===================================
// Global Variables
// ===================================

let pinHash = '';
let currentEditId = null;
let currentChartType = 'pie';
let portfolioChart = null;
let analyticsChart = null;
let recordFilter = 'all';

// Currency symbol from settings (Default: NRs for Nepal)
let currencySymbol = 'NRs';

// ===================================
// Nepal Commercial Banks Database
// ===================================

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

/**
 * Encrypt data using AES
 * @param {any} data - Data to encrypt
 * @param {string} key - Encryption key
 * @returns {string} - Encrypted string
 */
function encrypt(data, key) {
    if (!key) {
        console.error('Encryption key is required');
        throw new Error('Encryption key is required');
    }
    try {
        return CryptoJS.AES.encrypt(JSON.stringify(data), key).toString();
    } catch (error) {
        console.error('Encryption error:', error);
        throw error;
    }
}

/**
 * Decrypt data using AES
 * @param {string} encryptedData - Encrypted string
 * @param {string} key - Decryption key
 * @returns {any} - Decrypted data or null on failure
 */
function decrypt(encryptedData, key) {
    if (!key) {
        console.error('Decryption key is required');
        return null;
    }
    try {
        const bytes = CryptoJS.AES.decrypt(encryptedData, key);
        const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
        
        if (!decryptedString) {
            console.error('Decryption returned empty result');
            return null;
        }
        
        return JSON.parse(decryptedString);
    } catch (error) {
        console.error('Decryption error:', error);
        return null;
    }
}

/**
 * Save data to localStorage with encryption
 * @param {string} key - Storage key
 * @param {any} data - Data to save
 * @returns {boolean} - Success status
 */
function saveData(key, data) {
    if (!pinHash) {
        console.error('Cannot save data: PIN not initialized');
        return false;
    }
    
    try {
        const encrypted = encrypt(data, pinHash);
        localStorage.setItem(key, encrypted);
        return true;
    } catch (error) {
        console.error('Save data error:', error);
        return false;
    }
}

/**
 * Get data from localStorage with decryption
 * @param {string} key - Storage key
 * @returns {any} - Decrypted data or null
 */
function getData(key) {
    if (!pinHash) {
        console.error('Cannot get data: PIN not initialized');
        return null;
    }
    
    try {
        const encrypted = localStorage.getItem(key);
        if (!encrypted) return null;
        return decrypt(encrypted, pinHash);
    } catch (error) {
        console.error('Get data error:', error);
        return null;
    }
}

// ===================================
// Date & Time Functions
// ===================================

/**
 * Format date string to DD/MM/YYYY
 * @param {string} dateString - ISO date string
 * @returns {string} - Formatted date
 */
function formatDate(dateString) {
    if (!dateString) return '-';
    
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '-';
        
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}/${month}/${year}`;
    } catch (error) {
        console.error('Date format error:', error);
        return '-';
    }
}

/**
 * Calculate maturity date based on start date and duration
 * @param {string} startDate - Start date string
 * @param {number} duration - Duration value
 * @param {string} unit - Duration unit (Days/Months/Years)
 * @returns {string} - Maturity date in ISO format
 */
function calculateMaturityDate(startDate, duration, unit) {
    if (!startDate || !duration) return '';
    
    try {
        const start = new Date(startDate);
        if (isNaN(start.getTime())) return '';
        
        let maturity = new Date(start);
        const durationNum = parseInt(duration);
        
        switch(unit) {
            case 'Days':
                maturity.setDate(maturity.getDate() + durationNum);
                break;
            case 'Months':
                maturity.setMonth(maturity.getMonth() + durationNum);
                break;
            case 'Years':
                maturity.setFullYear(maturity.getFullYear() + durationNum);
                break;
            default:
                console.warn(`Unknown duration unit: ${unit}, defaulting to months`);
                maturity.setMonth(maturity.getMonth() + durationNum);
        }
        
        return maturity.toISOString().split('T')[0];
    } catch (error) {
        console.error('Calculate maturity date error:', error);
        return '';
    }
}

/**
 * Calculate days remaining until maturity
 * @param {string} maturityDate - Maturity date string
 * @returns {number|null} - Days remaining or null on error
 */
function calculateDaysRemaining(maturityDate) {
    if (!maturityDate) return null;
    
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const maturity = new Date(maturityDate);
        if (isNaN(maturity.getTime())) {
            console.warn('Invalid maturity date:', maturityDate);
            return null;
        }
        
        maturity.setHours(0, 0, 0, 0);
        const diffTime = maturity - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    } catch (error) {
        console.error('Calculate days remaining error:', error);
        return null;
    }
}

/**
 * Convert duration to months
 * @param {number} duration - Duration value
 * @param {string} unit - Duration unit
 * @returns {number} - Duration in months
 */
function getDurationInMonths(duration, unit) {
    const durationNum = parseInt(duration) || 0;
    
    switch(unit) {
        case 'Days':
            return (durationNum / 365.25) * 12;
        case 'Years':
            return durationNum * 12;
        case 'Months':
        default:
            return durationNum;
    }
}

// ===================================
// Interest Calculation Functions
// ===================================

/**
 * Calculate simple interest
 * @param {number} principal - Principal amount
 * @param {number} rate - Annual interest rate (%)
 * @param {number} timeInMonths - Duration in months
 * @returns {number} - Interest amount
 */
function calculateSimpleInterest(principal, rate, timeInMonths) {
    if (!principal || !rate || !timeInMonths) return 0;
    
    const timeInYears = timeInMonths / 12;
    return (principal * rate * timeInYears) / 100;
}

/**
 * Calculate compound interest
 * @param {number} principal - Principal amount
 * @param {number} rate - Annual interest rate (%)
 * @param {number} timeInMonths - Duration in months
 * @param {number} frequency - Compounding frequency per year (0 for simple)
 * @returns {number} - Interest amount
 */
function calculateCompoundInterest(principal, rate, timeInMonths, frequency = 4) {
    if (!principal || !rate || !timeInMonths) return 0;
    
    const timeInYears = timeInMonths / 12;
    
    // If frequency is 0, use simple interest
    if (frequency === 0) {
        return calculateSimpleInterest(principal, rate, timeInMonths);
    }
    
    const ratePerPeriod = rate / (frequency * 100);
    const numberOfPeriods = frequency * timeInYears;
    
    const maturityAmount = principal * Math.pow(1 + ratePerPeriod, numberOfPeriods);
    return maturityAmount - principal;
}

/**
 * Calculate interest for a specific FD record
 * @param {Object} record - FD record object
 * @returns {number} - Interest amount
 */
function calculateInterestForRecord(record) {
    if (!record || !record.amount || !record.rate || !record.duration) return 0;
    
    const durationMonths = getDurationInMonths(record.duration, record.durationUnit || 'Months');
    return calculateCompoundInterest(record.amount, record.rate, durationMonths, 4);
}

// ===================================
// Formatting Functions
// ===================================

/**
 * Format amount as currency
 * @param {number} amount - Amount to format
 * @returns {string} - Formatted currency string
 */
function formatCurrency(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) {
        return currencySymbol + ' 0';
    }
    
    try {
        // Use 'en-IN' locale for Indian/Nepali number format (lakhs, crores)
        const formatted = Number(amount).toLocaleString('en-IN', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        });
        return currencySymbol + ' ' + formatted;
    } catch (error) {
        // Fallback formatting
        return currencySymbol + ' ' + Number(amount).toFixed(2);
    }
}

/**
 * Format number with locale
 * @param {number} num - Number to format
 * @returns {string} - Formatted number string
 */
function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '0';
    
    try {
        return Number(num).toLocaleString('en-IN', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        });
    } catch (error) {
        return Number(num).toFixed(2);
    }
}

// ===================================
// Toast Notification System
// ===================================

/**
 * Show toast notification
 * @param {string} message - Message to display
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
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeHtml(text) {
    if (text === null || text === undefined) return '';
    
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return String(text).replace(/[&<>"']/g, m => map[m]);
}

// Make showToast globally available
window.showToast = showToast;

// ===================================
// Tab Navigation
// ===================================

/**
 * Switch to specified tab
 * @param {string} tabId - Tab ID to switch to
 */
function switchTab(tabId) {
    try {
        const tab = document.getElementById(tabId + '-tab');
        if (tab && typeof bootstrap !== 'undefined' && bootstrap.Tab) {
            const bsTab = new bootstrap.Tab(tab);
            bsTab.show();
        }
    } catch (error) {
        console.error('Tab switch error:', error);
    }
}

// ===================================
// Theme Toggle
// ===================================

/**
 * Toggle dark mode theme
 */
function toggleTheme() {
    try {
        document.body.classList.toggle('dark-mode');
        const isDark = document.body.classList.contains('dark-mode');
        
        const settings = JSON.parse(localStorage.getItem('fd_settings') || '{}');
        settings.darkMode = isDark;
        localStorage.setItem('fd_settings', JSON.stringify(settings));
        
        const icon = document.querySelector('[onclick="toggleTheme()"] i');
        if (icon) {
            icon.className = isDark ? 'bi bi-sun-fill' : 'bi bi-moon-stars-fill';
        }
        
        // Safely call chart update functions if they exist
        if (portfolioChart && typeof updateDashboard === 'function') {
            updateDashboard();
        }
        if (analyticsChart && typeof updateAnalytics === 'function') {
            updateAnalytics();
        }
    } catch (error) {
        console.error('Theme toggle error:', error);
    }
}

// ===================================
// Validation Functions
// ===================================

/**
 * Validate PIN format (4 digits)
 */
function isValidPIN(pin) {
    return /^\d{4}$/.test(pin);
}

/**
 * Validate amount (positive number)
 */
function isValidAmount(amount) {
    const num = parseFloat(amount);
    return !isNaN(num) && num > 0;
}

/**
 * Validate interest rate (0-100)
 */
function isValidRate(rate) {
    const num = parseFloat(rate);
    return !isNaN(num) && num >= 0 && num <= 100;
}

/**
 * Validate date string
 */
function isValidDate(dateString) {
    if (!dateString) return false;
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime());
}

/**
 * Validate duration (positive integer)
 */
function isValidDuration(duration) {
    const num = parseInt(duration);
    return !isNaN(num) && num > 0 && num <= 999;
}

/**
 * Validate account holder name
 */
function isValidAccountHolder(name) {
    return name && typeof name === 'string' && name.trim().length > 0 && name.length <= 50;
}

/**
 * Validate bank name
 */
function isValidBank(bank) {
    return bank && typeof bank === 'string' && bank.trim().length > 0 && bank.length <= 100;
}

/**
 * Validate certificate data URI
 */
function isValidCertificateData(data) {
    if (!data || typeof data !== 'string') return false;
    
    const validPrefixes = [
        'data:image/jpeg;base64,',
        'data:image/jpg;base64,',
        'data:image/png;base64,',
        'data:image/gif;base64,',
        'data:application/pdf;base64,'
    ];
    
    return validPrefixes.some(prefix => data.startsWith(prefix));
}

// ===================================
// Search & Filter Functions
// ===================================

/**
 * Search records by query
 */
function searchRecords(records, query) {
    if (!query || !records) return records || [];
    
    query = query.toLowerCase().trim();
    return records.filter(record => {
        return (record.bank && record.bank.toLowerCase().includes(query)) ||
               (record.accountHolder && record.accountHolder.toLowerCase().includes(query)) ||
               (record.amount && String(record.amount).includes(query)) ||
               (record.notes && record.notes.toLowerCase().includes(query));
    });
}

// ===================================
// Array & Object Utilities
// ===================================

/**
 * Group array by key
 */
function groupBy(array, key) {
    if (!array || !Array.isArray(array)) return {};
    
    return array.reduce((result, item) => {
        const group = item[key];
        if (!result[group]) {
            result[group] = [];
        }
        result[group].push(item);
        return result;
    }, {});
}

/**
 * Sum array by key
 */
function sumBy(array, key) {
    if (!array || !Array.isArray(array)) return 0;
    return array.reduce((sum, item) => sum + (parseFloat(item[key]) || 0), 0);
}

/**
 * Average array by key
 */
function averageBy(array, key) {
    if (!array || !Array.isArray(array) || array.length === 0) return 0;
    return sumBy(array, key) / array.length;
}

// ===================================
// Status Helpers
// ===================================

/**
 * Get record status based on days remaining
 */
function getRecordStatus(daysRemaining) {
    if (daysRemaining === null || daysRemaining === undefined) return 'Unknown';
    if (daysRemaining < 0) return 'Matured';
    if (daysRemaining <= 15) return 'Expiring Soon';
    return 'Active';
}

/**
 * Get CSS class for status badge
 */
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
// ID Generator
// ===================================

/**
 * Generate unique ID
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ===================================
// Debounce Function
// ===================================

/**
 * Debounce function execution
 */
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
// Settings Functions
// ===================================

/**
 * Load application settings
 */
function loadSettings() {
    try {
        const settings = JSON.parse(localStorage.getItem('fd_settings') || '{}');
        currencySymbol = settings.currencySymbol || 'NRs';
        
        if (settings.darkMode) {
            document.body.classList.add('dark-mode');
        }
        
        return settings;
    } catch (error) {
        console.error('Load settings error:', error);
        return {};
    }
}

// ===================================
// CSV Functions
// ===================================

/**
 * Parse CSV text to array of objects
 */
function parseCSV(csvText) {
    if (!csvText || typeof csvText !== 'string') return [];
    
    try {
        const lines = csvText.split('\n').filter(line => line.trim());
        if (lines.length < 2) return [];
        
        // Parse headers - normalize to lowercase
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, ''));
        const records = [];
        
        for (let i = 1; i < lines.length; i++) {
            // Handle quoted values in CSV
            const values = parseCSVLine(lines[i]);
            const record = {};
            
            headers.forEach((header, index) => {
                record[header] = values[index]?.trim() || '';
            });
            
            records.push(record);
        }
        
        return records;
    } catch (error) {
        console.error('CSV parse error:', error);
        return [];
    }
}

/**
 * Parse a single CSV line (handles quoted values)
 */
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    
    result.push(current);
    return result;
}

/**
 * Generate CSV from records
 */
function generateCSVFromRecords(records) {
    if (!records || records.length === 0) return '';
    
    const headers = [
        'accountHolder',
        'bank',
        'amount',
        'duration',
        'durationUnit',
        'rate',
        'startDate',
        'maturityDate',
        'certificateStatus',
        'notes'
    ];
    
    let csv = '\uFEFF'; // UTF-8 BOM for Excel
    csv += headers.join(',') + '\n';
    
    records.forEach(record => {
        const maturityDate = record.maturityDate || calculateMaturityDate(
            record.startDate, record.duration, record.durationUnit
        );
        
        const row = [
            csvEscape(record.accountHolder || ''),
            csvEscape(record.bank || ''),
            record.amount || 0,
            record.duration || 0,
            record.durationUnit || 'Months',
            record.rate || 0,
            record.startDate || '',
            maturityDate || '',
            csvEscape(record.certificateStatus || 'Not Obtained'),
            csvEscape(record.notes || '')
        ];
        
        csv += row.join(',') + '\n';
    });
    
    return csv;
}

/**
 * Escape value for CSV
 */
function csvEscape(val) {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

/**
 * Download file
 */
function downloadFile(data, filename, type) {
    try {
        const blob = new Blob([data], { type: type });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (error) {
        console.error('Download file error:', error);
        showToast('Error downloading file', 'error');
    }
}

// ===================================
// File Handling
// ===================================

/**
 * Read file as Base64
 */
function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
            reject(new Error('No file provided'));
            return;
        }
        
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('File read error'));
        reader.readAsDataURL(file);
    });
}

// ===================================
// Export to Excel
// ===================================

/**
 * Export data to Excel file
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

// ===================================
// Chart Colors
// ===================================

/**
 * Get chart colors array
 */
function getChartColors(count) {
    const colors = [
        '#0d6efd', '#6f42c1', '#d63384', '#dc3545', '#fd7e14',
        '#ffc107', '#198754', '#20c997', '#0dcaf0', '#6c757d',
        '#5c636a', '#1a1e21', '#146c43', '#0a58ca', '#9f1239'
    ];
    return colors.slice(0, Math.min(count, colors.length));
}

// ===================================
// Bank Autocomplete (FIXED)
// ===================================

/**
 * Get all banks (from database + history)
 */
async function getAllBanks() {
    try {
        let allBanks = [...bankDatabase]; // Start with static bank list
        
        // Only try to get records if PIN is initialized
        if (pinHash) {
            const records = (await getData('fd_records')) || [];
            const historyBanks = [...new Set(
                records
                    .map(r => r.bank)
                    .filter(bank => bank && typeof bank === 'string' && bank.trim())
            )];
            
            // Merge with history banks
            allBanks = [...new Set([...allBanks, ...historyBanks])];
        } else {
            console.log('PIN not initialized yet, returning static bank list only');
        }
        
        return allBanks.sort((a, b) => a.localeCompare(b));
    } catch (error) {
        console.error('Get all banks error:', error);
        return [...bankDatabase].sort();
    }
}

// ===================================
// Backup & Export Functions
// ===================================

/**
 * Create full backup of all data
 */
async function backupData() {
    try {
        if (!pinHash) {
            showToast('❌ Please log in first', 'danger');
            return;
        }

        const backupObject = {
            version: '4.0',
            timestamp: new Date().toISOString(),
            records: (await getData('fd_records')) || [],
            accountHolders: (await getData('fd_account_holders')) || [],
            templates: (await getData('fd_templates')) || [],
            settings: JSON.parse(localStorage.getItem('fd_settings') || '{}'),
            calculations: (await getData('fd_calculations')) || [],
            comparisons: (await getData('fd_comparisons')) || []
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
 * Export all FD records to CSV
 */
async function exportAllToCSV() {
    try {
        console.log('[FD Manager] Starting CSV export...');
        
        const records = (await getData('fd_records')) || [];
        
        if (!Array.isArray(records) || records.length === 0) {
            showToast('⚠️ No records available to export', 'warning');
            return;
        }

        const csv = generateCSVFromRecords(records);

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

// ===================================
// Initialize
// ===================================

document.addEventListener('DOMContentLoaded', function() {
    console.log('[FD Manager Nepal] Utilities loaded successfully');
    console.log('[FD Manager Nepal] Version 4.0 (Corrected)');
});

// Debug log (at end of file, so all functions are defined)
console.log('[FD Manager] utils.js loaded');
console.log('[FD Manager] showToast available:', typeof showToast === 'function');