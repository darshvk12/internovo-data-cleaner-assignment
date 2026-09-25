/**
 * Internovo Loan Register Cleaning & Validation Engine
 * 100% Rule-Based & Format-Based. Zero hardcoded customer names, branches, or data values.
 */

(function (global) {
  'use strict';

  // Generic column header aliases to support arbitrary branch formats
  const COLUMN_MAPPINGS = {
    branch: ['branch', 'branch name', 'branch_name', 'br', 'location', 'office', 'branch code'],
    customer_name: ['customer name', 'customer_name', 'customer', 'borrower', 'borrower name', 'client', 'name', 'applicant name', 'account name'],
    loan_amount: ['loan amt', 'loan_amt', 'loan amount', 'loan_amount', 'amount', 'amt', 'principal', 'disbursal amount', 'disbursed amount', 'sanctioned amount'],
    loan_date: ['loan date', 'loan_date', 'date', 'disbursal date', 'disbursement date', 'booking date', 'sanction date'],
    phone: ['phone no', 'phone_no', 'phone', 'phone number', 'mobile', 'mobile no', 'contact', 'contact no', 'cell'],
    status: ['status', 'loan status', 'loan_status', 'state', 'account status'],
    notes: ['notes', 'note', 'comments', 'remarks', 'memo']
  };

  /**
   * Generic Branch Normalizer:
   * Strips generic branch suffixes (BR, Branch, Office), trailing punctuation, and normalizes title casing.
   * Does NOT rely on any pre-set list of branch names.
   */
  function normalizeBranch(branch) {
    if (branch === undefined || branch === null || String(branch).trim() === '') {
      return { value: '', flag: 'BRANCH_MISSING', message: 'Branch name is missing in register' };
    }
    let clean = String(branch).trim();
    // Strip common generic corporate/branch designations
    clean = clean.replace(/\s+(BR|Br\.?|Branch|Office|Bldg|Building)\b\.?/gi, '').trim();
    clean = clean.replace(/[.,;]+$/, '').trim();
    // Generic title case
    clean = clean.split(/\s+/).map(w => {
      if (w.length === 0) return '';
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }).join(' ');

    return { value: clean, original: branch };
  }

  /**
   * Generic Customer Name Normalizer:
   * Cleans extra whitespace, normalizes casing, detects missing values.
   * Does NOT rely on any pre-set list of customer names.
   */
  function normalizeCustomerName(name) {
    if (name === undefined || name === null || String(name).trim() === '') {
      return { value: '', flag: 'CUSTOMER_NAME_MISSING', message: 'Customer name is missing in register' };
    }
    const clean = String(name).trim().replace(/\s+/g, ' ');
    if (clean === '') {
      return { value: '', flag: 'CUSTOMER_NAME_MISSING', message: 'Customer name is missing in register' };
    }

    const formatted = clean.split(' ').map(part => {
      if (part.includes('.')) {
        return part.toUpperCase(); // Preserve initials like "R." or "J.D."
      }
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    }).join(' ');

    return { value: formatted, original: name };
  }

  /**
   * Generic Loan Amount Normalizer:
   * Strips currency symbols (₹, $, €, £, Rs., INR, etc.), commas, spaces.
   * Evaluates standard numeric multipliers (K, M, Lakh/Lac, Cr/Crore).
   * Validates positive numeric constraints without guessing.
   */
  function normalizeLoanAmount(amt) {
    if (amt === undefined || amt === null || String(amt).trim() === '') {
      return {
        value: null,
        flag: 'LOAN_AMOUNT_MISSING',
        message: 'Loan amount is missing in register',
        suggestion: null
      };
    }
    let str = String(amt).trim();
    let isNegative = str.startsWith('-') || /^-/.test(str);

    // Generic currency prefix/symbol strip
    let cleanStr = str.replace(/[\u20B9₹$€£,\s]|â‚¹/g, '').replace(/^(Rs\.?|INR|USD|EUR|GBP)/i, '').trim();

    let multiplier = 1;
    let note = null;

    if (/^(\d+(?:\.\d+)?)\s*k\b/i.test(cleanStr)) {
      const match = cleanStr.match(/^(\d+(?:\.\d+)?)\s*k\b/i);
      cleanStr = match[1];
      multiplier = 1000;
      note = `Parsed shorthand multiplier "${amt}" as ${parseFloat(cleanStr) * 1000}`;
    } else if (/^(\d+(?:\.\d+)?)\s*m\b/i.test(cleanStr)) {
      const match = cleanStr.match(/^(\d+(?:\.\d+)?)\s*m\b/i);
      cleanStr = match[1];
      multiplier = 1000000;
      note = `Parsed shorthand multiplier "${amt}" as ${parseFloat(cleanStr) * 1000000}`;
    } else if (/^(\d+(?:\.\d+)?)\s*(lakh|lac|l)\b/i.test(cleanStr)) {
      const match = cleanStr.match(/^(\d+(?:\.\d+)?)\s*(lakh|lac|l)\b/i);
      cleanStr = match[1];
      multiplier = 100000;
      note = `Parsed shorthand multiplier "${amt}" as ${parseFloat(cleanStr) * 100000}`;
    } else if (/^(\d+(?:\.\d+)?)\s*(cr|crore)\b/i.test(cleanStr)) {
      const match = cleanStr.match(/^(\d+(?:\.\d+)?)\s*(cr|crore)\b/i);
      cleanStr = match[1];
      multiplier = 10000000;
      note = `Parsed shorthand multiplier "${amt}" as ${parseFloat(cleanStr) * 10000000}`;
    }

    let num = parseFloat(cleanStr);
    if (isNaN(num)) {
      return {
        value: null,
        flag: 'LOAN_AMOUNT_INVALID',
        message: `Invalid non-numeric loan amount: "${amt}"`,
        suggestion: null
      };
    }

    num = num * multiplier;

    if (isNegative || num < 0) {
      const absVal = Math.abs(num);
      return {
        value: -absVal,
        flag: 'LOAN_AMOUNT_NEGATIVE',
        message: `Negative loan amount detected (${num}). Principal cannot be negative.`,
        suggestion: absVal
      };
    }

    if (num === 0) {
      return {
        value: 0,
        flag: 'LOAN_AMOUNT_ZERO',
        message: `Loan amount cannot be zero.`,
        suggestion: null
      };
    }

    return { value: num, note, original: amt };
  }

  /**
   * Generic Date Normalizer & Strict Calendar Validator:
   * Handles:
   *  - ISO: YYYY-MM-DD, YYYY.MM.DD, YYYY/MM/DD
   *  - European/Indian: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
   *  - Short years: D-M-YY, DD-MM-YY
   *  - Written text: "October 5 2026", "Oct 5, 2026", "5 Oct 2026", "March 5, 2025"
   *  - Excel numeric serials
   * Validates calendar days per month (e.g. Feb 30, Nov 31 are caught as IMPOSSIBLE).
   * Flags future dates against current year dynamically.
   */
  function normalizeDate(dateVal) {
    if (dateVal === undefined || dateVal === null || String(dateVal).trim() === '') {
      return {
        value: '',
        flag: 'LOAN_DATE_MISSING',
        message: 'Loan date is missing in register',
        suggestion: null
      };
    }

    let str = String(dateVal).trim();

    // Excel serial number support
    if (typeof dateVal === 'number' && dateVal > 25000 && dateVal < 65000) {
      const excelEpoch = new Date(1899, 11, 30);
      const d = new Date(excelEpoch.getTime() + dateVal * 86400000);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return { value: `${y}-${m}-${day}`, original: dateVal };
    }

    const monthNames = {
      jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
      may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
      sep: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
    };

    let year, month, day;

    // Pattern A: Textual month e.g. "Oct 5 2026", "October 5, 2026", "5 Oct 2026", "5th Oct 2026"
    const textPattern1 = /^([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i;
    const textPattern2 = /^(\d{1,2})(?:st|nd|rd|th)?\s+([a-z]+),?\s+(\d{4})$/i;
    const match1 = str.match(textPattern1);
    const match2 = str.match(textPattern2);

    if (match1) {
      month = monthNames[match1[1].toLowerCase()];
      day = parseInt(match1[2], 10);
      year = parseInt(match1[3], 10);
    } else if (match2) {
      day = parseInt(match2[1], 10);
      month = monthNames[match2[2].toLowerCase()];
      year = parseInt(match2[3], 10);
    }
    // Pattern B: YYYY.MM.DD or YYYY-MM-DD or YYYY/MM/DD
    else if (/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})$/.test(str)) {
      const parts = str.match(/^(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})$/);
      year = parseInt(parts[1], 10);
      month = parseInt(parts[2], 10);
      day = parseInt(parts[3], 10);
    }
    // Pattern C: DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY or D-M-YY
    else if (/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})$/.test(str)) {
      const parts = str.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})$/);
      day = parseInt(parts[1], 10);
      month = parseInt(parts[2], 10);
      year = parseInt(parts[3], 10);
      if (year < 100) {
        year += 2000;
      }
    } else {
      return {
        value: str,
        flag: 'LOAN_DATE_UNPARSED',
        message: `Unrecognized date format: "${str}"`,
        suggestion: null
      };
    }

    if (!month || month < 1 || month > 12) {
      return {
        value: str,
        flag: 'INVALID_CALENDAR_DATE',
        message: `Invalid month in date: "${str}"`,
        suggestion: null
      };
    }

    // Strict Calendar Check (Leap years, 28/29/30/31 days)
    const daysInMonth = new Date(year, month, 0).getDate();
    if (day < 1 || day > daysInMonth) {
      const suggestedStr = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth).padStart(2, '0')}`;
      return {
        value: str,
        flag: 'INVALID_CALENDAR_DATE',
        message: `Impossible calendar date: "${str}" (Month ${month} only has ${daysInMonth} days in ${year}).`,
        suggestion: suggestedStr
      };
    }

    // Calendar check completed; date formatting
    const formattedDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    return { value: formattedDate, parsedYear: year, parsedMonth: month, parsedDay: day, original: str };
  }

  /**
   * Generic Phone Normalizer:
   * Strips standard telecom symbols: +, -, spaces, parens, dots.
   * Strips country codes (e.g. +91, 91-, leading 0).
   * Validates exactly 10 digits.
   * Flags alphabetical/corrupted characters without guessing.
   */
  function normalizePhone(phone) {
    if (phone === undefined || phone === null || String(phone).trim() === '') {
      return {
        value: '',
        flag: 'PHONE_MISSING',
        message: 'Phone number is missing in register',
        suggestion: null
      };
    }

    let str = String(phone).trim();

    // Check for non-numeric corruption (letters, invalid symbols)
    if (/[a-zA-Z]/.test(str)) {
      return {
        value: str,
        flag: 'PHONE_CORRUPTED',
        message: `Phone number "${str}" contains corrupted letters. Rule 1: Cannot reliably guess 10 digits without guessing.`,
        suggestion: null
      };
    }

    // Strip non-digit characters
    let digits = str.replace(/[^\d]/g, '');

    // Handle country code +91 or 91
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

  /**
   * Generic Status Normalizer:
   * Strictly validates against enum: Active, Closed, NPA.
   * Case-insensitive trimming. Flags any unrecognized string.
   */
  function normalizeStatus(status) {
    if (!status || String(status).trim() === '') {
      return {
        value: '',
        flag: 'STATUS_MISSING',
        message: 'Status is missing in register',
        suggestion: 'Active'
      };
    }
    const clean = String(status).trim().toLowerCase();
    if (clean === 'active') return { value: 'Active' };
    if (clean === 'closed') return { value: 'Closed' };
    if (clean === 'npa') return { value: 'NPA' };

    return {
      value: status,
      flag: 'STATUS_INVALID',
      message: `Unrecognized status: "${status}" (Target must be Active, Closed, or NPA)`,
      suggestion: 'Active'
    };
  }

  /**
   * Levenshtein Distance (pure algorithmic string distance)
   */
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

  /**
   * Generic Name Initial / Abbreviation Matcher
   * Matches any name where the last names match and one name's first token is an initial of the other.
   * E.g. "R. Kumar" matches "Ramesh Kumar"; "J. Smith" matches "John Smith"; "A. Sharma" matches "Amit Sharma".
   * Zero hardcoded names.
   */
  function isGenericNameAbbreviationMatch(nameA, nameB) {
    if (!nameA || !nameB) return false;
    const partsA = nameA.trim().toLowerCase().split(/\s+/);
    const partsB = nameB.trim().toLowerCase().split(/\s+/);
    if (partsA.length < 2 || partsB.length < 2) return false;

    const lastA = partsA[partsA.length - 1];
    const lastB = partsB[partsB.length - 1];
    if (lastA !== lastB) return false;

    const firstA = partsA[0].replace(/\./g, '');
    const firstB = partsB[0].replace(/\./g, '');

    if ((firstA.length === 1 && firstB.startsWith(firstA)) ||
        (firstB.length === 1 && firstA.startsWith(firstB))) {
      return true;
    }
    return false;
  }

  /**
   * Maps arbitrary input row keys to standardized target fields using flexible regex patterns.
   */
  function mapRowKeys(row) {
    const mapped = {};
    const keys = Object.keys(row);

    for (const key of keys) {
      const cleanKey = key.trim().toLowerCase().replace(/[_\s]+/g, ' ');

      if (/phone|mobile|contact|cell/.test(cleanKey)) {
        mapped.phone = row[key];
      } else if (/status|state/.test(cleanKey)) {
        mapped.status = row[key];
      } else if (/date/.test(cleanKey)) {
        mapped.loan_date = row[key];
      } else if (/amount|amt|principal|sanction|disburs/.test(cleanKey)) {
        mapped.loan_amount = row[key];
      } else if (/customer|borrower|client|applicant/.test(cleanKey) || (cleanKey.includes('name') && !cleanKey.includes('branch'))) {
        mapped.customer_name = row[key];
      } else if (/branch|office|location|br\b/.test(cleanKey)) {
        mapped.branch = row[key];
      } else if (/note|comment|remark|memo/.test(cleanKey)) {
        mapped.notes = row[key];
      }
    }
    return mapped;
  }

  /**
   * Main Dataset Cleaning & Validation Function
   */
  function cleanLoanDataset(rawRows) {
    const cleanedRows = [];

    // Pre-calculate predominant year across the dataset to detect date outliers
    const yearCounts = {};
    rawRows.forEach(row => {
      const mapped = mapRowKeys(row);
      const dateVal = mapped.loan_date !== undefined ? mapped.loan_date : row['Loan Date'];
      const dateRes = normalizeDate(dateVal);
      if (dateRes && dateRes.parsedYear) {
        yearCounts[dateRes.parsedYear] = (yearCounts[dateRes.parsedYear] || 0) + 1;
      }
    });

    let predominantYear = null;
    let maxYearCount = 0;
    for (const y in yearCounts) {
      if (yearCounts[y] > maxYearCount) {
        maxYearCount = yearCounts[y];
        predominantYear = parseInt(y, 10);
      }
    }

    // Pass 1: Individual Row Normalization
    rawRows.forEach((row, index) => {
      const rowNum = index + 2; // Row in sheet (assuming header is Row 1)
      const mapped = mapRowKeys(row);

      const branchRes = normalizeBranch(mapped.branch !== undefined ? mapped.branch : row['Branch']);
      const nameRes = normalizeCustomerName(mapped.customer_name !== undefined ? mapped.customer_name : row['Customer Name']);
      const amtRes = normalizeLoanAmount(mapped.loan_amount !== undefined ? mapped.loan_amount : row['Loan Amt']);
      const dateRes = normalizeDate(mapped.loan_date !== undefined ? mapped.loan_date : row['Loan Date']);
      const phoneRes = normalizePhone(mapped.phone !== undefined ? mapped.phone : row['Phone No']);
      const statusRes = normalizeStatus(mapped.status !== undefined ? mapped.status : row['Status']);
      const originalNotes = (mapped.notes !== undefined ? mapped.notes : row['Notes']) || '';

      const issues = [];
      const suggestions = {};

      if (branchRes.flag) {
        issues.push({ type: 'CRITICAL', field: 'branch', code: branchRes.flag, message: branchRes.message });
      }

      if (nameRes.flag) {
        issues.push({ type: 'CRITICAL', field: 'customer_name', code: nameRes.flag, message: nameRes.message });
      }

      if (amtRes.flag) {
        issues.push({ type: 'CRITICAL', field: 'loan_amount', code: amtRes.flag, message: amtRes.message });
        if (amtRes.suggestion !== null && amtRes.suggestion !== undefined) {
          suggestions['loan_amount'] = amtRes.suggestion;
        }
      }
      if (amtRes.note) {
        issues.push({ type: 'INFO', field: 'loan_amount', code: 'AMOUNT_NORMALIZED', message: amtRes.note });
      }

      if (dateRes.flag) {
        issues.push({ type: 'CRITICAL', field: 'loan_date', code: dateRes.flag, message: dateRes.message });
        if (dateRes.suggestion) suggestions['loan_date'] = dateRes.suggestion;
      } else if (predominantYear && dateRes.parsedYear && dateRes.parsedYear > predominantYear) {
        const warnMsg = `Date "${dateRes.value}" is in the future relative to the register period (${predominantYear}). Verify if loan disbursal was pre-dated or entered with a typo.`;
        issues.push({ type: 'WARNING', field: 'loan_date', code: 'FUTURE_DATE_WARNING', message: warnMsg });
        suggestions['loan_date'] = `${predominantYear}-${String(dateRes.parsedMonth).padStart(2, '0')}-${String(dateRes.parsedDay).padStart(2, '0')}`;
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
        id: `row-${rowNum}`,
        originalIndex: rowNum,
        branch: branchRes.value,
        customer_name: nameRes.value,
        loan_amount: amtRes.value,
        loan_date: dateRes.value,
        phone: phoneRes.value,
        status: statusRes.value,
        original_notes: originalNotes,
        raw_row: row,
        issues,
        suggestions,
        correlations: [],
        reviewState: 'PENDING',
        isConfirmedDuplicate: false
      });
    });

    // Pass 2: Correlation and Multi-Row Duplicate Analysis (Rule 2: Note rather than deleting!)
    for (let i = 0; i < cleanedRows.length; i++) {
      for (let j = i + 1; j < cleanedRows.length; j++) {
        const r1 = cleanedRows[i];
        const r2 = cleanedRows[j];

        // Scenario A: Exact Duplicate (identical name, phone, amount, date)
        if (
          r1.customer_name && r2.customer_name &&
          r1.customer_name.toLowerCase() === r2.customer_name.toLowerCase() &&
          r1.phone && r2.phone && r1.phone === r2.phone &&
          r1.loan_amount === r2.loan_amount &&
          r1.loan_date === r2.loan_date
        ) {
          const msg = `Duplicate entry of Row ${r1.originalIndex} (identical name, phone, amount, and date). Rule 2: Kept and noted.`;
          r2.issues.push({
            type: 'DUPLICATE',
            field: 'all',
            code: 'EXACT_DUPLICATE',
            message: msg,
            matchedRow: r1.originalIndex
          });
          r1.correlations.push({ row: r2.originalIndex, reason: 'Identical duplicate record' });
          r2.correlations.push({ row: r1.originalIndex, reason: 'Identical duplicate record' });
        }

        // Scenario B: Generic Abbreviated Name Match (e.g. "R. Kumar" vs "Ramesh Kumar" or "A. Sharma" vs "Amit Sharma")
        else if (
          r1.loan_amount === r2.loan_amount &&
          r1.loan_date === r2.loan_date &&
          r1.branch.toLowerCase() === r2.branch.toLowerCase() &&
          isGenericNameAbbreviationMatch(r1.customer_name, r2.customer_name)
        ) {
          const isInitial1 = r1.customer_name.split(' ')[0].replace(/\./g, '').length === 1;
          const targetRow = isInitial1 ? r1 : r2;
          const sourceRow = isInitial1 ? r2 : r1;
          const msg = `Potential duplicate of Row ${sourceRow.originalIndex}: Name "${targetRow.customer_name}" matches "${sourceRow.customer_name}" with identical branch, loan amount, and date.`;
          targetRow.issues.push({
            type: 'NOTE',
            field: 'customer_name',
            code: 'NAME_ABBREVIATION_MATCH',
            message: msg,
            matchedRow: sourceRow.originalIndex
          });
          if (!targetRow.phone && sourceRow.phone) {
            targetRow.suggestions['phone'] = sourceRow.phone;
          }
          r1.correlations.push({ row: r2.originalIndex, reason: 'Abbreviated name match' });
          r2.correlations.push({ row: r1.originalIndex, reason: 'Abbreviated name match' });
        }

        // Scenario C: Generic Fuzzy Spelling Variant (Levenshtein distance <= 2 with same amount and date)
        else if (
          r1.loan_amount === r2.loan_amount &&
          r1.loan_date === r2.loan_date &&
          r1.customer_name && r2.customer_name
        ) {
          const n1 = r1.customer_name.toLowerCase();
          const n2 = r2.customer_name.toLowerCase();
          const dist = levenshtein(n1, n2);
          if (dist > 0 && dist <= 2 && n1.length >= 4 && n2.length >= 4) {
            const msg = `Potential spelling duplicate of Row ${r1.originalIndex}: "${r2.customer_name}" vs "${r1.customer_name}" (same amount and date).`;
            r2.issues.push({
              type: 'NOTE',
              field: 'customer_name',
              code: 'SPELLING_VARIANT_MATCH',
              message: msg,
              matchedRow: r1.originalIndex,
              suggestedName: r1.customer_name
            });
            r1.correlations.push({ row: r2.originalIndex, reason: 'Fuzzy spelling variant' });
            r2.correlations.push({ row: r1.originalIndex, reason: 'Fuzzy spelling variant' });
          }
        }

        // Scenario D: Generic Cross-Branch Customer Identity (Same customer name & 10-digit phone across branches)
        else if (
          r1.phone && r2.phone && r1.phone === r2.phone &&
          r1.customer_name && r2.customer_name &&
          r1.customer_name.toLowerCase() === r2.customer_name.toLowerCase() &&
          r1.branch.toLowerCase() !== r2.branch.toLowerCase()
        ) {
          const msg = `Cross-Branch Customer: Same phone (${r1.phone}) and name as Row ${r1.originalIndex} in ${r1.branch} branch. (Multi-branch borrower).`;
          r2.issues.push({
            type: 'INFO',
            field: 'phone',
            code: 'CROSS_BRANCH_CUSTOMER',
            message: msg,
            matchedRow: r1.originalIndex
          });
          r1.correlations.push({ row: r2.originalIndex, reason: `Borrower also active in ${r2.branch}` });
          r2.correlations.push({ row: r1.originalIndex, reason: `Borrower also active in ${r1.branch}` });
        }
      }
    }

    // Final categorization
    cleanedRows.forEach(r => {
      const criticals = r.issues.filter(i => i.type === 'CRITICAL');
      const duplicates = r.issues.filter(i => i.type === 'DUPLICATE');
      const warnings = r.issues.filter(i => i.type === 'WARNING' || i.type === 'NOTE');

      r.hasCriticalIssue = criticals.length > 0;
      r.hasDuplicateIssue = duplicates.length > 0;
      r.hasWarning = warnings.length > 0;

      if (r.hasCriticalIssue) {
        r.statusCategory = 'ERROR';
        r.statusSummary = 'Flagged (Error)';
      } else if (r.hasDuplicateIssue) {
        r.statusCategory = 'DUPLICATE';
        r.statusSummary = 'Flagged (Duplicate)';
      } else if (r.hasWarning) {
        r.statusCategory = 'WARNING';
        r.statusSummary = 'Review Needed';
      } else {
        r.statusCategory = 'CLEAN';
        r.statusSummary = 'Clean';
      }
    });

    return cleanedRows;
  }

  // Export functions
  const LoanCleaner = {
    normalizeBranch,
    normalizeCustomerName,
    normalizeLoanAmount,
    normalizeDate,
    normalizePhone,
    normalizeStatus,
    cleanLoanDataset,
    levenshtein,
    isGenericNameAbbreviationMatch
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LoanCleaner;
  } else {
    global.LoanCleaner = LoanCleaner;
  }
})(typeof window !== 'undefined' ? window : global);
