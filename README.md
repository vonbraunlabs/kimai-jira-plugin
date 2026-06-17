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

## Configuring activity code mapping

The plugin uses the **Categorias** field of the Jira card (`labels` in the REST API) to auto-detect the corresponding Kimai activity. By default, the label value is compared directly against Kimai activity names — no transformation is applied.

If your team stores activities in Kimai using a code derived from the label (e.g. by stripping separators), you can configure a regex-based extraction rule in the admin page.

### How it works

The flow is always:

```
Jira label  →  [extraction regex]  →  code  →  [Kimai API lookup]  →  activity name
```

1. The extraction regex transforms each label value into the code used to search in Kimai.
2. The Kimai API returns the matching activity with its stored name.
3. The activity name displayed in the panel is always whatever is stored in Kimai.

### Configuring in the admin page

1. Go to **Settings → Apps → Kimai Time Tracking**.
2. Under **Mapeamento de atividades**, enable **Habilitar conversão de código**.
3. Fill in the three regex fields:

| Field | Description | Example |
|---|---|---|
| **Padrão (regex)** | Characters/pattern to match in the label | `\D` |
| **Flags** | JS regex flags | `g` |
| **Substituição** | Replacement string (`$1`, `$2`… for groups) | *(empty)* |

4. Use the **Pré-visualização** field to test your regex live before saving.
5. Click **Salvar mapeamento**.

### Example: digits-only codes

Some teams store activities in Kimai using only the numeric portion of a longer code. For example, the Jira label `GPV0339-ME3-E01` maps to a Kimai activity named `0339301`.

| Field | Value |
|---|---|
| Padrão (regex) | `\D` |
| Flags | `g` |
| Substituição | *(empty)* |

This strips every non-digit character from the label (`GPV0339-ME3-E01` → `0339301`) and uses the result to find the activity in Kimai.

---

## Known limitations

| # | Limitation | Impact |
|---|---|---|
| A | Wildcard egress (`address: "*"`) required because the Kimai URL is set at runtime | Needs review for Atlassian Marketplace submission; fine for internal/single-site use |
| B | No handling when a timer is already running on a **different** issue — user must stop it manually in Kimai or in the other issue's panel | UX only |
| C | "Categorias" field mapped to Jira `labels` — confirm with `GET /rest/api/3/field` on your instance if auto-detection doesn't work | Auto-detection |

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
