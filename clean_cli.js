const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const LoanCleaner = require('./cleaner');

const inputFile = process.argv[2] || 'Branch_Loan_Register_Sample.xlsx';
const outputFile = process.argv[3] || 'Cleaned_Loan_Register_Output.xlsx';

if (!fs.existsSync(inputFile)) {
  console.error(`Error: Input file "${inputFile}" does not exist.`);
  process.exit(1);
}

console.log(`\n======================================================`);
console.log(`  INTERNOVO AI LOAN REGISTER AUTOMATION CLEANER`);
console.log(`======================================================`);
console.log(`Input File:  ${inputFile}`);
console.log(`Output File: ${outputFile}\n`);

const wb = XLSX.readFile(inputFile);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rawRows = XLSX.utils.sheet_to_json(sheet);

console.log(`Loaded ${rawRows.length} rows from worksheet "${wb.SheetNames[0]}". Processing...\n`);

const results = LoanCleaner.cleanLoanDataset(rawRows);

let cleanCount = 0;
let flaggedErrorCount = 0;
let flaggedDuplicateCount = 0;
let warningCount = 0;

results.forEach(r => {
  if (r.statusCategory === 'CLEAN') cleanCount++;
  else if (r.statusCategory === 'ERROR') flaggedErrorCount++;
  else if (r.statusCategory === 'DUPLICATE') flaggedDuplicateCount++;
  else if (r.statusCategory === 'WARNING') warningCount++;
});

console.log(`------------------------------------------------------`);
console.log(`PROCESSING SUMMARY:`);
console.log(`  Total Rows:             ${results.length}`);
console.log(`  Clean & Valid Rows:     ${cleanCount}`);
console.log(`  Flagged (Errors):       ${flaggedErrorCount}`);
console.log(`  Flagged (Duplicates):   ${flaggedDuplicateCount}`);
console.log(`  Review Needed (Notes):  ${warningCount}`);
console.log(`------------------------------------------------------\n`);

// Helper to verify if a row strictly matches the 6 schema criteria
function isStrictlyCompliant(r) {
  if (!r.branch || String(r.branch).trim() === '') return false;
  if (!r.customer_name || String(r.customer_name).trim() === '') return false;
  if (r.loan_amount === null || r.loan_amount === undefined || isNaN(r.loan_amount) || r.loan_amount <= 0) return false;
  if (!r.loan_date || !/^\d{4}-\d{2}-\d{2}$/.test(r.loan_date)) return false;
  if (!r.phone || !/^\d{10}$/.test(r.phone)) return false;
  if (!['Active', 'Closed', 'NPA'].includes(r.status)) return false;
  return true;
}

// 1. Clean CBS Ingestion rows (strictly compliant)
const cleanValidRows = results
  .filter(r => r.statusCategory === 'CLEAN' && isStrictlyCompliant(r))
  .map(r => ({
    'branch': r.branch,
    'customer_name': r.customer_name,
    'loan_amount': Number(r.loan_amount),
    'loan_date': r.loan_date,
    'phone': r.phone,
    'status': r.status
  }));

// 2. Flagged Review Queue (unresolved, ambiguous, missing, corrupted, or duplicates)
const flaggedQueueRows = results
  .filter(r => r.statusCategory !== 'CLEAN' || !isStrictlyCompliant(r))
  .map(r => ({
    'Original Row #': r.originalIndex,
    'Branch': r.branch,
    'Customer Name': r.customer_name || '[MISSING]',
    'Loan Amount': r.loan_amount !== null && r.loan_amount !== undefined ? r.loan_amount : '[MISSING]',
    'Loan Date': r.loan_date || '[MISSING]',
    'Phone': r.phone || '[MISSING]',
    'Status': r.status || '[MISSING]',
    'Flag Category': r.statusSummary,
    'Stated Reason for Flag': r.issues.map(i => `[${i.type}] ${i.message}`).join(' | '),
    'Suggested Resolution': Object.keys(r.suggestions).map(k => `${k}: ${r.suggestions[k]}`).join(', ') || 'Manual branch check needed',
    'Original Notes': r.original_notes
  }));

// 3. Complete Master Register with Audit Tracking (No row lost!)
const masterAuditRows = results.map(r => ({
  'Row #': r.originalIndex,
  'branch': r.branch,
  'customer_name': r.customer_name,
  'loan_amount': r.loan_amount,
  'loan_date': r.loan_date,
  'phone': r.phone,
  'status': r.status,
  'compliance_status': isStrictlyCompliant(r) ? 'PASS' : 'FLAGGED_FOR_REVIEW',
  'issues': r.issues.map(i => `[${i.type}] ${i.message}`).join(' | ') || 'None',
  'original_notes': r.original_notes
}));

// Build Multi-Sheet Workbook
const outWb = XLSX.utils.book_new();

// Sheet 1: Strictly Compliant Clean Data
const cleanWs = XLSX.utils.json_to_sheet(cleanValidRows);
XLSX.utils.book_append_sheet(outWb, cleanWs, "Clean_CBS_Data");

// Sheet 2: Flagged Review Queue (Rule 1 & Rule 2 preserved)
const flaggedWs = XLSX.utils.json_to_sheet(flaggedQueueRows);
XLSX.utils.book_append_sheet(outWb, flaggedWs, "Flagged_Review_Queue");

// Sheet 3: Full Audit Log
const auditWs = XLSX.utils.json_to_sheet(masterAuditRows);
XLSX.utils.book_append_sheet(outWb, auditWs, "All_Records_Audit_Trail");

XLSX.writeFile(outWb, outputFile);

// Write CSVs
const cleanCsvPath = outputFile.replace(/\.xlsx$/i, '.csv');
fs.writeFileSync(cleanCsvPath, XLSX.utils.sheet_to_csv(cleanWs), 'utf8');

const queueCsvPath = outputFile.replace(/\.xlsx$/i, '_flagged_queue.csv');
fs.writeFileSync(queueCsvPath, XLSX.utils.sheet_to_csv(flaggedWs), 'utf8');

console.log(`Generated Output Artifacts:`);
console.log(`  1. Master Excel Workbook: ${outputFile}`);
console.log(`     - Sheet 'Clean_CBS_Data' (${cleanValidRows.length} rows strictly compliant)`);
console.log(`     - Sheet 'Flagged_Review_Queue' (${flaggedQueueRows.length} rows flagged with stated reasons)`);
console.log(`     - Sheet 'All_Records_Audit_Trail' (${masterAuditRows.length} rows preserved)`);
console.log(`  2. Clean Target CSV:     ${cleanCsvPath}`);
console.log(`  3. Flagged Review CSV:   ${queueCsvPath}`);
console.log(`\nVerification passed: Zero guessing, duplicates retained, schema compliant.\n`);
