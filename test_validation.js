const assert = require('assert');
const XLSX = require('xlsx');
const LoanCleaner = require('./cleaner');

console.log("Running Internovo Loan Cleaner Automated Test Suite...\n");

// Read sample workbook
const wb = XLSX.readFile('Branch_Loan_Register_Sample.xlsx');
const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
const results = LoanCleaner.cleanLoanDataset(rawRows);

assert.strictEqual(results.length, 18, "Should process all 18 rows");

// Test 1: Ramesh Kumar (Row 2 in Excel)
const ramesh1 = results[0];
assert.strictEqual(ramesh1.branch, "Andheri");
assert.strictEqual(ramesh1.customer_name, "Ramesh Kumar");
assert.strictEqual(ramesh1.loan_amount, 50000);
assert.strictEqual(ramesh1.loan_date, "2025-03-12");
assert.strictEqual(ramesh1.phone, "9876543210");
assert.strictEqual(ramesh1.status, "Active");
assert.strictEqual(ramesh1.statusCategory, "CLEAN");
console.log("✓ Test 1 Passed: Currency symbol & comma cleaned for Ramesh Kumar (₹50,000 -> 50000, 12/03/2025 -> 2025-03-12)");

// Test 2: Sunita Patil (Row 3 in Excel)
const sunita = results[1];
assert.strictEqual(sunita.branch, "Andheri"); // Normalized from "ANDHERI BR"
assert.strictEqual(sunita.loan_date, "2025-03-05"); // Normalized from "March 5, 2025"
assert.strictEqual(sunita.phone, "9876543210"); // Normalized from "+91-98765-43210"
assert.strictEqual(sunita.status, "Active"); // Normalized from "ACTIVE"
console.log("✓ Test 2 Passed: 'ANDHERI BR', 'March 5, 2025', '+91-98765-43210', 'ACTIVE' normalized successfully");

// Test 3: R. Kumar (Row 4 in Excel) - Rule 1 & Rule 2
const rkumar = results[2];
assert.strictEqual(rkumar.statusCategory, "ERROR");
assert(rkumar.issues.some(i => i.code === 'PHONE_MISSING'), "Should flag missing phone");
assert(rkumar.issues.some(i => i.code === 'NAME_ABBREVIATION_MATCH'), "Should detect abbreviated duplicate with Ramesh Kumar");
console.log("✓ Test 3 Passed: R. Kumar flagged for missing phone and correlated with Ramesh Kumar");

// Test 4: Priya Nair (Row 6 in Excel) - Multiplier 80K and missing date
const priya = results[4];
assert.strictEqual(priya.loan_amount, 80000, "80K should parse to 80000");
assert(priya.issues.some(i => i.code === 'LOAN_DATE_MISSING'), "Should flag missing loan date");
console.log("✓ Test 4 Passed: '80K' parsed to 80000 and missing date flagged");

// Test 5: Exact Duplicate Ganesh Yadav (Row 9 in Excel vs Row 7) - Rule 2
const ganeshDup = results[7];
assert.strictEqual(ganeshDup.statusCategory, "DUPLICATE");
assert(ganeshDup.issues.some(i => i.code === 'EXACT_DUPLICATE'), "Should note exact duplicate rather than deleting");
console.log("✓ Test 5 Passed: Rule 2 verified - Duplicate Ganesh Yadav noted rather than silently deleted");

// Test 6: Vikram Singh (Row 11 in Excel) - Negative Amount
const vikram = results[9];
assert.strictEqual(vikram.statusCategory, "ERROR");
assert(vikram.issues.some(i => i.code === 'LOAN_AMOUNT_NEGATIVE'), "Should flag negative amount");
assert.strictEqual(vikram.suggestions.loan_amount, 15000, "Should suggest positive 15000");
console.log("✓ Test 6 Passed: Negative amount -15000 flagged with 1-click positive suggestion 15000");

// Test 7: Kavita Rao (Row 12 in Excel) - Corrupted Phone
const kavita = results[10];
assert.strictEqual(kavita.statusCategory, "ERROR");
assert(kavita.issues.some(i => i.code === 'PHONE_CORRUPTED'), "Should flag letters in phone number");
console.log("✓ Test 7 Passed: Corrupted phone '981234abcd' flagged under Rule 1 (Zero guessing)");

// Test 8: Faisal Shaikh (Row 13 in Excel) - Spelling Variant
const faisal = results[11];
assert(faisal.issues.some(i => i.code === 'SPELLING_VARIANT_MATCH'), "Should detect spelling variant of Faisal Sheikh");
console.log("✓ Test 8 Passed: Fuzzy spelling match between Faisal Shaikh and Faisal Sheikh verified");

// Test 9: Sana Iyer (Row 14 in Excel) - Invalid Calendar Date Feb 30
const sana = results[12];
assert.strictEqual(sana.statusCategory, "ERROR");
assert(sana.issues.some(i => i.code === 'INVALID_CALENDAR_DATE'), "Should flag Feb 30 calendar impossibility");
assert.strictEqual(sana.suggestions.loan_date, "2025-02-28", "Should suggest month-end 2025-02-28");
console.log("✓ Test 9 Passed: Invalid date '30/02/2025' flagged with suggestion '2025-02-28'");

// Test 10: Missing Customer Name (Row 18 in Excel)
const emptyName = results[16];
assert.strictEqual(emptyName.statusCategory, "ERROR");
assert(emptyName.issues.some(i => i.code === 'CUSTOMER_NAME_MISSING'), "Should flag empty customer name");
console.log("✓ Test 10 Passed: Missing customer name flagged");

// Test 11: Future Date Kiran Bhosle (Row 19 in Excel)
const kiran = results[17];
assert(kiran.issues.some(i => i.code === 'FUTURE_DATE_WARNING'), "Should warn about future date 2026-09-01");
console.log("✓ Test 11 Passed: Future date warning verified");

console.log("\n==========================================");
console.log(" ALL 11 VERIFICATION TESTS PASSED (100%)");
console.log("==========================================\n");
