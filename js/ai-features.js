// ===================================
// FD Manager Pro - AI Smart Features
// Smart Recognition, Validation & Notifications
// ===================================

class AISmartFeatures {
    constructor() {
        this.bankDatabase = this.initializeBankDatabase();
        this.userPatterns = this.loadUserPatterns();
        this.notificationHistory = this.loadNotificationHistory();
        this.settings = this.loadSettings();
        this.searchIndex = this.buildSearchIndex();
        this.initializeEventListeners();
    }

    loadSettings() {
        const stored = localStorage.getItem('fd_ai_settings');
        return stored ? JSON.parse(stored) : {
            smartRecognition: true,
            ratePrediction: true,
            formValidation: true,
            smartNotifications: true,
            notificationTiming: 'standard',
            browserNotifications: true,
            inAppNotifications: true
        };
    }

    updateSettings(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        localStorage.setItem('fd_ai_settings', JSON.stringify(this.settings));
    }

    initializeEventListeners() {
        // Initialize any event listeners if needed
        // For now, this is a placeholder to prevent errors
        console.log('[AI Features] Event listeners initialized');
    }

    buildSearchIndex() {
        // Build search index for natural language search
        // For now, return empty object - will be populated as needed
        return {
            banks: Object.keys(this.bankDatabase),
            terms: ['amount', 'rate', 'bank', 'holder', 'maturity', 'expiring', 'highest', 'lowest'],
            timeTerms: ['today', 'tomorrow', 'next week', 'next month', 'this week', 'this month']
        };
    }

    // ===================================
    // 1. Smart Bank Recognition & Rate Prediction
    // ===================================

    initializeBankDatabase() {
        return {
            'nepal investment bank': { 
                fullName: 'Nepal Investment Bank Limited', 
                typicalRates: { 3: 2.5, 6: 2.75, 12: 3.5, 24: 4.0 },
                confidence: 0.95
            },
            'nibl': { 
                fullName: 'Nepal Investment Bank Limited', 
                typicalRates: { 3: 2.5, 6: 2.75, 12: 3.5, 24: 4.0 },
                confidence: 0.90
            },
            'prime commercial bank': { 
                fullName: 'Prime Commercial Bank Limited', 
                typicalRates: { 3: 2.75, 6: 2.75, 12: 3.25, 24: 3.75 },
                confidence: 0.95
            },
            'siddhartha bank': { 
                fullName: 'Siddhartha Bank Limited', 
                typicalRates: { 3: 3.0, 6: 3.25, 12: 3.5, 24: 4.0 },
                confidence: 0.95
            },
            'laxmi sunrise bank': { 
                fullName: 'Laxmi Sunrise Bank Limited', 
                typicalRates: { 3: 2.75, 6: 3.0, 12: 3.25, 24: 3.75 },
                confidence: 0.95
            },
            'nmb bank': { 
                fullName: 'NMB Bank Limited', 
                typicalRates: { 3: 2.75, 6: 3.0, 12: 3.0, 24: 3.5 },
                confidence: 0.95
            },
            'sanima bank': { 
                fullName: 'Sanima Bank Limited', 
                typicalRates: { 3: 2.5, 6: 2.75, 12: 2.75, 24: 3.25 },
                confidence: 0.95
            },
            'global ime bank': { 
                fullName: 'Global IME Bank Limited', 
                typicalRates: { 3: 3.0, 6: 3.25, 12: 3.5, 24: 4.0 },
                confidence: 0.95
            },
            'nic asia bank': { 
                fullName: 'NIC Asia Bank Limited', 
                typicalRates: { 3: 2.75, 6: 3.0, 12: 3.25, 24: 3.75 },
                confidence: 0.95
            },
            'kumari bank': { 
                fullName: 'Kumari Bank Limited', 
                typicalRates: { 3: 2.5, 6: 2.75, 12: 3.0, 24: 3.5 },
                confidence: 0.95
            }
        };
    }

    async smartBankRecognition(input) {
        const normalizedInput = input.toLowerCase().trim();
        let bestMatch = null;
        let highestScore = 0;

        for (const [key, bank] of Object.entries(this.bankDatabase)) {
            let score = 0;
            
            // Exact match
            if (key === normalizedInput) score = 100;
            // Contains match
            else if (key.includes(normalizedInput) || normalizedInput.includes(key)) score = 80;
            // Fuzzy matching
            else {
                score = this.calculateFuzzyScore(normalizedInput, key);
            }

            // Boost score based on user history
            const userBoost = this.getUserBankPreference(bank.fullName);
            score += userBoost;

            if (score > highestScore && score > 30) {
                highestScore = score;
                bestMatch = bank;
            }
        }

        return bestMatch ? {
            ...bestMatch,
            confidence: Math.min(highestScore / 100, 1),
            matchScore: highestScore
        } : null;
    }

    calculateFuzzyScore(str1, str2) {
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 100.0;
        
        const editDistance = this.levenshteinDistance(longer, shorter);
        return ((longer.length - editDistance) / longer.length) * 100;
    }

    levenshteinDistance(str1, str2) {
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

    async predictInterestRate(bankName, duration, durationUnit, amount) {
        const bank = Object.values(this.bankDatabase).find(b => b.fullName === bankName);
        if (!bank) return null;

        // Convert duration to months for prediction
        const durationInMonths = durationUnit === 'Years' ? duration * 12 : 
                                durationUnit === 'Days' ? duration / 30 : duration;

        // Base rate from database
        let predictedRate = this.getClosestRate(bank.typicalRates, durationInMonths);
        
        // Adjust based on amount (higher amounts might get better rates)
        const amountAdjustment = this.getAmountRateAdjustment(amount);
        predictedRate += amountAdjustment;
        
        // Adjust based on user history
        const userAdjustment = this.getUserRateHistory(bankName, durationInMonths);
        predictedRate += userAdjustment;
        
        // Market trend adjustment (mock implementation)
        const marketAdjustment = await this.getMarketTrendAdjustment();
        predictedRate += marketAdjustment;

        return {
            rate: Math.round(predictedRate * 100) / 100,
            confidence: this.calculateRateConfidence(bank, durationInMonths, amount),
            factors: {
                baseRate: this.getClosestRate(bank.typicalRates, durationInMonths),
                amountAdjustment,
                userAdjustment,
                marketAdjustment
            }
        };
    }

    getClosestRate(rates, durationInMonths) {
        const durations = Object.keys(rates).map(Number).sort((a, b) => a - b);
        let closestDuration = durations[0];
        
        for (const duration of durations) {
            if (Math.abs(duration - durationInMonths) < Math.abs(closestDuration - durationInMonths)) {
                closestDuration = duration;
            }
        }
        
        return rates[closestDuration];
    }

    getAmountRateAdjustment(amount) {
        // Higher amounts might get slightly better rates
        if (amount >= 10000000) return 0.25; // 1 crore+
        if (amount >= 5000000) return 0.15;  // 50 lakh+
        if (amount >= 1000000) return 0.10;  // 10 lakh+
        return 0;
    }

    getUserRateHistory(bankName, duration) {
        // Analyze user's historical rates for this bank and duration
        const history = this.userPatterns.rateHistory?.[bankName]?.[duration] || [];
        if (history.length === 0) return 0;
        
        const avgUserRate = history.reduce((sum, rate) => sum + rate, 0) / history.length;
        const marketRate = this.getClosestRate(
            Object.values(this.bankDatabase).find(b => b.fullName === bankName)?.typicalRates || {},
            duration
        );
        
        return (avgUserRate - marketRate) * 0.3; // Partial adjustment based on user history
    }

    async getMarketTrendAdjustment() {
        // FIX: Original used Math.random() giving a different adjustment every call —
        // meaning the same bank/duration/amount could show a different "predicted rate"
        // on each keystroke. This made the prediction widget flicker and was
        // indistinguishable from noise. Return 0 until real market data is integrated.
        return 0;
    }

    calculateRateConfidence(bank, duration, amount) {
        let confidence = bank.confidence || 0.8;
        
        // Higher confidence for standard durations
        const standardDurations = [3, 6, 12, 24];
        if (standardDurations.includes(Math.round(duration))) {
            confidence += 0.1;
        }
        
        // Higher confidence for amounts the user typically uses
        const typicalAmounts = this.userPatterns.typicalAmounts || [];
        if (typicalAmounts.some(typical => Math.abs(typical - amount) / typical < 0.2)) {
            confidence += 0.05;
        }
        
        return Math.min(confidence, 0.95);
    }

    // ===================================
    // 2. AI-Powered Form Validation
    // ===================================

    async validateFDInput(formData) {
        const validationResults = {
            isValid: true,
            warnings: [],
            errors: [],
            suggestions: []
        };

        // Bank name validation
        const bankValidation = await this.validateBankName(formData.bank);
        if (bankValidation.error) validationResults.errors.push(bankValidation.error);
        if (bankValidation.warning) validationResults.warnings.push(bankValidation.warning);
        if (bankValidation.suggestion) validationResults.suggestions.push(bankValidation.suggestion);

        // Rate validation
        const rateValidation = await this.validateInterestRate(formData);
        if (rateValidation.error) validationResults.errors.push(rateValidation.error);
        if (rateValidation.warning) validationResults.warnings.push(rateValidation.warning);
        if (rateValidation.suggestion) validationResults.suggestions.push(rateValidation.suggestion);

        // Amount validation
        const amountValidation = this.validateAmount(formData.amount);
        if (amountValidation.error) validationResults.errors.push(amountValidation.error);
        if (amountValidation.warning) validationResults.warnings.push(amountValidation.warning);

        // Date validation
        const dateValidation = this.validateDates(formData.startDate, formData.maturityDate);
        if (dateValidation.error) validationResults.errors.push(dateValidation.error);
        if (dateValidation.warning) validationResults.warnings.push(dateValidation.warning);

        // Cross-reference validation
        const crossValidation = await this.crossReferenceValidation(formData);
        validationResults.warnings.push(...crossValidation.warnings);
        validationResults.suggestions.push(...crossValidation.suggestions);

        validationResults.isValid = validationResults.errors.length === 0;
        return validationResults;
    }

    async validateBankName(bankName) {
        if (!bankName || bankName.trim().length === 0) {
            return { error: 'Bank name is required' };
        }

        const recognition = await this.smartBankRecognition(bankName);
        if (!recognition) {
            return { 
                warning: 'Bank not recognized in our database',
                suggestion: 'Please check the bank name or select from suggestions'
            };
        }

        if (recognition.confidence < 0.7) {
            return {
                warning: `Did you mean "${recognition.fullName}"?`,
                suggestion: `We found a similar bank with ${Math.round(recognition.confidence * 100)}% confidence`
            };
        }

        return { valid: true };
    }

    async validateInterestRate(formData) {
        const { rate, bank, duration, durationUnit, amount } = formData;
        
        if (!rate || rate <= 0 || rate > 20) {
            return { error: 'Interest rate must be between 0% and 20%' };
        }

        // Compare with predicted rate
        const prediction = await this.predictInterestRate(bank, duration, durationUnit, amount);
        if (prediction) {
            const difference = Math.abs(rate - prediction.rate);
            if (difference > 2) {
                return {
                    warning: `Rate seems unusual for ${bank}`,
                    suggestion: `Expected rate: ${prediction.rate}% (confidence: ${Math.round(prediction.confidence * 100)}%)`
                };
            } else if (difference > 1) {
                return {
                    warning: 'Rate is slightly different from expected',
                    suggestion: `Expected: ${prediction.rate}%, but your rate may be correct`
                };
            }
        }

        return { valid: true };
    }

    validateAmount(amount) {
        if (!amount || amount <= 0) {
            return { error: 'Amount must be greater than 0' };
        }

        if (amount < 1000) {
            return { warning: 'Amount seems very low for an FD' };
        }

        if (amount > 100000000) { // 10 crore
            return { warning: 'Amount is very high - please double-check' };
        }

        // Check if amount follows typical user patterns
        const typicalAmounts = this.userPatterns.typicalAmounts || [];
        const isTypical = typicalAmounts.some(typical => Math.abs(typical - amount) / typical < 0.1);
        
        if (!isTypical && typicalAmounts.length > 0) {
            return {
                suggestion: `Your typical FD amounts: ${typicalAmounts.slice(0, 3).join(', ')}`
            };
        }

        return { valid: true };
    }

    validateDates(startDate, maturityDate) {
        if (!startDate || !maturityDate) {
            return { error: 'Both dates are required' };
        }

        const start    = new Date(startDate);
        const maturity = new Date(maturityDate);
        // FIX: Original code called today.setHours(0,0,0,0) which mutates the Date
        // object in-place and returns a timestamp number, not a Date. The subsequent
        // `start < today` comparison was therefore comparing a Date against a number,
        // which is unreliable across JS engines. Assign to a fresh variable instead.
        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);

        if (start > maturity) {
            return { error: 'Start date cannot be after maturity date' };
        }

        if (start < todayMidnight) {
            return { warning: 'Start date is in the past' };
        }

        const duration = (maturity - start) / (1000 * 60 * 60 * 24);
        if (duration < 7) {
            return { warning: 'Duration seems very short for an FD' };
        }

        if (duration > 3650) { // 10 years
            return { warning: 'Duration seems very long for an FD' };
        }

        return { valid: true };
    }

    async crossReferenceValidation(formData) {
        const warnings = [];
        const suggestions = [];
        const records = await this.getUserFDRecords();

        // Check for potential duplicates
        const similarRecords = records.filter(record => {
            return record.bank === formData.bank &&
                   Math.abs(new Date(record.startDate) - new Date(formData.startDate)) < 86400000 && // Within 1 day
                   Math.abs(record.amount - formData.amount) / formData.amount < 0.05; // Within 5%
        });

        if (similarRecords.length > 0) {
            warnings.push('Similar FD already exists');
            suggestions.push('Check existing records to avoid duplicates');
        }

        // Portfolio diversification check
        const bankConcentration = records.filter(r => r.bank === formData.bank).length;
        const totalRecords = records.length;
        
        if (totalRecords > 0 && bankConcentration / totalRecords > 0.6) {
            suggestions.push('Consider diversifying across different banks');
        }

        return { warnings, suggestions };
    }

    // ===================================
    // 3. Intelligent Notification Prioritization
    // ===================================

    async createSmartNotification(type, data) {
        // Check if notifications are enabled
        if (!this.settings.smartNotifications) return null;
        
        const notification = {
            id: this.generateNotificationId(),
            type,
            data,
            timestamp: new Date().toISOString(),
            priority: this.calculateNotificationPriority(type, data),
            message: this.generatePersonalizedMessage(type, data, this.calculateNotificationPriority(type, data)),
            actions: this.generateNotificationActions(type, data),
            read: false
        };
        
        // Store in history
        this.notificationHistory.unshift(notification);
        if (this.notificationHistory.length > 100) {
            this.notificationHistory = this.notificationHistory.slice(0, 100);
        }
        this.saveNotificationHistory();
        
        return notification;
    }

    // FIX: generateNotificationId() was defined twice in this class (here and
    // again at line ~1077). The second definition silently overwrote the first
    // on the prototype — always use the one definition here and remove the duplicate.
    generateNotificationId() {
        return 'notif_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    calculateNotificationPriority(type, data) {
        let basePriority = 50;
        let urgencyScore = 0;
        let importanceScore = 0;

        switch (type) {
            case 'maturity_reminder':
                const daysToMaturity = this.calculateDaysToMaturity(data.maturityDate);
                urgencyScore = Math.max(0, 100 - daysToMaturity * 2);
                importanceScore = data.amount > 1000000 ? 30 : 20;
                break;
                
            case 'rate_change':
                importanceScore = data.rateChange > 0.5 ? 40 : 25;
                urgencyScore = 30; // Rate changes are time-sensitive
                break;
                
            case 'portfolio_alert':
                importanceScore = data.severity === 'high' ? 50 : 30;
                urgencyScore = 20;
                break;
                
            case 'certificate_reminder':
                urgencyScore = data.daysOverdue > 7 ? 60 : 40;
                importanceScore = 25;
                break;
        }

        // User behavior adjustments
        const userEngagement = this.getUserEngagementScore(type);
        const timeOfDay = this.getTimeOfDayScore();

        return Math.min(100, basePriority + urgencyScore + importanceScore + userEngagement + timeOfDay);
    }

    calculateOptimalTiming(type, data) {
        const userPreferences = this.userPatterns.notificationPreferences || {};
        const now = new Date();
        
        // Default timing based on type
        let scheduledFor = new Date(now);
        
        switch (type) {
            case 'maturity_reminder':
                const daysToMaturity = this.calculateDaysToMaturity(data.maturityDate);
                if (daysToMaturity <= 7) {
                    scheduledFor.setHours(userPreferences.maturityHour || 9, 0, 0);
                } else if (daysToMaturity <= 30) {
                    scheduledFor.setDate(scheduledFor.getDate() + 1);
                    scheduledFor.setHours(userPreferences.maturityHour || 9, 0, 0);
                } else {
                    scheduledFor.setDate(scheduledFor.getDate() + 7);
                    scheduledFor.setHours(userPreferences.maturityHour || 9, 0, 0);
                }
                break;
                
            case 'rate_change':
                scheduledFor.setHours(userPreferences.marketHour || 18, 0, 0);
                break;
                
            default:
                scheduledFor.setHours(userPreferences.defaultHour || 10, 0, 0);
        }

        // Avoid weekends and late nights
        if (scheduledFor.getDay() === 0 || scheduledFor.getDay() === 6) {
            scheduledFor.setDate(scheduledFor.getDate() + 1); // Move to Monday
        }
        
        if (scheduledFor.getHours() < 8 || scheduledFor.getHours() > 20) {
            scheduledFor.setHours(10, 0, 0); // Move to business hours
        }

        return {
            scheduledFor,
            reason: this.getTimingReason(type, data, scheduledFor)
        };
    }

    generateNotificationActions(type, data) {
        const actions = [];

        switch (type) {
            case 'maturity_reminder':
                actions.push(
                    { label: 'View Details', action: 'view', primary: true },
                    { label: 'Set Renewal Reminder', action: 'renewal_reminder' },
                    { label: 'Snooze', action: 'snooze' }
                );
                break;
                
            case 'rate_change':
                actions.push(
                    { label: 'View Opportunities', action: 'view_opportunities', primary: true },
                    { label: 'Set Alert', action: 'set_alert' },
                    { label: 'Dismiss', action: 'dismiss' }
                );
                break;
                
            case 'certificate_reminder':
                actions.push(
                    { label: 'Mark as Collected', action: 'mark_collected', primary: true },
                    { label: 'Set Reminder', action: 'set_reminder' },
                    { label: 'Contact Bank', action: 'contact_bank' }
                );
                break;
        }

        return actions;
    }

    generatePersonalizedMessage(type, data, priority) {
        const user = this.userPatterns.userProfile || {};
        const formal = user.preferredTone === 'formal';
        
        switch (type) {
            case 'maturity_reminder':
                const amount = this.formatCurrency(data.amount);
                const days = this.calculateDaysToMaturity(data.maturityDate);
                
                if (days <= 3) {
                    return formal ? 
                        `URGENT: Your FD with ${data.bank} for ${amount} matures in ${days} day(s). Immediate action required.` :
                        `🚨 Alert! Your ${data.bank} FD of ${amount} matures in ${days} day(s)!`;
                } else if (days <= 7) {
                    return formal ?
                        `Reminder: Your FD with ${data.bank} for ${amount} matures in ${days} day(s). Please plan accordingly.` :
                        `⏰ Your ${data.bank} FD of ${amount} matures in ${days} days. Time to plan!`;
                } else {
                    return formal ?
                        `Your FD with ${data.bank} for ${amount} will mature in ${days} days.` :
                        `📅 Your ${data.bank} FD of ${amount} matures in ${days} days.`;
                }
                
            case 'rate_change':
                return formal ?
                    `Interest rate update for ${data.bank}: ${data.rateChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(data.rateChange)}%.` :
                    `📈 ${data.rateChange > 0 ? 'Good news!' : 'Update'}: ${data.bank} rates ${data.rateChange > 0 ? 'up' : 'down'} by ${Math.abs(data.rateChange)}%`;
                    
            case 'certificate_reminder':
                return formal ?
                    `Certificate collection reminder for your FD with ${data.bank}. Overdue by ${data.daysOverdue} day(s).` :
                    `📋 Time to collect your certificate from ${data.bank}! (${data.daysOverdue} days overdue)`;
                    
            default:
                return 'FD Manager Pro notification';
        }
    }

    // Helper function for currency formatting
    formatCurrency(amount) {
        if (amount === null || amount === undefined || isNaN(amount)) {
            return 'NRs 0';
        }
        return 'NRs ' + amount.toLocaleString('en-IN', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
    }

    // ===================================
    // 5. AI Portfolio Insights
    // ===================================

    async generatePortfolioInsights(records) {
        const insights = [];
        // FIX: If records is empty, records.length is 0 — dividing produces NaN
        // which then propagates silently through every avgRate comparison below,
        // causing all insight branches to produce wrong/missing output.
        if (!records || records.length === 0) {
            insights.push({
                type: 'info',
                title: '📋 No Records',
                message: 'Add FD records to see portfolio insights.'
            });
            return insights;
        }
        const totalInvestment = records.reduce((sum, r) => sum + (r.amount || 0), 0);
        const avgRate = records.reduce((sum, r) => sum + (r.rate || 0), 0) / records.length;
        
        // Bank concentration analysis
        const bankAnalysis = this.analyzeBankConcentration(records);
        if (bankAnalysis.risk) {
            insights.push({
                type: 'warning',
                title: '🏦 Bank Concentration Risk',
                message: bankAnalysis.message
            });
        }
        
        // Rate analysis
        const rateAnalysis = this.analyzeInterestRates(records, avgRate);
        insights.push(...rateAnalysis);
        
        // Maturity clustering analysis
        const maturityAnalysis = this.analyzeMaturityClustering(records);
        insights.push(...maturityAnalysis);
        
        // Investment pattern analysis
        const patternAnalysis = this.analyzeInvestmentPatterns(records);
        insights.push(...patternAnalysis);
        
        // Market comparison
        const marketAnalysis = this.compareWithMarket(records, avgRate);
        insights.push(...marketAnalysis);
        
        return insights;
    }

    analyzeBankConcentration(records) {
        const bankCounts = {};
        const bankAmounts = {};
        
        records.forEach(r => {
            bankCounts[r.bank] = (bankCounts[r.bank] || 0) + 1;
            bankAmounts[r.bank] = (bankAmounts[r.bank] || 0) + r.amount;
        });
        
        const totalAmount = Object.values(bankAmounts).reduce((sum, amount) => sum + amount, 0);
        const topBank = Object.entries(bankAmounts).sort((a, b) => b[1] - a[1])[0];
        
        if (topBank && topBank[1] > totalAmount * 0.6) {
            const percentage = Math.round((topBank[1] / totalAmount) * 100);
            return {
                risk: true,
                message: `${topBank[0]} holds ${this.formatCurrency(topBank[1])} (${percentage}%) of your total investment. Consider diversifying across multiple banks for better safety.`
            };
        }
        
        return { risk: false };
    }

    analyzeInterestRates(records, avgRate) {
        const insights = [];
        
        if (avgRate < 7) {
            insights.push({
                type: 'warning',
                title: '📊 Below Market Rates',
                message: `Your average rate is ${avgRate.toFixed(2)}%, which is below current market averages. Consider negotiating better rates or exploring other banks.`
            });
        } else if (avgRate > 12) {
            insights.push({
                type: 'success',
                title: '🎯 Excellent Rate Strategy',
                message: `Your average rate of ${avgRate.toFixed(2)}% is exceptional! You're maximizing your returns effectively.`
            });
        } else {
            insights.push({
                type: 'info',
                title: '📈 Competitive Rates',
                message: `Your average rate of ${avgRate.toFixed(2)}% is competitive with current market conditions.`
            });
        }
        
        return insights;
    }

    analyzeMaturityClustering(records) {
        const insights = [];
        const maturities = records.map(r => new Date(r.maturityDate));
        
        // Check for maturity clustering
        const clusters = this.findMaturityClusters(maturities);
        if (clusters.length > 0) {
            insights.push({
                type: 'info',
                title: '📅 Maturity Clustering Detected',
                message: `${clusters.length} FD(s) maturing within the same timeframe. Consider staggering renewals for better liquidity management.`
            });
        }
        
        // Check for upcoming maturities
        const upcoming = records.filter(r => {
            const days = this.calculateDaysToMaturity(r.maturityDate);
            return days !== null && days <= 90;
        });
        
        if (upcoming.length > 0) {
            const totalUpcoming = upcoming.reduce((sum, r) => sum + r.amount, 0);
            insights.push({
                type: 'warning',
                title: '⏰ Upcoming Maturities',
                message: `${upcoming.length} FD(s) totaling ${this.formatCurrency(totalUpcoming)} maturing in the next 90 days. Plan your renewal strategy.`
            });
        }
        
        return insights;
    }

    analyzeInvestmentPatterns(records) {
        const insights = [];
        const amounts = records.map(r => r.amount);
        const avgAmount = amounts.reduce((sum, a) => sum + a, 0) / amounts.length;
        
        // Check investment size patterns
        const largeInvestments = records.filter(r => r.amount > 5000000);
        if (largeInvestments.length > 0) {
            insights.push({
                type: 'info',
                title: '💰 Large Investment Strategy',
                message: `You have ${largeInvestments.length} investment(s) above 50 lakh. Consider breaking them into smaller FDs for better flexibility and DICGC coverage.`
            });
        }
        
        // Check investment frequency
        if (records.length > 10) {
            insights.push({
                type: 'success',
                title: '🎯 Diversified Portfolio',
                message: `Your portfolio of ${records.length} FDs shows good diversification. Keep monitoring for optimization opportunities.`
            });
        }
        
        return insights;
    }

    compareWithMarket(records, avgRate) {
        const insights = [];
        
        // Simulated market rates (in real implementation, this would fetch from API)
        const marketRates = {
            '1_year': 8.5,
            '2_year': 9.2,
            '3_year': 10.1,
            '5_year': 11.3
        };
        
        // Compare average rates with market
        if (avgRate < marketRates['3_year']) {
            insights.push({
                type: 'info',
                title: '📊 Market Comparison',
                message: `Current market rates for 3-year FDs are around ${marketRates['3_year']}%. Your portfolio could potentially earn higher rates.`
            });
        }
        
        return insights;
    }

    findMaturityClusters(maturities) {
        const clusters = [];
        const sortedDates = maturities.sort((a, b) => a - b);
        
        for (let i = 0; i < sortedDates.length - 1; i++) {
            const daysDiff = (sortedDates[i + 1] - sortedDates[i]) / (1000 * 60 * 60 * 24);
            if (daysDiff <= 30) { // Within 30 days is considered a cluster
                clusters.push([sortedDates[i], sortedDates[i + 1]]);
            }
        }
        
        return clusters;
    }

    // ===================================
    // 4. Natural Language Search
    // ===================================

    async naturalLanguageSearch(query) {
        const parsedQuery = this.parseNaturalLanguageQuery(query);
        const results = await this.executeSearch(parsedQuery);
        
        return {
            query,
            parsed: parsedQuery,
            results,
            suggestions: this.generateSearchSuggestions(query, results),
            totalCount: results.length
        };
    }

    parseNaturalLanguageQuery(query) {
        const parsed = {
            filters: {},
            sort: null,
            limit: null,
            entities: this.extractEntities(query)
        };

        // FIX: The time expression values called today(), tomorrow(), addDays(),
        // addMonths() eagerly at the moment the object literal was evaluated (once
        // per parseNaturalLanguageQuery call). That means 'today' was always the date
        // the search was *first* run, not the actual current date. Wrapping them as
        // thunks (functions) and calling them lazily below fixes the stale-date bug
        // and avoids any ReferenceError if the helpers are not yet defined.
        const timeExpressions = {
            'today':        () => ({ startDate: today(),     endDate: today() }),
            'tomorrow':     () => ({ startDate: tomorrow(),  endDate: tomorrow() }),
            'next week':    () => ({ startDate: addDays(7),  endDate: addDays(14) }),
            'next month':   () => ({ startDate: addMonths(1),endDate: addMonths(2) }),
            'maturing':     () => ({ filter: 'maturity_date', operator: '>', value: today() }),
            'expired':      () => ({ filter: 'maturity_date', operator: '<', value: today() }),
            'expiring soon':() => ({ filter: 'maturity_date', operator: '<', value: addDays(30) })
        };

        for (const [expression, getCriteria] of Object.entries(timeExpressions)) {
            if (query.toLowerCase().includes(expression)) {
                const criteria = getCriteria();
                if (criteria.filter) {
                    parsed.filters[criteria.filter] = { operator: criteria.operator, value: criteria.value };
                } else {
                    parsed.filters.date_range = criteria;
                }
            }
        }

        // Extract amount expressions
        const amountMatches = query.match(/(\d+)\s*(lakh|crore|thousand|million)/i);
        if (amountMatches) {
            const amount = this.parseAmount(amountMatches[1], amountMatches[2]);
            parsed.filters.amount = { operator: '>', value: amount };
        }

        // Extract bank names
        for (const bankKey of Object.keys(this.bankDatabase)) {
            if (query.toLowerCase().includes(bankKey)) {
                parsed.filters.bank = this.bankDatabase[bankKey].fullName;
                break;
            }
        }

        // Extract account holders
        const holders = this.extractAccountHolders(query);
        if (holders.length > 0) {
            parsed.filters.accountHolder = { $in: holders };
        }

        // Extract sort instructions
        if (query.toLowerCase().includes('highest') || query.toLowerCase().includes('top')) {
            parsed.sort = { field: 'amount', order: 'desc' };
        } else if (query.toLowerCase().includes('lowest') || query.toLowerCase().includes('bottom')) {
            parsed.sort = { field: 'amount', order: 'asc' };
        } else if (query.toLowerCase().includes('recent')) {
            parsed.sort = { field: 'createdAt', order: 'desc' };
        }

        // Extract limit
        const limitMatch = query.match(/top\s+(\d+)|first\s+(\d+)|show\s+(\d+)/i);
        if (limitMatch) {
            parsed.limit = parseInt(limitMatch[1] || limitMatch[2] || limitMatch[3]);
        }

        return parsed;
    }

    extractEntities(query) {
        const entities = {
            banks: [],
            amounts: [],
            dates: [],
            holders: []
        };

        // Extract banks
        for (const [key, bank] of Object.entries(this.bankDatabase)) {
            if (query.toLowerCase().includes(key)) {
                entities.banks.push(bank.fullName);
            }
        }

        // Extract amounts
        const amountPattern = /(\d+(?:\.\d+)?)\s*(lakh|crore|thousand|million|rs|nrs)?/gi;
        let match;
        while ((match = amountPattern.exec(query)) !== null) {
            entities.amounts.push({
                value: parseFloat(match[1]),
                unit: match[2] || 'rs'
            });
        }

        // Extract dates
        const datePattern = /(\d{1,2}[-/]\d{1,2}[-/]\d{4}|\d{4}[-/]\d{1,2}[-/]\d{1,2})/g;
        while ((match = datePattern.exec(query)) !== null) {
            entities.dates.push(new Date(match[1]));
        }

        return entities;
    }

    async executeSearch(parsedQuery) {
        let records = await this.getUserFDRecords();
        let maturedRecords = await this.getUserMaturedRecords();
        // FIX: was `const allRecords` but the variable is reassigned inside the
        // filter loop below — `const` throws a TypeError in strict mode. Use `let`.
        let allRecords = [...records, ...maturedRecords];

        // Apply filters
        for (const [field, criteria] of Object.entries(parsedQuery.filters)) {
            if (field === 'date_range') {
                allRecords = allRecords.filter(record => {
                    const recordDate = new Date(record.maturityDate);
                    return recordDate >= criteria.startDate && recordDate <= criteria.endDate;
                });
            } else if (typeof criteria === 'object' && criteria.operator) {
                allRecords = this.applyFilter(allRecords, field, criteria);
            } else {
                allRecords = allRecords.filter(record => record[field] === criteria);
            }
        }

        // Apply sorting
        if (parsedQuery.sort) {
            allRecords.sort((a, b) => {
                const aVal = a[parsedQuery.sort.field];
                const bVal = b[parsedQuery.sort.field];
                return parsedQuery.sort.order === 'desc' ? bVal - aVal : aVal - bVal;
            });
        }

        // Apply limit
        if (parsedQuery.limit) {
            allRecords = allRecords.slice(0, parsedQuery.limit);
        }

        return allRecords;
    }

    applyFilter(records, field, criteria) {
        return records.filter(record => {
            const value = record[field];
            switch (criteria.operator) {
                case '>': return value > criteria.value;
                case '<': return value < criteria.value;
                case '>=': return value >= criteria.value;
                case '<=': return value <= criteria.value;
                case '$in': return criteria.value.includes(value);
                default: return value === criteria.value;
            }
        });
    }

    generateSearchSuggestions(originalQuery, results) {
        const suggestions = [];

        if (results.length === 0) {
            suggestions.push('Try using different keywords');
            suggestions.push('Check spelling of bank names');
            suggestions.push('Use broader search terms');
        } else if (results.length < 5) {
            suggestions.push('Try removing some filters');
            suggestions.push('Search for similar banks');
        } else {
            suggestions.push(`Found ${results.length} results. Add more filters to narrow down.`);
        }

        return suggestions;
    }

    // ===================================
    // Helper Functions
    // ===================================

    loadUserPatterns() {
        const stored = localStorage.getItem('fd_ai_patterns');
        return stored ? JSON.parse(stored) : {
            rateHistory: {},
            typicalAmounts: [],
            notificationPreferences: {},
            userProfile: {},
            searchHistory: []
        };
    }

    saveUserPatterns() {
        localStorage.setItem('fd_ai_patterns', JSON.stringify(this.userPatterns));
    }

    loadNotificationHistory() {
        const stored = localStorage.getItem('fd_notification_history');
        return stored ? JSON.parse(stored) : [];
    }

    saveNotificationHistory() {
        localStorage.setItem('fd_notification_history', JSON.stringify(this.notificationHistory));
    }

    async getUserFDRecords() {
        if (typeof getData === 'function') {
            return await getData('fd_records') || [];
        }
        return [];
    }

    async getUserMaturedRecords() {
        if (typeof getData === 'function') {
            return await getData('fd_matured_records') || [];
        }
        return [];
    }

    getUserBankPreference(bankName) {
        const history = this.userPatterns.rateHistory[bankName];
        if (!history || history.length === 0) return 0;
        return Math.min(history.length * 2, 20); // Up to 20 points boost
    }

    getUserEngagementScore(type) {
        const history = this.userPatterns.notificationHistory?.filter(n => n.type === type) || [];
        const engagement = history.filter(n => n.userAction === 'clicked' || n.userAction === 'acted').length;
        return Math.min(engagement * 5, 15);
    }

    getTimeOfDayScore() {
        const hour = new Date().getHours();
        if (hour >= 9 && hour <= 11) return 10; // Morning peak
        if (hour >= 14 && hour <= 16) return 5;  // Afternoon
        if (hour >= 18 && hour <= 20) return 8;  // Evening
        return 0;
    }

    calculateDaysToMaturity(maturityDate) {
        const today = new Date();
        const maturity = new Date(maturityDate);
        const diffTime = maturity - today;
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    getTimingReason(type, data, scheduledFor) {
        return `Scheduled for optimal engagement time based on your patterns`;
    }

    parseAmount(value, unit) {
        const multipliers = {
            'thousand': 1000,
            'lakh': 100000,
            'million': 1000000,
            'crore': 10000000
        };
        return value * (multipliers[unit.toLowerCase()] || 1);
    }

    extractAccountHolders(query) {
        // This would need to be integrated with actual account holder data
        const holders = [];
        // Mock implementation - in real version, this would search actual holder names
        return holders;
    }

    buildSearchIndex() {
        // Build search index for faster searching
        return {};
    }
}

// Utility functions
function today() {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
}

function tomorrow() {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(0, 0, 0, 0);
    return date;
}

function addDays(days) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
}

function addMonths(months) {
    const date = new Date();
    date.setMonth(date.getMonth() + months);
    return date;
}

// Initialize global AI features instance with error handling
let aiFeatures;
try {
    aiFeatures = new AISmartFeatures();
    console.log('[AI Features] Successfully initialized');
} catch (error) {
    console.error('[AI Features] Failed to initialize:', error);
    aiFeatures = null;
}