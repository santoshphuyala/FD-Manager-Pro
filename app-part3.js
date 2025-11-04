// ===================================
// FD Manager Pro - Application Part 3
// Analytics, Export, Backup, Calculator
// Nepal Edition - Version 4.0
// ===================================

// ===================================
// Analytics Functions
// ===================================

function updateAnalytics() {
    const records = getData('fd_records') || [];
    
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
function toggleCalcMode() {
    const mode = document.getElementById('calcMode').value;
    
    if (mode === 'existing') {
        document.getElementById('existingFDSection').style.display = 'block';
        document.getElementById('manualInputSection').style.display = 'none';
        loadAccountHoldersForCalc();
    } else {
        document.getElementById('existingFDSection').style.display = 'none';
        document.getElementById('manualInputSection').style.display = 'block';
    }
}

/**
 * Load account holders for calculator
 */
function loadAccountHoldersForCalc() {
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
}

/**
 * Load FDs for selected holder
 */
function loadFDsForCalc() {
    const holder = document.getElementById('calcAccountHolder').value;
    const select = document.getElementById('calcFDSelect');
    
    if (!holder || !select) {
        select.innerHTML = '<option value="">Select FD</option>';
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
}

/**
 * Fill calculator from selected FD
 */
function fillCalcFromFD() {
    const fdId = document.getElementById('calcFDSelect').value;
    if (!fdId) return;
    
    const records = getData('fd_records') || [];
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
function performCalculation() {
    const mode = document.getElementById('calcMode').value;
    let principal, rate, durationValue, unit;
    
    // Get values based on mode
    principal = parseFloat(document.getElementById('calcPrincipal').value);
    rate = parseFloat(document.getElementById('calcRate').value);
    
    // Check for custom date range
    const useCustomRange = mode === 'existing' && document.getElementById('calcCustomDateRange')?.checked;
    
    if (useCustomRange) {
        const fromDate = document.getElementById('calcFromDate').value;
        const toDate = document.getElementById('calcToDate').value;
        
        if (!fromDate || !toDate) {
            showToast('Please select both From and To dates', 'error');
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
        months = durationValue / 30; // Approximate
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
    
    // Get frequency name
    const frequencyNames = {
        '4': 'Quarterly (4/year)',
        '12': 'Monthly (12/year)',
        '1': 'Annually (1/year)',
        '365': 'Daily (365/year)',
        '0': 'At Maturity (Simple)'
    };
    
    // Display results
    document.getElementById('resultPrincipal').textContent = formatCurrency(principal);
    document.getElementById('resultRate').textContent = rate + '% p.a.';
    document.getElementById('resultDuration').textContent = `${durationValue} ${unit}`;
    document.getElementById('resultFrequency').textContent = frequencyNames[frequency];
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
    const calculation = {
        id: generateId(),
        timestamp: new Date().toISOString(),
        principal: document.getElementById('resultPrincipal').textContent,
        rate: document.getElementById('resultRate').textContent,
        duration: document.getElementById('resultDuration').textContent,
        compoundInterest: document.getElementById('resultCompound').textContent,
        maturityAmount: document.getElementById('resultMaturity').textContent
    };
    
    let history = JSON.parse(localStorage.getItem('calc_history') || '[]');
    history.unshift(calculation); // Add to beginning
    
    // Keep only last 10
    if (history.length > 10) {
        history = history.slice(0, 10);
    }
    
    localStorage.setItem('calc_history', JSON.stringify(history));
    displayCalculationHistory();
    
    showToast('Calculation saved to history', 'success');
}

/**
 * Display calculation history
 */
function displayCalculationHistory() {
    const history = JSON.parse(localStorage.getItem('calc_history') || '[]');
    const container = document.getElementById('calculationHistory');
    
    if (!container) return;
    
    if (history.length === 0) {
        container.innerHTML = '<p class="text-muted small">No saved calculations</p>';
        return;
    }
    
    container.innerHTML = history.map(calc => `
        <div class="card mb-2">
            <div class="card-body p-2">
                <div class="d-flex justify-content-between align-items-start">
                    <div class="small">
                        <strong>${calc.principal}</strong> @ ${calc.rate} for ${calc.duration}<br>
                        <span class="text-success"><strong>Interest:</strong> ${calc.compoundInterest}</span><br>
                        <small class="text-muted">${formatDate(calc.timestamp)}</small>
                    </div>
                    <button class="btn btn-sm btn-outline-danger" onclick="deleteCalculationHistory('${calc.id}')">
                        <i class="bi bi-trash"></i>
                    </button>
                </div>
            </div>
        </div>
    `).join('');
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
function calculateInterest() {
    performCalculation();
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

function loadCertificates() {
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
function handleBulkCSVImportSmart() {
    const fileInput = document.getElementById('bulkCSVImportFile');
    const file = fileInput.files[0];
    
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
            
            // Prepare import records
            const importRecords = csvRecords.map(csvRecord => {
                const holderName = (csvRecord.accountholder || '').trim();
                
                return {
                    accountHolder: holderName,
                    bank: (csvRecord.bank || '').trim(),
                    amount: parseFloat(csvRecord.amount) || 0,
                    duration: parseInt(csvRecord.duration) || 12,
                    durationUnit: csvRecord.unit || 'Months',
                    rate: parseFloat(csvRecord.rate) || 0,
                    startDate: csvRecord.startdate || '',
                    maturityDate: csvRecord.maturitydate || '',
                    certificateStatus: csvRecord.certificatestatus || 'Not Obtained',
                    notes: csvRecord.notes || ''
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
        
        // Refresh UI
        loadAccountHolders();
        loadFDRecords();
        updateDashboard();
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

// Keep existing export functions unchanged
// ... (exportAllPDF, exportToExcel, exportAllToCSV, backupData, clearAllData, etc

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

function performCalculation() {
    const principal = parseFloat(document.getElementById('calcPrincipal').value);
    const rate = parseFloat(document.getElementById('calcRate').value);
    const duration = parseInt(document.getElementById('calcDuration').value);
    const unit = document.getElementById('calcUnit').value;
    const frequency = parseInt(document.getElementById('calcFrequency').value);
    
    // Validation
    if (!principal || principal <= 0) {
        showToast('Please enter valid principal amount', 'error');
        return;
    }
    
    if (!rate || rate <= 0) {
        showToast('Please enter valid interest rate', 'error');
        return;
    }
    
    if (!duration || duration <= 0) {
        showToast('Please enter valid duration', 'error');
        return;
    }
    
    // Calculate
    const months = getDurationInMonths(duration, unit);
    
    const simpleInterest = calculateSimpleInterest(principal, rate, months);
    const compoundInterest = calculateCompoundInterest(principal, rate, months, frequency);
    const maturityAmount = principal + compoundInterest;
    
    // Get frequency name
    const frequencyNames = {
        '4': 'Quarterly',
        '12': 'Monthly',
        '1': 'Annually',
        '365': 'Daily',
        '0': 'At Maturity (Simple)'
    };
    
    // Display results
    document.getElementById('resultPrincipal').textContent = formatCurrency(principal);
    document.getElementById('resultRate').textContent = rate + '% p.a.';
    document.getElementById('resultDuration').textContent = duration + ' ' + unit;
    document.getElementById('resultFrequency').textContent = frequencyNames[frequency];
    document.getElementById('resultSimple').textContent = formatCurrency(simpleInterest);
    document.getElementById('resultCompound').textContent = formatCurrency(compoundInterest);
    document.getElementById('resultMaturity').textContent = formatCurrency(maturityAmount);
    
    // Show results
    document.getElementById('calcResults').style.display = 'block';
    document.getElementById('noCalcResults').style.display = 'none';
    
    // Show comparison chart
    showInterestComparison(principal, simpleInterest, compoundInterest);
    
    // Success message
    showToast('Calculation completed successfully!', 'success');
}

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
    if (window.interestComparisonChart) {
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
function calculateInterest() {
    performCalculation();
}

console.log('[FD Manager Nepal] Import functions loaded - ADD ONLY mode available');
console.log('[FD Manager Nepal] App-part3.js loaded successfully');