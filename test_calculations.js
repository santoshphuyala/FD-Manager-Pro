// Test script for FD Manager Pro interest calculations
// Run with: node test_calculations.js

// Mock the required functions and data
function calculateSimpleInterest(principal, rate, timeInMonths) {
    const timeInYears = timeInMonths / 12;
    return (principal * rate * timeInYears) / 100;
}

function calculateCompoundInterest(principal, rate, timeInMonths, frequency = 4) {
    const timeInYears = timeInMonths / 12;

    if (frequency === 0) {
        return calculateSimpleInterest(principal, rate, timeInMonths);
    }

    const ratePerPeriod = rate / (frequency * 100);
    const numberOfPeriods = frequency * timeInYears;

    const maturityAmount = principal * Math.pow(1 + ratePerPeriod, numberOfPeriods);
    return maturityAmount - principal;
}

function calculateDurationFromDates(fromDate, toDate) {
    const start = new Date(fromDate);
    const end = new Date(toDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

// Test cases
console.log('Testing Manual Interest Calculations for 10 and 20 Days...\n');

const principal = 100000;
const rate = 10;
const frequency = 4; // Quarterly

// Test 1: 10 days
console.log('=== 10 Days Calculation ===');
const days10 = 10;
const months10 = (days10 / 365) * 12;
console.log(`Days: ${days10}`);
console.log(`Months: ${months10.toFixed(6)}`);

const simple10 = calculateSimpleInterest(principal, rate, months10);
const compound10 = calculateCompoundInterest(principal, rate, months10, frequency);

console.log(`Simple Interest: ${simple10.toFixed(2)} NPR`);
console.log(`Compound Interest: ${compound10.toFixed(2)} NPR`);
console.log(`Maturity Amount: ${(principal + compound10).toFixed(2)} NPR\n`);

// Test 2: 20 days
console.log('=== 20 Days Calculation ===');
const days20 = 20;
const months20 = (days20 / 365) * 12;
console.log(`Days: ${days20}`);
console.log(`Months: ${months20.toFixed(6)}`);

const simple20 = calculateSimpleInterest(principal, rate, months20);
const compound20 = calculateCompoundInterest(principal, rate, months20, frequency);

console.log(`Simple Interest: ${simple20.toFixed(2)} NPR`);
console.log(`Compound Interest: ${compound20.toFixed(2)} NPR`);
console.log(`Maturity Amount: ${(principal + compound20).toFixed(2)} NPR\n`);

// Verification
console.log('=== Verification ===');
console.log('Expected for 10 days:');
console.log('Simple: ~274 NPR, Compound: ~271 NPR');
console.log('Expected for 20 days:');
console.log('Simple: ~548 NPR, Compound: ~543 NPR');
console.log('\nTest completed.');