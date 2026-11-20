import { test } from 'node:test';
import assert from 'node:assert/strict';
import { webVersion } from '../src/webversion.js';
import worker from '../src/worker.js';

// Shaped like what Brevo stores for a sent issue.
const sent = `<!doctype html><html><body style="margin:0"><div><h1>Issue #1</h1><p>Hey {{ contact.FIRSTNAME }},</p>
<p>Hi {{ contact.LASTNAME | default:"friend" }}.</p>
<p style="color:#888">You're getting this because you subscribed to Letters. <a href="{{ unsubscribe }}">Unsubscribe</a></p>
</div></body></html>`;

test('web version hides the unsubscribe footer and fills in personal tags', () => {
  const page = webVersion(sent, { title: 'Issue #1', subscribeBox: '<form id="sub"></form>' });
  assert.doesNotMatch(page, /unsubscribe/i);
  assert.doesNotMatch(page, /\{\{/);
  assert.match(page, /Hey there,/);
  assert.match(page, /Hi friend\./);
  assert.match(page, /<form id="sub"><\/form><\/body>/);
  assert.match(page, /<title>Issue #1<\/title>/);
});

const env = { BREVO_API_KEY: 'test', ADMIN_PASSWORD: 'pw', ALLOWED_EMAILS: 'yourname+*@gmail.com', LIST_ID: '3' };
const campaigns = [
  { id: 4, subject: 'Older', status: 'sent', sentDate: '2026-10-01T10:00:00Z', recipients: { lists: [3] }, htmlContent: sent },
  { id: 9, subject: 'Newer', status: 'sent', sentDate: '2026-10-20T10:00:00Z', recipients: { lists: [3] }, htmlContent: sent },
  { id: 5, subject: 'Other list', status: 'sent', sentDate: '2026-10-25T10:00:00Z', recipients: { lists: [7] }, htmlContent: 'secret' },
  { id: 6, subject: 'Draft', status: 'draft', recipients: { lists: [3] }, htmlContent: 'draft' },
];
globalThis.fetch = async (url) => {
  const path = new URL(url).pathname;
  if (path === '/v3/emailCampaigns') return Response.json({ campaigns: campaigns.filter((c) => c.status === 'sent') });
  const c = campaigns.find((c) => path === `/v3/emailCampaigns/${c.id}`);
  return c ? Response.json(c) : Response.json({ message: 'Campaign not found' }, { status: 404 });
};
const get = (path) => worker.fetch(new Request('https://letters.test' + path), env);

test('/archive lists only issues sent to the list, newest first', async () => {
  const page = await (await get('/archive')).text();
  assert.ok(page.indexOf('Newer') < page.indexOf('Older'));
  assert.doesNotMatch(page, /Other list|Draft/);
});

test('/archive/<id> shows a sent issue with a subscribe box, and nothing else is public', async () => {
  const res = await get('/archive/4');
  assert.equal(res.status, 200);
  const page = await res.text();
  assert.match(page, /Hey there,/);
  assert.match(page, /<form method="post" action="\/"/);
  assert.doesNotMatch(page, /unsubscribe/i);
  for (const id of [5, 6, 404]) assert.equal((await get(`/archive/${id}`)).status, 404, `campaign ${id}`);
});
