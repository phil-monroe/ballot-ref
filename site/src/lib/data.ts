import { loadConfig } from '../../../src/config.ts';
import { DataStore } from '../../../src/data.ts';
import { SnapshotStore } from '../../../src/fetch/snapshot-store.ts';
import { buildBallotView } from '../../../src/site/view.ts';

// Paths are relative to the repository root, where `ballot-ref build` runs.
const root = process.env.BALLOT_REF_DATA ?? 'data';
export const config = loadConfig(process.env.BALLOT_REF_CONFIG ?? 'site.config.yaml');
export const data = new DataStore(root);
export const store = new SnapshotStore(`${root}/snapshots`);
export const now = process.env.BALLOT_REF_NOW ? new Date(process.env.BALLOT_REF_NOW) : new Date();

export const ballots = () => data.listBallots().map((b) => b.ballot);
export const ballotView = (b: ReturnType<typeof ballots>[number]) => buildBallotView(b, data, store, config, now);
