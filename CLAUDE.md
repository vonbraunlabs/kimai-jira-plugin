# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Atlassian Forge app that adds a Kimai time-tracking panel to Jira issue cards (`jira:issueContext` module). The entire app lives in the `Kimai-Jira-Plugin/` subdirectory. All commands must be run from inside that directory.

## Commands

All commands run from `Kimai-Jira-Plugin/`:

```bash
npm run lint                          # ESLint on src/**/*
forge lint                            # Validate manifest.yml syntax
forge deploy --non-interactive -e development
forge install --non-interactive --site <url> --product jira --environment development
forge install --non-interactive --upgrade --site <url> --product jira --environment development  # when scopes change
forge tunnel                          # Live reload during development
forge logs -e development --since 15m # Debug deployed app
```

Always run `forge lint` after editing `manifest.yml`. Never use `--no-verify` on deploy unless explicitly asked.

## Architecture

```
src/
  frontend/index.jsx      # React UI, renders inside the Jira issue panel
  resolvers/index.js      # Backend resolver functions (Node.js 24.x, 256 MB, arm64)
  index.js                # Re-exports resolver handler for Forge runtime
manifest.yml              # Module config, scopes, runtime settings
```

**Data flow:** The frontend invokes named resolver functions via `invoke('functionName', payload)` from `@forge/bridge`. The resolver returns data back to the frontend.

**Frontend API calls:** For Jira/Confluence REST APIs, prefer calling them directly on the frontend using `requestJira` / `requestConfluence` from `@forge/bridge` instead of routing through a resolver.

**Backend storage:** Forge SQL, Key-Value Storage, and Custom Entities have no client-side API — they must be accessed from resolvers using `.asApp()`.

**Auth:** Prefer `.asUser()` in resolvers for product REST APIs (enforces user-level authorization automatically). If using `.asApp()` in a user context, perform authorization checks manually via permission REST APIs.

## Critical Forge UI Constraints

Only components exported by `@forge/react` may be rendered — standard HTML elements (`<div>`, `<strong>`, etc.) and third-party React component libraries will break the app. The `@forge/ui` package is deprecated and must not be imported.

Valid UI Kit components: `Badge, BarChart, Box, Button, ButtonGroup, Calendar, Checkbox, Code, CodeBlock, DatePicker, EmptyState, ErrorMessage, Form, FormFooter, FormHeader, FormSection, Heading, HelperMessage, HorizontalBarChart, HorizontalStackBarChart, Icon, Inline, Label, LineChart, LinkButton, List, ListItem, LoadingButton, Lozenge, Modal, ModalBody, ModalFooter, ModalHeader, ModalTitle, ModalTransition, PieChart, ProgressBar, ProgressTracker, Radio, RadioGroup, Range, Select, SectionMessage, SectionMessageAction, SingleValueChart, Spinner, Stack, StackBarChart, Tab, TabList, TabPanel, Tabs, Tag, TagGroup, TextArea, Textfield, TimePicker, Toggle, Tooltip, Text, ValidMessage, RequiredAsterisk, Image, Link, UserPicker, User, UserGroup, Em, Strike, Strong, Frame, DynamicTable, InlineEdit, Popup, AdfRenderer`

There is no `Table` component — use `DynamicTable` instead.

## Scopes and Manifest

Adding or changing `permissions.scopes` in `manifest.yml` requires a redeploy **and** a reinstall (`--upgrade`). Minimize scopes — only add what's strictly needed.

See `Kimai-Jira-Plugin/AGENT.md` for the full Forge platform reference (CLI flags, tunnelling rules, module constraints).
