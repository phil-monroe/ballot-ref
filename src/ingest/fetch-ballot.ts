import { readFileSync } from 'node:fs';
import type { Ballot } from '../schemas/contest.ts';

export interface BallotBytes {
  data: Uint8Array;
  contentType: string;
  method: 'direct' | 'playwright' | 'manual';
}

export class NeedsManualImport extends Error {}

export function ballotUrl(b: Ballot): string {
  const s = b.ballot_source;
  return `https://lookup.boe.ohio.gov/vtrapp/${s.county_slug}/getballot.aspx?elect=${s.election_code}&prsid=${s.precinct_code}&bpty=X`;
}

async function direct(
  url: string,
  userAgent: string,
  fetchImpl: typeof fetch,
): Promise<BallotBytes> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchImpl(url, { headers: { 'user-agent': userAgent } });
      const contentType = res.headers.get('content-type') ?? '';
      if (res.ok && contentType.includes('application/pdf')) {
        return {
          data: new Uint8Array(await res.arrayBuffer()),
          contentType: 'application/pdf',
          method: 'direct',
        };
      }
      lastErr = new Error(`HTTP ${res.status} ${contentType}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
  }
  throw lastErr;
}

/** Browser-driven fallback. Playwright is optional; when absent the caller is told to import manually. */
async function viaPlaywright(url: string): Promise<BallotBytes> {
  const mod = 'playwright';
  interface Browser {
    newContext(): Promise<{
      request: {
        get(u: string): Promise<{ ok(): boolean; status(): number; body(): Promise<Buffer> }>;
      };
    }>;
    close(): Promise<void>;
  }
  let pw: { chromium: { launch(): Promise<Browser> } };
  try {
    pw = await import(/* @vite-ignore */ mod);
  } catch {
    throw new NeedsManualImport('Playwright is not installed; use --from <ballot.pdf>');
  }
  const browser = await pw.chromium.launch();
  try {
    const ctx = await browser.newContext();
    const res = await ctx.request.get(url);
    if (!res.ok()) throw new NeedsManualImport(`Browser fetch failed: HTTP ${res.status()}`);
    return {
      data: new Uint8Array(await res.body()),
      contentType: 'application/pdf',
      method: 'playwright',
    };
  } finally {
    await browser.close();
  }
}

/** Order: manual file, direct HTTP, Playwright, then ask for manual import. */
export async function getBallotBytes(opts: {
  ballot: Ballot;
  from?: string;
  userAgent: string;
  fetchImpl?: typeof fetch;
}): Promise<BallotBytes> {
  if (opts.from) {
    return {
      data: new Uint8Array(readFileSync(opts.from)),
      contentType: 'application/pdf',
      method: 'manual',
    };
  }
  const url = ballotUrl(opts.ballot);
  try {
    return await direct(url, opts.userAgent, opts.fetchImpl ?? fetch);
  } catch {
    return await viaPlaywright(url).catch((e) => {
      throw e instanceof NeedsManualImport
        ? e
        : new NeedsManualImport(`Could not retrieve ${url}; supply the PDF with --from`);
    });
  }
}
