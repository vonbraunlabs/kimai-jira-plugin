import { requestJira } from '@forge/bridge';

// Fetches the current issue's project name, epic name, and labels (Categorias).
// Called once on panel load; all Jira data for auto-detection comes from here.
//
// NOTE — "Categorias" field: in the Jira REST API this field is named `labels`.
// Confirm with GET /rest/api/3/field on a real instance if the field ID differs
// (see Point A in TASKS.md). If a different field is needed, update the
// `fields` query param and the extraction below.
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

// Converts a Jira deliverable code (e.g. "GPV0339-ME3-E01") to the
// digits-only format stored in Kimai (e.g. "0339301"), by stripping every
// non-digit character.  Returns an empty string for non-code strings.
export const toKimaiCode = (label) => (label ?? '').replace(/\D/g, '');

// Reverse of toKimaiCode: reconstructs the full deliverable code from the
// digits-only Kimai code.  Only converts strings that match the expected
// pattern (7–10 digits); returns the input unchanged for anything else so
// regular activity names (e.g. "Development") are not altered.
//
// Pattern: GPV{4d}-ME{1–4d}-E{2d}  →  concat digits = 7–10 chars
//   first 4 digits  → project (GPV part)
//   last 2 digits   → entregável (E part)
//   middle 1–4      → milestone (ME part)
export const fromKimaiCode = (activityName) => {
  if (!activityName || !/^\d{7,10}$/.test(activityName)) return activityName;
  const gpv = activityName.slice(0, 4);
  const e   = activityName.slice(-2);
  const me  = activityName.slice(4, -2);
  return `GPV${gpv}-ME${me}-E${e}`;
};

// Returns the best-matching Kimai activity for the given epic name and Jira
// labels.  Tries multiple strategies in order of confidence:
//   1. Exact name match (full label text)
//   2. Exact name match using digits-only version of the label (Kimai code)
//   3. Match against the activity's `number` field (digits-only)
//   4. Substring match (original fallback)
export const autoDetectActivity = (activities, epicName, labels) => {
  if (!activities?.length) return null;

  const rawCandidates = [epicName, ...(labels ?? [])].filter(Boolean);
  if (!rawCandidates.length) return null;

  const fullCandidates  = rawCandidates.map((s) => s.toLowerCase());
  // Digits-only versions of each candidate (for matching Kimai codes)
  const digitCandidates = rawCandidates
    .map(toKimaiCode)
    .filter((s) => s.length >= 4); // ignore trivially short results

  return (
    // 1. Exact match on activity name (full label format)
    activities.find((a) => fullCandidates.some((c) => a.name.toLowerCase() === c)) ??
    // 2. Exact match on activity name (digits-only format)
    activities.find((a) => digitCandidates.some((c) => a.name.toLowerCase() === c)) ??
    // 3. Match against the activity `number` field if Kimai exposes it
    activities.find((a) => a.number && digitCandidates.some((c) => a.number === c)) ??
    // 4. Substring fallback (both full and digits-only)
    activities.find((a) => {
      const name = a.name.toLowerCase();
      return (
        fullCandidates.some((c) => name.includes(c)) ||
        digitCandidates.some((c) => name.includes(c))
      );
    }) ??
    null
  );
};

// Formats elapsed milliseconds as HH:MM:SS for the live timer display.
export const formatDuration = (ms) => {
  const s = Math.floor(ms / 1000);
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
