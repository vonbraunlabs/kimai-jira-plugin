# Kimai Time Tracking — Jira Plugin

An [Atlassian Forge](https://developer.atlassian.com/platform/forge/) app that adds a **Kimai time-tracking panel directly inside Jira issue cards** — so your team can log hours without leaving Jira.

Inspired by the Clockify Jira plugin, built for teams running a self-hosted [Kimai](https://www.kimai.org/) instance.

---

## Features

- **Live timer** — start and stop a running timer from inside the issue card; detects timers already running in Kimai
- **Manual time entry** — log hours with an explicit start/end time and description
- **Issue history** — shows all timesheet entries linked to the current issue
- **Auto-detection** — automatically pre-selects the Kimai project (matched against the Jira project name) and activity (matched against the epic name or issue labels)
- **Inline user setup** — each user enters their own Kimai API Key directly in the panel on first use; no separate settings page needed
- **Admin configuration** — a dedicated admin page lets Jira administrators set the Kimai instance URL
- **Deliverable code conversion** — translates deliverable codes between the Jira label format (`GPV0339-ME3-E01`) and the Kimai digits-only format (`0339301`) automatically

---

## Architecture overview

```
┌──────────────────────────────────────────────────────────┐
│  Jira issue card (browser)                               │
│                                                          │
│  src/frontend/index.jsx   ←── @forge/react (UI Kit 2)   │
│  src/frontend/jira.js     ←── requestJira (Jira REST)    │
└───────────────────┬──────────────────────────────────────┘
                    │ invoke() via @forge/bridge
┌───────────────────▼──────────────────────────────────────┐
│  Forge backend (Node.js 24, arm64, 256 MB)               │
│                                                          │
│  src/resolvers/index.js   ←── @forge/resolver            │
│  src/kimai/client.js      ←── fetch → Kimai REST API     │
│                           ←── @forge/kvs (KV storage)    │
└──────────────────────────────────────────────────────────┘
```

| Concern | Approach |
|---|---|
| Issue panel | `jira:issueContext` Forge module |
| Admin settings | `jira:adminPage` Forge module |
| Kimai URL | Forge KV Storage (app-scoped) |
| User API Key | Forge KV Storage (per `accountId`) |
| Kimai API calls | Backend resolvers only (protects keys, avoids CORS) |
| Jira REST calls | Frontend via `requestJira` from `@forge/bridge` |
| Entry ↔ issue link | Kimai timesheet tag = Jira issue key (e.g. `PROJ-123`) |

---

## Prerequisites

| Requirement | Notes |
|---|---|
| [Atlassian Forge CLI](https://developer.atlassian.com/platform/forge/getting-started/) | `npm install -g @forge/cli` |
| Node.js ≥ 20 | Forge runtime is Node.js 24 |
| Kimai v1.x | Self-hosted; API v1.1 |
| Jira Cloud site | Atlassian developer account |

---

## Getting started

### 1. Clone and install dependencies

```bash
git clone https://github.com/your-org/kimai-jira-plugin.git
cd kimai-jira-plugin/Kimai-Jira-Plugin
npm install
```

### 2. Log in to Forge

```bash
forge login
```

### 3. Register the app (first time only)

```bash
forge register
```

This generates a new app ID in `manifest.yml`. Commit the updated file.

### 4. Deploy

```bash
forge deploy --non-interactive -e development
```

### 5. Install on your Jira site

```bash
forge install --non-interactive \
  --site your-site.atlassian.net \
  --product jira \
  --environment development
```

> If you later change `permissions.scopes` in `manifest.yml`, reinstall with `--upgrade` instead of a fresh `install`.

---

## Configuration

### Admin — Kimai URL

1. In Jira, go to **Settings → Apps → Kimai Time Tracking** (the admin page).
2. Enter your Kimai base URL (e.g. `https://kimai.your-company.com`).
3. Click **Testar conexão** to verify, then **Salvar**.

### User — API Key

Each user configures their own key:

1. Open any Jira issue. The Kimai panel appears on the right sidebar.
2. On first use, an inline form prompts for your Kimai API Key.
3. In Kimai: go to your **Profile → API → Generate token**.
4. Paste the token and click **Salvar e conectar**.

The key is validated against `GET /api/users/me` before being stored. It is stored per `accountId` in Forge KV Storage and is never exposed to the frontend.

---

## Development

All commands run from inside `Kimai-Jira-Plugin/`:

```bash
# Lint source files
npm run lint

# Validate manifest.yml
forge lint

# Deploy to development
forge deploy --non-interactive -e development

# Live tunnel (resolvers run locally — great for debugging localhost Kimai)
forge tunnel

# View recent logs from the deployed app
forge logs -e development --since 15m
```

### Testing with a local Kimai instance

Forge enforces **HTTPS-only** for all outbound requests, even during `forge tunnel`. If your Kimai is on `http://localhost:8001`, expose it via [ngrok](https://ngrok.com/) with host-header rewriting:

```bash
ngrok http --host-header="localhost:8001" 8001
```

Then use the `https://` URL ngrok provides as the Kimai URL in the admin settings.

> **Symfony trusted hosts:** If Kimai rejects requests with *"Untrusted Host"*, add the ngrok domain to `TRUSTED_HOSTS` in your Kimai `.env.local`, or use `--host-header` as shown above.

---

## Project structure

```
Kimai-Jira-Plugin/
├── manifest.yml                  # Forge app config: modules, scopes, egress
├── package.json
├── src/
│   ├── index.js                  # Re-exports resolver handler
│   ├── frontend/
│   │   ├── index.jsx             # Main panel UI (jira:issueContext)
│   │   ├── AdminSettings.jsx     # Admin settings UI (jira:adminPage)
│   │   └── jira.js               # Jira REST helpers + auto-detection logic
│   ├── resolvers/
│   │   └── index.js              # All backend resolver functions
│   └── kimai/
│       └── client.js             # Kimai API v1.1 HTTP client
```

---

## Activity code mapping

This plugin handles a custom mapping between Jira label codes and Kimai activity codes.

**Background:** Kimai activity codes are limited to 10 characters (digits only). Our deliverable codes use the format `GPV{project}-ME{milestone}-E{deliverable}` (e.g. `GPV0339-ME3-E01`), which exceeds that limit when stored as-is.

**Solution:** Strip all non-digit characters before storing in Kimai:

| Jira label | Kimai activity code |
|---|---|
| `GPV0339-ME3-E01` | `0339301` |
| `GPV0339-ME9999-E01` | `033999901` |

The plugin converts automatically in both directions:
- **Auto-detection:** converts Jira labels to digits before matching Kimai activities
- **Display:** converts digits-only codes back to the full `GPV…-ME…-E…` format in the panel

If your team uses a different code scheme, update `toKimaiCode` and `fromKimaiCode` in `src/frontend/jira.js`.

---

## Known limitations

| # | Limitation | Impact |
|---|---|---|
| A | Wildcard egress (`address: "*"`) required because the Kimai URL is set at runtime | Needs review for Atlassian Marketplace submission; fine for internal/single-site use |
| B | No handling when a timer is already running on a **different** issue — user must stop it manually in Kimai or in the other issue's panel | UX only |
| C | Activity code reverse-mapping assumes the fixed format `GPV{4d}-ME{1–4d}-E{2d}` | Update `fromKimaiCode` in `jira.js` if your format differs |
| D | "Categorias" field mapped to Jira `labels` — confirm with `GET /rest/api/3/field` on your instance if auto-detection doesn't work | Auto-detection |

---

## Contributing

Contributions, bug reports, and questions are welcome. This project was built to solve a real need and shared with the community in the hope that others facing the same Kimai + Jira integration challenge find it useful.

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-improvement`)
3. Make your changes and run `forge lint` + `npm run lint`
4. Open a Pull Request describing the problem and solution

---

## Tech stack

| Layer | Technology |
|---|---|
| Platform | [Atlassian Forge](https://developer.atlassian.com/platform/forge/) |
| UI | [Forge UI Kit 2](https://developer.atlassian.com/platform/forge/ui-kit/) (`@forge/react`) |
| Backend | Node.js 24 (Forge runtime) |
| Storage | [Forge KV Storage](https://developer.atlassian.com/platform/forge/runtime-reference/key-value-storage/) (`@forge/kvs`) |
| Time tracking | [Kimai](https://www.kimai.org/) v1.x REST API |

---

## License

MIT — see [LICENSE](LICENSE) for details.
