import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadConfig } from '../../src/config.ts';
import { ProcessQueue, type ProcessDeps } from '../../src/discovery/process.ts';
import { addProposals } from '../../src/discovery/queue.ts';
import { sourceReviewLoop } from '../../src/discovery/review-cli.ts';
import type { ExtractInput, LlmExtractor } from '../../src/extract/extractor.ts';
import { Fetcher } from '../../src/fetch/fetcher.ts';
import { house, makeDiscoveryFixture, newProposal } from '../helpers/discovery-fixture.ts';

const config = loadConfig();
const realStdin = Object.getOwnPropertyDescriptor(process, 'stdin')!;
afterEach(() => {
  Object.defineProperty(process, 'stdin', realStdin);
  vi.restoreAllMocks();
});

const SITE = 'https://balderson.example/';
const FEC = 'https://www.fec.gov/data/candidate/H8OH12180/';
const NOISY = 'https://noisy.example/';

/** Feeds one scripted answer each time the loop prints a prompt (a line ending in "> "). */
function script(answers: string[]) {
  const input = new PassThrough();
  Object.defineProperty(process, 'stdin', { value: input, configurable: true });
  const out: string[] = [];
  const queue = [...answers];
  vi.spyOn(console, 'log').mockImplementation((...a) => void out.push(a.join(' ')));
  vi.spyOn(process.stdout, 'write').mockImplementation(((chunk: string | Uint8Array) => {
    const s = String(chunk);
    out.push(s);
    if (/> $/.test(s) && queue.length) setImmediate(() => input.write(queue.shift() + '\n'));
    return true;
  }) as typeof process.stdout.write);
  return out;
}

function setup() {
  const fx = makeDiscoveryFixture();
  addProposals(
    house.id,
    [
      newProposal({ url: FEC, proposed_class: 'fec', proposed_tier: 'official' }),
      newProposal({
        url: SITE,
        proposed_class: 'candidate-site',
        proposed_tier: 'says',
        identity_label: 'identity-matched',
      }),
      newProposal({ url: NOISY, entity_id: 'jerrad-christian' }),
    ],
    fx.data,
  );
  const pages: Record<string, string> = {
    [FEC]:
      '<html><head><title>FEC \u001b[31mDATA\u001b[0m</title></head><body><p>Filings for the candidate.</p></body></html>',
    [SITE]:
      '<html><body><p>Troy Balderson for Congress, Ohio 12th District. I will lower taxes for working families.</p></body></html>',
    [NOISY]:
      '<html><head><title>Noisy</title></head><body>\u001b]0;pwned\u0007Hello there</body></html>',
  };
  const fetcher = new Fetcher({
    userAgent: 't',
    rateLimitSeconds: 0.001,
    sleep: async () => {},
    maxAttempts: 1,
    fetchImpl: (async (u: string | URL | Request) => {
      const url = String(u);
      if (url.endsWith('/robots.txt')) return new Response('', { status: 404 });
      const body = pages[url];
      if (!body) return new Response('', { status: 404 });
      return new Response(body, { headers: { 'content-type': 'text/html' } });
    }) as typeof fetch,
  });
  const extracted: string[] = [];
  const extractor: LlmExtractor = {
    provider: 'stub',
    model: 'stub',
    async extract(i: ExtractInput) {
      extracted.push(i.snapshot.url);
      return {
        subject_name: 'Troy Balderson',
        fields: [],
        usage: { input_tokens: 1, output_tokens: 1 },
      };
    },
  };
  const deps: ProcessDeps = {
    data: fx.data,
    store: fx.store,
    fetcher,
    extractor,
    config,
    logs: { drops: join(fx.dir, 'd.jsonl'), extractionRuns: join(fx.dir, 'x.jsonl') },
  };
  return { fx, fetcher, deps, extracted };
}

describe('sources review loop', () => {
  it('shows coverage first, asks ownership for a candidate site, warns on reject, processes accepts in the background and waits on quit', async () => {
    const { fx, fetcher, deps, extracted } = setup();
    // Order: FEC (official), SITE (candidate site), NOISY. Accept FEC; accept SITE but answer "n" to the
    // ownership prompt (refused); then reject NOISY; the refused SITE is skipped for the session; then quit.
    const out = script(['a', 'a', 'n', 'r', 'dead link', 'q']);
    const queue = new ProcessQueue(deps);
    await sourceReviewLoop({
      decisionsLog: join(fx.dir, 'decisions.jsonl'),
      reviewer: 'phil',
      contest: house.id,
      data: fx.data,
      config,
      fetcher,
      queue,
    });
    const text = out.join('\n');

    // Coverage is printed before the first review item.
    expect(text.indexOf('Coverage for')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('Coverage for')).toBeLessThan(text.indexOf('url:'));
    // Excerpt shown, with escape sequences stripped.
    expect(text).toContain('Title: FEC DATA');
    expect(text).not.toContain('\u001b');
    // Ownership prompt, refusal, and the publish warning.
    expect(text).toContain('Confirm this site belongs to Troy Balderson');
    expect(text).toMatch(/Refused: confirm that this site belongs/);
    expect(text).toContain('Reject reasons are published');

    const q = fx.data.loadProposals(house.id);
    const st = (u: string) => q.find((p) => p.url === u)!;
    expect(st(FEC)).toMatchObject({ status: 'accepted', decided_by: 'phil' });
    expect(st(SITE).status).toBe('pending'); // refused, stays pending on disk
    expect(st(NOISY)).toMatchObject({ status: 'rejected', decision_reason: 'dead link' });
    expect(fx.data.loadSources(house.id).map((s) => s.url)).toEqual([FEC]);

    // The accepted source was fetched and extracted by the time the loop returned.
    expect(extracted).toEqual([FEC]);
    expect(text).toMatch(/ok\s+https:\/\/www\.fec\.gov/);
    // The excerpt of a page that was never accepted was shown but never written to disk.
    expect(text).toContain('Hello there');
    const files = readdirSync(fx.dir, { recursive: true }) as string[];
    for (const f of files.filter((f) => /\.(yaml|json|jsonl|txt)$/.test(f))) {
      expect(readFileSync(join(fx.dir, f), 'utf8'), f).not.toContain('Hello there');
    }
  });

  it('resumes: decided proposals are not shown again, and a candidate site is accepted once ownership is confirmed', async () => {
    const { fx, fetcher, deps } = setup();
    script(['s', 'a', 'y', 'q']); // skip FEC; accept SITE with ownership "y"; quit
    await sourceReviewLoop({
      decisionsLog: join(fx.dir, 'decisions.jsonl'),
      reviewer: 'phil',
      contest: house.id,
      data: fx.data,
      config,
      fetcher,
      queue: new ProcessQueue(deps),
    });
    const q = fx.data.loadProposals(house.id);
    expect(q.find((p) => p.url === FEC)!.status).toBe('pending'); // skip is session-only
    expect(q.find((p) => p.url === SITE)).toMatchObject({
      status: 'accepted',
      ownership_confirmed: true,
    });

    const out = script(['q']);
    await sourceReviewLoop({
      decisionsLog: join(fx.dir, 'decisions.jsonl'),
      reviewer: 'phil',
      contest: house.id,
      data: fx.data,
      config,
      fetcher,
      queue: new ProcessQueue(deps),
    });
    const text = out.join('\n');
    expect(text).toContain(FEC);
    expect(text).not.toContain(`url:    ${SITE}`);
  });

  it('link-only acceptances are registered but never processed', async () => {
    const { fx, fetcher, deps, extracted } = setup();
    addProposals(
      house.id,
      [
        newProposal({
          url: 'https://news.example/s',
          proposed_class: 'other',
          proposed_tier: 'context',
        }),
      ],
      fx.data,
    );
    // Review order puts "other" last: skip FEC and SITE, then accept the news link (candidate order breaks the tie with NOISY).
    const out = script(['s', 's', 'a', 'q']);
    await sourceReviewLoop({
      decisionsLog: join(fx.dir, 'decisions.jsonl'),
      reviewer: 'phil',
      contest: house.id,
      data: fx.data,
      config,
      fetcher,
      queue: new ProcessQueue(deps),
    });
    expect(out.join('\n')).toContain('Registered as link-only context');
    expect(fx.data.loadSources(house.id)).toMatchObject([
      { url: 'https://news.example/s', tier: 'context', domain_class: 'other' },
    ]);
    expect(extracted).toEqual([]);
    expect(existsSync(join(fx.dir, 'data/snapshots'))).toBe(false);
  });

  it('requires a reviewer id', async () => {
    const { fx, fetcher, deps } = setup();
    await expect(
      sourceReviewLoop({
        decisionsLog: join(fx.dir, 'decisions.jsonl'),
        reviewer: '',
        data: fx.data,
        config,
        fetcher,
        queue: new ProcessQueue(deps),
      }),
    ).rejects.toThrow(/reviewer id/);
  });
});
