// ===================================
// FD Manager Pro - OCR Enhanced Module
// Simplified Working Version
// ===================================

// ===================================
// Simple OCR Text Extraction
// ===================================

/**
 * Extract bank name from text
 */
function extractBankNameAdvanced(text) {
    // Try exact patterns first
    for (const pattern of bankPatterns) {
        if (pattern.pattern.test(text)) {
            return pattern.name;
        }
    }
    
    // Try fuzzy matching with all banks
    const words = text.toLowerCase().split(/\s+/);
    
    for (const bank of bankDatabase) {
        const bankWords = bank.toLowerCase().split(/\s+/);
        let matchCount = 0;
        
        for (const bankWord of bankWords) {
            if (bankWord.length < 3) continue;
            
            for (const word of words) {
                if (word.includes(bankWord) || bankWord.includes(word)) {
                    matchCount++;
                    break;
                }
            }
        }
        
        if (matchCount >= Math.max(1, bankWords.filter(w => w.length >= 3).length * 0.5)) {
            return bank;
        }
    }
    
    return '';
}

/**
 * Extract amount from text
 */
function extractAmountAdvanced(text) {
    const patterns = [
        /(?:NRs|Rs|NPR)\s*([0-9,]+(?:\.[0-9]{1,2})?)/gi,
        /([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:NRs|Rs|NPR)/gi,
        /(?:Amount|Principal|Deposit)[:\s]*(?:NRs|Rs|NPR)?[.\s]*([0-9,]+(?:\.[0-9]{1,2})?)/gi,
        /([0-9]+(?:\.[0-9]+)?)\s*(?:lakh|lakhs)/gi,
        /\b([1-9][0-9]{4,8})\b/g
    ];
    
    const amounts = [];
    
    for (const pattern of patterns) {
        const matches = [...text.matchAll(pattern)];
        for (const match of matches) {
            let amount = match[1].replace(/,/g, '');
            
            if (match[0].toLowerCase().includes('lakh')) {
                amount = parseFloat(amount) * 100000;
            } else {
                amount = parseFloat(amount);
            }
            
            if (amount >= 1000 && amount <= 100000000) {
                amounts.push(amount);
            }
        }
    }
    
    return amounts.length > 0 ? amounts[0] : 0;
}

/**
 * Extract interest rate from text
 */
function extractRateAdvanced(text) {
    const patterns = [
        /([0-9]+\.?[0-9]*)\s*%/gi,
        /(?:Rate|Interest)[:\s]*([0-9]+\.?[0-9]*)\s*%/gi,
        /at\s+([0-9]+\.?[0-9]*)\s*%/gi
    ];
    
    const rates = [];
    
    for (const pattern of patterns) {
        const matches = [...text.matchAll(pattern)];
        for (const match of matches) {
            const rate = parseFloat(match[1]);
            if (rate >= 3 && rate <= 20) {
                rates.push(rate);
            }
        }
    }
    
    return rates.length > 0 ? rates[0] : 0;
}

/**
 * Extract dates from text
 */
function extractDatesAdvanced(text) {
    const patterns = [
        /(\d{2})[\/\-](\d{2})[\/\-](\d{4})/g,
        /(\d{4})[\/\-](\d{2})[\/\-](\d{2})/g
    ];
    
    const dates = [];
    
    for (const pattern of patterns) {
        const matches = [...text.matchAll(pattern)];
        for (const match of matches) {
            let year, month, day;
            
            if (match[1].length === 4) {
                year = match[1];
                month = match[2];
                day = match[3];
            } else {
                day = match[1];
                month = match[2];
                year = match[3];
            }
            
            const dateObj = new Date(year, month - 1, day);
            if (dateObj instanceof Date && !isNaN(dateObj)) {
                dates.push(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`);
            }
        }
    }
    
    return dates;
}

/**
 * Extract duration from text
 */
function extractDuration(text) {
    const patterns = [
        /(\d+)\s*(?:months?)/gi,
        /(\d+)\s*(?:years?)/gi
    ];
    
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            const num = parseInt(match[1] || match[0].match(/\d+/)[0]);
            const isYear = /year/i.test(match[0]);
            
            return {
                duration: num,
                unit: isYear ? 'Years' : 'Months'
            };
        }
    }
    
    return null;
}

/**
 * Perform simple OCR - FIXED for PDF handling
 */
async function performSimpleOCR(imageData) {
    try {
        // Check if it's a PDF
        if (imageData.startsWith('data:application/pdf')) {
            throw new Error('PDF files are not supported for OCR. Please use JPG or PNG images.');
        }
        
        const result = await Tesseract.recognize(
            imageData,
            'eng',
            {
                logger: info => {
                    if (info.status === 'recognizing text') {
                        console.log(`OCR Progress: ${Math.round(info.progress * 100)}%`);
                    }
                }
            }
        );
        return result.data.text;
    } catch (error) {
        console.error('OCR Error:', error);
        throw error;
    }
}

/**
 * Extract all FD data from OCR text
 */
function extractFDDataAdvanced(text) {
    console.log('=== OCR Extracted Text ===');
    console.log(text);
    console.log('========================');
    
    const data = {
        bank: extractBankNameAdvanced(text),
        amount: extractAmountAdvanced(text),
        rate: extractRateAdvanced(text),
        dates: extractDatesAdvanced(text),
        duration: null,
        unit: 'Months',
        confidence: 0
    };
    
    const durationInfo = extractDuration(text);
    if (durationInfo) {
        data.duration = durationInfo.duration;
        data.unit = durationInfo.unit;
    }
    
    if (data.dates.length >= 2 && !data.duration) {
        const startDate = new Date(data.dates[0]);
        const maturityDate = new Date(data.dates[1]);
        const diffTime = Math.abs(maturityDate - startDate);
        const diffMonths = Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30));
        data.duration = diffMonths;
    }
    
    if (data.dates.length >= 2) {
        data.startDate = data.dates[0];
        data.maturityDate = data.dates[1];
    } else if (data.dates.length === 1) {
        data.startDate = data.dates[0];
    }
    
    let confidence = 0;
    if (data.bank) confidence += 25;
    if (data.amount > 0) confidence += 25;
    if (data.rate > 0) confidence += 25;
    if (data.startDate) confidence += 15;
    if (data.duration) confidence += 10;
    
    data.confidence = confidence;
    
    return data;
}

/**
 * Validate extracted data
 */
function validateAndSuggest(data) {
    const suggestions = {
        valid: true,
        warnings: [],
        suggestions: []
    };
    
    if (!data.bank) {
        suggestions.warnings.push('Bank name not detected');
        suggestions.suggestions.push('Please select bank manually');
    }
    
    if (data.amount < 1000) {
        suggestions.warnings.push('Amount seems too low');
        suggestions.suggestions.push('Minimum FD is usually NRs 25,000');
    }
    
    if (data.rate === 0) {
        suggestions.warnings.push('Interest rate not detected');
    } else if (data.rate < 3 || data.rate > 15) {
        suggestions.warnings.push('Interest rate seems unusual');
        suggestions.suggestions.push('Typical rates: 6-11% for Nepal');
    }
    
    if (!data.startDate) {
        suggestions.warnings.push('Start date not detected');
    }
    
    if (suggestions.warnings.length > 2) {
        suggestions.valid = false;
        suggestions.suggestions.push('Consider manual entry or retake photo');
    }
    
    return suggestions;
}

// Export functions to window object
window.OCREnhanced = {
    performSimpleOCR,
    extractFDDataAdvanced,
    validateAndSuggest
};

console.log('[FD Manager Nepal] OCR Enhanced module loaded');