// Just enough Markdown for a newsletter: headings, paragraphs, lists, quotes, bold, italic, code, links.
const esc = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');

function block(text) {
  const lines = text.trim().split('\n');
  const h = lines[0].match(/^(#{1,3}) (.*)/);
  if (h) return `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>` + (lines.length > 1 ? block(lines.slice(1).join('\n')) : '');
  const list = (re, tag) => lines.every((l) => re.test(l)) && `<${tag}>${lines.map((l) => `<li>${inline(l.replace(re, ''))}</li>`).join('')}</${tag}>`;
  return (
    list(/^[-*] /, 'ul') ||
    list(/^\d+\. /, 'ol') ||
    (lines.every((l) => l.startsWith('>')) && `<blockquote>${lines.map((l) => inline(l.replace(/^> ?/, ''))).join('<br>')}</blockquote>`) ||
    `<p>${lines.map(inline).join('<br>')}</p>`
  );
}

export const markdown = (src) => src.replace(/\r/g, '').split(/\n\s*\n/).filter((b) => b.trim()).map(block).join('\n');
export { esc };
