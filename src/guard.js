// Demo mode. ALLOWED_EMAILS is a comma-separated list of patterns where * matches anything,
// e.g. "yourname+*@gmail.com". Empty means nobody (fail closed); "*" turns demo mode off.
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const escape = (s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');

export const parsePatterns = (s = '') => s.split(',').map((p) => p.trim().toLowerCase()).filter(Boolean);

export function isAllowed(email, patterns) {
  email = String(email).trim().toLowerCase();
  if (!EMAIL.test(email)) return false;
  return patterns.some((p) => new RegExp('^' + p.split('*').map(escape).join('.*') + '$').test(email));
}

// Everyone on the list who is NOT allowed. A send only goes out if this is empty.
export const blockedRecipients = (emails, patterns) => emails.filter((e) => !isAllowed(e, patterns));
