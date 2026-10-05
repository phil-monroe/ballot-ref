export interface RobotsRules {
  allows(path: string): boolean;
}

const ALLOW_ALL: RobotsRules = { allows: () => true };
const DISALLOW_ALL: RobotsRules = { allows: () => false };
export { ALLOW_ALL, DISALLOW_ALL };

/** Minimal robots.txt: the group for our token, else "*"; longest matching rule wins, Allow wins ties. */
export function parseRobots(text: string, agentToken: string): RobotsRules {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let cur: (typeof groups)[number] | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    const val = m[2]!.trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) groups.push((cur = { agents: [], rules: [] }));
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else if (key === 'allow' || key === 'disallow') {
      lastWasAgent = false;
      if (cur && val !== '') cur.rules.push({ allow: key === 'allow', path: val });
    } else lastWasAgent = false;
  }
  const token = agentToken.toLowerCase();
  const group =
    groups.find((g) => g.agents.some((a) => a !== '*' && token.includes(a))) ??
    groups.find((g) => g.agents.includes('*'));
  if (!group) return ALLOW_ALL;
  return {
    allows(path: string) {
      let best: { allow: boolean; len: number } | null = null;
      for (const r of group.rules) {
        const pat = r.path.replace(/\$$/, '');
        const matches = r.path.includes('*')
          ? new RegExp(
              '^' +
                pat
                  .split('*')
                  .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
                  .join('.*'),
            ).test(path)
          : path.startsWith(pat);
        if (!matches) continue;
        if (!best || pat.length > best.len || (pat.length === best.len && r.allow)) {
          best = { allow: r.allow, len: pat.length };
        }
      }
      return best ? best.allow : true;
    },
  };
}
