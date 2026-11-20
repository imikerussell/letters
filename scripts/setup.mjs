// One-time setup: creates the list, templates and attribute Letters needs in Brevo, then prints the ids.
// Safe to re-run: anything that already exists is reused. Usage: node scripts/setup.mjs
import { brevo } from '../src/brevo.js';
import { brevoKey } from './env.mjs';

const key = brevoKey();
const api = (path, opts) => brevo(key, path, opts);
const sender = { name: 'Letters', email: 'hello@letters.example.com' };

// 1. The list (Brevo lists live in a folder, so find or make one first)
const { folders = [] } = await api('/contacts/folders?limit=50&offset=0');
const folderId = folders[0]?.id ?? (await api('/contacts/folders', { method: 'POST', body: { name: 'Letters' } })).id;
const { lists = [] } = await api('/contacts/lists?limit=50&offset=0');
const listId = lists.find((l) => l.name === 'Letters')?.id ?? (await api('/contacts/lists', { method: 'POST', body: { name: 'Letters', folderId } })).id;

// 2. Templates
const { templates = [] } = await api('/smtp/templates?limit=1000&offset=0');
const template = async (name, fields) =>
  templates.find((t) => t.name === name)?.id ??
  (await api('/smtp/templates', { method: 'POST', body: { templateName: name, sender, isActive: true, ...fields } })).id;

const card = (inner) => `<div style="max-width:560px;margin:0 auto;padding:32px 20px;font:17px/1.6 Georgia,serif;color:#1d1d1b">${inner}</div>`;
const optinId = await template('Letters: confirm subscription', {
  tag: 'optin', // Brevo requires this tag on double opt-in templates
  subject: 'Confirm your subscription to Letters',
  htmlContent: card(`<h1 style="font-size:24px">One click to go</h1><p>Confirm you want to get Letters:</p>
    <p><a href="{{ doubleoptin }}" style="display:inline-block;background:#7c6cff;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-family:system-ui,sans-serif">Yes, subscribe me</a></p>
    <p style="color:#888;font-size:14px">Didn't sign up? Ignore this email and you won't hear from us.</p>`),
});
const welcomeId = await template('Letters: welcome', {
  subject: 'Welcome to Letters',
  htmlContent: card(`<h1 style="font-size:24px">Welcome, {{ params.FIRSTNAME }}</h1><p>You're on the list. The next letter will land right here in your inbox.</p><p>Talk soon.</p>`),
});

// 3. A contact attribute so /welcome sends the welcome email only once per person
await api('/contacts/attributes/normal/WELCOMED', { method: 'POST', body: { type: 'boolean' } }).catch((e) => {
  if (!/already exist|must be unique/i.test(e.message)) throw e;
});

console.log(`Brevo is ready. Put these in wrangler.toml under [vars]:

LIST_ID = "${listId}"
OPTIN_TEMPLATE_ID = "${optinId}"
WELCOME_TEMPLATE_ID = "${welcomeId}"`);
