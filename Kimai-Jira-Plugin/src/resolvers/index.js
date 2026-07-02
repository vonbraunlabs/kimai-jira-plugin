import Resolver from '@forge/resolver';
import { kvs } from '@forge/kvs';
import * as kimai from '../kimai/client';

const resolver = new Resolver();

const KIMAI_URL_KEY = 'kimai_base_url';
const MAPPING_CONFIG_KEY = 'activity_mapping_config';
const userKeyId = (accountId) => `user_apikey_${accountId}`;

// ─── Internal helpers ─────────────────────────────────────────────────────────

// Reads both the Kimai URL and the current user's API key in parallel.
const getConfig = (accountId) =>
  Promise.all([kvs.get(KIMAI_URL_KEY), kvs.get(userKeyId(accountId))]).then(
    ([kimaiUrl, apiKey]) => ({ kimaiUrl: kimaiUrl || null, apiKey: apiKey || null }),
  );

// Fetches config, asserts both values are present, then calls fn(url, key).
// Throws descriptive errors that the frontend can surface to the user.
// 401/403 errors from Kimai are prefixed with [AUTH_INVALID] so the frontend
// can distinguish a stale/revoked API key from other errors.
const withKimai = async (req, fn) => {
  const accountId = req.context.accountId;
  const { kimaiUrl, apiKey } = await getConfig(accountId);
  console.log(`[resolver] withKimai accountId=${accountId} kimaiUrl=${kimaiUrl} apiKey=${apiKey ? '***set***' : 'null'}`);
  if (!kimaiUrl) throw new Error('URL do Kimai não configurada. Contacte o administrador.');
  if (!apiKey) throw new Error('API Key não configurada. Informe sua chave no painel.');
  try {
    return await fn(kimaiUrl, apiKey);
  } catch (e) {
    if (e.status === 401 || e.status === 403) {
      throw new Error(`[AUTH_INVALID] ${e.message}`);
    }
    throw e;
  }
};

// ─── Admin config ─────────────────────────────────────────────────────────────

resolver.define('getAdminConfig', async () => {
  const kimaiUrl = await kvs.get(KIMAI_URL_KEY);
  console.log(`[resolver] getAdminConfig → kimaiUrl=${kimaiUrl}`);
  return { kimaiUrl: kimaiUrl || '' };
});

resolver.define('saveAdminConfig', async (req) => {
  console.log(`[resolver] saveAdminConfig kimaiUrl="${req.payload.kimaiUrl}"`);
  await kvs.set(KIMAI_URL_KEY, req.payload.kimaiUrl);
  return { success: true };
});

// Tests URL reachability without an API key.
// HTTP 401/403 is treated as success — server is up but auth is required (expected).
resolver.define('testAdminConnection', async (req) => {
  const { kimaiUrl } = req.payload;
  console.log(`[resolver] testAdminConnection kimaiUrl="${kimaiUrl}"`);
  if (!kimaiUrl) return { success: false, error: 'URL não informada.' };

  const cleanUrl = kimaiUrl.replace(/\/$/, '');
  try {
    const response = await fetch(`${cleanUrl}/api/version`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    console.log(`[resolver] testAdminConnection → HTTP ${response.status}`);

    if (response.ok) {
      let version = null;
      try { version = (await response.json()).version ?? null; } catch { /* not JSON */ }
      console.log(`[resolver] testAdminConnection → success, version=${version}`);
      return { success: true, version };
    }

    // 401 or 403 = server is alive but auth is required — URL is valid
    if (response.status === 401 || response.status === 403) {
      console.log(`[resolver] testAdminConnection → ${response.status} treated as success`);
      return { success: true, version: null };
    }

    return { success: false, error: `Servidor respondeu com status ${response.status}.` };
  } catch (e) {
    console.error(`[resolver] testAdminConnection network error:`, e.message);
    return { success: false, error: 'Não foi possível alcançar o servidor. Verifique a URL.' };
  }
});

// ─── User API key ─────────────────────────────────────────────────────────────

// Returns only whether the key is configured — never exposes the key itself.
resolver.define('getUserApiKey', async (req) => {
  const key = await kvs.get(userKeyId(req.context.accountId));
  console.log(`[resolver] getUserApiKey accountId=${req.context.accountId} configured=${!!key}`);
  return { configured: !!key };
});

// Validates the key against Kimai before persisting it.
resolver.define('saveUserApiKey', async (req) => {
  const { apiKey } = req.payload;
  const accountId = req.context.accountId;
  console.log(`[resolver] saveUserApiKey accountId=${accountId} apiKey length=${apiKey?.length ?? 0}`);

  const kimaiUrl = await kvs.get(KIMAI_URL_KEY);
  console.log(`[resolver] saveUserApiKey kimaiUrl="${kimaiUrl}"`);

  if (!kimaiUrl) {
    console.warn(`[resolver] saveUserApiKey → no kimaiUrl configured`);
    return { success: false, error: 'URL do Kimai não configurada. Contacte o administrador.' };
  }

  try {
    const profile = await kimai.testConnection(kimaiUrl, apiKey);
    console.log(`[resolver] saveUserApiKey → testConnection OK, user=${profile?.username}`);
  } catch (e) {
    console.error(`[resolver] saveUserApiKey → testConnection FAILED status=${e.status} message="${e.message}"`);
    return { success: false, error: `API Key inválida (HTTP ${e.status ?? 'erro de rede'}): ${e.message}` };
  }

  await kvs.set(userKeyId(accountId), apiKey);
  console.log(`[resolver] saveUserApiKey → saved successfully`);
  return { success: true };
});

// ─── Panel bootstrap (single round-trip on load) ─────────────────────────────

// Returns configuration status so the panel knows which state to render.
resolver.define('getContext', async (req) => {
  const { kimaiUrl, apiKey } = await getConfig(req.context.accountId);
  console.log(`[resolver] getContext kimaiUrlConfigured=${!!kimaiUrl} apiKeyConfigured=${!!apiKey}`);
  return {
    kimaiUrlConfigured: !!kimaiUrl,
    apiKeyConfigured: !!apiKey,
  };
});

// ─── Activity mapping config ──────────────────────────────────────────────────

resolver.define('getMappingConfig', async () => {
  const config = await kvs.get(MAPPING_CONFIG_KEY);
  console.log(`[resolver] getMappingConfig → enabled=${config?.enabled ?? false}`);
  return config ?? null;
});

resolver.define('saveMappingConfig', async (req) => {
  const { enabled, extraction } = req.payload ?? {};
  console.log(`[resolver] saveMappingConfig enabled=${enabled}`);

  if (enabled) {
    const { pattern = '', flags = '' } = extraction ?? {};
    try {
      // eslint-disable-next-line no-new-regexp
      new RegExp(pattern, flags);
    } catch (e) {
      console.warn(`[resolver] saveMappingConfig invalid regex: ${e.message}`);
      return { success: false, errors: { extractionPattern: `Regex inválida: ${e.message}` } };
    }
  }

  const config = {
    enabled: !!enabled,
    extraction: {
      pattern: extraction?.pattern ?? '\\D',
      flags: extraction?.flags ?? 'g',
      replacement: extraction?.replacement ?? '',
    },
  };
  await kvs.set(MAPPING_CONFIG_KEY, config);
  console.log(`[resolver] saveMappingConfig → saved`);
  return { success: true };
});

// ─── Kimai data resolvers ─────────────────────────────────────────────────────

resolver.define('getKimaiProjects', (req) => {
  console.log(`[resolver] getKimaiProjects`);
  return withKimai(req, (url, key) => kimai.getProjects(url, key));
});

resolver.define('getKimaiActivities', (req) => {
  console.log(`[resolver] getKimaiActivities projectId=${req.payload?.projectId}`);
  return withKimai(req, (url, key) => kimai.getActivities(url, key, req.payload?.projectId));
});

resolver.define('getActiveTimer', (req) => {
  console.log(`[resolver] getActiveTimer`);
  return withKimai(req, (url, key) => kimai.getActiveTimer(url, key));
});

resolver.define('getIssueTimesheets', (req) => {
  console.log(`[resolver] getIssueTimesheets issueKey=${req.payload?.issueKey}`);
  return withKimai(req, (url, key) => kimai.getTimesheetsByTag(url, key, req.payload.issueKey));
});

// ─── Timesheet actions ────────────────────────────────────────────────────────

resolver.define('startTimer', (req) => {
  console.log(`[resolver] startTimer payload=`, JSON.stringify(req.payload));
  return withKimai(req, (url, key) => kimai.startTimer(url, key, req.payload));
});

resolver.define('stopTimer', (req) => {
  console.log(`[resolver] stopTimer timesheetId=${req.payload?.timesheetId}`);
  return withKimai(req, (url, key) => kimai.stopTimer(url, key, req.payload.timesheetId));
});

resolver.define('createManualEntry', (req) => {
  console.log(`[resolver] createManualEntry payload=`, JSON.stringify(req.payload));
  return withKimai(req, (url, key) => kimai.createManualEntry(url, key, req.payload));
});

resolver.define('deleteEntry', (req) => {
  console.log(`[resolver] deleteEntry timesheetId=${req.payload?.timesheetId}`);
  return withKimai(req, (url, key) => kimai.deleteEntry(url, key, req.payload.timesheetId));
});

export const handler = resolver.getDefinitions();
