export interface ErrorReportTarget {
  contestId: string;
  entityId: string;
  fieldKey: string;
  slot: number | null;
  /** Page URL (absolute when `site_url` is configured, otherwise the site-relative path). */
  pageUrl: string;
}

/** GitHub new-issue URL pre-filled with the contest, candidate, field, and page URL (FR-043). */
export function errorReportUrl(repoUrl: string, t: ErrorReportTarget): string {
  const field = `${t.fieldKey}${t.slot ? `#${t.slot}` : ''}`;
  const title = `Error report: ${t.contestId} / ${t.entityId} / ${field}`;
  const body = [
    `**Contest:** ${t.contestId}`,
    `**Candidate/entity:** ${t.entityId}`,
    `**Field:** ${field}`,
    `**Page:** ${t.pageUrl}`,
    '',
    'What is wrong, and what source shows the correct information?',
    '',
  ].join('\n');
  const q = new URLSearchParams({ title, body });
  return `${repoUrl.replace(/\/+$/, '')}/issues/new?${q.toString()}`;
}
