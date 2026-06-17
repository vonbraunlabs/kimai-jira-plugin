import { requestJira } from '@forge/bridge';

// Fetches the current issue's project name, epic name, and labels (Categorias).
// Called once on panel load; all Jira data for auto-detection comes from here.
//
// The "Categorias" field in the Jira REST API corresponds to `labels`.
// Confirm with GET /rest/api/3/field on a real instance if the field ID differs.
export const fetchIssueContext = async (issueKey) => {
  if (!issueKey) return { projectName: null, epicName: null, labels: [], summary: null };

  try {
    const res = await requestJira(
      `/rest/api/3/issue/${issueKey}?fields=summary,project,parent,labels,customfield_10014`,
      { headers: { Accept: 'application/json' } },
    );
    const data = await res.json();
    const fields = data.fields ?? {};

    const projectName = fields.project?.name ?? null;
    const labels = fields.labels ?? [];
    const summary = fields.summary ?? null;

    // Epic detection strategy:
    // 1. Next-gen (team-managed) projects: the epic is the direct parent issue
    //    with issuetype "Epic".
    // 2. Classic projects: the epic key is stored in customfield_10014
    //    (the "Epic Link" field).
    let epicKey = null;
    if (fields.parent?.fields?.issuetype?.name === 'Epic') {
      epicKey = fields.parent.key;
    } else if (fields.customfield_10014) {
      epicKey = fields.customfield_10014;
    }

    let epicName = null;
    if (epicKey) {
      try {
        const epicRes = await requestJira(
          `/rest/api/3/issue/${epicKey}?fields=summary`,
          { headers: { Accept: 'application/json' } },
        );
        epicName = (await epicRes.json()).fields?.summary ?? null;
      } catch {
        // Epic fetch failed — auto-detection will rely on labels only
      }
    }

    return { projectName, epicName, labels, summary };
  } catch {
    return { projectName: null, epicName: null, labels: [], summary: null };
  }
};

// Returns the best-matching Kimai project for the given Jira project name.
// Tries exact match first, then falls back to substring match (either name
// contains the other), case-insensitive.
export const autoDetectProject = (projects, projectName) => {
  if (!projectName || !projects?.length) return null;
  const name = projectName.toLowerCase();
  return (
    projects.find((p) => p.name.toLowerCase() === name) ??
    projects.find((p) => {
      const k = p.name.toLowerCase();
      return k.includes(name) || name.includes(k);
    }) ??
    null
  );
};

// Transforms a Jira label into the code used to search for the matching activity
// in Kimai. When config.enabled is true, applies the configured regex replacement.
// When config is absent or disabled, returns the label unchanged (direct match).
export const toKimaiCode = (label, config) => {
  if (!config?.enabled) return label ?? '';
  try {
    const { pattern = '\\D', flags = 'g', replacement = '' } = config.extraction ?? {};
    return (label ?? '').replace(new RegExp(pattern, flags), replacement);
  } catch {
    // Invalid regex — fall back to direct label
    return label ?? '';
  }
};

// Returns the best-matching Kimai activity for the given epic name and Jira
// labels. The "Categorias" field of the Jira card (labels) is the source used
// for matching. Tries multiple strategies in order of confidence:
//   1. Exact name match (full label text)
//   2. Exact name match using the transformed code (via toKimaiCode + config)
//   3. Match against the activity's `number` field
//   4. Substring match (original fallback)
export const autoDetectActivity = (activities, epicName, labels, config) => {
  if (!activities?.length) return null;

  const rawCandidates = [epicName, ...(labels ?? [])].filter(Boolean);
  if (!rawCandidates.length) return null;

  const fullCandidates = rawCandidates.map((s) => s.toLowerCase());
  // Code candidates: labels transformed via the configured extraction regex.
  // When config is disabled, toKimaiCode returns the label unchanged, so
  // codeCandidates equals fullCandidates (strategies 1 and 2 overlap harmlessly).
  const codeCandidates = rawCandidates
    .map((s) => toKimaiCode(s, config))
    .filter((s) => s.length >= 4);

  return (
    // 1. Exact match on activity name (full label format)
    activities.find((a) => fullCandidates.some((c) => a.name.toLowerCase() === c)) ??
    // 2. Exact match on activity name (transformed code)
    activities.find((a) => codeCandidates.some((c) => a.name.toLowerCase() === c)) ??
    // 3. Match against the activity `number` field if Kimai exposes it
    activities.find((a) => a.number && codeCandidates.some((c) => a.number === c)) ??
    // 4. Substring fallback (both full and transformed)
    activities.find((a) => {
      const name = a.name.toLowerCase();
      return (
        fullCandidates.some((c) => name.includes(c)) ||
        codeCandidates.some((c) => name.includes(c))
      );
    }) ??
    null
  );
};

// Adds a worklog entry to the Jira issue.
// Silently skips if duration < 60 s (Jira minimum) or issueKey is missing.
export const addJiraWorklog = async (issueKey, timeSpentSeconds, begin, description) => {
  if (!issueKey || timeSpentSeconds < 60) return;

  // Jira expects "YYYY-MM-DDTHH:mm:ss.SSS+0000" — convert whatever begin format we have to UTC.
  const started = new Date(begin).toISOString().replace(/Z$/, '+0000');

  const body = { timeSpentSeconds: Math.round(timeSpentSeconds), started };
  if (description) {
    body.comment = {
      type: 'doc',
      version: 1,
      content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }],
    };
  }

  await requestJira(`/rest/api/3/issue/${issueKey}/worklog`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
};

// Formats elapsed milliseconds as HH:MM:SS for the live timer display.
export const formatDuration = (ms) => {
  const s = Math.floor(Math.max(0, ms) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
};

// Formats a Kimai timesheet duration (seconds) as "Xh Ym".
export const formatKimaiDuration = (seconds) => {
  if (!seconds) return '0m';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
};
