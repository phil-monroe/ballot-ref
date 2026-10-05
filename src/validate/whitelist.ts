import type { Source } from '../schemas/source.ts';

function parse(u: string): URL | null {
  try {
    return new URL(u);
  } catch {
    return null;
  }
}

/** Registry `url` is a URL or URL prefix: same host, path prefix on a segment boundary. */
export function urlMatches(registryUrl: string, candidateUrl: string): boolean {
  const r = parse(registryUrl);
  const c = parse(candidateUrl);
  if (!r || !c) return false;
  if (r.protocol !== c.protocol || r.hostname.toLowerCase() !== c.hostname.toLowerCase())
    return false;
  const rp = r.pathname.replace(/\/+$/, '');
  const cp = c.pathname.replace(/\/+$/, '');
  if (!(cp === rp || cp.startsWith(rp + '/'))) return false;
  return r.search === '' || r.search === c.search;
}

/**
 * Gate 3: the source must be human-registered for the contest. Entity-scoped entries only apply to
 * that entity. Returns the matching entry (its tier is authoritative) or null.
 */
export function matchSource(url: string, sources: Source[], entityId?: string): Source | null {
  const candidates = sources.filter(
    (s) => urlMatches(s.url, url) && (s.entity_id === undefined || s.entity_id === entityId),
  );
  // Prefer the most specific (entity-scoped, then longest URL).
  candidates.sort(
    (a, b) =>
      Number(b.entity_id !== undefined) - Number(a.entity_id !== undefined) ||
      b.url.length - a.url.length,
  );
  return candidates[0] ?? null;
}
