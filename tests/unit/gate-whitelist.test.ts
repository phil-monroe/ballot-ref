import { describe, expect, it } from 'vitest';
import { matchSource, urlMatches } from '../../src/validate/whitelist.ts';
import { sources } from './gate-helpers.ts';

describe('whitelist gate', () => {
  it('matches the registered host and path prefix on a segment boundary', () => {
    expect(
      urlMatches('https://a.gov/data/candidate/', 'https://a.gov/data/candidate/S6OH00163'),
    ).toBe(true);
    expect(urlMatches('https://a.gov/data', 'https://a.gov/database')).toBe(false);
  });
  it('rejects other hosts, lookalike hosts, and other schemes', () => {
    expect(urlMatches('https://a.gov/x', 'https://a.gov.evil.com/x')).toBe(false);
    expect(urlMatches('https://a.gov/x', 'http://a.gov/x')).toBe(false);
  });
  it('registered query strings must match', () => {
    expect(urlMatches('https://a.gov/x?id=1', 'https://a.gov/x?id=2')).toBe(false);
    expect(urlMatches('https://a.gov/x?id=1', 'https://a.gov/x?id=1')).toBe(true);
  });
  it('entity-scoped sources only apply to that entity', () => {
    expect(matchSource('https://husted.example/issues', sources, 'jon-husted')).not.toBeNull();
    expect(matchSource('https://husted.example/issues', sources, 'sherrod-brown')).toBeNull();
  });
  it('returns null for unregistered URLs', () => {
    expect(matchSource('https://unknown.example/', sources, 'jon-husted')).toBeNull();
  });
});
