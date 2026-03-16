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
        // Handle PDF files differently
        if (file.type === 'application/pdf') {
            // For PDFs, return a default thumbnail or skip
            resolve('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
            return;
        }
        
        // Handle invalid or empty files
        if (!file || file.size === 0) {
            resolve('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==');
            return;
        }
        
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const img = new Image();
        
        // Add timeout for image loading
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('Thumbnail generation timeout'));
        }, 5000); // Reduced timeout
        
        const cleanup = () => {
            if (img.src && img.src.startsWith('blob:')) {
                URL.revokeObjectURL(img.src);
            }
            clearTimeout(timeout);
        };
        
        img.onload = () => {
            cleanup();
            try {
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
                
            } catch (error) {
                reject(new Error('Failed to generate thumbnail: ' + error.message));
            }
        };
        
        img.onerror = () => {
            cleanup();
            reject(new Error('Failed to load image for thumbnail'));
        };
        
        // Handle different file types
        try {
            if (file instanceof Blob) {
                img.src = URL.createObjectURL(file);
            } else if (typeof file === 'string') {
                img.src = file;
            } else {
                reject(new Error('Invalid file type for thumbnail generation'));
            }
        } catch (error) {
            cleanup();
            reject(new Error('Failed to process file for thumbnail: ' + error.message));
        }
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
                        logger: m => {
                            if (m.status === 'recognizing text' && m.progress % 0.25 === 0) {
                                console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
                            }
                        },
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
        
        if (bestResult && bestResult.confidence > 15) {
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
 * Calculate maturity date from start date and duration
 */
function calculateMaturityDate(startDate, durationInfo) {
    try {
        if (!startDate || !durationInfo || !durationInfo.duration) {
            return null;
        }
        
        const start = new Date(startDate);
        if (isNaN(start)) {
            return null;
        }
        
        const duration = durationInfo.duration;
        const unit = durationInfo.unit || 'Months';
        
        let maturity = new Date(start);
        
        if (unit === 'Years') {
            maturity.setFullYear(maturity.getFullYear() + duration);
        } else if (unit === 'Months') {
            maturity.setMonth(maturity.getMonth() + duration);
        }
        
        // Format as YYYY-MM-DD
        const year = maturity.getFullYear();
        const month = String(maturity.getMonth() + 1).padStart(2, '0');
        const day = String(maturity.getDate()).padStart(2, '0');
        
        return `${year}-${month}-${day}`;
    } catch (error) {
        console.error('Error calculating maturity date:', error);
        return null;
    }
}

/**
 * Extract FD data from OCR result with enhanced patterns
 */
function extractFDDataFromOCR(ocrResult) {
    const text = ocrResult.text;
    const confidence = ocrResult.confidence;
    
    // console.log('OCR Text:', text);
    // console.log('OCR Confidence:', confidence);
    
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
    
    // Auto-calculate maturity date if missing but start date and duration are available
    if (!extractedData.maturityDate && extractedData.startDate && extractedData.duration) {
        const calculatedMaturity = calculateMaturityDate(extractedData.startDate, extractedData.duration);
        if (calculatedMaturity) {
            extractedData.maturityDate = calculatedMaturity;
            extractedData.maturityDateCalculated = true;
            // console.log('Auto-calculated maturity date:', calculatedMaturity);
        }
    }
    
    // Validate and enhance with AI
    const validation = validateAndSuggest(extractedData);
    extractedData.validation = validation;
    
    return extractedData;
}

/**
 * Extract bank name from text with enhanced fuzzy logic for all Nepal commercial banks
 */
function extractBankNameEnhanced(text) {
    const textLower = text.toLowerCase();
    
    // Priority 1: Check for exact patterns from bankPatterns first
    for (const pattern of bankPatterns) {
        if (pattern.pattern.test(text)) {
            // console.log('Found bank via exact pattern:', pattern.name);
            return pattern.name;
        }
    }
    
    // Priority 2: Comprehensive fuzzy matching for all Nepal commercial banks
    const bankVariations = {
        'Nepal Bank Limited': ['nepal bank', 'nbl', 'nepal bank ltd', 'nepal bank limited'],
        'Rastriya Banijya Bank': ['rastriya banijya', 'rbb', 'rastriya', 'banijya bank', 'rashtriya banijya'],
        'Agriculture Development Bank': ['agriculture bank', 'adbl', 'agriculture development', 'agri bank', 'adb'],
        'Nabil Bank Limited': ['nabil', 'nabil bank', 'nabil ltd'],
        'Nepal Investment Bank Limited': ['nepal investment', 'nibl', 'investment bank', 'nibl bank'],
        'Standard Chartered Bank Nepal': ['standard chartered', 'scb', 'chartered bank', 'standard bank'],
        'Himalayan Bank Limited': ['himalayan', 'hbl', 'himalaya bank'],
        'Nepal SBI Bank Limited': ['nepal sbi', 'sbi', 'nsbi', 'sbi bank', 'state bank'],
        'Nepal Bangladesh Bank Limited': ['nepal bangladesh', 'nbb', 'bangladesh bank', 'nbb bank'],
        'Everest Bank Limited': ['everest', 'ebl', 'everest bank'],
        'Kumari Bank Limited': ['kumari', 'kumari bank', 'kbl'],
        'Laxmi Sunrise Bank Limited': ['laxmi sunrise', 'laxmi', 'sunrise bank', 'laxmi bank', 'sunrise', 'laxmi sunrise bank'],
        'Citizens Bank International Limited': ['citizens bank', 'citizens', 'citizens international', 'cbl'],
        'Prime Commercial Bank Limited': ['prime commercial', 'prime bank', 'prime', 'pcbl'],
        'Sunrise Bank Limited': ['sunrise', 'sunrise bank', 'sbl'],
        'Century Commercial Bank Limited': ['century commercial', 'century bank', 'century', 'ccbl'],
        'Sanima Bank Limited': ['sanima', 'sanima bank', 'sbl'],
        'Machhapuchchhre Bank Limited': ['machhapuchchhre', 'machhapuchhre bank', 'machapuchhre', 'mbl'],
        'NIC Asia Bank Limited': ['nic asia', 'nicasia', 'nic', 'nic bank'],
        'Global IME Bank Limited': ['global ime', 'gibl', 'global bank', 'ime bank', 'global'],
        'NMB Bank Limited': ['nmb', 'nmb bank', 'nmb limited'],
        'Prabhu Bank Limited': ['prabhu', 'prabhu bank', 'pbl'],
        'Siddhartha Bank Limited': ['siddhartha', 'siddhartha bank', 'sbl'],
        'Bank of Kathmandu Limited': ['bank of kathmandu', 'bok', 'bokl', 'kathmandu bank'],
        'Civil Bank Limited': ['civil', 'civil bank', 'cbl'],
        'Nepal Credit and Commerce Bank Limited': ['nepal credit', 'ncc', 'ncc bank', 'credit commerce', 'nepal commerce'],
        
        // Additional variations and common OCR errors
        'Laxmi Bank Limited': ['laxmi', 'laxmi bank', 'l bavik', 'shrgx', 'l bavik it', 'laksami', 'laxmi bak', 'laxmi bnk']
    };
    
    // Check each bank's variations
    for (const [bankName, variations] of Object.entries(bankVariations)) {
        for (const variation of variations) {
            if (textLower.includes(variation)) {
                // console.log('Found bank via variation:', bankName, 'matched:', variation);
                return bankName;
            }
        }
    }
    
    // Priority 3: Advanced fuzzy matching with word proximity and partial matching
    const words = textLower.split(/\s+/).filter(word => word.length > 2);
    
    for (const bank of bankDatabase) {
        const bankWords = bank.toLowerCase().split(/\s+/);
        let matchCount = 0;
        let totalWords = 0;
        let proximityScore = 0;
        
        for (const bankWord of bankWords) {
            if (bankWord.length < 3) continue;
            totalWords++;
            
            for (let i = 0; i < words.length; i++) {
                const word = words[i];
                
                // Exact or partial matching
                if (word.includes(bankWord) || bankWord.includes(word)) {
                    matchCount++;
                    break;
                }
                
                // Check for partial matches (first 3+ characters)
                if (word.length >= 3 && bankWord.length >= 3) {
                    const wordPartial = word.substring(0, Math.min(4, word.length));
                    const bankPartial = bankWord.substring(0, Math.min(4, bankWord.length));
                    if (wordPartial === bankPartial) {
                        matchCount += 0.5; // Partial match gets half weight
                        break;
                    }
                }
                
                // Check for word proximity (words appearing close to each other)
                if (word.length >= 2 && bankWord.length >= 2) {
                    const similarity = calculateSimilarity(word, bankWord);
                    if (similarity > 0.6) {
                        proximityScore += similarity;
                        break;
                    }
                }
            }
        }
        
        // Calculate final score
        const finalScore = matchCount + (proximityScore * 0.3);
        const threshold = Math.max(1, totalWords * 0.3); // Lower threshold for better matching
        
        if (finalScore >= threshold) {
            // console.log('Found bank via advanced fuzzy matching:', bank, 'score:', finalScore.toFixed(2), 'threshold:', threshold);
            return bank;
        }
    }
    
    return '';
}

/**
 * Calculate string similarity for fuzzy matching
 */
function calculateSimilarity(str1, str2) {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;
    
    if (longer.length === 0) return 1.0;
    
    const editDistance = levenshteinDistance(longer, shorter);
    return (longer.length - editDistance) / longer.length;
}

/**
 * Calculate Levenshtein distance for string similarity
 */
function levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
        matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
        matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
        for (let j = 1; j <= str1.length; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    
    return matrix[str2.length][str1.length];
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
 * Extract duration from text with enhanced patterns
 */
function extractDurationEnhanced(text) {
    const patterns = [
        /(\d+)\s*(?:months?)/gi,
        /(\d+)\s*(?:years?)/gi,
        /period\s*of\s*(\d+)\s*(?:months?)/gi,
        /for\s*(\d+)\s*(?:months?)/gi,
        /(\d+)\s*-\s*month/gi,
        /(\d+)\s*-\s*year/gi
    ];
    
    for (const pattern of patterns) {
        const matches = [...text.matchAll(pattern)];
        for (const match of matches) {
            const num = parseInt(match[1]);
            const isYear = /year/i.test(match[0]);
            
            if (num > 0 && num <= 120) { // Reasonable range
                return {
                    duration: num,
                    unit: isYear ? 'Years' : 'Months'
                };
            }
        }
    }
    
    // Fallback to basic function
    return extractDuration(text);
}

/**
 * Extract date from text with enhanced patterns
 */
function extractDateEnhanced(text) {
    const dates = extractDatesAdvanced(text);
    return dates.length > 0 ? dates[0] : '';
}

/**
 * Extract maturity date from text with enhanced patterns
 */
function extractMaturityDateEnhanced(text) {
    const dates = extractDatesAdvanced(text);
    
    // Look for maturity-specific patterns
    const maturityPatterns = [
        /maturity\s*date[:\s]*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/gi,
        /date\s*of\s*maturity[:\s]*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/gi,
        /due\s*date[:\s]*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/gi
    ];
    
    for (const pattern of maturityPatterns) {
        const matches = [...text.matchAll(pattern)];
        for (const match of matches) {
            const date = match[1];
            // Convert to standard format
            const parts = date.split(/[\/\-]/);
            if (parts.length === 3) {
                let year, month, day;
                if (parts[2].length === 4) {
                    day = parts[0];
                    month = parts[1];
                    year = parts[2];
                } else {
                    year = parts[0];
                    month = parts[1];
                    day = parts[2];
                }
                return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
            }
        }
    }
    
    // Return second date if available (usually maturity date)
    return dates.length > 1 ? dates[1] : '';
}

/**
 * Extract account holder name from text with enhanced patterns
 */
function extractHolderEnhanced(text) {
    const patterns = [
        /(?:from|depositor|account\s*holder|customer)[:\s]*([A-Z][a-z\s]+(?:Ltd|Limited|Pvt|Private)?)/gi,
        /(?:MS|Mr|Mrs|Dr)\s*([A-Z][a-z\s]+(?:Ltd|Limited)?)/gi,
        /([A-Z][A-Z\s]{5,}(?:LTD|LIMITED)?)(?=\s+(?:Fixed|Deposit|FD))/gi
    ];
    
    for (const pattern of patterns) {
        const matches = [...text.matchAll(pattern)];
        for (const match of matches) {
            const holder = match[1].trim();
            if (holder.length > 3 && holder.length < 100 && !/^\d+$/.test(holder)) {
                return holder;
            }
        }
    }
    
    return '';
}

/**
 * Extract certificate number from text with enhanced patterns
 */
function extractCertificateNumberEnhanced(text) {
    const patterns = [
        /(?:FD|Fixed\s*Deposit|Certificate)\s*No[:\s]*([0-9A-Za-z\-]+)/gi,
        /(?:Certificate|Receipt)\s*No[:\s]*([0-9A-Za-z\-]+)/gi,
        /(?:Account|FD)\s*Number[:\s]*([0-9A-Za-z\-]+)/gi,
        /\b([0-9]{8,})\b/g
    ];
    
    for (const pattern of patterns) {
        const matches = [...text.matchAll(pattern)];
        for (const match of matches) {
            const certNum = match[1].trim();
            if (certNum.length >= 6 && certNum.length <= 20) {
                return certNum;
            }
        }
    }
    
    return '';
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
 * Extract bank name from text (advanced version)
 */
function extractBankNameAdvanced(text) {
    // Use enhanced version if available, otherwise basic
    if (typeof extractBankNameEnhanced === 'function') {
        return extractBankNameEnhanced(text);
    }
    
    // Basic pattern matching as fallback
    const banks = [
        'Laxmi Bank', 'Nepal Bank', 'Rastriya Banijya Bank', 'Nabil Bank',
        'Standard Chartered Bank', 'Himalayan Bank', 'Siddhartha Bank',
        'Agriculture Development Bank', 'Prabhu Bank', 'Kumari Bank'
    ];
    
    for (const bank of banks) {
        if (text.toLowerCase().includes(bank.toLowerCase())) {
            return bank;
        }
    }
    
    return '';
}

/**
 * Extract amount from text (advanced version)
 */
function extractAmountAdvanced(text) {
    // Use enhanced version if available, otherwise basic
    if (typeof extractAmountEnhanced === 'function') {
        return extractAmountEnhanced(text);
    }
    
    // Basic amount extraction
    const patterns = [
        /(?:NRs|Rs|NPR)\s*([0-9,]+(?:\.[0-9]{1,2})?)/gi,
        /([0-9,]+(?:\.[0-9]{1,2})?)\s*(?:NRs|Rs|NPR)/gi
    ];
    
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            const amount = parseFloat(match[1].replace(/,/g, ''));
            if (amount >= 1000 && amount <= 100000000) {
                return amount;
            }
        }
    }
    
    return 0;
}

/**
 * Extract interest rate from text (advanced version)
 */
function extractRateAdvanced(text) {
    // Use enhanced version if available, otherwise basic
    if (typeof extractRateEnhanced === 'function') {
        return extractRateEnhanced(text);
    }
    
    // Basic rate extraction
    const patterns = [
        /([0-9]+\.?[0-9]*)\s*%/gi,
        /(?:Rate|Interest)[:\s]*([0-9]+\.?[0-9]*)\s*%/gi
    ];
    
    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            const rate = parseFloat(match[1]);
            if (rate >= 3 && rate <= 20) {
                return rate;
            }
        }
    }
    
    return 0;
}

/**
 * Extract all FD data from OCR text
 */
function extractFDDataAdvanced(text) {
    // console.log('=== OCR Extracted Text ===');
    // console.log(text);
    // console.log('========================');
    
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
        
        // console.log('Certificate saved:', certificateData.id);
        
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

// console.log('[FD Manager Nepal] Enhanced OCR module loaded with PDF & JPEG support');
