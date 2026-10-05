/**
 * Published neutral rule for key votes (FR-030): the final-passage roll-call votes on the N most recent
 * bills, applied identically to everyone. The bill set is fixed once per chamber and reused for every
 * candidate with a voting record; nothing here knows or cares who the candidates are.
 */
export interface Bill {
  /** Stable id, e.g. "HB 123". */
  id: string;
  /** Date of the final-passage roll call (ISO date). */
  finalPassageDate: string;
  /** Whether a final-passage roll-call vote exists for this bill in this chamber. */
  hasFinalPassageRollCall: boolean;
}

export function selectKeyVoteBills(bills: Bill[], n: number): Bill[] {
  return bills
    .filter((b) => b.hasFinalPassageRollCall)
    .sort(
      (a, b) => b.finalPassageDate.localeCompare(a.finalPassageDate) || a.id.localeCompare(b.id),
    )
    .slice(0, n);
}

export interface KeyVoteSlot {
  slot: number;
  bill: Bill;
}

/** Slots are numbered 1..N by the position of the bill in the shared set, the same for every candidate. */
export function keyVoteSlots(bills: Bill[], n: number): KeyVoteSlot[] {
  return selectKeyVoteBills(bills, n).map((bill, i) => ({ slot: i + 1, bill }));
}
