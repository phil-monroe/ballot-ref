import { describe, expect, it } from 'vitest';
import { errorReportUrl } from '../../src/site/issue-url.ts';

describe('error report URL (FR-043)', () => {
  const url = new URL(
    errorReportUrl('https://github.com/acme/ballot-reference/', {
      contestId: '2026-11-03:us-senate:oh:special-2029',
      entityId: 'jon-husted',
      fieldKey: 'priority',
      slot: 2,
      pageUrl: 'https://ref.example/b/delaware-154-1/#us-senate-oh-special-2029',
    }),
  );
  it('targets the repository new-issue page', () => {
    expect(url.origin + url.pathname).toBe('https://github.com/acme/ballot-reference/issues/new');
  });
  it('pre-fills title and body with contest, candidate, field and page', () => {
    expect(url.searchParams.get('title')).toBe(
      'Error report: 2026-11-03:us-senate:oh:special-2029 / jon-husted / priority#2',
    );
    const body = url.searchParams.get('body')!;
    expect(body).toContain('**Contest:** 2026-11-03:us-senate:oh:special-2029');
    expect(body).toContain('**Candidate/entity:** jon-husted');
    expect(body).toContain('**Field:** priority#2');
    expect(body).toContain(
      '**Page:** https://ref.example/b/delaware-154-1/#us-senate-oh-special-2029',
    );
  });
  it('round-trips special characters safely', () => {
    const u = new URL(
      errorReportUrl('https://github.com/a/b', {
        contestId: 'x',
        entityId: "o'brien & co",
        fieldKey: 'k',
        slot: null,
        pageUrl: '/p?q=1&r=2',
      }),
    );
    expect(u.searchParams.get('body')).toContain("o'brien & co");
    expect(u.searchParams.get('body')).toContain('/p?q=1&r=2');
  });
});
