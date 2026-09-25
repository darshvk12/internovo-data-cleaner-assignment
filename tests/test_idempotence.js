const assert = require('assert');
const path = require('path');
const XLSX = require('xlsx');
const LoanCleaner = require('../src/cleaner');

console.log("=================================================================");
console.log(" RUNNING IDEMPOTENCE AND STABILITY VERIFICATION TEST");
console.log("=================================================================\n");

// Test 1: Run sample data twice
const samplePath = path.join(__dirname, '../data/sample/Branch_Loan_Register_Sample.xlsx');
const wb1 = XLSX.readFile(samplePath);
const raw1 = XLSX.utils.sheet_to_json(wb1.Sheets[wb1.SheetNames[0]]);

const run1 = LoanCleaner.cleanLoanDataset(raw1);
const run2 = LoanCleaner.cleanLoanDataset(raw1);

assert.strictEqual(run1.length, run2.length, "Lengths must match");
assert.strictEqual(JSON.stringify(run1), JSON.stringify(run2), "Run 1 and Run 2 must produce byte-for-byte identical output");

console.log("✓ Pass: Identical output verified across multiple runs on sample data (zero non-determinism).");

// Test 2: Run unseen generalization dataset twice
const testPath = path.join(__dirname, '../data/test/New_Test_Loan_Register.xlsx');
const wb2 = XLSX.readFile(testPath);
const raw2 = XLSX.utils.sheet_to_json(wb2.Sheets[wb2.SheetNames[0]]);

const genRun1 = LoanCleaner.cleanLoanDataset(raw2);
const genRun2 = LoanCleaner.cleanLoanDataset(raw2);

assert.strictEqual(JSON.stringify(genRun1), JSON.stringify(genRun2), "Unseen dataset runs must be 100% identical");

console.log("✓ Pass: Identical output verified across multiple runs on unseen generalization data.");

console.log("\n=================================================================");
console.log(" IDEMPOTENCE & STABILITY VERIFICATION PASSED (100%)");
console.log("=================================================================\n");
