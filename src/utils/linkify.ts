/**
 * Utility functions for URL detection and linkification.
 */

// Common top-level domains for bare domain matching
const COMMON_TLDS = [
  'com', 'org', 'net', 'edu', 'gov', 'mil', 'io', 'dev', 'app', 'ai', 'co', 'me', 'info',
  'biz', 'xyz', 'tv', 'cc', 'us', 'uk', 'ca', 'de', 'fr', 'in', 'jp', 'au', 'eu', 'nl',
  'br', 'ru', 'is', 'tech', 'online', 'store', 'site', 'club', 'design', 'cloud', 'social',
].join('|');

// Matches http(s)://, www., and bare domains with common TLDs
const URL_PATTERN = new RegExp(
  `(?:https?:\\/\\/|www\\.)[^\\s<>"'\`]+|\\b[a-zA-Z0-9][-a-zA-Z0-9]*\\.(?:${COMMON_TLDS})\\b(?:\\/[^\\s<>"'\`]*)?`,
  'gi'
);

/**
 * Strips trailing punctuation such as . , ! ? ) > from the end of a matched URL.
 * Balances closing parentheses if URL itself includes matching opening parentheses.
 */
export function stripTrailingPunctuation(rawUrl: string): { url: string; trailing: string } {
  let url = rawUrl;
  let trailing = '';
  const punctRegex = /[.,!?:;"')\]>]+$/;

  while (punctRegex.test(url)) {
    if (url.endsWith(')')) {
      const openCount = (url.match(/\(/g) || []).length;
      const closeCount = (url.match(/\)/g) || []).length;
      if (openCount >= closeCount) {
        break;
      }
    }
    const lastChar = url[url.length - 1];
    trailing = lastChar + trailing;
    url = url.slice(0, -1);
  }

  return { url, trailing };
}

/**
 * Ensures a URL starts with https:// or http://.
 */
export function normalizeHref(url: string): string {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  return `https://${url}`;
}

export interface LinkToken {
  type: 'text' | 'link';
  text: string;
  href?: string;
}

/**
 * Splits text into tokens of regular text and clickable URLs.
 */
export function linkifyText(text: string): LinkToken[] {
  if (!text) return [];

  const tokens: LinkToken[] = [];
  let lastIndex = 0;
  const regex = new RegExp(URL_PATTERN.source, 'gi');

  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const matchedText = match[0];
    const startIndex = match.index;

    // Push text preceding the match
    if (startIndex > lastIndex) {
      tokens.push({
        type: 'text',
        text: text.slice(lastIndex, startIndex),
      });
    }

    const { url, trailing } = stripTrailingPunctuation(matchedText);

    if (url) {
      tokens.push({
        type: 'link',
        text: url,
        href: normalizeHref(url),
      });
    }

    if (trailing) {
      tokens.push({
        type: 'text',
        text: trailing,
      });
    }

    lastIndex = startIndex + matchedText.length;
  }

  // Push remaining text
  if (lastIndex < text.length) {
    tokens.push({
      type: 'text',
      text: text.slice(lastIndex),
    });
  }

  return tokens;
}

/**
 * Extracts all valid URLs from a block of text.
 */
export function extractUrls(text: string): string[] {
  if (!text) return [];
  const tokens = linkifyText(text);
  return tokens.filter((t) => t.type === 'link' && t.href).map((t) => t.href!);
}
