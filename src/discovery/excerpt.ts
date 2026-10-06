import type { Fetcher } from '../fetch/fetcher.ts';
import { htmlToText } from '../fetch/html-text.ts';
import { isLinkOnlyHost } from './validity.ts';

const EXCERPT_CHARS = 300;

/** Strips control and escape sequences so fetched text cannot drive the reviewer's terminal. */
export function sanitizeForTerminal(s: string): string {
  return s
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '') // CSI sequences
    .replace(/\u001b\][^\u0007\u001b]*(\u0007|\u001b\\)?/g, '') // OSC sequences
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Page title and the first few hundred characters, fetched at review time (FR-004a). The result is for
 * the reviewer's eyes only: it is returned to the caller for printing and is never written to disk or
 * used as a quote.
 */
export async function fetchExcerpt(url: string, fetcher: Fetcher): Promise<string> {
  if (isLinkOnlyHost(url)) return '(link-only context: not fetched)';
  const res = await fetcher.fetchUrl(url);
  if (!res.ok) return `(could not load: ${res.reason}: ${sanitizeForTerminal(res.error)})`;
  if (!/html|text/i.test(res.contentType)) return `(${sanitizeForTerminal(res.contentType)})`;
  const html = res.body.toString('utf8');
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  const title = t ? sanitizeForTerminal(htmlToText(`<p>${t}</p>`)) : '';
  const body = sanitizeForTerminal(htmlToText(html)).slice(0, EXCERPT_CHARS);
  return `${title ? `Title: ${title}\n` : ''}${body}`;
}
