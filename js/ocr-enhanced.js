// ===================================
// FD Manager Pro - Enhanced OCR Module
// PDF & JPEG Support with Compression & Storage
// ===================================

// ===================================
// Enhanced OCR with PDF & Image Compression
// ===================================

/**
 * Compress image before processing
 */
async function compressImage(file, maxWidth = 1200, quality = 0.7) {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        // Add timeout for image loading
        const timeout = setTimeout(() => {
            URL.revokeObjectURL(img.src);
            reject(new Error('Image loading timeout'));
        }, 10000);
        
        img.onload = () => {
            clearTimeout(timeout);
            // Calculate new dimensions
            let { width, height } = img;
            if (width > maxWidth) {
                height = (height * maxWidth) / width;
                width = maxWidth;
            }
            
            canvas.width = width;
            canvas.height = height;
            
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob(blob => {
                // FIX: Release canvas backing store immediately after blob is captured
                // to avoid holding the decoded pixel buffer in memory for the entire
                // lifetime of the OCR pipeline.
                canvas.width = 0;
                canvas.height = 0;
                resolve(blob);
            }, 'image/jpeg', quality);
            
            // Clean up object URL
            URL.revokeObjectURL(img.src);
        };
        
        img.onerror = () => {
            clearTimeout(timeout);
            URL.revokeObjectURL(img.src);
            reject(new Error('Failed to load image'));
        };
        
        img.src = URL.createObjectURL(file);
    });
}

/**
 * Convert PDF page to image
 */
async function convertPDFToImages(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            // FIX: async FileReader.onload swallows post-await rejections — they
            // become unhandled promise rejections instead of reaching .catch(reject).
            // Use a sync handler wrapping an async IIFE with .catch(reject).
            (async function() {
                const typedArray = new Uint8Array(e.target.result);
                const pdf = await window.pdfjsLib.getDocument(typedArray).promise;
                const images = [];
                
                // Limit pages to prevent memory issues
                const maxPages = Math.min(pdf.numPages, 3);
                
                for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
                    const page = await pdf.getPage(pageNum);
                    const viewport = page.getViewport({ scale: 2.0 });
                    
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    
                    await page.render({
                        canvasContext: context,
                        viewport: viewport
                    }).promise;
                    
                    // FIX: canvas nodes created per-page were never released.
                    // Nulling width/height signals the browser to free the backing store.
                    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.8));
                    canvas.width = 0;
                    canvas.height = 0;
                    images.push(blob);
                }
                
                // Clean up PDF document
                if (pdf && pdf.cleanup) {
                    pdf.cleanup();
                }
                
                resolve(images);
            })().catch(reject);
        };
        
        reader.onerror = (error) => {
            reject(new Error('Failed to read PDF file: ' + error.message));
        };
        
        reader.readAsArrayBuffer(file);
    });
}

/**
 * Process uploaded file (PDF or Image)
 */
async function processUploadedFile(file) {
    try {
        showLoading();
        
        let imageFiles = [];
        
        if (file.type === 'application/pdf') {
            // Convert PDF to images
            imageFiles = await convertPDFToImages(file);
        } else if (file.type.startsWith('image/')) {
            // Compress image
            const compressed = await compressImage(file);
            imageFiles = [compressed];
        } else {
            throw new Error('Unsupported file type. Please upload PDF or JPEG image.');
        }
        
        // Store original file for reference
        const certificateData = await storeCertificate(file);
        
        // Process each image
        let bestResult = null;
        let bestConfidence = 0;
        
        for (const imageFile of imageFiles) {
            const result = await performEnhancedOCR(imageFile);
            if (result.confidence > bestConfidence) {
                bestResult = result;
                bestConfidence = result.confidence;
            }
        }
        
        if (bestResult) {
            bestResult.certificateId = certificateData.id;
            bestResult.originalFileName = file.name;
        }
        
        hideLoading();
        return bestResult;
        
    } catch (error) {
        hideLoading();
        console.error('Error processing file:', error);
        showToast('Error processing file: ' + error.message, 'error');
        return null;
    }
}

/**
 * Store certificate for future reference
 */
async function storeCertificate(file) {
    try {
        const certificateId = 'cert_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        
        // Compressed version for storage
        let storageFile = file;
        if (file.type.startsWith('image/')) {
            storageFile = await compressImage(file, 800, 0.5); // Smaller for storage
        }
        
        // Convert to base64 for IndexedDB storage
        const base64 = await fileToBase64(storageFile);
        
        const certificateData = {
            id: certificateId,
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            compressedSize: storageFile.size,
            uploadDate: new Date().toISOString(),
            data: base64,
            thumbnail: await generateThumbnail(storageFile)
        };
        
        // Save to IndexedDB
        await saveCertificateData(certificateData);
        
        return certificateData;
        
    } catch (error) {
        console.error('Error storing certificate:', error);
        throw error;
    }
}

/**
 * Generate thumbnail for certificate
 */
async function generateThumbnail(file) {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        // Add timeout for image loading
        const timeout = setTimeout(() => {
            URL.revokeObjectURL(img.src);
            reject(new Error('Thumbnail generation timeout'));
        }, 10000);
        
        img.onload = () => {
            clearTimeout(timeout);
            // Create thumbnail (200x200 max)
            const size = 200;
            let { width, height } = img;
            
            if (width > height) {
                height = (height * size) / width;
                width = size;
            } else {
                width = (width * size) / height;
                height = size;
            }
            
            canvas.width = width;
            canvas.height = height;
            
            ctx.drawImage(img, 0, 0, width, height);
            const dataURL = canvas.toDataURL('image/jpeg', 0.6);
            // FIX: Release canvas backing store after capturing the data URL
            canvas.width = 0;
            canvas.height = 0;
            resolve(dataURL);
            
            // Clean up object URL
            URL.revokeObjectURL(img.src);
        };
        
        img.onerror = () => {
            clearTimeout(timeout);
            URL.revokeObjectURL(img.src);
            reject(new Error('Failed to load image for thumbnail'));
        };
        
        img.src = URL.createObjectURL(file);
    });
}

/**
 * Convert file to base64
 */
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

/**
 * Enhanced OCR with multiple recognition attempts
 */
async function performEnhancedOCR(imageFile) {
    try {
        // Initialize Tesseract if not already loaded
        if (!window.Tesseract) {
            await loadTesseract();
        }
        
        // Multiple recognition attempts with different settings
        const attempts = [
            { lang: 'eng', oem: 1, psm: 6 }, // LSTM, Single block
            { lang: 'eng', oem: 1, psm: 3 }, // LSTM, Auto
            { lang: 'eng', oem: 0, psm: 6 }  // Legacy, Single block
        ];
        
        let bestResult = null;
        let bestConfidence = 0;
        
        for (const attempt of attempts) {
            try {
                const result = await Tesseract.recognize(
                    imageFile,
                    attempt.lang,
                    {
                        logger: m => console.log(m),
                        tessedit_ocr_engine_mode: attempt.oem,
                        tessedit_pageseg_mode: attempt.psm,
                        preserve_interword_spaces: '1'
                    }
                );
                
                const confidence = parseFloat(result.data.confidence);
                if (confidence > bestConfidence) {
                    bestConfidence = confidence;
                    bestResult = {
                        text: result.data.text,
                        confidence: confidence,
                        words: result.data.words,
                        lines: result.data.lines,
                        attempt: attempt
                    };
                }
            } catch (attemptError) {
                console.warn('OCR attempt failed:', attempt, attemptError);
            }
        }
        
        if (bestResult && bestResult.confidence > 30) {
            return extractFDDataFromOCR(bestResult);
        } else {
            throw new Error('OCR confidence too low. Please try with a clearer image.');
        }
        
    } catch (error) {
        console.error('Enhanced OCR failed:', error);
        throw error;
    }
}

// FIX: loadTesseract had no in-flight guard — two concurrent OCR attempts would
// each append their own <script> tag, causing Tesseract to initialise twice and
// potentially corrupting the global worker state. Singleton promise fixes this.
let _tesseractLoadPromise = null;

async function loadTesseract() {
    if (window.Tesseract) return;
    if (_tesseractLoadPromise) return _tesseractLoadPromise;

    _tesseractLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@4/dist/tesseract.min.js';
        script.onload  = () => { _tesseractLoadPromise = null; resolve(); };
        script.onerror = (err) => { _tesseractLoadPromise = null; reject(err); };
        document.head.appendChild(script);
    });

    return _tesseractLoadPromise;
}

/**
 * Extract FD data from OCR result with enhanced patterns
 */
function extractFDDataFromOCR(ocrResult) {
    const text = ocrResult.text;
    const confidence = ocrResult.confidence;
    
    console.log('OCR Text:', text);
    console.log('OCR Confidence:', confidence);
    
    const extractedData = {
        bank: extractBankNameEnhanced(text),
        amount: extractAmountEnhanced(text),
        rate: extractRateEnhanced(text),
        duration: extractDurationEnhanced(text),
        startDate: extractDateEnhanced(text),
        maturityDate: extractMaturityDateEnhanced(text),
        holder: extractHolderEnhanced(text),
        certificateNumber: extractCertificateNumberEnhanced(text),
        confidence: confidence,
        rawText: text
    };
    
    // Validate and enhance with AI
    const validation = validateAndSuggest(extractedData);
    extractedData.validation = validation;
    
    return extractedData;
}

/**
 * Extract bank name from text
 */
function extractBankNameEnhanced(text) {
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
 * Extract amount from text with enhanced patterns
 */
function extractAmountEnhanced(text) {
    const patterns = [
        /(?:NRs|Rs|NPR)\s*([0-9,]+(?:\.[0-9]{1,2})?)/gi,
        /([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:NRs|Rs|NPR)/gi,
        /(?:Amount|Principal|Deposit|Sum)[:\s]*(?:NRs|Rs|NPR)?[.\s]*([0-9,]+(?:\.[0-9]{1,2})?)/gi,
        /([0-9]+(?:\.[0-9]+)?)\s*(?:lakh|lakhs)/gi,
        /\b([1-9][0-9]{4,8})\b/g,
        /(?:Total|Grand Total)[:\s]*([0-9,]+(?:\.[0-9]{1,2})?)/gi
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
 * Extract interest rate from text with enhanced patterns
 */
function extractRateEnhanced(text) {
    const patterns = [
        /([0-9]+\.?[0-9]*)\s*%/gi,
        /(?:Rate|Interest|ROI)[:\s]*([0-9]+\.?[0-9]*)\s*%/gi,
        /at\s+([0-9]+\.?[0-9]*)\s*%/gi,
        /([0-9]+\.?[0-9]*)\s*percent/gi,
        /p\.a\.\s*([0-9]+\.?[0-9]*)/gi
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

/**
 * Save certificate data to IndexedDB
 */
async function saveCertificateData(certificateData) {
    try {
        // Get existing certificates
        let certificates = (await getData('fd_certificates')) || [];
        
        // Add new certificate
        certificates.push(certificateData);
        
        // FIX: Original used slice(-50) which KEEPS the last 50 (newest), which
        // is correct intent, but only activates AFTER already exceeding 50.
        // Trim to exactly 50 here to prevent unbounded growth.
        if (certificates.length > 50) {
            // slice(-50) keeps the 50 most recent entries
            certificates = certificates.slice(-50);
        }
        
        // Save to IndexedDB
        await saveData('fd_certificates', certificates);
        
        console.log('Certificate saved:', certificateData.id);
        
    } catch (error) {
        console.error('Error saving certificate data:', error);
        throw error;
    }
}

/**
 * Get certificate by ID
 */
async function getCertificateById(certificateId) {
    try {
        const certificates = (await getData('fd_certificates')) || [];
        return certificates.find(cert => cert.id === certificateId);
    } catch (error) {
        console.error('Error getting certificate:', error);
        return null;
    }
}

/**
 * Delete certificate by ID
 */
async function deleteCertificateById(certificateId) {
    try {
        let certificates = (await getData('fd_certificates')) || [];
        certificates = certificates.filter(cert => cert.id !== certificateId);
        await saveData('fd_certificates', certificates);
        return true;
    } catch (error) {
        console.error('Error deleting certificate:', error);
        return false;
    }
}

// Export enhanced functions to window object
window.OCREnhanced = {
    processUploadedFile,
    performEnhancedOCR,
    extractFDDataFromOCR,
    validateAndSuggest,
    getCertificateById,
    deleteCertificateById,
    compressImage,
    convertPDFToImages
};

// Also export for backward compatibility
window.performSimpleOCR = performSimpleOCR;
window.extractFDDataAdvanced = extractFDDataAdvanced;

console.log('[FD Manager Nepal] Enhanced OCR module loaded with PDF & JPEG support');