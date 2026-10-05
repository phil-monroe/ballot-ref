import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { build, makeFixture, read } from '../helpers/site-fixture.ts';

let html: string;
beforeAll(() => {
  html = read(join(build(makeFixture().dir).out, 'b/test-1/index.html'));
}, 120_000);

const section = (id: string, next: string) =>
  html.slice(html.indexOf(`id="${id}"`), html.indexOf(`id="${next}"`));
const persons = (s: string) =>
  [...s.matchAll(/<article class="person">([\s\S]*?)<\/article>/g)].map((m) => m[1]!);
const labels = (s: string) => [...s.matchAll(/<dt>([^<]*)<\/dt>/g)].map((m) => m[1]);

describe('identical layout across candidates (FR-042)', () => {
  let ready: string;
  let a: string;
  let b: string;
  beforeAll(() => {
    ready = section('ready-race-oh-unspecified', 'pending-race-oh-unspecified');
    [a, b] = persons(ready) as [string, string];
  });

  it('renders the same slot labels in the same order for every candidate', () => {
    expect(labels(a).length).toBeGreaterThan(5);
    expect(labels(a)).toEqual(labels(b));
  });
  it('shows "Not found in whitelisted sources." for every empty slot', () => {
    const missing = (s: string) => (s.match(/Not found in whitelisted sources\./g) ?? []).length;
    expect(missing(a)).toBe(labels(a).length - 1); // alpha has one approved priority
    expect(missing(b)).toBe(labels(b).length - 1);
  });
  it('renders write-in lines as printed with no field slots', () => {
    expect(ready).toContain('<p class="writein">Write-in</p>');
    expect(persons(ready)).toHaveLength(2);
  });
  it('renders a joint ticket as one choice with two person blocks using identical slots', () => {
    const gov = section('governor-lt-governor-oh-unspecified', 'levy-test-district-additional');
    const choices = [
      ...gov.matchAll(
        /<div class="choice choice--ticket">([\s\S]*?)(?=<div class="choice choice--ticket">|<\/div><\/section>|$)/g,
      ),
    ];
    expect(choices).toHaveLength(2);
    const people = persons(choices[0]![1]!);
    expect(people).toHaveLength(2);
    expect(labels(people[0]!)).toEqual(labels(people[1]!));
    expect(gov).toContain('For Governor');
    expect(gov).toContain('For Lieutenant Governor');
  });
  it('keeps candidate order as printed', () => {
    expect(ready.indexOf('Alpha Able')).toBeLessThan(ready.indexOf('Beta Baker'));
  });
});
