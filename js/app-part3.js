// ===================================
// FD Manager Pro - Application Part 3 (FIXED)
// Analytics, Export, Backup, Calculator
// Nepal Edition - Version 4.0
// ===================================

// Global variables for principal choice modal
let pendingCalculation = null;

// ===================================
// Chart Management Helpers
// ===================================

/**
 * Safely destroy a chart instance
 */
function safeDestroyChart(chartInstance) {
    try {
        if (chartInstance && typeof chartInstance.destroy === 'function') {
            chartInstance.destroy();
        }
    } catch (error) {
        console.warn('Chart destruction warning:', error);
    }
    return null;
}

/**
 * Initialize chart with error handling
 */
function safeCreateChart(ctx, config) {
    try {
        if (!ctx) {
            console.error('Chart context is null');
            return null;
        }
        
        if (typeof Chart === 'undefined') {
            console.error('Chart.js library not loaded');
            showToast('Chart library not available', 'error');
            return null;
        }
        
        return new Chart(ctx, config);
    } catch (error) {
        console.error('Chart creation error:', error);
        showToast('Error creating chart: ' + error.message, 'error');
        return null;
    }
}

// ===================================
// Analytics Functions (FIXED)
// ===================================

function updateAnalytics() {
    try {
        // Check if PIN is initialized before getting data
        if (!pinHash) {
            console.warn('Cannot update analytics: PIN not initialized');
            return;
        }
        
        const records = getData('fd_records') || [];
        
        if (records.length === 0) {
            const canvas = document.getElementById('analyticsChart');
            if (canvas && analyticsChart) {
                analyticsChart = safeDestroyChart(analyticsChart);
            }
            
            const tableBody = document.getElementById('bankAnalysisTable');
            if (tableBody) {
                tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">No data available</td></tr>';
            }
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
        
        // Update summary cards safely
        const updateElement = (id, value) => {
            const element = document.getElementById(id);
            if (element) element.textContent = value;
        };
        
        updateElement('analyticsTotalBanks', bankStats.length);
        updateElement('analyticsTotalFDs', records.length);
        updateElement('analyticsTotalInvestment', formatCurrency(sumBy(records, 'amount')));
        updateElement('analyticsTotalInterest', formatCurrency(
            records.reduce((sum, r) => sum + calculateInterestForRecord(r), 0)
        ));
        updateElement('analyticsAvgRate', averageBy(records, 'rate').toFixed(2) + '%');
        
        updateBankAnalysisTable(bankStats);
        updateAnalyticsChart(bankStats);
        
    } catch (error) {
        console.error('Analytics update error:', error);
        showToast('Error updating analytics', 'error');
    }
}

function updateBankAnalysisTable(bankStats) {
    const tbody = document.getElementById('bankAnalysisTable');
    if (!tbody || !Array.isArray(bankStats)) return;
    
    try {
        tbody.innerHTML = bankStats.map(stat => `
            <tr>
                <td><strong>${escapeHtml(stat.bank)}</strong></td>
                <td>${stat.count}</td>
                <td>${formatCurrency(stat.totalInvestment)}</td>
                <td>${formatCurrency(stat.totalInterest)}</td>
                <td>${stat.avgRate.toFixed(2)}%</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Bank analysis table update error:', error);
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error loading data</td></tr>';
    }
}

function updateAnalyticsChart(bankStats) {
    const canvas = document.getElementById('analyticsChart');
    if (!canvas || !Array.isArray(bankStats) || bankStats.length === 0) return;
    
    try {
        const ctx = canvas.getContext('2d');
        
        const labels = bankStats.map(s => s.bank);
        const data = bankStats.map(s => s.totalInvestment);
        const colors = getChartColors(labels.length);
        
        // Safely destroy existing chart
        if (analyticsChart) {
            analyticsChart = safeDestroyChart(analyticsChart);
        }
        
        const config = {
            type: currentChartType || 'pie',
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
        };
        
        analyticsChart = safeCreateChart(ctx, config);
        
    } catch (error) {
        console.error('Analytics chart update error:', error);
        showToast('Error updating analytics chart', 'error');
    }
}

function changeChartType(type) {
    try {
        currentChartType = type;
        
        // Update button states
        document.querySelectorAll('[onclick^="changeChartType"]').forEach(btn => {
            btn.classList.remove('active');
        });
        
        if (event && event.target) {
            event.target.classList.add('active');
        }
        
        updateAnalytics();
    } catch (error) {
        console.error('Chart type change error:', error);
    }
}

// ===================================
// Enhanced Interest Calculator Functions (FIXED)
// ===================================

// Use a single chart instance with proper naming
let interestComparisonChart = null;

/**
 * Toggle between manual and existing FD mode
 */
function toggleCalcMode() {
    try {
        if (!pinHash) {
            showToast('Please log in first', 'error');
            return;
        }
        
        const mode = document.getElementById('calcMode')?.value;
        
        if (mode === 'existing') {
            const existingSection = document.getElementById('existingFDSection');
            const manualSection = document.getElementById('manualInputSection');
            
            if (existingSection) existingSection.style.display = 'block';
            if (manualSection) manualSection.style.display = 'none';
            
            loadAccountHoldersForCalc();
        } else {
            const existingSection = document.getElementById('existingFDSection');
            const manualSection = document.getElementById('manualInputSection');
            
            if (existingSection) existingSection.style.display = 'none';
            if (manualSection) manualSection.style.display = 'block';
        }
    } catch (error) {
        console.error('Calc mode toggle error:', error);
    }
}

/**
 * Load account holders for calculator
 */
function loadAccountHoldersForCalc() {
    try {
        if (!pinHash) {
            console.warn('Cannot load account holders: PIN not initialized');
            showToast('Please log in first', 'error');
            return;
        }
        
        const holders = getData('fd_account_holders') || [];
        const select = document.getElementById('calcAccountHolder');
        
        if (!select) return;
        
        select.innerHTML = '<option value="">Select Holder</option>';
        holders.forEach(holder => {
            const option = document.createElement('option');
            option.value = holder;
            option.textContent = holder;
            select.appendChild(option);
        });
        
        if (holders.length === 0) {
            showToast('No account holders found. Please add some FDs first or load sample data.', 'warning');
        }
    } catch (error) {
        console.error('Load account holders for calc error:', error);
        showToast('Error loading account holders', 'error');
    }
}

/**
 * Load FDs for selected holder
 */
function loadFDsForCalc() {
    try {
        if (!pinHash) {
            console.warn('Cannot load FDs: PIN not initialized');
            return;
        }
        
        const holder = document.getElementById('calcAccountHolder')?.value;
        const select = document.getElementById('calcFDSelect');
        
        if (!holder || !select) {
            if (select) select.innerHTML = '<option value="">Select FD</option>';
            return;
        }
        
        let records = getData('fd_records') || [];
        records = records.filter(r => r.accountHolder === holder);
        
        select.innerHTML = '<option value="">Select FD</option>';
        records.forEach(r => {
            const option = document.createElement('option');
            option.value = r.id;
            option.textContent = `${r.bank} - ${formatCurrency(r.amount)} @ ${r.rate}% (${r.duration} ${r.durationUnit})`;
            select.appendChild(option);
        });
        
        if (records.length === 0) {
            showToast('No FDs found for ' + holder + '. Please add some FDs first.', 'warning');
        }
    } catch (error) {
        console.error('Load FDs for calc error:', error);
        showToast('Error loading FDs', 'error');
    }
}

/**
 * Fill calculator from selected FD
 */
function fillCalcFromFD() {
    try {
        if (!pinHash) {
            showToast('Please log in first', 'error');
            return;
        }
        
        const fdId = document.getElementById('calcFDSelect')?.value;
        if (!fdId) return;
        
        const records = getData('fd_records') || [];
        const record = records.find(r => r.id === fdId);
        
        if (!record) return;
        
        // Fill form fields safely
        const fields = {
            'calcPrincipal': record.amount,
            'calcRate': record.rate,
            'calcDuration': record.duration,
            'calcUnit': record.durationUnit
        };
        
        Object.keys(fields).forEach(fieldId => {
            const element = document.getElementById(fieldId);
            if (element) element.value = fields[fieldId];
        });
        
        // Set date range
        const maturityDate = record.maturityDate || calculateMaturityDate(
            record.startDate, record.duration, record.durationUnit
        );
        
        const fromDateEl = document.getElementById('calcFromDate');
        const toDateEl = document.getElementById('calcToDate');
        
        if (fromDateEl) fromDateEl.value = record.startDate;
        if (toDateEl) toDateEl.value = maturityDate;
        
        showToast('FD data loaded into calculator', 'success');
    } catch (error) {
        console.error('Fill calc from FD error:', error);
        showToast('Error loading FD data', 'error');
    }
}

/**
 * Toggle custom date range
 */
function toggleCalcDateRange() {
    try {
        const checked = document.getElementById('calcCustomDateRange')?.checked;
        const rangeDiv = document.getElementById('calcDateRangeDiv');
        if (rangeDiv) {
            rangeDiv.style.display = checked ? 'block' : 'none';
        }
    } catch (error) {
        console.error('Toggle calc date range error:', error);
    }
}

/**
 * Toggle manual date range
 */
function toggleManualDateRange() {
    try {
        const checked = document.getElementById('calcManualDateRange')?.checked;
        const durationDiv = document.getElementById('calcManualDateRangeDiv');
        const durationInput = document.getElementById('calcDuration')?.parentElement?.parentElement;
        
        if (checked) {
            if (durationDiv) durationDiv.style.display = 'block';
            if (durationInput) durationInput.style.display = 'none';
            
            // Set default dates if empty
            const startInput = document.getElementById('calcManualStartDate');
            const endInput = document.getElementById('calcManualEndDate');
            if (startInput && !startInput.value) {
                const today = new Date().toISOString().split('T')[0];
                startInput.value = today;
                
                if (endInput) {
                    const tenDaysLater = new Date();
                    tenDaysLater.setDate(tenDaysLater.getDate() + 10);
                    endInput.value = tenDaysLater.toISOString().split('T')[0];
                }
            }
        } else {
            if (durationDiv) durationDiv.style.display = 'none';
            if (durationInput) durationInput.style.display = 'block';
        }
    } catch (error) {
        console.error('Toggle manual date range error:', error);
    }
}

/**
 * Calculate duration from custom dates
 */
function calculateDurationFromDates(fromDate, toDate) {
    try {
        const start = new Date(fromDate);
        const end = new Date(toDate);
        const diffTime = Math.abs(end - start);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays;
    } catch (error) {
        console.error('Calculate duration from dates error:', error);
        return 0;
    }
}

/**
 * Main calculation function (IMPROVED)
 */
function performCalculation() {
    try {
        const mode = document.getElementById('calcMode')?.value;
        let principal, rate, durationValue, unit;
        
        // Get values based on mode
        principal = parseFloat(document.getElementById('calcPrincipal')?.value);
        rate = parseFloat(document.getElementById('calcRate')?.value);
        
        // Check for date range input
        const useDateRange = (mode === 'existing' && document.getElementById('calcCustomDateRange')?.checked) ||
                             (mode === 'manual' && document.getElementById('calcManualDateRange')?.checked);
        
        let fromDate, toDate;
        if (useDateRange) {
            if (mode === 'existing') {
                fromDate = document.getElementById('calcFromDate')?.value;
                toDate = document.getElementById('calcToDate')?.value;
                
                if (!isValidDate(fromDate) || !isValidDate(toDate)) {
                    showToast('Please select valid dates', 'error');
                    return;
                }
                
                // Swap dates if from > to
                if (new Date(fromDate) > new Date(toDate)) {
                    [fromDate, toDate] = [toDate, fromDate];
                    if (document.getElementById('calcFromDate')) document.getElementById('calcFromDate').value = fromDate;
                    if (document.getElementById('calcToDate')) document.getElementById('calcToDate').value = toDate;
                }
                
                // Cap dates to FD term
                const fdId = document.getElementById('calcFDSelect')?.value;
                const records = getData('fd_records') || [];
                const record = records.find(r => r.id === fdId);
                if (record) {
                    const maturityDate = calculateMaturityDate(record.startDate, record.duration, record.durationUnit);
                    const fdStart = new Date(record.startDate);
                    const fdEnd = new Date(maturityDate);
                    const customFrom = new Date(fromDate);
                    const customTo = new Date(toDate);
                    
                    if (customFrom < fdStart) {
                        fromDate = record.startDate;
                        if (document.getElementById('calcFromDate')) document.getElementById('calcFromDate').value = fromDate;
                    }
                    if (customTo > fdEnd) {
                        toDate = maturityDate;
                        if (document.getElementById('calcToDate')) document.getElementById('calcToDate').value = toDate;
                    }
                }
            } else { // manual
                fromDate = document.getElementById('calcManualStartDate')?.value;
                toDate = document.getElementById('calcManualEndDate')?.value;
                
                if (!isValidDate(fromDate) || !isValidDate(toDate)) {
                    showToast('Please select valid dates', 'error');
                    return;
                }
                
                // Swap dates if from > to
                if (new Date(fromDate) > new Date(toDate)) {
                    [fromDate, toDate] = [toDate, fromDate];
                    if (document.getElementById('calcManualStartDate')) document.getElementById('calcManualStartDate').value = fromDate;
                    if (document.getElementById('calcManualEndDate')) document.getElementById('calcManualEndDate').value = toDate;
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
            durationValue = parseInt(document.getElementById('calcDuration')?.value);
            unit = document.getElementById('calcUnit')?.value;
        }
        
        const frequency = parseInt(document.getElementById('calcFrequency')?.value);
        
        // Adjust principal for existing FD if fromDate is after startDate
        if (useDateRange && mode === 'existing') {
            const fdId = document.getElementById('calcFDSelect')?.value;
            const records = getData('fd_records') || [];
            const record = records.find(r => r.id === fdId);
            
            if (record && record.startDate && fromDate) {
                const startDate = new Date(record.startDate);
                const customFromDate = new Date(fromDate);
                
                if (customFromDate > startDate) {
                    // Calculate maturity amount at fromDate
                    const daysToFrom = calculateDurationFromDates(record.startDate, fromDate);
                    const monthsToFrom = (daysToFrom / 365) * 12; // More accurate
                    const maturityAtFrom = record.amount + calculateCompoundInterest(record.amount, record.rate, monthsToFrom, frequency);
                    
                    // Show modal to choose principal
                    const calculationParams = {
                        mode, principal: record.amount, rate, durationValue, unit, frequency, fromDate, toDate, useDateRange,
                        originalPrincipal: record.amount,
                        compoundedPrincipal: maturityAtFrom
                    };
                    
                    showPrincipalChoiceModal(record.amount, maturityAtFrom, calculationParams);
                    return; // Wait for user choice
                }
            }
        }
        
        // Proceed with calculation
        const calculationParams = {
            principal, rate, durationValue, unit, frequency
        };
        completeCalculation(calculationParams);
        
    } catch (error) {
        console.error('Calculation error:', error);
        showToast('Error performing calculation: ' + error.message, 'error');
    }
}

/**
 * Show interest comparison chart (FIXED)
 */
function showInterestComparison(principal, simpleInterest, compoundInterest) {
    try {
        const comparisonCard = document.getElementById('comparisonCard');
        const canvas = document.getElementById('interestComparisonChart');
        
        if (!canvas) {
            console.warn('Interest comparison chart canvas not found');
            return;
        }
        
        if (comparisonCard) {
            comparisonCard.style.display = 'block';
        }
        
        const ctx = canvas.getContext('2d');
        
        // Safely destroy existing chart - THIS IS THE FIX
        if (interestComparisonChart) {
            interestComparisonChart = safeDestroyChart(interestComparisonChart);
        }
        
        const config = {
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
        };
        
        // Create new chart
        interestComparisonChart = safeCreateChart(ctx, config);
        
    } catch (error) {
        console.error('Interest comparison chart error:', error);
        showToast('Error creating comparison chart', 'error');
    }
}

/**
 * Set calculator preset values
 */
function setCalcPreset(amount, rate, duration, unit) {
    try {
        const modeEl = document.getElementById('calcMode');
        if (modeEl) {
            modeEl.value = 'manual';
            toggleCalcMode();
        }
        
        const fields = {
            'calcPrincipal': amount,
            'calcRate': rate,
            'calcDuration': duration,
            'calcUnit': unit
        };
        
        Object.keys(fields).forEach(fieldId => {
            const element = document.getElementById(fieldId);
            if (element) element.value = fields[fieldId];
        });
        
        showToast('Preset values loaded. Click Calculate to see results.', 'info');
    } catch (error) {
        console.error('Set calc preset error:', error);
    }
}

/**
 * Print calculation results
 */
function printCalculation() {
    try {
        const principal = document.getElementById('resultPrincipal')?.textContent;
        const rate = document.getElementById('resultRate')?.textContent;
        const duration = document.getElementById('resultDuration')?.textContent;
        const frequency = document.getElementById('resultFrequency')?.textContent;
        const simple = document.getElementById('resultSimple')?.textContent;
        const compound = document.getElementById('resultCompound')?.textContent;
        const maturity = document.getElementById('resultMaturity')?.textContent;
        const difference = document.getElementById('resultDifference')?.textContent;
        
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
    } catch (error) {
        console.error('Print calculation error:', error);
        showToast('Error printing calculation', 'error');
    }
}

/**
 * Save calculation to history
 */
function saveCalculationToHistory() {
    try {
        const calculation = {
            id: generateId(),
            timestamp: new Date().toISOString(),
            principal: document.getElementById('resultPrincipal')?.textContent,
            rate: document.getElementById('resultRate')?.textContent,
            duration: document.getElementById('resultDuration')?.textContent,
            frequency: document.getElementById('resultFrequency')?.textContent,
            simpleInterest: document.getElementById('resultSimple')?.textContent,
            compoundInterest: document.getElementById('resultCompound')?.textContent,
            maturityAmount: document.getElementById('resultMaturity')?.textContent,
            difference: document.getElementById('resultDifference')?.textContent
        };

        let history = JSON.parse(localStorage.getItem('calc_history') || '[]');
        history.unshift(calculation); // Add to beginning

        // Keep only last 50 calculations (increased from 10)
        if (history.length > 50) {
            history = history.slice(0, 50);
        }

        localStorage.setItem('calc_history', JSON.stringify(history));
        displayCalculationHistory();

        showToast('Calculation saved to history', 'success');
    } catch (error) {
        console.error('Save calculation to history error:', error);
        showToast('Error saving calculation', 'error');
    }
}

/**
 * Display calculation history
 */
function displayCalculationHistory() {
    try {
        const history = JSON.parse(localStorage.getItem('calc_history') || '[]');
        const tbody = document.getElementById('calculationHistory');
        const countEl = document.getElementById('calcCount');

        if (!tbody) return;

        if (history.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-muted py-4">
                        <i class="bi bi-info-circle"></i> No saved calculations
                    </td>
                </tr>
            `;
            if (countEl) countEl.textContent = '0 calculations';
            return;
        }

        tbody.innerHTML = history.map(calc => `
            <tr data-calc-id="${calc.id}">
                <td>
                    <small class="text-muted">${formatDate(calc.timestamp)}</small>
                </td>
                <td>
                    <strong>${calc.principal || 'N/A'}</strong>
                </td>
                <td>${calc.rate || 'N/A'}</td>
                <td>${calc.duration || 'N/A'}</td>
                <td class="text-success">
                    <strong>${calc.compoundInterest || 'N/A'}</strong>
                </td>
                <td class="text-primary">
                    <strong>${calc.maturityAmount || 'N/A'}</strong>
                </td>
                <td>
                    <div class="btn-group" role="group">
                        <button class="btn btn-sm btn-outline-primary" onclick="editCalculation('${calc.id}')" title="Edit">
                            <i class="bi bi-pencil"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-info" onclick="duplicateCalculation('${calc.id}')" title="Duplicate">
                            <i class="bi bi-copy"></i>
                        </button>
                        <button class="btn btn-sm btn-outline-danger" onclick="deleteCalculationHistory('${calc.id}')" title="Delete">
                            <i class="bi bi-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');

        if (countEl) countEl.textContent = `${history.length} calculation${history.length !== 1 ? 's' : ''}`;

        // Apply current filter
        filterCalculations();
    } catch (error) {
        console.error('Display calculation history error:', error);
    }
}

/**
 * Edit calculation
 */
function editCalculation(id) {
    try {
        const history = JSON.parse(localStorage.getItem('calc_history') || '[]');
        const calc = history.find(c => c.id === id);

        if (!calc) {
            showToast('Calculation not found', 'error');
            return;
        }

        // Populate the calculator form with the saved calculation data
        // Extract values from the saved strings
        const principal = calc.principal ? calc.principal.replace(/[^\d.]/g, '') : '';
        const rate = calc.rate ? calc.rate.replace(/[^\d.]/g, '') : '';
        const duration = calc.duration ? calc.duration.split(' ')[0] : '';

        // Set form values
        if (document.getElementById('calcPrincipal')) document.getElementById('calcPrincipal').value = principal;
        if (document.getElementById('calcRate')) document.getElementById('calcRate').value = rate;
        if (document.getElementById('calcDuration')) document.getElementById('calcDuration').value = duration;

        // Switch to manual mode for editing
        if (document.getElementById('calcMode')) document.getElementById('calcMode').value = 'manual';
        toggleCalcMode();

        showToast('Calculation loaded for editing', 'success');

        // Scroll to calculator
        document.getElementById('calculator-tab')?.click();
        document.querySelector('#calculator')?.scrollIntoView({ behavior: 'smooth' });

    } catch (error) {
        console.error('Edit calculation error:', error);
        showToast('Error editing calculation', 'error');
    }
}

/**
 * Duplicate calculation
 */
function duplicateCalculation(id) {
    try {
        const history = JSON.parse(localStorage.getItem('calc_history') || '[]');
        const calc = history.find(c => c.id === id);

        if (!calc) {
            showToast('Calculation not found', 'error');
            return;
        }

        // Create a duplicate with new ID and timestamp
        const duplicate = {
            ...calc,
            id: generateId(),
            timestamp: new Date().toISOString()
        };

        history.unshift(duplicate);
        localStorage.setItem('calc_history', JSON.stringify(history));
        displayCalculationHistory();

        showToast('Calculation duplicated', 'success');
    } catch (error) {
        console.error('Duplicate calculation error:', error);
        showToast('Error duplicating calculation', 'error');
    }
}

/**
 * Export calculations to Excel
 */
function exportCalculationsToExcel() {
    try {
        const history = JSON.parse(localStorage.getItem('calc_history') || '[]');

        if (history.length === 0) {
            showToast('No calculations to export', 'warning');
            return;
        }

        // Prepare data for Excel
        const data = history.map(calc => ({
            'Date': formatDate(calc.timestamp),
            'Principal': calc.principal || '',
            'Rate': calc.rate || '',
            'Duration': calc.duration || '',
            'Interest': calc.compoundInterest || '',
            'Maturity Amount': calc.maturityAmount || '',
            'Simple Interest': calc.simpleInterest || '',
            'Difference': calc.difference || ''
        }));

        // Create worksheet
        const ws = XLSX.utils.json_to_sheet(data);

        // Create workbook
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Calculations');

        // Generate filename with current date
        const filename = `FD_Calculations_${new Date().toISOString().split('T')[0]}.xlsx`;

        // Save file
        XLSX.writeFile(wb, filename);

        showToast(`Exported ${history.length} calculations to Excel`, 'success');
    } catch (error) {
        console.error('Export to Excel error:', error);
        showToast('Error exporting to Excel', 'error');
    }
}

/**
 * Filter calculations based on search input
 */
function filterCalculations() {
    try {
        const searchTerm = document.getElementById('calcSearch')?.value?.toLowerCase() || '';
        const rows = document.querySelectorAll('#calculationHistory tr[data-calc-id]');
        let visibleCount = 0;

        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            const isVisible = text.includes(searchTerm);
            row.style.display = isVisible ? '' : 'none';
            if (isVisible) visibleCount++;
        });

        // Update count if search is active
        const countEl = document.getElementById('calcCount');
        if (searchTerm && countEl) {
            const total = rows.length;
            countEl.textContent = `Showing ${visibleCount} of ${total} calculation${total !== 1 ? 's' : ''}`;
        }
    } catch (error) {
        console.error('Filter calculations error:', error);
    }
}

/**
 * Clear all calculation history
 */
function clearCalculationHistory() {
    try {
        const history = JSON.parse(localStorage.getItem('calc_history') || '[]');
        if (history.length === 0) {
            showToast('No calculations to clear', 'info');
            return;
        }

        if (!confirm(`Clear all ${history.length} calculation records?`)) return;

        localStorage.setItem('calc_history', '[]');
        displayCalculationHistory();
        showToast('All calculations cleared', 'success');
    } catch (error) {
        console.error('Clear calculation history error:', error);
        showToast('Error clearing calculations', 'error');
    }
}

// Keep backward compatibility
function calculateInterest() {
    performCalculation();
}

// ===================================
// Certificate Functions (IMPROVED)
// ===================================

function loadCertificates() {
    try {
        if (!pinHash) {
            console.warn('Cannot load certificates: PIN not initialized');
            return;
        }
        
        const records = getData('fd_records') || [];
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
                            <h6 class="mt-2">${escapeHtml(record.bank)}</h6>
                            <p class="mb-1"><strong>${escapeHtml(record.accountHolder)}</strong></p>
                            <p class="mb-0">${formatCurrency(record.amount)}</p>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Load certificates error:', error);
        const container = document.getElementById('certificatesGallery');
        if (container) {
            container.innerHTML = '<div class="col-12 text-center text-danger"><p>Error loading certificates</p></div>';
        }
    }
}

// ===================================
// Export Functions
// ===================================

function exportAllPDF() {
    try {
        if (!pinHash) {
            showToast('Please log in first', 'error');
            return;
        }
        
        const records = getData('fd_records') || [];
        
        if (records.length === 0) {
            showToast('No records to export', 'warning');
            return;
        }
        
        if (typeof jsPDF === 'undefined') {
            showToast('PDF library not loaded. Please refresh the page.', 'error');
            return;
        }
        
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
    try {
        if (!pinHash) {
            showToast('Please log in first', 'error');
            return;
        }
        
        const records = getData('fd_records') || [];
        
        if (records.length === 0) {
            showToast('No records to export', 'warning');
            return;
        }
        
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
 */
function areRecordsDuplicate(record1, record2) {
    try {
        return (
            record1.accountHolder.toLowerCase().trim() === record2.accountHolder.toLowerCase().trim() &&
            record1.bank.toLowerCase().trim() === record2.bank.toLowerCase().trim() &&
            parseFloat(record1.amount) === parseFloat(record2.amount) &&
            record1.startDate === record2.startDate
        );
    } catch (error) {
        console.error('Duplicate check error:', error);
        return false;
    }
}

/**
 * Find duplicate record in existing records
 */
function findDuplicateRecord(newRecord, existingRecords) {
    try {
        return existingRecords.find(existing => areRecordsDuplicate(newRecord, existing)) || null;
    } catch (error) {
        console.error('Find duplicate error:', error);
        return null;
    }
}

/**
 * Analyze import data and categorize records
 */
function analyzeImportData(importRecords, existingRecords) {
    const analysis = {
        newRecords: [],
        duplicates: [],
        updated: [],
        invalid: []
    };
    
    try {
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
    } catch (error) {
        console.error('Import analysis error:', error);
    }
    
    return analysis;
}

// ===================================
// Import Preview Dialog
// ===================================

/**
 * Show import preview with detailed analysis
 */
function showImportPreview(analysis, callback) {
    try {
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
        
    } catch (error) {
        console.error('Import preview error:', error);
        showToast('Error showing import preview', 'error');
    }
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
            <td>${escapeHtml(item.record.accountHolder)}</td>
            <td>${escapeHtml(item.record.bank)}</td>
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
            <td>${escapeHtml(item.record.accountHolder)}</td>
            <td>${escapeHtml(item.record.bank)}</td>
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
                <td>${escapeHtml(item.imported.accountHolder)}</td>
                <td>${escapeHtml(item.imported.bank)}</td>
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
            <td>${escapeHtml(item.record.accountHolder || 'N/A')}</td>
            <td>${escapeHtml(item.record.bank || 'N/A')}</td>
            <td>${item.record.amount || 'N/A'}</td>
            <td><span class="badge bg-danger">${escapeHtml(item.reason)}</span></td>
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
function handleBulkCSVImportSmart() {
    try {
        if (!pinHash) {
            showToast('Please log in first', 'error');
            return;
        }
        
        const fileInput = document.getElementById('bulkCSVImportFile');
        const file = fileInput?.files[0];
        
        if (!file) {
            showToast('Please select a CSV file', 'warning');
            return;
        }
        
        const reader = new FileReader();
        
        reader.onload = function(e) {
            try {
                const csvText = e.target.result;
                const csvRecords = parseCSV(csvText);
                
                if (csvRecords.length === 0) {
                    showToast('CSV file is empty or invalid', 'error');
                    fileInput.value = '';
                    return;
                }
                
                // Get existing records
                const existingRecords = getData('fd_records') || [];
                
                // Prepare import records - FLEXIBLE HEADER MAPPING
                const importRecords = csvRecords.map(csvRecord => {
                    // Normalize all keys to lowercase for flexible matching
                    const normalized = {};
                    Object.keys(csvRecord).forEach(key => {
                        normalized[key.toLowerCase().replace(/\s+/g, '')] = csvRecord[key];
                    });
                    
                    const holderName = (normalized.accountholder || '').trim();
                    
                    return {
                        accountHolder: holderName,
                        bank: (normalized.bank || '').trim(),
                        amount: parseFloat(normalized.amount) || 0,
                        duration: parseInt(normalized.duration) || 12,
                        durationUnit: normalized.unit || normalized.durationunit || 'Months',
                        rate: parseFloat(normalized.rate || normalized.interestrate) || 0,
                        startDate: normalized.startdate || '',
                        maturityDate: normalized.maturitydate || '',
                        certificateStatus: normalized.certificatestatus || 'Not Obtained',
                        notes: normalized.notes || ''
                    };
                });
                
                // Analyze import data
                const analysis = analyzeImportData(importRecords, existingRecords);
                
                // Show preview dialog
                showImportPreview(analysis, function(selectedOption, analysisData) {
                    processSmartImport(selectedOption, analysisData, fileInput);
                });
                
            } catch (error) {
                console.error('CSV import error:', error);
                showToast('Error reading CSV file. Please check file format.', 'error');
                fileInput.value = '';
            }
        };
        
        reader.readAsText(file);
    } catch (error) {
        console.error('Handle CSV import error:', error);
        showToast('Error handling CSV import', 'error');
    }
}

/**
 * Process import based on user selection
 */
function processSmartImport(option, analysis, fileInput) {
    try {
        let records = getData('fd_records') || [];
        let holders = getData('fd_account_holders') || [];
        
        const beforeCount = records.length;
        let addedCount = 0;
        let updatedCount = 0;
        
        // Process based on selected option
        if (option === 'new') {
            // Import only new records
            analysis.newRecords.forEach(item => {
                const record = prepareRecordForImport(item.record);
                
                // Add holder if not exists
                if (!holders.includes(record.accountHolder)) {
                    holders.push(record.accountHolder);
                }
                
                records.push(record);
                addedCount++;
            });
            
        } else if (option === 'newAndUpdate') {
            // Import new + update existing
            analysis.newRecords.forEach(item => {
                const record = prepareRecordForImport(item.record);
                
                if (!holders.includes(record.accountHolder)) {
                    holders.push(record.accountHolder);
                }
                
                records.push(record);
                addedCount++;
            });
            
            analysis.updated.forEach(item => {
                const existingIndex = records.findIndex(r => r.id === item.existing.id);
                if (existingIndex !== -1) {
                    // Update existing record
                    records[existingIndex] = {
                        ...records[existingIndex],
                        rate: item.imported.rate,
                        duration: item.imported.duration,
                        durationUnit: item.imported.durationUnit,
                        maturityDate: item.imported.maturityDate || calculateMaturityDate(
                            item.imported.startDate,
                            item.imported.duration,
                            item.imported.durationUnit
                        ),
                        certificateStatus: item.imported.certificateStatus,
                        notes: item.imported.notes,
                        updatedAt: new Date().toISOString()
                    };
                    updatedCount++;
                }
            });
            
        } else if (option === 'all') {
            // Import everything including duplicates
            [...analysis.newRecords, ...analysis.duplicates, ...analysis.updated].forEach(item => {
                const record = prepareRecordForImport(item.record || item.imported);
                
                if (!holders.includes(record.accountHolder)) {
                    holders.push(record.accountHolder);
                }
                
                records.push(record);
                addedCount++;
            });
        }
        
        // Save data
        saveData('fd_account_holders', holders);
        saveData('fd_records', records);
        
        // Refresh UI if functions exist
        if (typeof loadAccountHolders === 'function') loadAccountHolders();
        if (typeof loadFDRecords === 'function') loadFDRecords();
        if (typeof updateDashboard === 'function') updateDashboard();
        updateAnalytics();
        loadCertificates();
        
        // Show success message
        let message = '✅ Import completed successfully!\n\n';
        message += `📊 Before: ${beforeCount} records\n`;
        message += `📊 After: ${records.length} records\n`;
        message += `➕ Added: ${addedCount} records\n`;
        if (updatedCount > 0) {
            message += `🔄 Updated: ${updatedCount} records\n`;
        }
        if (analysis.duplicates.length > 0 && option === 'new') {
            message += `⏭️ Skipped: ${analysis.duplicates.length} duplicates\n`;
        }
        if (analysis.invalid.length > 0) {
            message += `❌ Invalid: ${analysis.invalid.length} records\n`;
        }
        
        alert(message);
        showToast(`Import completed: ${addedCount} added, ${updatedCount} updated`, 'success');
        
        fileInput.value = '';
        
    } catch (error) {
        console.error('Import processing error:', error);
        showToast('Error processing import. Please try again.', 'error');
    }
}

/**
 * Prepare record for import with all necessary fields
 */
function prepareRecordForImport(record) {
    try {
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
    } catch (error) {
        console.error('Prepare record for import error:', error);
        return record;
    }
}

// ===================================
// Enhanced Backup Restore with Duplicate Detection
// ===================================

/**
 * Restore backup with duplicate detection
 */
function restoreDataSmart() {
    try {
        if (!pinHash) {
            showToast('Please log in first', 'error');
            return;
        }
        
        const fileInput = document.getElementById('restoreFile');
        const file = fileInput?.files[0];
        
        if (!file) {
            showToast('Please select a backup file', 'warning');
            return;
        }
        
        const reader = new FileReader();
        
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                
                // Validate backup file
                if (!data.version || !data.records) {
                    throw new Error('Invalid backup file format');
                }
                
                const importRecords = data.records || [];
                const existingRecords = getData('fd_records') || [];
                
                // Analyze import data
                const analysis = analyzeImportData(importRecords, existingRecords);
                
                // Show preview dialog
                showImportPreview(analysis, function(selectedOption, analysisData) {
                    processSmartRestore(selectedOption, analysisData, data, fileInput);
                });
                
            } catch (error) {
                console.error('Restore error:', error);
                showToast('Invalid backup file. Please check the file format.', 'error');
                fileInput.value = '';
            }
        };
        
        reader.readAsText(file);
    } catch (error) {
        console.error('Restore data smart error:', error);
        showToast('Error handling backup restore', 'error');
    }
}

/**
 * Process restore based on user selection
 */
function processSmartRestore(option, analysis, backupData, fileInput) {
    try {
        let records = getData('fd_records') || [];
        let holders = getData('fd_account_holders') || [];
        let templates = getData('fd_templates') || [];
        
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
        
        fileInput.value = '';
        
        setTimeout(() => {
            location.reload();
        }, 1500);
        
    } catch (error) {
        console.error('Restore processing error:', error);
        showToast('Error processing restore. Please try again.', 'error');
    }
}

// ===================================
// Clear All Data Function
// ===================================

function clearAllData() {
    try {
        if (!pinHash) {
            showToast('Please log in first', 'error');
            return;
        }
        
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
    } catch (error) {
        console.error('Clear all data error:', error);
        showToast('Error clearing data', 'error');
    }
}

// ===================================
// Global Error Handler for Charts
// ===================================

// Add global error handler for chart-related errors
window.addEventListener('error', function(event) {
    if (event.error && event.error.message && 
        (event.error.message.includes('destroy') || event.error.message.includes('chart'))) {
        console.warn('Chart error handled globally:', event.error.message);
        event.preventDefault(); // Prevent the error from breaking the app
        return false;
    }
});

// ===================================
// Initialize
// ===================================

// Safe initialization
document.addEventListener('DOMContentLoaded', function() {
    try {
        // Wait a bit for other modules to load
        setTimeout(() => {
            // Only load if PIN is available
            if (pinHash) {
                displayCalculationHistory();
            } else {
                console.log('Waiting for PIN initialization...');
                // Try again after another delay
                setTimeout(() => {
                    if (pinHash) {
                        displayCalculationHistory();
                    }
                }, 3000);
            }
        }, 2000);
    } catch (error) {
        console.error('App-part3 initialization error:', error);
    }
});

console.log('[FD Manager Nepal] Import functions loaded - ADD ONLY mode available');
console.log('[FD Manager Nepal] App-part3.js loaded successfully');

// ===================================
// Principal Choice Modal Functions
// ===================================

function showPrincipalChoiceModal(originalPrincipal, compoundedPrincipal, calculationParams) {
    const modal = new bootstrap.Modal(document.getElementById('principalChoiceModal'));
    
    document.getElementById('originalPrincipalDisplay').textContent = formatCurrency(originalPrincipal);
    document.getElementById('compoundedPrincipalDisplay').textContent = formatCurrency(compoundedPrincipal);
    
    pendingCalculation = calculationParams;
    
    modal.show();
}

function useOriginalPrincipal() {
    if (pendingCalculation) {
        pendingCalculation.principal = pendingCalculation.originalPrincipal;
        completeCalculation(pendingCalculation);
        pendingCalculation = null;
    }
}

function useCompoundedPrincipal() {
    if (pendingCalculation) {
        pendingCalculation.principal = pendingCalculation.compoundedPrincipal;
        completeCalculation(pendingCalculation);
        pendingCalculation = null;
    }
}

function completeCalculation(params) {
    const { principal, rate, durationValue, unit, frequency } = params;
    
    try {
        // Enhanced validation
        if (!isValidAmount(principal)) {
            showToast('Please enter valid principal amount', 'error');
            return;
        }
        
        if (!isValidRate(rate)) {
            showToast('Please enter valid interest rate (0-100%)', 'error');
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
        
        if (months <= 0) {
            showToast('Invalid duration calculation', 'error');
            return;
        }
        
        // Calculate interest
        const simpleInterest = calculateSimpleInterest(principal, rate, months);
        const compoundInterest = calculateCompoundInterest(principal, rate, months, frequency);
        const maturityAmount = principal + compoundInterest;
        const difference = compoundInterest - simpleInterest;
        
        // Get frequency name
        const frequencyNames = {
            '4': 'Quarterly (4/year)',
            '12': 'Monthly (12/year)',
            '1': 'Annually (1/year)',
            '365': 'Daily (365/year)',
            '0': 'At Maturity (Simple)'
        };
        
        // Display results safely
        const resultFields = {
            'resultPrincipal': formatCurrency(principal),
            'resultRate': rate + '% p.a.',
            'resultDuration': `${durationValue} ${unit}`,
            'resultFrequency': frequencyNames[frequency] || 'Unknown',
            'resultSimple': formatCurrency(simpleInterest),
            'resultCompound': formatCurrency(compoundInterest),
            'resultMaturity': formatCurrency(maturityAmount),
            'resultDifference': formatCurrency(difference)
        };
        
        Object.keys(resultFields).forEach(fieldId => {
            const element = document.getElementById(fieldId);
            if (element) element.textContent = resultFields[fieldId];
        });
        
        // Show/hide result sections
        const resultsEl = document.getElementById('calcResults');
        const noResultsEl = document.getElementById('noCalcResults');
        
        if (resultsEl) resultsEl.style.display = 'block';
        if (noResultsEl) noResultsEl.style.display = 'none';
        
        // Show comparison chart
        showInterestComparison(principal, simpleInterest, compoundInterest);
        
        // Success message
        showToast('Calculation completed successfully!', 'success');
        
    }
    catch (error) {
        console.error('Calculation error:', error);
        showToast('Error performing calculation: ' + error.message, 'error');
    }
}

// End of app-part3.js