import { z } from 'zod';

export const LevyType = z.enum([
  'renewal',
  'additional',
  'replacement',
  'decrease',
  'renewal-and-increase',
  'renewal-and-decrease',
  'sales-use-tax',
]);

/** Allowed field keys per contest kind, with the tier each key must carry (null = from registry). */
export const FIELD_KEYS = {
  candidate: [
    'ballot_name',
    'party_label',
    'campaign_website',
    'priority',
    'office_held',
    'prior_office',
    'finance_raised',
    'finance_spent',
    'finance_period_end',
    'key_vote',
  ],
  judicial: ['ballot_name', 'current_office', 'bar_admission', 'campaign_website'],
  'constitutional-issue': [
    'ballot_language',
    'official_explanation',
    'argument_for',
    'argument_against',
    'effect_yes',
    'effect_no',
    'current_law',
  ],
  levy: [
    'taxing_entity',
    'levy_type',
    'millage',
    'duration',
    'purpose',
    'auditor_estimated_cost_per_100k',
    'auditor_estimated_annual_collection',
    'sponsor_materials',
    'official_text_link',
  ],
} as const;

export type ContestKindKey = keyof typeof FIELD_KEYS;

/** Keys with repeated slots: key -> slot count source. */
export const SLOTTED_KEYS = new Set(['priority', 'key_vote', 'official_explanation']);

/** Maximum slot for keys whose count is not set by config (official explanation items). */
export const MAX_EXPLANATION_ITEMS = 12;

/** Keys that must carry the given tier regardless of source registry entry. */
export const REQUIRED_TIER: Record<string, 'says' | 'done' | 'official'> = {
  priority: 'says',
  sponsor_materials: 'says',
  finance_raised: 'done',
  finance_spent: 'done',
  finance_period_end: 'done',
  key_vote: 'done',
  bar_admission: 'official',
  office_held: 'official',
  prior_office: 'official',
  ballot_language: 'official',
  official_explanation: 'official',
  effect_yes: 'official',
  effect_no: 'official',
  current_law: 'official',
};

export function isAllowedKey(kind: ContestKindKey, key: string): boolean {
  return (FIELD_KEYS[kind] as readonly string[]).includes(key);
}
