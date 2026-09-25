const fs = require('fs');
const XLSX = require('xlsx');

// Comprehensive test dataset with realistic branch lending variations
const testRows = [
  ["Branch", "Customer Name", "Loan Amt", "Loan Date", "Phone No", "Status", "Notes"],
  
  // 1. Valid clean row (Dollar symbol, ISO date)
  ["Connaught Place", "Arjun Kapoor", "$ 75,000", "2026-05-15", "9810012345", "Active", "Sanctioned online"],
  
  // 2. Valid clean row (Suffix 'BR', Lakh multiplier, written month date, +91 phone, uppercase status)
  ["WHITEFIELD BR", "Devika Sengupta", "2.5 Lakh", "October 12, 2026", "+91-98200-54321", "ACTIVE", ""],
  
  // 3. Potential duplicate / initial match of Row 1 (A. Kapoor vs Arjun Kapoor, same amount/date, missing phone)
  ["Connaught Place", "A. Kapoor", "75000", "2026-05-15", "", "active", "Check if same applicant as Arjun Kapoor"],
  
  // 4. Valid clean row (Suffix 'Branch', 'Rs.', short date format D-M-YY, phone with space)
  ["Salt Lake Branch", "Sneha Roy", "Rs. 1,40,000", "5-10-26", "98765 11223", "Closed ", "Full repayment received"],
  
  // 5. Missing loan date & 'K' shorthand multiplier (Rule 1 test)
  ["Hinjewadi", "Vikram Malhotra", "65K", "", "9845012345", "NPA", "Borrower contactable on mobile"],
  
  // 6. Valid record (Dot date format, comma amount)
  ["Indiranagar", "Rohan Verma", "3,20,000", "2026.04.10", "9988112233", "closed", ""],
  
  // 7. Exact duplicate of Row 6 (Rule 2 test: should be preserved & flagged, NOT deleted)
  ["Indiranagar", "Rohan Verma", "320000", "10/04/2026", "9988112233", "Closed", "Duplicate entry of previous row"],
  
  // 8. Missing loan amount (Rule 1 test: should be flagged, not guessed)
  ["Koramangala Office", "Meera Nair", "", "18/05/2026", "9090123456", "Active", "Amount column was left blank in register"],
  
  // 9. Negative loan amount (Rule 1 test: should be flagged with + suggestion)
  ["Cyber City", "Kunal Shah", "-45000", "02/06/2026", "9812309876", "Active", "Entered as negative in branch sheet"],
  
  // 10. Corrupted phone number with letters (Rule 1 test: should be flagged, not guessed)
  ["Bandra West", "Pooja Hegde", "90,000", "2026-06-05", "985001abcd", "ACTIVE", "Phone has letters in it"],
  
  // 11. Fuzzy spelling duplicate of Row 10 (Puja Hegde vs Pooja Hegde, same amount & date)
  ["Bandra", "Puja Hegde", "90000", "05/06/2026", "9850099999", "Active", "Spelling variant of Pooja Hegde?"],
  
  // 12. Impossible calendar date (April 31 does not exist, Rule 1 test)
  ["Cyber City", "Aditya Joshi", "110000", "31/04/2026", "9765401234", "Active", "April only has 30 days"],
  
  // 13. Cross-branch multi-loan borrower (Same phone as Row 1 Arjun Kapoor, in a different branch)
  ["Indiranagar", "Arjun Kapoor", "125000", "20/07/2026", "9810012345", "Active", "Customer also has loan in Connaught Place"],
  
  // 14. Missing customer name (Rule 1 test: critical flag)
  ["Connaught Place", "", "85000", "22/05/2026", "9822001122", "Active", "Customer name empty in register"],
  
  // 15. Zero loan principal amount (Rule 1 test)
  ["Salt Lake", "Tanya Sen", "₹ 0", "14/06/2026", "9833441122", "Active", "Zero principal amount"],
  
  // 16. Outlier future date (Relative to 2026 batch register)
  ["Hinjewadi", "Siddharth Rao", "50000", "2029.01.15", "9871199887", "Active", "Disbursal date far in future (2029)"],
  
  // 17. Valid clean record with crore multiplier
  ["Bandra West", "Kabir Bedi", "1.2 Cr", "19-05-2026", "9820088776", "Active", "Commercial loan sanction"]
];

// Write CSV
const csvContent = testRows.map(row => 
  row.map(cell => {
    const str = String(cell ?? '');
    return str.includes(',') || str.includes('"') || str.includes('\n') 
      ? `"${str.replace(/"/g, '""')}"` 
      : str;
  }).join(',')
).join('\r\n');

fs.writeFileSync('New_Test_Loan_Register.csv', '\uFEFF' + csvContent, 'utf8');

// Write XLSX
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(testRows);
XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
XLSX.writeFile(wb, 'New_Test_Loan_Register.xlsx');

console.log("Successfully generated test files:");
console.log("  - New_Test_Loan_Register.csv  (17 test records)");
console.log("  - New_Test_Loan_Register.xlsx (17 test records)");
