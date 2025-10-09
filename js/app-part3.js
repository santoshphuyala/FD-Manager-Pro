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
// Bulk CSV Import/Export (Settings)
// ===================================

function handleBulkCSVImport() {
    const fileInput = document.getElementById('bulkCSVImportFile');
    const file = fileInput.files[0];
    
    if (!file) return;
    
    if (!confirm('⚠️ Import FDs from CSV?\n\nThis will ADD records to existing data.')) {
        fileInput.value = '';
        return;
    }
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const csvText = e.target.result;
            const csvRecords = parseCSV(csvText);
            
            if (csvRecords.length === 0) {
                showToast('CSV file is empty or invalid', 'error');
                return;
            }
            
            let records = getData('fd_records') || [];
            let holders = getData('fd_account_holders') || [];
            let importedCount = 0;
            let skippedCount = 0;
            
            csvRecords.forEach((csvRecord, index) => {
                try {
                    if (!csvRecord.accountholder || !csvRecord.bank || !csvRecord.amount || 
                        !csvRecord.rate || !csvRecord.startdate) {
                        skippedCount++;
                        return;
                    }
                    
                    const holderName = csvRecord.accountholder.trim();
                    if (!holders.includes(holderName)) {
                        holders.push(holderName);
                    }
                    
                    const fdRecord = {
                        id: generateId(),
                        accountHolder: holderName,
                        bank: csvRecord.bank.trim(),
                        amount: parseFloat(csvRecord.amount) || 0,
                        duration: parseInt(csvRecord.duration) || 12,
                        durationUnit: csvRecord.unit || 'Months',
                        rate: parseFloat(csvRecord.rate) || 0,
                        startDate: csvRecord.startdate,
                        maturityDate: csvRecord.maturitydate || '',
                        certificateStatus: csvRecord.certificatestatus || 'Not Obtained',
                        notes: csvRecord.notes || '',
                        createdAt: new Date().toISOString()
                    };
                    
                    if (!fdRecord.maturityDate && fdRecord.startDate && fdRecord.duration) {
                        fdRecord.maturityDate = calculateMaturityDate(
                            fdRecord.startDate,
                            fdRecord.duration,
                            fdRecord.durationUnit
                        );
                    }
                    
                    if (!isValidAmount(fdRecord.amount) || !isValidRate(fdRecord.rate)) {
                        skippedCount++;
                        return;
                    }
                    
                    records.push(fdRecord);
                    importedCount++;
                    
                } catch (error) {
                    skippedCount++;
                }
            });
            
            saveData('fd_account_holders', holders);
            saveData('fd_records', records);
            
            loadAccountHolders();
            loadFDRecords();
            updateDashboard();
            updateAnalytics();
            loadCertificates();
            
            let message = `✅ Successfully imported ${importedCount} record(s)`;
            if (skippedCount > 0) {
                message += `\n⚠️ Skipped ${skippedCount} record(s)`;
            }
            
            alert(message);
            showToast(`Imported ${importedCount} FD record(s)`, 'success');
            
            fileInput.value = '';
            
        } catch (error) {
            console.error('Bulk CSV import error:', error);
            showToast('Error importing CSV. Please check file format.', 'error');
            fileInput.value = '';
        }
    };
    
    reader.readAsText(file);
}

function exportAllToCSV() {
    const records = getData('fd_records') || [];
    
    if (records.length === 0) {
        showToast('No records to export', 'warning');
        return;
    }
    
    const csvContent = generateCSVFromRecords(records);
    const filename = `FD_Records_All_${new Date().toISOString().split('T')[0]}.csv`;
    
    downloadFile(csvContent, filename, 'text/csv');
    showToast(`Exported ${records.length} record(s) to CSV`, 'success');
}

// ===================================
// Backup & Restore Functions
// ===================================

function backupData() {
    const data = {
        version: '4.0',
        timestamp: new Date().toISOString(),
        accountHolders: getData('fd_account_holders'),
        records: getData('fd_records'),
        templates: getData('fd_templates'),
        settings: JSON.parse(localStorage.getItem('fd_settings') || '{}')
    };
    
    const jsonString = JSON.stringify(data, null, 2);
    const filename = `FD_Backup_${new Date().toISOString().split('T')[0]}.json`;
    
    downloadFile(jsonString, filename, 'application/json');
    
    showToast('Backup created successfully', 'success');
}

function restoreData() {
    const fileInput = document.getElementById('restoreFile');
    const file = fileInput.files[0];
    
    if (!file) return;
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            if (!data.version || !data.accountHolders) {
                throw new Error('Invalid backup file');
            }
            
            if (!confirm('⚠️ This will replace all current data. Continue?')) {
                return;
            }
            
            saveData('fd_account_holders', data.accountHolders || []);
            saveData('fd_records', data.records || []);
            saveData('fd_templates', data.templates || []);
            
            if (data.settings) {
                localStorage.setItem('fd_settings', JSON.stringify(data.settings));
            }
            
            showToast('Data restored successfully! Reloading...', 'success');
            
            setTimeout(() => {
                location.reload();
            }, 1500);
            
        } catch (error) {
            console.error('Restore error:', error);
            showToast('Invalid backup file', 'error');
        }
    };
    
    reader.readAsText(file);
    
    fileInput.value = '';
}

function clearAllData() {
    const confirmation = prompt('⚠️ WARNING: This will delete ALL FD data!\n\nType "DELETE" to confirm:');
    
    if (confirmation !== 'DELETE') {
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
// Enhanced Interest Calculator Functions
// ===================================

/**
 * Perform calculation with enhanced display
 */
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

/**
 * Set calculator preset values
 */
function setCalcPreset(amount, rate, duration, unit) {
    document.getElementById('calcPrincipal').value = amount;
    document.getElementById('calcRate').value = rate;
    document.getElementById('calcDuration').value = duration;
    document.getElementById('calcUnit').value = unit;
    
    showToast('Preset values loaded. Click Calculate to see results.', 'info');
}

/**
 * Show interest comparison chart
 */
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

/**
 * Print calculation results
 */
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

// Keep the original calculateInterest function for backward compatibility
function calculateInterest() {
    performCalculation();
}

console.log('[FD Manager Nepal] Enhanced calculator functions loaded');

console.log('[FD Manager Nepal] App-part3.js loaded successfully');