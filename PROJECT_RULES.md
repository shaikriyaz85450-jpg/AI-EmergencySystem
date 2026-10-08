# PROJECT RULES

These rules govern the development of the AI Emergency Response Assistant MVP. All contributors must follow them.

---

## Rule 1 — MVP First

Do not overbuild.

A working demonstrable MVP is more important than advanced features.

## Rule 2 — Requirements Source

| Document | Purpose |
|---|---|
| `MVP_SPEC.md` | Requirements source of truth |
| `PROJECT_PROCESS.md` | Development order |
| `PROJECT_PROGRESS.md` | Current progress |
| `PROJECT_RULES.md` | Engineering rules |

## Rule 3 — Report ≠ Incident

One incident can contain many reports.

**Never create a new incident simply because a new report arrived.**

## Rule 4 — Do Not Use Text Duplication

Incident correlation is **not** exact duplicate detection.

Use:
- location
- incident type
- semantic meaning
- time
- evidence

## Rule 5 — Never Merge by Location Alone

Two incidents can occur near the same location.

Example:

> Flood near MRTS + Power outage near MRTS = **two separate incidents**

## Rule 6 — Never Add People Counts

6 people + 8 people ≠ 14.

Use the latest credible explicit total.

## Rule 7 — Preserve Original Reports

Never delete or mutate raw reports.

Every report remains available as evidence.

## Rule 8 — Preserve Incident History

Incident timeline is append-only.

Never rewrite history to hide previous information.

## Rule 9 — AI Is Not Final Authority

AI extraction can be uncertain.

Clearly distinguish:
- AI extracted
- responder confirmed
- operator confirmed

## Rule 10 — Resolution Requires Verification

AI or citizen reports **cannot** automatically resolve an incident.

Responder/operator confirmation is required.

## Rule 11 — Audio Uses Same Pipeline

Do not build a separate AI logic for audio.

```
Audio → STT → transcript → same processing pipeline as text
```

## Rule 12 — Fallbacks

The application should remain demonstrable even when an external AI/STT service is unavailable.

Use deterministic fallback/demo mechanisms where necessary.

## Rule 13 — Modular Architecture

Keep independent modules for:
- ingestion
- STT
- extraction
- location
- correlation
- state machine
- notifications
- dashboard

## Rule 14 — Database First

Do not create UI assumptions that conflict with the database model.

Verify relationships before inserting dependent records.

## Rule 15 — No Fake Completion

Never mark a task complete because:
- a component exists
- a file exists
- a button exists

**It is complete only when the feature actually works.**

## Rule 16 — Protect Existing Features

Before modifying working functionality:
1. Inspect dependencies
2. Understand existing implementation
3. Make the smallest safe change
4. Test the change

## Rule 17 — Progress Tracking

Update `PROJECT_PROGRESS.md` after each meaningful phase.

## Rule 18 — Architecture Changes

Do not silently change:
- framework
- database
- AI provider
- project structure
- core data model

**Ask before making major architecture changes.**

## Rule 19 — No Unnecessary Dependencies

Install a dependency only when there is a clear requirement.

## Rule 20 — Test Before Moving Forward

A phase should be considered complete only after basic verification.
