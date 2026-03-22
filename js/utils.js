// ===================================
// FD Manager Pro - Utility Functions
// Nepal Edition - Version 4.1 (Corrected)
// ===================================
//
// Changelog (v4.1):
//   • Removed duplicate getAllBanks() declaration
//   • Added missing calculateDurationFromDates()
//   • Added missing exportToCSV()
//   • Added parseLocalDate() helper to avoid timezone bugs
//   • Added safety guards for all external-function calls
//   • Fixed formatDate timezone off-by-one
//   • Fixed calculateMaturityDate timezone handling
//   • Fixed calculateDaysRemaining timezone handling
//   • Fixed event-listener leak in fixDropdownPositioning
//   • Added CryptoJS / XLSX availability checks
//   • Froze static data arrays to prevent accidental mutation
//   • Cleaned up duplicate section headers
// ===================================

// ===================================
// Global Variables
// ===================================

let pinHash = '';

function setPinHash(hash) {
    pinHash = hash;
}

let currentEditId = null;
let currentEditSource = 'records';

function setCurrentEditId(id) {
    currentEditId = id;
}

function setCurrentEditSource(source) {
    currentEditSource = source;
}

let currentChartType = 'pie';
let portfolioChart = null;
let analyticsChart = null;
let recordFilter = 'all';

// Currency symbol from settings (Default: NRs for Nepal)
let currencySymbol = 'NRs';

// ===================================
// Nepal Commercial Banks Database
// ===================================

const bankDatabase = Object.freeze([
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
]);

// Bank rate patterns for OCR
const bankPatterns = Object.freeze([
    { name: 'Nepal Bank Limited',            pattern: /nepal\s*bank(?!\s*(investment|sbi|bangladesh))/i },
    { name: 'Rastriya Banijya Bank',         pattern: /rastriya\s*banijya|rbb/i },
    { name: 'Agriculture Development Bank',  pattern: /agriculture\s*development|adbl?/i },
    { name: 'Nabil Bank Limited',            pattern: /nabil/i },
    { name: 'Nepal Investment Bank Limited', pattern: /nepal\s*investment|nibl/i },
    { name: 'Standard Chartered Bank Nepal', pattern: /standard\s*chartered|scbnl/i },
    { name: 'Himalayan Bank Limited',        pattern: /himalayan\s*bank|hbl/i },
    { name: 'Nepal SBI Bank Limited',        pattern: /nepal\s*sbi|nsbi/i },
    { name: 'Everest Bank Limited',          pattern: /everest\s*bank|ebl/i },
    { name: 'Kumari Bank Limited',           pattern: /kumari/i },
    { name: 'NIC Asia Bank Limited',         pattern: /nic\s*asia|nicasia/i },
    { name: 'Global IME Bank Limited',       pattern: /global\s*ime|gibl/i },
    { name: 'NMB Bank Limited',              pattern: /nmb\s*bank/i },
    { name: 'Prabhu Bank Limited',           pattern: /prabhu/i },
    { name: 'Siddhartha Bank Limited',       pattern: /siddhartha|sbl/i },
    { name: 'Sanima Bank Limited',           pattern: /sanima/i }
]);

// Nepal Bank Interest Rates Database
const bankRates = Object.freeze([
    {
        bank: 'Nabil Bank Limited',
        rates: Object.freeze([
            { duration: 6,  rate: 7.75, minAmount: 25000 },
            { duration: 12, rate: 9.25, minAmount: 25000 },
            { duration: 24, rate: 9.75, minAmount: 25000 }
        ])
    },
    {
        bank: 'Nepal Investment Bank Limited',
        rates: Object.freeze([
            { duration: 6,  rate: 8.0,  minAmount: 25000 },
            { duration: 12, rate: 9.5,  minAmount: 25000 },
            { duration: 24, rate: 10.0, minAmount: 25000 }
        ])
    },
    {
        bank: 'Global IME Bank Limited',
        rates: Object.freeze([
            { duration: 6,  rate: 8.0,  minAmount: 25000 },
            { duration: 12, rate: 9.5,  minAmount: 25000 },
            { duration: 24, rate: 10.0, minAmount: 25000 }
        ])
    }
]);

// ===================================
// Bank Autocomplete
// ===================================

/**
 * Get all known banks (static list + user history).
 * @returns {Promise<string[]>} Sorted, deduplicated bank names
 */
async function getAllBanks() {
    try {
        let allBanks = [...bankDatabase];

        if (pinHash && typeof getCachedData === 'function') {
            const records = (await getCachedData('records', 'fd_records')) || [];
            const historyBanks = [...new Set(
                records
                    .map(r => r.bank)
                    .filter(bank => bank && typeof bank === 'string' && bank.trim())
            )];
            allBanks = [...new Set([...allBanks, ...historyBanks])];
        }

        return allBanks.sort((a, b) => a.localeCompare(b));
    } catch (error) {
        console.error('Get all banks error:', error);
        return [...bankDatabase].sort();
    }
}

// ===================================
// Encryption & Storage Functions
// ===================================

/**
 * Encrypt data using AES.
 * @param {any}    data - Data to encrypt
 * @param {string} key  - Encryption key
 * @returns {string} Encrypted string
 */
function encrypt(data, key) {
    if (!key) {
        console.error('Encryption key is required');
        throw new Error('Encryption key is required');
    }
    if (typeof CryptoJS === 'undefined') {
        throw new Error('CryptoJS library not loaded. Please refresh the page.');
    }
    try {
        return CryptoJS.AES.encrypt(JSON.stringify(data), key).toString();
    } catch (error) {
        console.error('Encryption error:', error);
        throw error;
    }
}

/**
 * Decrypt data using AES.
 * @param {string} encryptedData - Encrypted string
 * @param {string} key           - Decryption key
 * @returns {any|null} Decrypted data or null on failure
 */
function decrypt(encryptedData, key) {
    if (!key) {
        console.error('Decryption key is required');
        return null;
    }
    if (typeof CryptoJS === 'undefined') {
        console.error('CryptoJS library not loaded');
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
 * Save data to localStorage with encryption.
 * @param {string} key  - Storage key
 * @param {any}    data - Data to save
 * @returns {boolean} Success status
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
 * Get data from localStorage with decryption.
 * @param {string} key - Storage key
 * @returns {any|null} Decrypted data or null
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
 * Parse a date string (YYYY-MM-DD or ISO) as a **local** Date to avoid
 * timezone-induced off-by-one errors.
 *
 * @param {string|Date} dateInput - Date string or Date object
 * @returns {Date|null} Local Date object or null
 */
function parseLocalDate(dateInput) {
    if (!dateInput) return null;

    // Already a Date
    if (dateInput instanceof Date) {
        return isNaN(dateInput.getTime()) ? null : dateInput;
    }

    if (typeof dateInput === 'string') {
        // Handle YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss…
        const parts = dateInput.split(/[-T]/);
        if (parts.length >= 3) {
            const y = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10) - 1;
            const d = parseInt(parts[2], 10);
            if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
                const date = new Date(y, m, d); // local midnight
                return isNaN(date.getTime()) ? null : date;
            }
        }
    }

    // Fallback
    const date = new Date(dateInput);
    return isNaN(date.getTime()) ? null : date;
}

function normalizeDurationUnit(unit) {
    if (!unit) return null;
    const normalized = String(unit).trim().toLowerCase();

    if (/^(business[-\s]?days?|bd|b)$/.test(normalized)) return 'BusinessDays';
    if (/^(days?|d)$/.test(normalized)) return 'Days';
    if (/^(months?|mos?|m)$/.test(normalized)) return 'Months';
    if (/^(years?|yrs?|y)$/.test(normalized)) return 'Years';

    return null;
}

function isLastDayOfMonth(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) return false;
    const month = date.getMonth();
    return date.getDate() === new Date(date.getFullYear(), month + 1, 0).getDate();
}

function getDaysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
}

/**
 * Format a local Date to "YYYY-MM-DD" string (safe for <input type="date">).
 * @param {Date} date - Local Date object
 * @returns {string} "YYYY-MM-DD"
 */
function toISOLocalDateString(date) {
    const yyyy = date.getFullYear();
    const mm   = String(date.getMonth() + 1).padStart(2, '0');
    const dd   = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

/**
 * Format date string to DD/MM/YYYY.
 * @param {string} dateString - ISO date string (YYYY-MM-DD)
 * @returns {string} Formatted date or '-'
 */
function formatDate(dateString) {
    if (!dateString) return '-';

    try {
        const date = parseLocalDate(dateString);
        if (!date) return '-';

        const dd   = String(date.getDate()).padStart(2, '0');
        const mm   = String(date.getMonth() + 1).padStart(2, '0');
        const yyyy = date.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
    } catch (error) {
        console.error('Date format error:', error);
        return '-';
    }
}

/**
 * Add business days to a date (skipping weekends and optional holidays).
 * @param {Date} baseDate
 * @param {number} offset
 * @param {Array<string>} [holidays] - Array of YYYY-MM-DD strings
 * @returns {Date}
 */
function addBusinessDays(baseDate, offset, holidays = []) {
    const date = new Date(baseDate);
    const increment = offset >= 0 ? 1 : -1;
    let remainingDays = Math.abs(Math.round(offset));

    const holidaySet = new Set((holidays || []).map(d => d.trim()));

    while (remainingDays > 0) {
        date.setDate(date.getDate() + increment);
        const day = date.getDay();
        const formatted = toISOLocalDateString(date);
        if (day === 0 || day === 6 || holidaySet.has(formatted)) {
            continue;
        }
        remainingDays -= 1;
    }

    return date;
}

/**
 * Calculate maturity date based on start date and duration.
 * @param {string|Date} startDate - Start date string (YYYY-MM-DD) or Date object
 * @param {number|string|object} duration - Duration value or object { duration, unit }
 * @param {string} [unit] - Duration unit (Days/Months/Years/BusinessDays)
 * @param {object} [options] - Optional behavior modifiers
 * @param {Array<string>} [options.holidays] - Holiday dates (YYYY-MM-DD) to exclude for business days
 * @returns {string} Maturity date as "YYYY-MM-DD" or ''
 */
function calculateMaturityDate(startDate, duration, unit, options = {}) {
    if (!startDate || duration === undefined || duration === null) return '';

    try {
        const start = parseLocalDate(startDate);
        if (!start) return '';

        let durationValue;
        let durationUnit = unit;

        if (typeof duration === 'object' && duration !== null && !Array.isArray(duration)) {
            durationValue = duration.duration;
            durationUnit = duration.unit || durationUnit;
        } else {
            durationValue = duration;
        }

        // Allow duration strings like "6m", "12 months", "1.5y", "30d".
        if (typeof durationValue === 'string') {
            const match = durationValue.trim().match(/^([+-]?\d+(?:\.\d+)?)(?:\s*(d(?:ays?)?|m(?:onths?|os?)?|y(?:ears?)?|b(?:usinessdays?)?))?$/i);
            if (match) {
                durationValue = parseFloat(match[1]);
                if (!durationUnit && match[2]) {
                    durationUnit = match[2];
                }
            }
        }

        const durationNum = Number(durationValue);
        if (!Number.isFinite(durationNum)) return '';

        const normalizedUnit = durationUnit ? normalizeDurationUnit(durationUnit) : null;
        if (!normalizedUnit) {
            console.warn(`Unknown duration unit: ${durationUnit}. Defaulting to Months.`);
            durationUnit = 'Months';
        }

        const maturity = new Date(start);

        if (durationNum === 0) {
            return toISOLocalDateString(maturity);
        }

        switch (normalizeDurationUnit(durationUnit)) {
            case 'Days':
                maturity.setDate(maturity.getDate() + Math.round(durationNum));
                break;
            case 'BusinessDays':
                {
                    const businessDays = Math.round(durationNum);
                    const holidays = Array.isArray(options.holidays) ? options.holidays : [];
                    const result = addBusinessDays(maturity, businessDays, holidays);
                    return toISOLocalDateString(result);
                }
            case 'Months':
                {
                    const wholeMonths = Math.trunc(durationNum);
                    maturity.setMonth(maturity.getMonth() + wholeMonths);
                    const fractional = Math.abs(durationNum - wholeMonths);
                    if (fractional > 0) {
                        const daysInMonth = getDaysInMonth(maturity.getFullYear(), maturity.getMonth());
                        maturity.setDate(maturity.getDate() + Math.round(fractional * daysInMonth));
                    }
                }
                break;
            case 'Years':
                {
                    const wholeYears = Math.trunc(durationNum);
                    maturity.setFullYear(maturity.getFullYear() + wholeYears);
                    const fractional = Math.abs(durationNum - wholeYears);
                    if (fractional > 0) {
                        const monthsToAdd = Math.round(fractional * 12);
                        maturity.setMonth(maturity.getMonth() + monthsToAdd);
                    }
                }
                break;
            default:
                maturity.setMonth(maturity.getMonth() + Math.round(durationNum));
        }

        return toISOLocalDateString(maturity);
    } catch (error) {
        console.error('Calculate maturity date error:', error);
        return '';
    }
}

/**
 * Calculate days remaining until maturity.
 * @param {string} maturityDate - Maturity date string (YYYY-MM-DD)
 * @returns {number|null} Days remaining or null on error
 */
function calculateDaysRemaining(maturityDate) {
    if (!maturityDate) return null;

    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const maturity = parseLocalDate(maturityDate);
        if (!maturity) {
            console.warn('Invalid maturity date:', maturityDate);
            return null;
        }

        maturity.setHours(0, 0, 0, 0);
        const diffTime = maturity - today;
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    } catch (error) {
        console.error('Calculate days remaining error:', error);
        return null;
    }
}

/**
 * Calculate duration in whole days between two dates.
 * @param {string|Date} fromDate - Start date
 * @param {string|Date} toDate   - End date
 * @returns {number} Duration in days (0 on error)
 */
function calculateDurationFromDates(fromDate, toDate) {
    const from = parseLocalDate(fromDate);
    const to   = parseLocalDate(toDate);

    if (!from || !to) {
        console.error('Invalid dates provided to calculateDurationFromDates');
        return 0;
    }

    from.setHours(0, 0, 0, 0);
    to.setHours(0, 0, 0, 0);

    const diffMs = to - from;
    return Math.round(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Convert duration to months.
 * @param {number} duration - Duration value
 * @param {string} unit     - Duration unit
 * @returns {number} Duration in months
 */
function getDurationInMonths(duration, unit) {
    const durationNum = parseInt(duration, 10) || 0;

    switch (unit) {
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
 * Calculate simple interest.
 * @param {number} principal    - Principal amount
 * @param {number} rate         - Annual interest rate (%)
 * @param {number} timeInMonths - Duration in months
 * @returns {number} Interest amount
 */
function calculateSimpleInterest(principal, rate, timeInMonths) {
    if (!principal || !rate || !timeInMonths) return 0;

    const timeInYears = timeInMonths / 12;
    return (principal * rate * timeInYears) / 100;
}

/**
 * Calculate compound interest.
 * @param {number} principal    - Principal amount
 * @param {number} rate         - Annual interest rate (%)
 * @param {number} timeInMonths - Duration in months
 * @param {number} frequency    - Compounding frequency per year (0 = simple)
 * @returns {number} Interest amount
 */
function calculateCompoundInterest(principal, rate, timeInMonths, frequency = 4) {
    if (!principal || !rate || !timeInMonths) return 0;

    const timeInYears = timeInMonths / 12;

    if (frequency === 0) {
        return calculateSimpleInterest(principal, rate, timeInMonths);
    }

    const ratePerPeriod    = rate / (frequency * 100);
    const numberOfPeriods  = frequency * timeInYears;
    const maturityAmount   = principal * Math.pow(1 + ratePerPeriod, numberOfPeriods);
    return maturityAmount - principal;
}

/**
 * Calculate interest for a specific FD record.
 * @param {Object} record - FD record object
 * @returns {number} Interest amount
 */
function calculateInterestForRecord(record) {
    if (!record || !record.amount || !record.rate || !record.duration) return 0;

    const durationMonths = getDurationInMonths(record.duration, record.durationUnit || 'Months');
    return calculateCompoundInterest(record.amount, record.rate, durationMonths, 4);
}

/**
 * Calculate interest for a custom date range on an existing FD record.
 * @param {Object} record    - FD record object
 * @param {string} fromDate  - Start date for calculation (YYYY-MM-DD)
 * @param {string} toDate    - End date for calculation (YYYY-MM-DD)
 * @param {number} frequency - Compounding frequency (1, 4, 12, 365, 0)
 * @returns {number} Interest amount for the custom period
 */
function calculateInterestForCustomDateRange(record, fromDate, toDate, frequency = 4) {
    if (!record || !record.amount || !record.rate || !fromDate || !toDate) return 0;

    const recordStart = parseLocalDate(record.startDate);
    const recordEndStr = record.maturityDate ||
        calculateMaturityDate(record.startDate, record.duration, record.durationUnit || 'Months');
    const recordEnd   = parseLocalDate(recordEndStr);
    const customStart = parseLocalDate(fromDate);
    const customEnd   = parseLocalDate(toDate);

    if (!recordStart || !recordEnd || !customStart || !customEnd) return 0;

    // Clamp to FD term
    const effectiveStart = customStart < recordStart ? recordStart : customStart;
    const effectiveEnd   = customEnd   > recordEnd   ? recordEnd   : customEnd;

    if (effectiveStart >= effectiveEnd) return 0;

    // Interest accrued from record start to effectiveStart
    let maturityAtStart = record.amount;
    if (effectiveStart > recordStart) {
        const daysToStart  = calculateDurationFromDates(recordStart, effectiveStart);
        const monthsToStart = (daysToStart / 365.25) * 12;
        maturityAtStart = record.amount +
            calculateCompoundInterest(record.amount, record.rate, monthsToStart, frequency);
    }

    // Interest accrued from record start to effectiveEnd
    const daysToEnd    = calculateDurationFromDates(recordStart, effectiveEnd);
    const monthsToEnd  = (daysToEnd / 365.25) * 12;
    const maturityAtEnd = record.amount +
        calculateCompoundInterest(record.amount, record.rate, monthsToEnd, frequency);

    return maturityAtEnd - maturityAtStart;
}

// ===================================
// Formatting Functions
// ===================================

/**
 * Get human-readable frequency name.
 * @param {number} frequency - Compounding frequency
 * @returns {string}
 */
function getFrequencyName(frequency) {
    const frequencyNames = {
        4:   'Quarterly (4/year)',
        12:  'Monthly (12/year)',
        1:   'Annually (1/year)',
        365: 'Daily (365/year)',
        0:   'At Maturity (Simple)'
    };
    return frequencyNames[frequency] || 'Unknown';
}

/**
 * Format amount as currency.
 * @param {number} amount
 * @returns {string}
 */
function formatCurrency(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) {
        return currencySymbol + ' 0';
    }

    try {
        const formatted = Number(amount).toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        return currencySymbol + ' ' + formatted;
    } catch (_) {
        const num = Number(amount);
        if (isNaN(num)) return currencySymbol + ' 0';
        return currencySymbol + ' ' + num.toFixed(2);
    }
}

/**
 * Format number with locale.
 * @param {number} num
 * @returns {string}
 */
function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return '0';

    try {
        return Number(num).toLocaleString('en-IN', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        });
    } catch (_) {
        const parsedNum = Number(num);
        if (isNaN(parsedNum)) return '0';
        return parsedNum.toFixed(2);
    }
}

// ===================================
// Toast Notification System
// ===================================

/**
 * Show toast notification.
 * @param {string} message - Message to display
 * @param {string} type    - 'success' | 'error' | 'warning' | 'info' | 'primary'
 */
function showToast(message, type = 'info') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => showToast(message, type));
        return;
    }

    try {
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
 * Bootstrap Toast implementation.
 */
function showBootstrapToast(message, type = 'info') {
    try {
        let toastContainer = document.getElementById('toastContainer');

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

        const toastId = 'toast_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        const toastElement = document.createElement('div');
        toastElement.id = toastId;
        toastElement.className =
            `toast align-items-center text-white bg-${getToastColorClass(type)} border-0`;
        toastElement.setAttribute('role', 'alert');
        toastElement.setAttribute('aria-live', 'assertive');
        toastElement.setAttribute('aria-atomic', 'true');

        toastElement.innerHTML = `
            <div class="d-flex">
                <div class="toast-body">
                    ${getToastIcon(type)} ${escapeHtml(message)}
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto"
                        data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        `;

        toastContainer.appendChild(toastElement);

        const toast = new bootstrap.Toast(toastElement, {
            autohide: true,
            delay: (type === 'error' || type === 'danger') ? 5000 : 3000
        });

        toast.show();

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
 * Simple fallback toast (no Bootstrap required).
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
            error:   '#dc3545',
            danger:  '#dc3545',
            warning: '#ffc107',
            info:    '#0dcaf0',
            primary: '#0d6efd'
        };

        const textColors = {
            warning: '#000',
            info:    '#000'
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

        const delay = (type === 'error' || type === 'danger') ? 5000 : 3000;
        setTimeout(() => removeToast(toast), delay);
    } catch (error) {
        console.error('Simple toast failed:', error);
        console.log(`[${type.toUpperCase()}] ${message}`);
    }
}

/**
 * Remove toast with animation.
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
 * Add toast animation styles to document.
 */
function addToastAnimationStyles() {
    if (document.getElementById('toastAnimationStyles')) return;

    try {
        const style = document.createElement('style');
        style.id = 'toastAnimationStyles';
        style.textContent = `
            @keyframes slideIn {
                from { transform: translateX(400px); opacity: 0; }
                to   { transform: translateX(0);     opacity: 1; }
            }
            @keyframes slideOut {
                from { transform: translateX(0);     opacity: 1; }
                to   { transform: translateX(400px); opacity: 0; }
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
 * Get Bootstrap color class for toast type.
 */
function getToastColorClass(type) {
    const colors = {
        success: 'success',
        error:   'danger',
        danger:  'danger',
        warning: 'warning',
        info:    'info',
        primary: 'primary'
    };
    return colors[type] || 'info';
}

/**
 * Get icon markup for toast type.
 */
function getToastIcon(type) {
    const icons = {
        success: '<i class="bi bi-check-circle-fill me-2"></i>',
        error:   '<i class="bi bi-exclamation-circle-fill me-2"></i>',
        danger:  '<i class="bi bi-exclamation-circle-fill me-2"></i>',
        warning: '<i class="bi bi-exclamation-triangle-fill me-2"></i>',
        info:    '<i class="bi bi-info-circle-fill me-2"></i>',
        primary: '<i class="bi bi-bell-fill me-2"></i>'
    };
    return icons[type] || icons.info;
}

/**
 * Escape HTML to prevent XSS.
 * @param {string} text
 * @returns {string}
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
 * Switch to the specified Bootstrap tab.
 * @param {string} tabId - Tab element ID prefix
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
 * Toggle dark mode theme.
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

        // Safely refresh charts if available
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

/** Validate PIN format (exactly 4 digits). */
function isValidPIN(pin) {
    return /^\d{4}$/.test(pin);
}

/** Validate amount (positive number). */
function isValidAmount(amount) {
    const num = parseFloat(amount);
    return !isNaN(num) && num > 0;
}

/** Validate interest rate (0–100 %). */
function isValidRate(rate) {
    const num = parseFloat(rate);
    return !isNaN(num) && num >= 0 && num <= 100;
}

/** Validate date string. */
function isValidDate(dateString) {
    if (!dateString) return false;
    return parseLocalDate(dateString) !== null;
}

/** Validate duration (positive integer, max 999). */
function isValidDuration(duration) {
    const num = parseInt(duration, 10);
    return !isNaN(num) && num > 0 && num <= 999;
}

/** Validate account holder name. */
function isValidAccountHolder(name) {
    return name && typeof name === 'string' && name.trim().length > 0 && name.length <= 50;
}

/** Validate bank name. */
function isValidBank(bank) {
    return bank && typeof bank === 'string' && bank.trim().length > 0 && bank.length <= 100;
}

/** Validate certificate data URI. */
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
 * Search records by query string (bank, holder, amount, notes).
 * @param {Object[]} records
 * @param {string}   query
 * @returns {Object[]}
 */
function searchRecords(records, query) {
    if (!query || !records) return records || [];

    query = query.toLowerCase().trim();
    return records.filter(record => {
        return (record.bank          && record.bank.toLowerCase().includes(query)) ||
               (record.accountHolder && record.accountHolder.toLowerCase().includes(query)) ||
               (record.amount        && String(record.amount).includes(query)) ||
               (record.notes         && record.notes.toLowerCase().includes(query));
    });
}

// ===================================
// Array & Object Utilities
// ===================================

/**
 * Group array items by a property key.
 * @param {Object[]} array
 * @param {string}   key
 * @returns {Object}
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
 * Sum a numeric property across an array.
 * @param {Object[]} array
 * @param {string}   key
 * @returns {number}
 */
function sumBy(array, key) {
    if (!array || !Array.isArray(array)) return 0;
    return array.reduce((sum, item) => sum + (parseFloat(item[key]) || 0), 0);
}

/**
 * Average a numeric property across an array.
 * @param {Object[]} array
 * @param {string}   key
 * @returns {number}
 */
function averageBy(array, key) {
    if (!array || !Array.isArray(array) || array.length === 0) return 0;
    return sumBy(array, key) / array.length;
}

// ===================================
// Status Helpers
// ===================================

/**
 * Get human-readable record status.
 * @param {number|null} daysRemaining
 * @returns {string}
 */
function getRecordStatus(daysRemaining) {
    if (daysRemaining === null || daysRemaining === undefined) return 'Unknown';
    if (daysRemaining < 0)  return 'Matured';
    if (daysRemaining <= 15) return 'Expiring Soon';
    return 'Active';
}

/**
 * Get CSS class(es) for a status badge.
 * @param {string} status
 * @returns {string}
 */
function getStatusBadgeClass(status) {
    switch (status) {
        case 'Active':        return 'status-badge status-active';
        case 'Expiring Soon': return 'status-badge status-expiring';
        case 'Matured':       return 'status-badge status-matured';
        default:              return 'status-badge';
    }
}

// ===================================
// ID Generator
// ===================================

/**
 * Generate a unique ID (base-36 timestamp + random suffix).
 * @returns {string}
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

// ===================================
// Debounce Function
// ===================================

/**
 * Debounce function execution.
 * @param {Function} func
 * @param {number}   wait - Milliseconds
 * @returns {Function}
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
 * Load application settings from localStorage.
 * @returns {Object}
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
// CSV / File Functions
// ===================================

/**
 * Escape a value for safe CSV inclusion.
 * @param {any} val
 * @returns {string}
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
 * Trigger a file download in the browser.
 * @param {string} data     - File content
 * @param {string} filename - Desired filename
 * @param {string} type     - MIME type
 */
function downloadFile(data, filename, type) {
    try {
        const blob = new Blob([data], { type: type });
        const url  = window.URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Revoke after a short delay to ensure download starts
        setTimeout(() => window.URL.revokeObjectURL(url), 1000);
    } catch (error) {
        console.error('Download file error:', error);
        showToast('Error downloading file', 'error');
    }
}

/**
 * Read a File object as a Base64 data URI.
 * @param {File} file
 * @returns {Promise<string>}
 */
function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
        if (!file) {
            reject(new Error('No file provided'));
            return;
        }

        const reader  = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('File read error'));
        reader.readAsDataURL(file);
    });
}

/**
 * Export all FD records to CSV.
 */
async function exportToCSV() {
    try {
        if (!pinHash) {
            showToast('❌ Please log in first', 'danger');
            return;
        }

        let records = [];
        if (typeof getCachedData === 'function') {
            records = (await getCachedData('records', 'fd_records')) || [];
        } else {
            records = getData('fd_records') || [];
        }

        if (records.length === 0) {
            showToast('⚠️ No records to export', 'warning');
            return;
        }

        const headers = [
            'Account Holder', 'Bank', 'Amount', 'Rate (%)',
            'Duration', 'Unit', 'Start Date', 'Maturity Date', 'Notes'
        ];

        const csvRows = [headers.join(',')];

        records.forEach(r => {
            csvRows.push([
                csvEscape(r.accountHolder),
                csvEscape(r.bank),
                csvEscape(r.amount),
                csvEscape(r.rate),
                csvEscape(r.duration),
                csvEscape(r.durationUnit),
                csvEscape(r.startDate),
                csvEscape(r.maturityDate),
                csvEscape(r.notes)
            ].join(','));
        });

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        downloadFile(csvRows.join('\n'), `FD-Records-${timestamp}.csv`, 'text/csv');
        showToast(`✅ Exported ${records.length} records to CSV`, 'success');
    } catch (error) {
        console.error('CSV export error:', error);
        showToast('❌ CSV export failed: ' + error.message, 'error');
    }
}

// ===================================
// Export to Excel
// ===================================

/**
 * Export data array to an Excel (.xlsx) file.
 * @param {Object[]} data     - Array of row objects
 * @param {string}   filename - Desired filename
 */
function exportToExcelFile(data, filename) {
    if (typeof XLSX === 'undefined') {
        showToast('Excel library not loaded. Please refresh the page.', 'error');
        return;
    }

    try {
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook  = XLSX.utils.book_new();
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
 * Get an array of chart-friendly hex colors.
 * @param {number} count - Number of colors needed
 * @returns {string[]}
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
// Backup & Restore Functions
// ===================================

/**
 * Helper – safely retrieve cached/encrypted data.
 * Falls back to getData() if getCachedData is not available.
 * @param {string} cacheKey   - Logical cache key (used by getCachedData)
 * @param {string} storageKey - localStorage key (used by getData fallback)
 * @returns {Promise<any>}
 */
async function safeGetData(cacheKey, storageKey) {
    if (typeof getCachedData === 'function') {
        return (await getCachedData(cacheKey, storageKey)) || [];
    }
    return getData(storageKey) || [];
}

/**
 * Create full JSON backup of all data.
 */
async function backupData() {
    try {
        if (!pinHash) {
            showToast('❌ Please log in first', 'danger');
            return;
        }

        const backupObject = {
            version:        '4.1',
            timestamp:      new Date().toISOString(),
            records:        await safeGetData('records',        'fd_records'),
            maturedRecords: await safeGetData('maturedRecords', 'fd_matured_records'),
            accountHolders: await safeGetData('accountHolders', 'fd_account_holders'),
            templates:      await safeGetData('templates',      'fd_templates'),
            settings:       JSON.parse(localStorage.getItem('fd_settings') || '{}'),
            calculations:   await safeGetData('calculations',   'fd_calculations'),
            comparisons:    await safeGetData('comparisons',    'fd_comparisons')
        };

        const dataStr  = JSON.stringify(backupObject, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });

        const url  = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href  = url;

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        link.download = `FD-Manager-Backup-${timestamp}.json`;

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        setTimeout(() => URL.revokeObjectURL(url), 1000);

        showToast('✅ Backup downloaded successfully!', 'success');
        console.log('[FD Manager] Backup created successfully');
    } catch (error) {
        console.error('[FD Manager] Backup error:', error);
        showToast('❌ Error creating backup: ' + error.message, 'danger');
    }
}

/**
 * Create Excel (.xlsx) backup of all data.
 */
async function backupDataToExcel() {
    try {
        if (!pinHash) {
            showToast('❌ Please log in first', 'danger');
            return;
        }

        if (typeof XLSX === 'undefined') {
            showToast('❌ Excel library not loaded. Please refresh the page.', 'error');
            return;
        }

        const records        = await safeGetData('records',        'fd_records');
        const maturedRecords = await safeGetData('maturedRecords', 'fd_matured_records');
        const accountHolders = await safeGetData('accountHolders', 'fd_account_holders');
        const templates      = await safeGetData('templates',      'fd_templates');
        const calculations   = await safeGetData('calculations',   'fd_calculations');
        const comparisons    = await safeGetData('comparisons',    'fd_comparisons');

        const totalDataCount =
            records.length + maturedRecords.length +
            accountHolders.length + templates.length;

        if (totalDataCount === 0) {
            showToast('⚠️ No data to backup', 'warning');
            return;
        }

        const workbook = XLSX.utils.book_new();

        // Metadata sheet
        const metadata = [{
            version:              '4.1',
            timestamp:            new Date().toISOString(),
            totalRecords:         records.length,
            totalMaturedRecords:  maturedRecords.length,
            totalAccountHolders:  accountHolders.length,
            totalTemplates:       templates.length,
            totalCalculations:    calculations.length,
            totalComparisons:     comparisons.length
        }];
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(metadata), 'Metadata');

        // Data sheets
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(records), 'FD_Records');

        if (maturedRecords.length > 0) {
            XLSX.utils.book_append_sheet(
                workbook, XLSX.utils.json_to_sheet(maturedRecords), 'Matured_Records');
        }

        XLSX.utils.book_append_sheet(
            workbook, XLSX.utils.json_to_sheet(accountHolders), 'Account_Holders');

        XLSX.utils.book_append_sheet(
            workbook, XLSX.utils.json_to_sheet(templates), 'Templates');

        XLSX.utils.book_append_sheet(
            workbook, XLSX.utils.json_to_sheet(calculations), 'Calculations');

        XLSX.utils.book_append_sheet(
            workbook, XLSX.utils.json_to_sheet(comparisons), 'Comparisons');

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename  = `FD-Manager-Backup-${timestamp}.xlsx`;

        XLSX.writeFile(workbook, filename);

        showToast(
            `✅ Excel backup created successfully! ` +
            `(${records.length} active, ${maturedRecords.length} matured records)`,
            'success'
        );
        console.log(`[FD Manager] Excel backup created: ${filename}`);
    } catch (error) {
        console.error('[FD Manager] Excel backup error:', error);
        showToast('❌ Error creating Excel backup: ' + error.message, 'danger');
    }
}

/**
 * Restore data from an Excel backup file.
 * @param {File} file - .xlsx / .xls file
 */
async function restoreDataFromExcel(file) {
    try {
        if (!pinHash) {
            showToast('❌ Please log in first', 'danger');
            return;
        }

        if (typeof XLSX === 'undefined') {
            showToast('❌ Excel library not loaded. Please refresh the page.', 'error');
            return;
        }

        const reader = new FileReader();

        reader.onload = async function (e) {
            try {
                const data     = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });

                const requiredSheets = ['FD_Records', 'Account_Holders', 'Templates'];
                const sheetNames     = workbook.SheetNames;

                if (!requiredSheets.every(sheet => sheetNames.includes(sheet))) {
                    throw new Error(
                        'Invalid Excel backup file format. Missing required sheets: ' +
                        requiredSheets.filter(s => !sheetNames.includes(s)).join(', ')
                    );
                }

                const records        = XLSX.utils.sheet_to_json(workbook.Sheets['FD_Records'])       || [];
                const accountHolders = XLSX.utils.sheet_to_json(workbook.Sheets['Account_Holders'])   || [];
                const templates      = XLSX.utils.sheet_to_json(workbook.Sheets['Templates'])         || [];

                const calculations = sheetNames.includes('Calculations')
                    ? (XLSX.utils.sheet_to_json(workbook.Sheets['Calculations']) || [])
                    : [];
                const comparisons = sheetNames.includes('Comparisons')
                    ? (XLSX.utils.sheet_to_json(workbook.Sheets['Comparisons']) || [])
                    : [];
                const maturedRecords = sheetNames.includes('Matured_Records')
                    ? (XLSX.utils.sheet_to_json(workbook.Sheets['Matured_Records']) || [])
                    : [];

                if (!Array.isArray(records)) {
                    throw new Error('Invalid records data in Excel file');
                }

                const backupPayload = {
                    version:        '4.1',
                    records:        records,
                    maturedRecords: maturedRecords,
                    accountHolders: accountHolders,
                    templates:      templates,
                    calculations:   calculations,
                    comparisons:    comparisons
                };

                // Validate required fields
                const invalidRecords = backupPayload.records.filter(r =>
                    !r.accountHolder || !r.bank || !r.amount || !r.rate || !r.startDate
                );
                if (invalidRecords.length > 0) {
                    throw new Error(
                        `Invalid backup file: ${invalidRecords.length} records missing required fields`
                    );
                }

                // Get existing records for analysis
                // FIX: was calling safeGetData twice (once to check Array.isArray,
                // once to use the value) — causing two IndexedDB decrypt round-trips.
                const fetchedRecords   = await safeGetData('records', 'fd_records');
                const existingRecords  = Array.isArray(fetchedRecords) ? fetchedRecords : [];

                // Analyze & preview
                if (typeof analyzeImportData === 'function' && typeof showImportPreview === 'function') {
                    const analysis = analyzeImportData(backupPayload.records, existingRecords);

                    showImportPreview(analysis, async function (selectedOption, analysisData) {
                        if (typeof processSmartRestore === 'function') {
                            await processSmartRestore(selectedOption, analysisData, backupPayload, null);
                        } else {
                            console.error('processSmartRestore is not defined');
                            showToast('❌ Restore function not available. Please refresh.', 'error');
                        }
                    });
                } else {
                    console.error('analyzeImportData or showImportPreview is not defined');
                    showToast('❌ Import analysis functions not available. Please refresh.', 'error');
                }
            } catch (error) {
                console.error('Excel restore error:', error);
                showToast('❌ Error reading Excel file: ' + error.message, 'error');
            }
        };

        reader.readAsArrayBuffer(file);
    } catch (error) {
        console.error('[FD Manager] Excel restore error:', error);
        showToast('❌ Error restoring from Excel: ' + error.message, 'danger');
    }
}

/**
 * Handle Excel restore file selection (called from UI button).
 */
function handleExcelRestore() {
    const fileInput = document.getElementById('excelRestoreFile');
    const file = fileInput && fileInput.files[0];

    if (!file) {
        showToast('Please select an Excel backup file', 'warning');
        return;
    }

    if (!file.name.toLowerCase().endsWith('.xlsx') && !file.name.toLowerCase().endsWith('.xls')) {
        showToast('Please select a valid Excel file (.xlsx or .xls)', 'error');
        if (fileInput) fileInput.value = '';
        return;
    }

    restoreDataFromExcel(file);
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
// Quick Import / Export Functions
// ===================================

/**
 * Create a temporary file input, append it to the DOM, trigger click,
 * and clean up afterwards — prevents Chrome/Edge GC hangs.
 *
 * @param {string}   accept   - File accept attribute
 * @param {Function} callback - Receives the selected File or null
 */
function createFileInput(accept, callback) {
    const input = document.createElement('input');
    input.type   = 'file';
    input.accept = accept;
    input.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
    document.body.appendChild(input);

    let handled = false;

    function cleanup() {
        if (input.parentNode) input.parentNode.removeChild(input);
    }

    input.addEventListener('change', function () {
        handled = true;
        const file = input.files[0] || null;
        cleanup();
        callback(file);
    });

    // Detect cancel
    window.addEventListener('focus', function onFocus() {
        window.removeEventListener('focus', onFocus);
        setTimeout(function () {
            if (!handled) {
                cleanup();
                // No file selected — nothing to do
            }
        }, 500);
    }, { once: true });

    input.click();
}

/**
 * Trigger JSON import file dialog.
 */
function triggerJSONImport() {
    createFileInput('.json', function (file) {
        if (!file) return;

        if (typeof restoreDataSmart === 'function') {
            restoreDataSmart(file);
        } else {
            console.error('restoreDataSmart is not defined');
            showToast('❌ JSON restore function not available. Please refresh the page.', 'error');
        }
    });
}

/**
 * Trigger Excel import file dialog.
 */
function triggerExcelImport() {
    createFileInput('.xlsx,.xls', function (file) {
        if (file) restoreDataFromExcel(file);
    });
}

/**
 * Show export options (legacy — kept for backward compatibility).
 */
function showExportOptions() {
    showToast('📤 Use the Export dropdown for quick download options', 'info');
}

/**
 * Show import options (legacy — kept for backward compatibility).
 */
function showImportOptions() {
    showToast('📥 Use the Import dropdown for quick restore options', 'info');
}

// ===================================
// Dropdown Visibility Fix
// ===================================

/**
 * Fix dropdown positioning for nav-tab dropdowns.
 * Uses AbortController to prevent event-listener leaks.
 */
function fixDropdownPositioning() {
    const dropdownButtons = document.querySelectorAll('.nav-item.dropdown .dropdown-toggle');

    dropdownButtons.forEach(button => {
        let controller = null;

        button.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();

            // Abort previous document listener if still active
            if (controller) {
                controller.abort();
                controller = null;
            }

            // Close other open dropdowns
            document.querySelectorAll('.nav-tabs .dropdown-menu.show').forEach(menu => {
                if (menu !== this.nextElementSibling) {
                    menu.classList.remove('show');
                }
            });

            const dropdownMenu = this.nextElementSibling;
            if (!dropdownMenu) return;

            const rect = this.getBoundingClientRect();

            dropdownMenu.style.position = 'fixed';
            dropdownMenu.style.top      = rect.bottom + 'px';
            dropdownMenu.style.left     = rect.left + 'px';
            dropdownMenu.style.zIndex   = '99999';
            dropdownMenu.classList.toggle('show');

            if (dropdownMenu.classList.contains('show')) {
                controller = new AbortController();

                setTimeout(() => {
                    document.addEventListener('click', function closeDropdown(ev) {
                        if (!dropdownMenu.contains(ev.target) && ev.target !== button) {
                            dropdownMenu.classList.remove('show');
                            if (controller) {
                                controller.abort();
                                controller = null;
                            }
                        }
                    }, { signal: controller.signal });
                }, 100);
            }
        });
    });
}

// ===================================
// Initialize
// ===================================

document.addEventListener('DOMContentLoaded', function () {
    console.log('[FD Manager Nepal] Utilities loaded successfully');
    console.log('[FD Manager Nepal] Version 4.1 (Corrected)');

    // Fix dropdown positioning after page load
    setTimeout(fixDropdownPositioning, 500);
});