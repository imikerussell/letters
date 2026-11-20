// Letters: a newsletter in one Worker. Brevo is the backend; this file is the front door.
import { brevo } from './brevo.js';
import { parsePatterns, isAllowed, blockedRecipients } from './guard.js';
import { markdown, esc } from './markdown.js';
import { webVersion } from './webversion.js';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    try {
      if (url.pathname === '/') return req.method === 'POST' ? signup(req, env, url) : html(signupPage());
      if (url.pathname === '/welcome') return welcome(env, url);
      if (url.pathname === '/admin') return admin(req, env, url);
      if (url.pathname === '/archive') return archive(env);
      const issueId = url.pathname.match(/^\/archive\/(\d+)$/)?.[1];
      if (issueId) return issue(env, issueId);
      return html(shell('Not found', '<h1>Not found</h1>'), 404);
    } catch (err) {
      console.error(err.message);
      return html(shell('Error', `<h1>Something went wrong</h1><p class="muted">${esc(err.message)}</p>`), 500);
    }
  },
};

const api = (env, path, opts) => brevo(env.BREVO_API_KEY, path, opts);
const sender = (env) => ({ name: env.SENDER_NAME, email: env.SENDER_EMAIL });

// ---------- Public: signup → Brevo double opt-in → /welcome ----------

async function signup(req, env, url) {
  const form = await req.formData();
  const name = String(form.get('name') || '').trim().slice(0, 100);
  const email = String(form.get('email') || '').trim().toLowerCase();
  if (!name || !email) return html(signupPage('Please fill in your name and email.'), 400);
  if (!isAllowed(email, parsePatterns(env.ALLOWED_EMAILS)))
    return html(signupPage("Letters is in demo mode right now, so it only accepts a few test addresses. Thanks for stopping by!"), 403);

  const [first, ...rest] = name.split(/\s+/);
  await api(env, '/contacts/doubleOptinConfirmation', {
    method: 'POST',
    body: {
      email,
      attributes: { FIRSTNAME: first, LASTNAME: rest.join(' ') },
      includeListIds: [Number(env.LIST_ID)],
      templateId: Number(env.OPTIN_TEMPLATE_ID),
      redirectionUrl: `${url.origin}/welcome?e=${encodeURIComponent(email)}&s=${await sign(env, email)}`,
    },
  });
  return html(shell('Check your inbox', `<h1>Check your inbox</h1><p>We sent a confirmation link to <b>${esc(email)}</b>. Click it and you're in.</p>`));
}

// Brevo redirects here after the click. The signature proves we built this link, so nobody
// can trigger welcome emails to arbitrary addresses. WELCOMED makes a refresh harmless.
async function welcome(env, url) {
  const email = url.searchParams.get('e') || '';
  let firstName = '';
  if (email && url.searchParams.get('s') === (await sign(env, email))) {
    const contact = await api(env, `/contacts/${encodeURIComponent(email)}`);
    firstName = contact.attributes?.FIRSTNAME || '';
    const subscribed = contact.listIds?.includes(Number(env.LIST_ID));
    if (subscribed && !contact.attributes?.WELCOMED && isAllowed(email, parsePatterns(env.ALLOWED_EMAILS))) {
      await api(env, '/smtp/email', {
        method: 'POST',
        body: { templateId: Number(env.WELCOME_TEMPLATE_ID), to: [{ email, name: firstName || email }], params: { FIRSTNAME: firstName || 'there' } },
      });
      await api(env, `/contacts/${encodeURIComponent(email)}`, { method: 'PUT', body: { attributes: { WELCOMED: true } } });
    }
  }
  return html(shell('Welcome', `<h1>You're in${firstName ? ', ' + esc(firstName) : ''}.</h1><p>Your subscription is confirmed. A welcome letter is on its way.</p>`));
}

async function sign(env, email) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(env.ADMIN_PASSWORD), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(email));
  return [...new Uint8Array(mac)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------- Public archive: every sent issue, straight from Brevo's campaigns ----------

// Only campaigns that were actually sent to the Letters list are public. Anything else in the Brevo account stays private.
const isPublished = (env, c) => c.status === 'sent' && c.recipients?.lists?.includes(Number(env.LIST_ID));
const cached = (res) => (res.headers.set('cache-control', 'public, max-age=300'), res);

async function archive(env) {
  const issues = [];
  for (let offset = 0; ; offset += 100) {
    const { campaigns = [] } = await api(env, `/emailCampaigns?type=classic&status=sent&excludeHtmlContent=true&limit=100&offset=${offset}`);
    issues.push(...campaigns.filter((c) => isPublished(env, c)));
    if (campaigns.length < 100) break;
  }
  issues.sort((a, b) => new Date(b.sentDate) - new Date(a.sentDate));
  const items = issues.map((c) => `<li><a href="/archive/${c.id}">${esc(c.subject)}</a><div class="muted">${new Date(c.sentDate).toDateString()}</div></li>`);
  return cached(html(shell('Letters archive', `
    <h1>Archive</h1>
    <p class="muted">Every letter so far. <a href="/">Subscribe</a> to get the next one.</p>
    ${items.length ? `<ul class="issues">${items.join('')}</ul>` : '<p class="muted">Nothing here yet.</p>'}`)));
}

async function issue(env, id) {
  const c = await api(env, `/emailCampaigns/${id}`).catch((err) => (err.status === 404 ? null : Promise.reject(err)));
  if (!c || !isPublished(env, c)) return html(shell('Not found', '<h1>Not found</h1><p><a href="/archive">See all letters</a></p>'), 404);
  return cached(html(webVersion(c.htmlContent, { title: esc(c.subject), subscribeBox })));
}

const subscribeBox = `<div style="max-width:600px;margin:0 auto;padding:8px 20px 48px;font:15px/1.5 system-ui,sans-serif;color:#1d1d1b">
<form method="post" action="/" style="border-top:1px solid #ddd;padding-top:24px;display:grid;gap:10px">
<p style="margin:0"><b>Enjoyed this?</b> Get the next letter in your inbox.</p>
<input name="name" placeholder="Your name" autocomplete="name" required style="font:inherit;padding:12px;border:1px solid #ccc;border-radius:8px">
<input name="email" type="email" placeholder="you@example.com" autocomplete="email" required style="font:inherit;padding:12px;border:1px solid #ccc;border-radius:8px">
<button style="font:inherit;font-weight:600;color:#fff;background:#7c6cff;border:0;border-radius:8px;padding:12px">Subscribe</button>
</form><p><a href="/archive" style="color:#7c6cff">&larr; All letters</a></p></div>`;

// ---------- Admin: write, preview, send, stats ----------

async function admin(req, env, url) {
  if (!(await authorized(req, env)))
    return new Response('Password required', { status: 401, headers: { 'www-authenticate': 'Basic realm="Letters admin"' } });
  if (req.method !== 'POST') return html(await adminPage(env, { notice: url.searchParams.has('sent') ? 'Sent. Brevo is delivering it now.' : '' }));
  if (req.headers.get('origin') !== url.origin) return new Response('Bad origin', { status: 403 });

  const form = await req.formData();
  const subject = String(form.get('subject') || '').trim();
  const body = String(form.get('body') || '');
  if (!subject || !body.trim()) return html(await adminPage(env, { subject, body, notice: 'An issue needs a subject and a body.' }));
  if (form.get('action') !== 'send') return html(await adminPage(env, { subject, body, preview: true }));

  // The demo-mode guard: refuse the whole send if anyone on the list is outside ALLOWED_EMAILS.
  const blocked = blockedRecipients(await listEmails(env), parsePatterns(env.ALLOWED_EMAILS));
  if (blocked.length)
    return html(await adminPage(env, { subject, body, notice: `Not sent. Demo mode: ${blocked.length} contact(s) on the list are outside ALLOWED_EMAILS (${blocked.slice(0, 5).map(esc).join(', ')}).` }), 403);

  const { id } = await api(env, '/emailCampaigns', {
    method: 'POST',
    body: { name: `Letters: ${subject}`, subject, sender: sender(env), htmlContent: emailHtml(subject, body), recipients: { listIds: [Number(env.LIST_ID)] } },
  });
  await api(env, `/emailCampaigns/${id}/sendNow`, { method: 'POST' });
  return Response.redirect(`${url.origin}/admin?sent=${id}`, 303);
}

async function authorized(req, env) {
  const [, b64] = (req.headers.get('authorization') || '').match(/^Basic (.+)$/) || [];
  if (!b64 || !env.ADMIN_PASSWORD) return false;
  const password = atob(b64).split(':').slice(1).join(':');
  const digest = (s) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return crypto.subtle.timingSafeEqual
    ? crypto.subtle.timingSafeEqual(await digest(password), await digest(env.ADMIN_PASSWORD))
    : password === env.ADMIN_PASSWORD; // Node (tests) has no timingSafeEqual on subtle
}

async function listEmails(env) {
  const emails = [];
  for (let offset = 0; ; offset += 500) {
    const { contacts = [] } = await api(env, `/contacts/lists/${env.LIST_ID}/contacts?limit=500&offset=${offset}`);
    emails.push(...contacts.map((c) => c.email));
    if (contacts.length < 500) return emails;
  }
}

async function adminPage(env, { subject = '', body = '', preview = false, notice = '' }) {
  const [list, { campaigns = [] }] = await Promise.all([
    api(env, `/contacts/lists/${env.LIST_ID}`),
    api(env, '/emailCampaigns?type=classic&statistics=globalStats&limit=50&sort=desc'),
  ]);
  const ours = campaigns.filter((c) => c.recipients?.lists?.includes(Number(env.LIST_ID)));
  const rows = ours.map((c) => {
    const s = c.statistics?.globalStats || {};
    return `<tr><td>${esc(c.subject || c.name)}<div class="muted">${c.sentDate ? new Date(c.sentDate).toDateString() : esc(c.status)}</div></td>
      <td>${s.delivered ?? 0}</td><td>${s.uniqueViews ?? 0}</td><td>${s.uniqueClicks ?? 0}</td><td>${s.unsubscriptions ?? 0}</td></tr>`;
  });
  const demo = parsePatterns(env.ALLOWED_EMAILS).includes('*') ? '' : `<span class="pill">demo mode: ${esc(env.ALLOWED_EMAILS || 'nobody')}</span>`;

  return shell('Letters admin', `
    <h1>Letters ${demo}</h1>
    <p class="muted">${list.uniqueSubscribers ?? list.totalSubscribers ?? 0} subscribers</p>
    ${notice ? `<p class="notice">${notice}</p>` : ''}
    <form method="post">
      <input name="subject" placeholder="Subject" value="${esc(subject)}" required>
      <textarea name="body" rows="14" placeholder="Write in Markdown…" required>${esc(body)}</textarea>
      ${preview ? `<iframe title="Preview" srcdoc="${esc(emailHtml(subject, body))}"></iframe>` : ''}
      <div class="row">
        <button name="action" value="preview" class="ghost">Preview</button>
        ${preview ? `<button name="action" value="send" onclick="return confirm('Send to the whole list?')">Send to list</button>` : ''}
      </div>
    </form>
    <h2>Past issues</h2>
    ${rows.length ? `<div class="scroll"><table><tr><th>Issue</th><th>Delivered</th><th>Opens</th><th>Clicks</th><th>Unsubs</th></tr>${rows.join('')}</table></div>` : '<p class="muted">Nothing sent yet.</p>'}`);
}

// ---------- HTML ----------

// The email itself. {{ unsubscribe }} is Brevo's tag: Brevo swaps in a real per-contact unsubscribe link.
const emailHtml = (subject, body) => `<!doctype html><html><body style="margin:0;background:#f6f6f4">
<div style="max-width:600px;margin:0 auto;padding:32px 20px;font:17px/1.6 Georgia,serif;color:#1d1d1b">
<h1 style="font-size:26px;line-height:1.25">${esc(subject)}</h1>${markdown(body)}
<p style="margin-top:40px;font:13px/1.5 system-ui,sans-serif;color:#888">You're getting this because you subscribed to Letters. <a href="{{ unsubscribe }}" style="color:#888">Unsubscribe</a></p>
</div></body></html>`;

const signupPage = (error = '') => shell('Letters', `
  <h1>Letters</h1>
  <p class="muted">A short letter, now and then. No spam, unsubscribe any time.</p>
  ${error ? `<p class="notice">${esc(error)}</p>` : ''}
  <form method="post">
    <input name="name" placeholder="Your name" autocomplete="name" required>
    <input name="email" type="email" placeholder="you@example.com" autocomplete="email" required>
    <button>Subscribe</button>
  </form>
  <p class="muted"><a href="/archive">Read past letters &rarr;</a></p>`);

const shell = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
*{box-sizing:border-box}a{color:#b4abff}.issues{list-style:none;padding:0}.issues li{padding:14px 0;border-bottom:1px solid #222}.issues a{font-size:1.1rem;text-decoration:none}body{margin:0;background:#0e0e10;color:#ececec;font:17px/1.55 system-ui,sans-serif}
main{max-width:640px;margin:0 auto;padding:12vh 16px 48px}h1{font-size:2rem;margin:0 0 .3em}h2{margin-top:2.5em;font-size:1.1rem}
.muted{color:#8b8b93}.notice{background:#2a2412;border:1px solid #5c4b1a;color:#f3d98b;padding:12px 14px;border-radius:10px}
.pill{font-size:.75rem;font-weight:500;vertical-align:middle;background:#2a2412;color:#f3d98b;padding:3px 9px;border-radius:99px}
form{display:grid;gap:12px;margin-top:24px}input,textarea{width:100%;font:inherit;color:inherit;background:#18181b;border:1px solid #2e2e33;border-radius:10px;padding:13px 14px}
textarea{font:15px/1.5 ui-monospace,monospace}input:focus,textarea:focus{outline:2px solid #7c6cff;border-color:transparent}
button{font:inherit;font-weight:600;color:#fff;background:#7c6cff;border:0;border-radius:10px;padding:13px 18px;cursor:pointer}
.ghost{background:transparent;border:1px solid #2e2e33}.row{display:flex;gap:10px;flex-wrap:wrap}
iframe{width:100%;height:480px;border:0;border-radius:10px;background:#f6f6f4}
.scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:.9rem}th,td{text-align:left;padding:10px 8px;border-bottom:1px solid #222}td+td,th+th{text-align:right}
</style></head><body><main>${body}</main></body></html>`;

const html = (body, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
