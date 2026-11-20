// The only way Letters talks to Brevo. Shared by the Worker and scripts/setup.mjs.
export async function brevo(apiKey, path, { method = 'GET', body } = {}) {
  const res = await fetch('https://api.brevo.com/v3' + path, {
    method,
    headers: { 'api-key': apiKey, accept: 'application/json', ...(body && { 'content-type': 'application/json' }) },
    body: body && JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw Object.assign(new Error(`Brevo ${method} ${path} → ${res.status}: ${data.message || text}`), { status: res.status });
  return data;
}
