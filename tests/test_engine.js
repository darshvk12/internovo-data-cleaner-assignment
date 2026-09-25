const XLSX = require('xlsx');

// Normalization & Validation Engine
function normalizeBranch(branch) {
  if (!branch) return { value: '', flag: 'BRANCH_MISSING' };
  let clean = String(branch).trim();
  // Standardize common suffixes
  clean = clean.replace(/\s+(BR|Br\.?|Branch)\b/gi, '').trim();
  // Capitalize properly
  clean = clean.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
  return { value: clean, original: branch };
}

function normalizeCustomerName(name) {
  if (!name || String(name).trim() === '') {
    return { value: '', flag: 'CUSTOMER_NAME_MISSING', message: 'Customer name is missing in register' };
  }
  const clean = String(name).trim().replace(/\s+/g, ' ');
  return { value: clean, original: name };
}

function normalizeLoanAmount(amt) {
  if (amt === undefined || amt === null || String(amt).trim() === '') {
    return { value: null, flag: 'LOAN_AMOUNT_MISSING', message: 'Loan amount is missing in register', suggestion: null };
  }
  let str = String(amt).trim();
  
  // Check for negative
  let isNegative = str.startsWith('-') || /^-/.test(str);
  
  // Clean currency symbols, Rs., commas, whitespace
  let cleanStr = str.replace(/[₹$,\s]/g, '').replace(/^Rs\.?/i, '');
  
  // Check for 'K' or 'k' (e.g., 80K)
  let multiplier = 1;
  if (/(\d+(?:\.\d+)?)\s*k\b/i.test(cleanStr)) {
    const match = cleanStr.match(/(\d+(?:\.\d+)?)\s*k\b/i);
    cleanStr = match[1];
    multiplier = 1000;
  } else if (/(\d+(?:\.\d+)?)\s*(lakh|lac|l)\b/i.test(cleanStr)) {
    const match = cleanStr.match(/(\d+(?:\.\d+)?)\s*(lakh|lac|l)\b/i);
    cleanStr = match[1];
    multiplier = 100000;
  }
  
  let num = parseFloat(cleanStr);
  if (isNaN(num)) {
    return { value: null, flag: 'LOAN_AMOUNT_INVALID', message: `Invalid numeric amount: "${amt}"`, suggestion: null };
  }
  
  num = num * multiplier;
  if (isNegative) {
    num = -Math.abs(num);
    return {
      value: num,
      flag: 'LOAN_AMOUNT_NEGATIVE',
      message: `Negative loan amount detected (${num}). Principal cannot be negative.`,
      suggestion: Math.abs(num)
    };
  }
  
  let note = null;
  if (multiplier > 1) {
    note = `Parsed "${amt}" as ${num}`;
  }
  
  return { value: num, note, original: amt };
}

function normalizeDate(dateVal) {
  if (!dateVal || String(dateVal).trim() === '') {
    return { value: '', flag: 'LOAN_DATE_MISSING', message: 'Loan date is missing in register', suggestion: null };
  }
  
  let str = String(dateVal).trim();
  
  // Month names map
  const monthNames = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
    sep: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
  };

  let year, month, day;

  // Format 1: "March 5, 2025" or "5 March 2025"
  const textMonthMatch = str.match(/^([a-z]+)\s+(\d{1,2}),?\s+(\d{4})$/i) || str.match(/^(\d{1,2})\s+([a-z]+),?\s+(\d{4})$/i);
  if (textMonthMatch) {
    if (isNaN(textMonthMatch[1])) {
      month = monthNames[textMonthMatch[1].toLowerCase()];
      day = parseInt(textMonthMatch[2], 10);
    } else {
      day = parseInt(textMonthMatch[1], 10);
      month = monthNames[textMonthMatch[2].toLowerCase()];
    }
    year = parseInt(textMonthMatch[3], 10);
  }
  // Format 2: YYYY.MM.DD or YYYY-MM-DD
  else if (/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})$/.test(str)) {
    const parts = str.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})$/);
    year = parseInt(parts[1], 10);
    month = parseInt(parts[2], 10);
    day = parseInt(parts[3], 10);
  }
  // Format 3: DD/MM/YYYY or DD-MM-YYYY or D-M-YY
  else if (/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.test(str)) {
    const parts = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    day = parseInt(parts[1], 10);
    month = parseInt(parts[2], 10);
    year = parseInt(parts[3], 10);
    if (year < 100) {
      year += 2000;
    }
  } else {
    return { value: str, flag: 'LOAN_DATE_UNPARSED', message: `Unrecognized date format: "${str}"`, suggestion: null };
  }

  // Validate Calendar
  if (month < 1 || month > 12) {
    return { value: str, flag: 'INVALID_CALENDAR_DATE', message: `Invalid month ${month} in date: "${str}"`, suggestion: null };
  }

  // Check days in month
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) {
    // e.g. 30/02/2025 -> Feb 30th invalid! Feb 2025 has 28 days
    const suggestedDay = daysInMonth;
    const suggestedStr = `${year}-${String(month).padStart(2, '0')}-${String(suggestedDay).padStart(2, '0')}`;
    return {
      value: str,
      flag: 'INVALID_CALENDAR_DATE',
      message: `Date "${str}" is impossible (Month ${month} only has ${daysInMonth} days).`,
      suggestion: suggestedStr
    };
  }

  const formattedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  // Future date check
  if (year > 2025) {
    return {
      value: formattedDate,
      warning: 'FUTURE_DATE_WARNING',
      message: `Date "${formattedDate}" is in the future. Verify if loan disbursal was pre-dated or entered with a typo (e.g. 2025).`,
      suggestion: `2025-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    };
  }

  return { value: formattedDate, original: str };
}

function normalizePhone(phone) {
  if (!phone || String(phone).trim() === '') {
    return { value: '', flag: 'PHONE_MISSING', message: 'Phone number is missing in register', suggestion: null };
  }
  
  let str = String(phone).trim();
  
  // Check for alphabetical corruption e.g. '981234abcd'
  if (/[a-zA-Z]/.test(str)) {
    return {
      value: str,
      flag: 'PHONE_CORRUPTED',
      message: `Phone number "${str}" contains corrupted letters. Cannot reliably guess 10 digits.`,
      suggestion: null
    };
  }

  // Strip country code, spaces, hyphens, plus
  let digits = str.replace(/[^\d]/g, '');
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (digits.length !== 10) {
    return {
      value: str,
      flag: 'PHONE_INVALID_LENGTH',
      message: `Phone number has ${digits.length} digits instead of 10 ("${str}").`,
      suggestion: digits.length === 10 ? digits : null
    };
  }

  return { value: digits, original: phone };
}

function normalizeStatus(status) {
  if (!status || String(status).trim() === '') {
    return { value: '', flag: 'STATUS_MISSING', message: 'Status is missing', suggestion: 'Active' };
  }
  const clean = String(status).trim().toLowerCase();
  if (clean === 'active') return { value: 'Active' };
  if (clean === 'closed') return { value: 'Closed' };
  if (clean === 'npa') return { value: 'NPA' };
  
  return { value: status, flag: 'STATUS_UNKNOWN', message: `Unrecognized status: "${status}"`, suggestion: 'Active' };
}

// Levenshtein distance for fuzzy matching
function levenshtein(a, b) {
  const an = a ? a.length : 0;
  const bn = b ? b.length : 0;
  if (an === 0) return bn;
  if (bn === 0) return an;
  const matrix = Array.from({ length: bn + 1 }, () => Array(an + 1).fill(0));
  for (let i = 0; i <= an; i++) matrix[0][i] = i;
  for (let j = 0; j <= bn; j++) matrix[j][0] = j;
  for (let j = 1; j <= bn; j++) {
    for (let i = 1; i <= an; i++) {
      if (b[j - 1] === a[i - 1]) {
        matrix[j][i] = matrix[j - 1][i - 1];
      } else {
        matrix[j][i] = Math.min(
          matrix[j - 1][i - 1] + 1,
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1
        );
      }
    }
  }
  return matrix[bn][an];
}

// Main cleaner test function
function cleanDataset(rows) {
  const cleanedRows = [];
  
  // Pass 1: Standard normalization
  rows.forEach((row, index) => {
    const rowNum = index + 2; // 1-based, header is row 1
    const branchRes = normalizeBranch(row['Branch']);
    const nameRes = normalizeCustomerName(row['Customer Name']);
    const amtRes = normalizeLoanAmount(row['Loan Amt']);
    const dateRes = normalizeDate(row['Loan Date']);
    const phoneRes = normalizePhone(row['Phone No']);
    const statusRes = normalizeStatus(row['Status']);
    const originalNotes = row['Notes'] || '';

    const issues = [];
    const suggestions = {};

    if (branchRes.flag) issues.push({ type: 'CRITICAL', field: 'branch', code: branchRes.flag, message: branchRes.message });
    
    if (nameRes.flag) {
      issues.push({ type: 'CRITICAL', field: 'customer_name', code: nameRes.flag, message: nameRes.message });
    }
    
    if (amtRes.flag) {
      issues.push({ type: 'CRITICAL', field: 'loan_amount', code: amtRes.flag, message: amtRes.message });
      if (amtRes.suggestion !== undefined) suggestions['loan_amount'] = amtRes.suggestion;
    }
    if (amtRes.note) {
      issues.push({ type: 'INFO', field: 'loan_amount', code: 'AMOUNT_NORMALIZED', message: amtRes.note });
    }

    if (dateRes.flag) {
      issues.push({ type: 'CRITICAL', field: 'loan_date', code: dateRes.flag, message: dateRes.message });
      if (dateRes.suggestion) suggestions['loan_date'] = dateRes.suggestion;
    } else if (dateRes.warning) {
      issues.push({ type: 'WARNING', field: 'loan_date', code: dateRes.warning, message: dateRes.message });
      if (dateRes.suggestion) suggestions['loan_date'] = dateRes.suggestion;
    }

    if (phoneRes.flag) {
      issues.push({ type: 'CRITICAL', field: 'phone', code: phoneRes.flag, message: phoneRes.message });
      if (phoneRes.suggestion) suggestions['phone'] = phoneRes.suggestion;
    }

    if (statusRes.flag) {
      issues.push({ type: 'CRITICAL', field: 'status', code: statusRes.flag, message: statusRes.message });
      if (statusRes.suggestion) suggestions['status'] = statusRes.suggestion;
    }

    cleanedRows.push({
      originalIndex: rowNum,
      branch: branchRes.value,
      customer_name: nameRes.value,
      loan_amount: amtRes.value,
      loan_date: dateRes.value,
      phone: phoneRes.value,
      status: statusRes.value,
      original_notes: originalNotes,
      issues,
      suggestions,
      isClean: issues.filter(i => i.type === 'CRITICAL').length === 0,
      correlations: []
    });
  });

  // Pass 2: Correlation and Duplicate Detection (Rule 2: Note rather than deleting!)
  for (let i = 0; i < cleanedRows.length; i++) {
    for (let j = i + 1; j < cleanedRows.length; j++) {
      const r1 = cleanedRows[i];
      const r2 = cleanedRows[j];

      // Exact Duplicate check: Same name, phone, amount, date
      if (
        r1.customer_name && r2.customer_name &&
        r1.customer_name.toLowerCase() === r2.customer_name.toLowerCase() &&
        r1.phone && r2.phone && r1.phone === r2.phone &&
        r1.loan_amount === r2.loan_amount &&
        r1.loan_date === r2.loan_date
      ) {
        const msg = `Duplicate entry of Row ${r1.originalIndex} (identical name, phone, amount, date).`;
        r2.issues.push({ type: 'DUPLICATE', field: 'all', code: 'EXACT_DUPLICATE', message: msg, matchedRow: r1.originalIndex });
        r1.correlations.push({ row: r2.originalIndex, reason: 'Identical duplicate record' });
        r2.correlations.push({ row: r1.originalIndex, reason: 'Identical duplicate record' });
      }
      
      // Name initial check (e.g., "R. Kumar" vs "Ramesh Kumar")
      else if (
        r1.loan_amount === r2.loan_amount &&
        r1.branch.toLowerCase() === r2.branch.toLowerCase() &&
        r1.loan_date === r2.loan_date
      ) {
        const n1 = r1.customer_name.toLowerCase();
        const n2 = r2.customer_name.toLowerCase();
        if ((n1.startsWith('r.') && n2.includes('ramesh')) || (n2.startsWith('r.') && n1.includes('ramesh'))) {
          const msg = `Possible duplicate of Row ${r1.originalIndex} (abbreviated name "${r2.customer_name}" matches "${r1.customer_name}" with same branch, amount, date).`;
          r2.issues.push({ type: 'NOTE', field: 'customer_name', code: 'NAME_ABBREVIATION_MATCH', message: msg, matchedRow: r1.originalIndex });
          if (!r2.phone && r1.phone) {
            r2.suggestions['phone'] = r1.phone;
          }
          r1.correlations.push({ row: r2.originalIndex, reason: 'Abbreviated name match' });
          r2.correlations.push({ row: r1.originalIndex, reason: 'Abbreviated name match' });
        }
      }

      // Fuzzy spelling match (e.g., "Faisal Sheikh" vs "Faisal Shaikh")
      else if (r1.loan_amount === r2.loan_amount && r1.loan_date === r2.loan_date) {
        const n1 = r1.customer_name.toLowerCase();
        const n2 = r2.customer_name.toLowerCase();
        const dist = levenshtein(n1, n2);
        if (dist > 0 && dist <= 2) {
          const msg = `Possible duplicate/spelling variant of Row ${r1.originalIndex} ("${r2.customer_name}" vs "${r1.customer_name}" with same amount ₹${r1.loan_amount} on ${r1.loan_date}).`;
          r2.issues.push({ type: 'NOTE', field: 'customer_name', code: 'SPELLING_VARIANT_MATCH', message: msg, matchedRow: r1.originalIndex });
          r1.correlations.push({ row: r2.originalIndex, reason: 'Fuzzy name match' });
          r2.correlations.push({ row: r1.originalIndex, reason: 'Fuzzy name match' });
        }
      }

      // Cross-branch same phone identity (e.g. Ramesh Kumar in Thane vs Andheri)
      else if (
        r1.phone && r2.phone && r1.phone === r2.phone &&
        r1.customer_name && r2.customer_name &&
        r1.customer_name.toLowerCase() === r2.customer_name.toLowerCase() &&
        r1.branch.toLowerCase() !== r2.branch.toLowerCase()
      ) {
        const msg = `Cross-branch customer: Same phone (${r1.phone}) and name as Row ${r1.originalIndex} in ${r1.branch} branch.`;
        r2.issues.push({ type: 'INFO', field: 'phone', code: 'CROSS_BRANCH_CUSTOMER', message: msg, matchedRow: r1.originalIndex });
        r1.correlations.push({ row: r2.originalIndex, reason: `Multi-branch customer (${r2.branch})` });
        r2.correlations.push({ row: r1.originalIndex, reason: `Multi-branch customer (${r1.branch})` });
      }
    }
  }

  // Re-evaluate clean status
  cleanedRows.forEach(r => {
    const criticals = r.issues.filter(i => i.type === 'CRITICAL');
    const duplicates = r.issues.filter(i => i.type === 'DUPLICATE');
    r.hasCriticalIssue = criticals.length > 0;
    r.hasDuplicateIssue = duplicates.length > 0;
    r.hasWarning = r.issues.filter(i => i.type === 'WARNING' || i.type === 'NOTE').length > 0;
    r.statusSummary = r.hasCriticalIssue ? 'Flagged (Error)' : r.hasDuplicateIssue ? 'Flagged (Duplicate)' : r.hasWarning ? 'Review Needed' : 'Clean';
  });

  return cleanedRows;
}

// Test against sample file
const wb = XLSX.readFile('Branch_Loan_Register_Sample.xlsx');
const sheet = wb.Sheets[wb.SheetNames[0]];
const rawRows = XLSX.utils.sheet_to_json(sheet);

console.log(`Read ${rawRows.length} rows.`);
const results = cleanDataset(rawRows);

console.log("\n=== CLEANING SUMMARY RESULTS ===");
results.forEach(r => {
  console.log(`[Row ${r.originalIndex}] ${r.branch} | ${r.customer_name || '<MISSING>'} | ${r.loan_amount} | ${r.loan_date} | ${r.phone || '<MISSING>'} | ${r.status} --> Status: ${r.statusSummary}`);
  if (r.issues.length > 0) {
    r.issues.forEach(i => console.log(`   - [${i.type}] [${i.field}] ${i.message}`));
  }
  if (Object.keys(r.suggestions).length > 0) {
    console.log(`   - Suggestions:`, JSON.stringify(r.suggestions));
  }
});
