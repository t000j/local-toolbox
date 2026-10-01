import DOMPurify from 'dompurify'

export function sanitizeMarkdown(html: string): string {
  // Strictly presentation-only: no URLs, media, styles, forms or executable content.
  // Removing href/src also prevents local documents from loading remote resources.
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'em', 'del', 'blockquote',
      'ul', 'ol', 'li', 'pre', 'code', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a'],
    ALLOWED_ATTR: ['start', 'colspan', 'rowspan'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  })
}
