# Kimai-Jira-Plugin — Forge App

This directory contains the Atlassian Forge application source.  
For full documentation, setup instructions, and architecture overview see the **[root README](../README.md)**.

---

## Quick reference

All commands must be run from **this directory** (`Kimai-Jira-Plugin/`).

```bash
npm install                                  # install dependencies

forge login                                  # authenticate with Atlassian
forge lint                                   # validate manifest.yml
npm run lint                                 # ESLint on src/**/*

forge deploy --non-interactive -e development
forge install --non-interactive \
  --site <your-site>.atlassian.net \
  --product jira --environment development

# Scope/manifest changed? Reinstall with --upgrade instead of install
forge install --non-interactive --upgrade \
  --site <your-site>.atlassian.net \
  --product jira --environment development

forge tunnel                                 # live reload (resolvers run locally)
forge logs -e development --since 15m        # tail logs from deployed app
```

## Key files

| File | Purpose |
|---|---|
| `manifest.yml` | App ID, modules (`jira:issueContext`, `jira:adminPage`), scopes, egress |
| `src/frontend/index.jsx` | Issue panel UI |
| `src/frontend/AdminSettings.jsx` | Admin settings UI |
| `src/frontend/jira.js` | Jira REST helpers, auto-detection, code conversion utilities |
| `src/resolvers/index.js` | Backend resolver functions (storage, Kimai calls) |
| `src/kimai/client.js` | Kimai API v1.1 HTTP client |
