// Kimai API v1.1 client.
// Authentication uses "Authorization: Bearer {apiKey}" — NOT X-AUTH-TOKEN.
// Every exported function takes (baseUrl, apiKey) as its first two arguments.

const request = async (baseUrl, apiKey, path, method = 'GET', body) => {
  const url = `${baseUrl.replace(/\/$/, '')}/api${path}`;

  console.log(`[kimai] ${method} ${url}`);

  const options = {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
  };

  if (body !== undefined) {
    options.body = JSON.stringify(body);
    console.log(`[kimai] body:`, JSON.stringify(body));
  }

  let response;
  try {
    response = await fetch(url, options);
  } catch (networkErr) {
    console.error(`[kimai] network error on ${method} ${url}:`, networkErr.message);
    throw networkErr;
  }

  console.log(`[kimai] ${method} ${url} → HTTP ${response.status}`);

  // 204 No Content is a valid success with no body (e.g. DELETE)
  if (response.status === 204) return null;

  const text = await response.text().catch(() => '');
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    console.warn(`[kimai] response body is not JSON:`, text.slice(0, 200));
  }

  if (!response.ok) {
    const message = data?.message || data?.detail || `Kimai respondeu com status ${response.status}`;
    console.error(`[kimai] error response:`, JSON.stringify(data)?.slice(0, 500));
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }

  return data;
};

// Returns the authenticated user's profile — used to validate an API key.
export const testConnection = (baseUrl, apiKey) => {
  console.log(`[kimai] testConnection baseUrl="${baseUrl}"`);
  return request(baseUrl, apiKey, '/users/me');
};

// Returns all projects visible to the authenticated user.
export const getProjects = (baseUrl, apiKey) =>
  request(baseUrl, apiKey, '/projects?visible=1');

// Returns activities. When projectId is provided, filters by that project.
export const getActivities = (baseUrl, apiKey, projectId) => {
  const query = projectId
    ? `?project=${encodeURIComponent(projectId)}&visible=1`
    : '?visible=1';
  return request(baseUrl, apiKey, `/activities${query}`);
};

// Returns the currently running timesheet entry (with expanded project/activity
// objects) or null if no timer is active.
// /api/timesheets/active returns project/activity as integer IDs; we fetch the
// single-entry endpoint to get the full expanded response with names.
export const getActiveTimer = async (baseUrl, apiKey) => {
  const entries = await request(baseUrl, apiKey, '/timesheets/active');
  if (!Array.isArray(entries) || entries.length === 0) {
    console.log(`[kimai] getActiveTimer → null`);
    return null;
  }
  const timer = entries[0];
  console.log(`[kimai] getActiveTimer → id=${timer.id}, fetching expanded`);
  try {
    return await request(baseUrl, apiKey, `/timesheets/${timer.id}`);
  } catch {
    // Fallback to basic data if expanded fetch fails
    return timer;
  }
};

// Returns up to 50 timesheet entries tagged with the given Jira issue key.
export const getTimesheetsByTag = (baseUrl, apiKey, issueKey) => {
  const tag = encodeURIComponent(issueKey);
  return request(
    baseUrl,
    apiKey,
    `/timesheets?tags=${tag}&size=50&orderBy=begin&order=DESC`,
  );
};

// Starts a running timer. Begin defaults to now (UTC). No end time = open entry.
export const startTimer = (baseUrl, apiKey, { projectId, activityId, description, issueKey }) => {
  const begin = new Date().toISOString().slice(0, 19); // "2024-01-01T09:00:00"
  return request(baseUrl, apiKey, '/timesheets', 'POST', {
    begin,
    project: projectId,
    activity: activityId,
    description: description || '',
    tags: issueKey,
  });
};

// Stops a running timer by patching its end time to now (UTC).
export const stopTimer = (baseUrl, apiKey, timesheetId) => {
  const end = new Date().toISOString().slice(0, 19);
  return request(baseUrl, apiKey, `/timesheets/${timesheetId}`, 'PATCH', { end });
};

// Creates a completed timesheet entry with explicit begin and end strings
// in "YYYY-MM-DDTHH:mm:ss" format (local time, Kimai applies user timezone).
export const createManualEntry = (
  baseUrl,
  apiKey,
  { projectId, activityId, description, begin, end, issueKey },
) =>
  request(baseUrl, apiKey, '/timesheets', 'POST', {
    begin,
    end,
    project: projectId,
    activity: activityId,
    description: description || '',
    tags: issueKey,
  });

// Permanently removes a timesheet entry.
export const deleteEntry = (baseUrl, apiKey, timesheetId) =>
  request(baseUrl, apiKey, `/timesheets/${timesheetId}`, 'DELETE');
