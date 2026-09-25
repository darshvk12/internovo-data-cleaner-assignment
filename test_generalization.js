const assert = require('assert');
const XLSX = require('xlsx');
const fs = require('fs');
const LoanCleaner = require('./cleaner');

console.log("=================================================================");
console.log(" RUNNING GENERALIZATION TEST ON UNSEEN DATASET");
console.log("=================================================================\n");

// Completely new, unseen dataset with zero overlap with sample branches, names, or formats
const unseenData = [
  {
    "Branch Name": "Connaught Place BR",
    "Borrower Name": "Arjun Kapoor",
    "Principal Amount": "$ 75,000",
    "Disbursal Date": "05.10.2026", // Dot notation DD.MM.YYYY
    "Mobile": "09820011223", // Leading 0 11-digit mobile
    "Loan Status": "active"
  },
  {
    "Branch Name": "Whitefield Office",
    "Borrower Name": "Devika Sengupta",
    "Principal Amount": "1.5 Lakh", // Suffix multiplier
    "Disbursal Date": "Oct 5 2026", // Textual month format
    "Mobile": "+91 98300 44556", // Spaces and +91
    "Loan Status": "CLOSED"
  },
  {
    "Branch Name": "Connaught Place",
    "Borrower Name": "A. Kapoor", // Generic abbreviation of Arjun Kapoor
    "Principal Amount": "75000",
    "Disbursal Date": "2026-10-05",
    "Mobile": "", // Missing phone
    "Loan Status": "Active"
  },
  {
    "Branch Name": "Salt Lake Branch",
    "Borrower Name": "Rahul Dravid",
    "Principal Amount": "₹ 0", // NEW malformed value: Zero amount
    "Disbursal Date": "15/11/2026",
    "Mobile": "9840012345",
    "Loan Status": "Active"
  },
  {
    "Branch Name": "Hinjewadi",
    "Borrower Name": "Pooja Hegde",
    "Principal Amount": "90000",
    "Disbursal Date": "15/13/2026", // NEW malformed value: Month 13
    "Mobile": "9850012345",
    "Loan Status": "Pending" // NEW malformed value: Unrecognized status
  },
  {
    "Branch Name": "Indiranagar",
    "Borrower Name": "Rohan Verma",
    "Principal Amount": "1.2 Cr", // Cr multiplier
    "Disbursal Date": "12-10-2026",
    "Mobile": "98112233", // NEW malformed value: Short 8-digit phone
    "Loan Status": "NPA"
  }
];

// Write to Excel and process
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.json_to_sheet(unseenData);
XLSX.utils.book_append_sheet(wb, ws, "Register");
XLSX.writeFile(wb, "Unseen_Generalization_Test.xlsx");

const results = LoanCleaner.cleanLoanDataset(unseenData);

console.log(`Processed ${results.length} unseen rows successfully.\n`);

// 1. Check Row 1: Connaught Place BR, Arjun Kapoor, $75,000, 05.10.2026, 09820011223, active
const r1 = results[0];
console.log("Row 1 Cleaned:", JSON.stringify({
  branch: r1.branch,
  name: r1.customer_name,
  amt: r1.loan_amount,
  date: r1.loan_date,
  phone: r1.phone,
  status: r1.status,
  category: r1.statusCategory
}));
assert.strictEqual(r1.branch, "Connaught Place", "Stripped 'BR' suffix generically");
assert.strictEqual(r1.customer_name, "Arjun Kapoor");
assert.strictEqual(r1.loan_amount, 75000, "Cleaned $ currency and comma");
assert.strictEqual(r1.loan_date, "2026-10-05", "Parsed DD.MM.YYYY format");
assert.strictEqual(r1.phone, "9820011223", "Stripped leading 0 from 11-digit mobile");
assert.strictEqual(r1.status, "Active", "Normalized status casing");
assert.strictEqual(r1.statusCategory, "CLEAN");
console.log("✓ Row 1 Passed: Generic currency, dot date, leading 0 phone, branch suffix normalized\n");

// 2. Check Row 2: Whitefield Office, Devika Sengupta, 1.5 Lakh, Oct 5 2026, +91 98300 44556, CLOSED
const r2 = results[1];
console.log("Row 2 Cleaned:", JSON.stringify({
  branch: r2.branch,
  name: r2.customer_name,
  amt: r2.loan_amount,
  date: r2.loan_date,
  phone: r2.phone,
  status: r2.status,
  category: r2.statusCategory
}));
assert.strictEqual(r2.branch, "Whitefield", "Stripped 'Office' suffix generically");
assert.strictEqual(r2.loan_amount, 150000, "1.5 Lakh multiplier parsed generically");
assert.strictEqual(r2.loan_date, "2026-10-05", "Textual date 'Oct 5 2026' parsed generically");
assert.strictEqual(r2.phone, "9830044556", "+91 and spaces stripped generically");
assert.strictEqual(r2.status, "Closed");
assert.strictEqual(r2.statusCategory, "CLEAN");
console.log("✓ Row 2 Passed: Lakh multiplier, textual date, international format normalized\n");

// 3. Check Row 3: A. Kapoor duplicate correlation with Arjun Kapoor
const r3 = results[2];
console.log("Row 3 Flagged:", JSON.stringify({
  issues: r3.issues.map(i => `[${i.type}] ${i.message}`),
  suggestions: r3.suggestions
}));
assert(r3.issues.some(i => i.code === 'PHONE_MISSING'), "Flagged missing phone");
assert(r3.issues.some(i => i.code === 'NAME_ABBREVIATION_MATCH'), "Generic algorithm matched 'A. Kapoor' with 'Arjun Kapoor'");
assert.strictEqual(r3.suggestions.phone, "9820011223", "Suggested phone from Arjun Kapoor");
console.log("✓ Row 3 Passed: Generic initial matching (A. Kapoor -> Arjun Kapoor) without hardcoded names\n");

// 4. Check Row 4: Zero loan amount
const r4 = results[3];
console.log("Row 4 Flagged (Zero Amount):", JSON.stringify(r4.issues));
assert(r4.issues.some(i => i.code === 'LOAN_AMOUNT_ZERO'), "Flagged zero loan amount");
console.log("✓ Row 4 Passed: Zero principal amount flagged\n");

// 5. Check Row 5: Month 13 & Invalid Status
const r5 = results[4];
console.log("Row 5 Flagged (Invalid Month & Status):", JSON.stringify(r5.issues));
assert(r5.issues.some(i => i.code === 'INVALID_CALENDAR_DATE'), "Flagged invalid month 13");
assert(r5.issues.some(i => i.code === 'STATUS_INVALID'), "Flagged non-enum status 'Pending'");
console.log("✓ Row 5 Passed: Impossible month 13 and non-enum status flagged\n");

// 6. Check Row 6: Short 8-digit phone & Cr multiplier
const r6 = results[5];
console.log("Row 6 Cleaned & Flagged:", JSON.stringify({ amt: r6.loan_amount, issues: r6.issues }));
assert.strictEqual(r6.loan_amount, 12000000, "1.2 Cr parsed to 12,000,000");
assert(r6.issues.some(i => i.code === 'PHONE_INVALID_LENGTH'), "Flagged short 8-digit phone");
console.log("✓ Row 6 Passed: Cr multiplier parsed and short phone flagged\n");

console.log("=================================================================");
console.log(" ALL GENERALIZATION TESTS PASSED WITH ZERO HARDCODING!");
console.log("=================================================================\n");
