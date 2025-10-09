// ===================================
// FD Manager Pro - Application Part 2
// OCR, Templates, CSV Import, Dashboard
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

function confirmOCRData() {
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
    
    let records = getData('fd_records') || [];
    records.push(record);
    saveData('fd_records', records);
    
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

function loadTemplates() {
    const templates = getData('fd_templates') || [];
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

function saveTemplate(event) {
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
    
    let templates = getData('fd_templates') || [];
    templates.push(template);
    saveData('fd_templates', templates);
    
    loadTemplates();
    
    document.getElementById('templateName').value = '';
    document.getElementById('templateBank').value = '';
    document.getElementById('templateDuration').value = '';
    document.getElementById('templateRate').value = '';
    
    showToast('Template saved successfully!', 'success');
}

function applyTemplate(templateId) {
    const templates = getData('fd_templates') || [];
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

function deleteTemplate(templateId) {
    if (!confirm('Delete this template?')) return;
    
    let templates = getData('fd_templates') || [];
    templates = templates.filter(t => t.id !== templateId);
    saveData('fd_templates', templates);
    
    loadTemplates();
    showToast('Template deleted', 'success');
}

// ===================================
// CSV Import Functions
// ===================================

function importCSV() {
    const accountHolder = document.getElementById('fdAccountHolder').value;
    
    if (!accountHolder) {
        showToast('Please select an account holder first', 'warning');
        return;
    }
    
    document.getElementById('csvFileInput').click();
}

function handleCSVImport() {
    const fileInput = document.getElementById('csvFileInput');
    const file = fileInput.files[0];
    
    if (!file) return;
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const csvText = e.target.result;
            const csvRecords = parseCSV(csvText);
            
            if (csvRecords.length === 0) {
                showToast('CSV file is empty or invalid', 'error');
                return;
            }
            
            const accountHolder = document.getElementById('fdAccountHolder').value;
            let records = getData('fd_records') || [];
            
            let importedCount = 0;
            
            csvRecords.forEach(csvRecord => {
                const fdRecord = {
                    id: generateId(),
                    accountHolder: accountHolder,
                    bank: csvRecord.bank || csvRecord.bankname || '',
                    amount: parseFloat(csvRecord.amount) || 0,
                    duration: parseInt(csvRecord.duration) || 0,
                    durationUnit: csvRecord.unit || 'Months',
                    rate: parseFloat(csvRecord.rate || csvRecord.interestrate) || 0,
                    startDate: csvRecord.startdate || '',
                    maturityDate: '',
                    certificateStatus: csvRecord.certificatestatus || 'Not Obtained',
                    notes: csvRecord.notes || '',
                    createdAt: new Date().toISOString()
                };
                
                if (fdRecord.startDate && fdRecord.duration) {
                    fdRecord.maturityDate = calculateMaturityDate(
                        fdRecord.startDate,
                        fdRecord.duration,
                        fdRecord.durationUnit
                    );
                }
                
                if (fdRecord.bank && fdRecord.amount && fdRecord.rate && fdRecord.startDate) {
                    records.push(fdRecord);
                    importedCount++;
                }
            });
            
            saveData('fd_records', records);
            
            loadFDRecords();
            updateDashboard();
            updateAnalytics();
            
            showToast(`Successfully imported ${importedCount} record(s)`, 'success');
            
            fileInput.value = '';
            
        } catch (error) {
            console.error('CSV import error:', error);
            showToast('Error importing CSV. Please check file format.', 'error');
        }
    };
    
    reader.readAsText(file);
}

// ===================================
// Dashboard Functions
// ===================================

function updateDashboard() {
    const selectedHolder = document.getElementById('dashboardHolderFilter')?.value;
    let records = getData('fd_records') || [];
    
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

function showChangePIN() {
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
    
    const holders = getData('fd_account_holders');
    const records = getData('fd_records');
    const templates = getData('fd_templates');
    
    saveData('fd_account_holders', holders);
    saveData('fd_records', records);
    saveData('fd_templates', templates);
    
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
function quickAddHolder() {
    const name = prompt('Enter account holder name:');
    if (!name || !name.trim()) return;
    
    const holders = getData('fd_account_holders') || [];
    if (holders.includes(name.trim())) {
        showToast('Account holder already exists', 'warning');
        return;
    }
    
    holders.push(name.trim());
    saveData('fd_account_holders', holders);
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
function showQuickAddModal() {
    const holders = getData('fd_account_holders') || [];
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
function saveQuickFD(event) {
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
    
    let records = getData('fd_records') || [];
    records.push(record);
    saveData('fd_records', records);
    
    loadFDRecords();
    updateDashboard();
    updateAnalytics();
    
    bootstrap.Modal.getInstance(document.getElementById('quickAddModal')).hide();
    document.getElementById('quickAddForm').reset();
    
    showToast('FD added quickly!', 'success');
}

/**
 * Duplicate last FD
 */
function duplicateLastFD() {
    const records = getData('fd_records') || [];
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
function showRenewalHelper() {
    const records = getData('fd_records') || [];
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
function loadRenewalDetails() {
    const fdId = document.getElementById('renewalFDSelect').value;
    if (!fdId) {
        document.getElementById('renewalDetails').style.display = 'none';
        return;
    }
    
    const records = getData('fd_records') || [];
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
function processRenewal() {
    const fdId = document.getElementById('renewalFDSelect').value;
    const records = getData('fd_records') || [];
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
    saveData('fd_records', records);
    
    loadFDRecords();
    updateDashboard();
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
    
    const records = getData('fd_records') || [];
    const holderRecords = records.filter(r => r.accountHolder === holder);
    
    if (holderRecords.length > 0) {
        const recent = holderRecords[holderRecords.length - 1];
        document.getElementById('fdBank').value = recent.bank;
        suggestBankRate();
    }
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