// Moves your Kit subscribers into the Letters list. They already confirmed with Kit, so this imports
// them directly (no double opt-in email). Only "active" subscribers come over, and demo mode applies.
// Usage: node scripts/import-kit.mjs kit_export.csv [--dry-run]
import { readFileSync } from 'node:fs';
import { brevo } from '../src/brevo.js';
import { parsePatterns, isAllowed } from '../src/guard.js';
import { brevoKey, wranglerVar } from './env.mjs';

const [csvPath, flag] = process.argv.slice(2);
if (!csvPath) throw new Error('Usage: node scripts/import-kit.mjs kit_export.csv [--dry-run]');
const dryRun = flag === '--dry-run';
const listId = Number(wranglerVar('LIST_ID'));
const patterns = parsePatterns(wranglerVar('ALLOWED_EMAILS'));
const key = brevoKey();
const api = (path, opts) => brevo(key, path, opts);

// Kit's export is plain CSV, but fields like tags can be quoted ("newsletter,workshop").
function parseCsv(text) {
  const rows = [[]];
  let field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') field += text[i++];
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') rows.at(-1).push(field), (field = '');
    else if (ch === '\n') rows.at(-1).push(field), rows.push([]), (field = '');
    else if (ch !== '\r') field += ch;
  }
  rows.at(-1).push(field);
  const [header, ...data] = rows.filter((r) => r.some((f) => f.trim()));
  return data.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

const subscribers = parseCsv(readFileSync(csvPath, 'utf8').replace(/^﻿/, ''));
const skipped = {}, refused = [], contacts = new Map();
for (const s of subscribers) {
  const email = s.email_address.toLowerCase();
  if (s.state !== 'active') skipped[s.state] = (skipped[s.state] || 0) + 1;
  else if (!isAllowed(email, patterns)) refused.push(email);
  else contacts.set(email, { email, attributes: { FIRSTNAME: s.first_name } });
}

const count = async () => {
  const list = await api(`/contacts/lists/${listId}`);
  return list.uniqueSubscribers ?? list.totalSubscribers;
};
console.log(`Kit export: ${subscribers.length} subscribers`);
console.log(`Skipped (not active): ${Object.entries(skipped).map(([state, n]) => `${n} ${state}`).join(', ') || 'none'}`);
console.log(`Refused by demo mode: ${refused.length}${refused.length ? ` (${refused.join(', ')})` : ''}`);
console.log(`To import: ${contacts.size}`);
console.log(`\nLetters list ${listId} before: ${await count()} contacts`);
if (dryRun || !contacts.size) process.exit(console.log(dryRun ? 'Dry run, nothing imported.' : 'Nothing to import.'));

const { processId } = await api('/contacts/import', {
  method: 'POST',
  body: { jsonBody: [...contacts.values()], listIds: [listId], updateExistingContacts: true, emptyContactsAttributes: false, disableNotification: true },
});
for (let tries = 0; ; tries++) {
  const { status } = await api(`/processes/${processId}`);
  if (status === 'completed') break;
  if (tries === 60) throw new Error(`Brevo import ${processId} still "${status}" after 2 minutes; check Brevo → Contacts → Import history`);
  await new Promise((r) => setTimeout(r, 2000));
}
console.log(`Letters list ${listId} after:  ${await count()} contacts`);
