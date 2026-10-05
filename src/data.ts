import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse, stringify } from 'yaml';
import { Ballot, Contest } from './schemas/contest.ts';
import { FieldFile } from './schemas/field.ts';
import { SourceFile } from './schemas/source.ts';

/** Contest ids contain ':'; filenames store them as '__'. */
export const contestFileStem = (id: string): string => id.replaceAll(':', '__');
export const contestIdFromStem = (stem: string): string => stem.replaceAll('__', ':');

export class DataStore {
  constructor(readonly root = 'data') {}

  private p(...parts: string[]): string {
    return join(this.root, ...parts);
  }

  private writeText(path: string, text: string): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  }

  loadBallot(file: string): Ballot {
    return Ballot.parse(parse(readFileSync(file, 'utf8')));
  }

  listBallots(): { file: string; ballot: Ballot }[] {
    const dir = this.p('ballots');
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith('.yaml'))
      .map((f) => ({ file: join(dir, f), ballot: this.loadBallot(join(dir, f)) }));
  }

  saveBallot(file: string, ballot: Ballot): void {
    this.writeText(file, stringify(Ballot.parse(ballot)));
  }

  contestPath(id: string): string {
    return this.p('contests', `${contestFileStem(id)}.yaml`);
  }

  loadContest(id: string): Contest {
    return Contest.parse(parse(readFileSync(this.contestPath(id), 'utf8')));
  }

  saveContest(contest: Contest): void {
    this.writeText(this.contestPath(contest.id), stringify(Contest.parse(contest)));
  }

  loadSources(contestId: string) {
    const path = this.p('sources', `${contestFileStem(contestId)}.yaml`);
    if (!existsSync(path)) return [];
    return SourceFile.parse(parse(readFileSync(path, 'utf8')));
  }

  fieldsPath(contestId: string, entityId: string): string {
    return this.p('fields', contestFileStem(contestId), `${entityId}.json`);
  }

  loadFields(contestId: string, entityId: string): FieldFile {
    const path = this.fieldsPath(contestId, entityId);
    if (!existsSync(path)) return { fields: [] };
    return FieldFile.parse(JSON.parse(readFileSync(path, 'utf8')));
  }

  saveFields(contestId: string, entityId: string, file: FieldFile): void {
    this.writeText(
      this.fieldsPath(contestId, entityId),
      JSON.stringify(FieldFile.parse(file), null, 2) + '\n',
    );
  }

  listEntities(contestId: string): string[] {
    const dir = this.p('fields', contestFileStem(contestId));
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.slice(0, -5));
  }
}
