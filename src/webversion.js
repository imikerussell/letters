// Turns a sent campaign's HTML into its public web version: same email, minus anything per-subscriber.
// Brevo tags: {{ contact.FIRSTNAME }} becomes "there" (or its | default:"…"), the unsubscribe footer goes.
export function webVersion(html, { title, subscribeBox }) {
  html = html
    .replace(/<p\b[^>]*>(?:(?!<\/p>)[\s\S])*?\{\{\s*unsubscribe\s*\}\}[\s\S]*?<\/p>/gi, '')
    .replace(/<a\b[^>]*\{\{\s*unsubscribe\s*\}\}[^>]*>[\s\S]*?<\/a>/gi, '')
    .replace(/\{\{\s*contact\.(\w+)\s*(?:\|\s*default\s*:\s*["']([^"']*)["']\s*)?\}\}/g, (_, attr, fallback) => fallback ?? (attr === 'FIRSTNAME' ? 'there' : ''))
    .replace(/\{\{[^}]*\}\}/g, '');
  if (!/<head\b/i.test(html))
    html = html.replace(/<body\b/i, `<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>$&`);
  return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${subscribeBox}</body>`) : html + subscribeBox;
}
