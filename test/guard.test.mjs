import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePatterns, isAllowed, blockedRecipients } from '../src/guard.js';
import worker from '../src/worker.js';

const demo = parsePatterns('yourname+*@gmail.com');

test('allowlist matches only the demo inboxes', () => {
  assert.ok(isAllowed('yourname+ada@gmail.com', demo));
  assert.ok(isAllowed('YourName+Ada@Gmail.com', demo));
  for (const e of ['ada@gmail.com', 'yourname@gmail.com', 'yourname+ada@gmail.co', 'xyourname+a@gmail.com',
    'yourname+a@evil.com', 'yourname+a@evil.com@gmail.com', 'yourname+a@gmail.com.evil.com', ''])
    assert.equal(isAllowed(e, demo), false, e);
});

test('empty allowlist fails closed; "*" turns demo mode off', () => {
  assert.equal(isAllowed('ada@example.com', parsePatterns('')), false);
  assert.equal(isAllowed('ada@example.com', parsePatterns(undefined)), false);
  assert.ok(isAllowed('ada@example.com', parsePatterns('*')));
});

test('blockedRecipients finds every outsider', () => {
  assert.deepEqual(blockedRecipients(['yourname+a@gmail.com', 'real@person.com'], demo), ['real@person.com']);
});

// End to end through the Worker, with Brevo faked: one outsider on the list blocks the whole send.
const env = { BREVO_API_KEY: 'test', ADMIN_PASSWORD: 'pw', ALLOWED_EMAILS: 'yourname+*@gmail.com', LIST_ID: '3', SENDER_NAME: 'Letters', SENDER_EMAIL: 'hello@example.com' };

async function send(listEmails) {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const path = new URL(url).pathname + new URL(url).search;
    calls.push(`${init.method || 'GET'} ${path}`);
    const body = path.startsWith('/v3/contacts/lists/3/contacts') ? { contacts: listEmails.map((email) => ({ email })) }
      : path.startsWith('/v3/emailCampaigns?') ? { campaigns: [] }
      : path === '/v3/emailCampaigns' ? { id: 42 }
      : {};
    return new Response(init.method === 'POST' && path.endsWith('sendNow') ? null : JSON.stringify(body), { status: path.endsWith('sendNow') ? 204 : 200 });
  };
  const req = new Request('https://letters.test/admin', {
    method: 'POST',
    headers: { origin: 'https://letters.test', authorization: 'Basic ' + btoa('admin:pw') },
    body: new URLSearchParams({ subject: 'Hi', body: 'Hello **world**', action: 'send' }),
  });
  return { res: await worker.fetch(req, env), calls };
}

test('send is refused if anyone on the list is outside the allowlist', async () => {
  const { res, calls } = await send(['yourname+ada@gmail.com', 'someone.real@yahoo.com']);
  assert.equal(res.status, 403);
  assert.match(await res.text(), /someone\.real@yahoo\.com/);
  assert.ok(!calls.some((c) => c.startsWith('POST /v3/emailCampaigns')), 'no campaign created or sent');
});

test('send goes out when everyone is allowed', async () => {
  const { res, calls } = await send(['yourname+ada@gmail.com', 'yourname+bob@gmail.com']);
  assert.equal(res.status, 303);
  assert.ok(calls.includes('POST /v3/emailCampaigns/42/sendNow'));
});

test('signup refuses addresses outside the allowlist without calling Brevo', async () => {
  let called = false;
  globalThis.fetch = async () => ((called = true), new Response('{}'));
  const req = new Request('https://letters.test/', { method: 'POST', body: new URLSearchParams({ name: 'Real Person', email: 'real@person.com' }) });
  const res = await worker.fetch(req, env);
  assert.equal(res.status, 403);
  assert.match(await res.text(), /demo mode/);
  assert.equal(called, false);
});
