# PROJECT PROCESS

This document defines the controlled development process for the AI Emergency Response Assistant MVP.

**Each phase must be completed and verified before moving to the next.**

---

## Phase 0 — Planning

- Understand problem
- Confirm MVP scope
- Review requirements
- Define architecture
- Define data models
- Define modules
- Define demo scenario

**Deliverables:** MVP_SPEC.md, PROJECT_PROCESS.md, PROJECT_PROGRESS.md, PROJECT_RULES.md

---

## Phase 1 — Project Setup

- Create Next.js application
- Configure TypeScript
- Configure Tailwind CSS
- Configure Supabase client
- Configure environment variables
- Establish folder structure
- Verify application starts successfully

**Verification:** Application runs at localhost without errors.

---

## Phase 2 — Database

- Create Supabase migrations
- Create tables (reports, incidents, incident_updates, landmarks, notifications)
- Create relationships and foreign keys
- Add constraints (enums, not-null, check)
- Add indexes for query performance
- Add landmark gazetteer data
- Verify database schema
- Add demo/seed data

**Verification:** All tables exist with correct relationships. Seed data can be inserted and queried.

---

## Phase 3 — Dashboard UI

- Dashboard shell and layout
- Statistics bar (total reports, active, escalated, rescue, resolved)
- Incident cards
- Incident list with sorting/filtering
- Map placeholder or integration
- Recent updates panel
- Filters (status, type, urgency)
- Incident detail view

**Initially use controlled demo data from the database.**

**Verification:** Dashboard renders correctly with demo data. All views are navigable.

---

## Phase 4 — Report Processing

- Report ingestion API
- Classification (real_emergency, irrelevant, rumor_unverified, general_question)
- AI information extraction (incident type, location, people, urgency, etc.)
- Confidence scoring
- Evidence/origin tracking (ai_extracted, responder_confirmed, operator)
- Language detection
- English rendering
- Deterministic fallback extractor

**Verification:** Reports are classified and extracted correctly. Fallback works when AI is unavailable.

---

## Phase 5 — Location Understanding

- Landmark gazetteer with aliases
- Alias matching and resolution
- Coordinate lookup
- Direction/offset parsing
- Location confidence scoring

**Verification:** Reports with various location descriptions resolve to correct landmarks.

---

## Phase 6 — Incident Correlation

- Compare new reports against active incidents
- Match scoring (location + type + semantic + time + details)
- Match breakdown (explain why matched)
- Update existing incident when matched
- Create new incident when no match
- Possible match flagging (requires operator confirmation)
- No-match handling
- Operator override (merge, split, reassign)

**Verification:** Related reports merge into same incident. Unrelated reports create separate incidents. Same-location-different-type stays separate.

---

## Phase 7 — Incident Memory

- Timeline (append-only updates)
- People count updates (latest credible total, not sum)
- Vulnerable people tracking
- Resource changes
- Urgency changes
- State transitions (Active → Escalated → Rescue in Progress → Resolved)
- Resolution verification (resolution_pending)
- Reopening on new evidence

**Verification:** Incident timeline reflects all changes. Count rules enforced. Resolution requires confirmation.

---

## Phase 8 — Audio

- Audio upload UI
- File validation (mp3, wav, m4a, webm)
- Server-side speech-to-text
- Transcript display
- Editable transcript before AI processing
- Same AI pipeline as text reports
- Incident correlation from audio reports
- Dashboard reflects audio-sourced data

**Verification:** Audio uploads, transcribes, extracts, correlates, and appears on dashboard. Tamil/Hindi supported.

---

## Phase 9 — Operator Controls

- Merge incidents
- Split incidents
- Reassign reports between incidents
- Escalate incidents
- Confirm resolution

**Verification:** All operator actions work correctly and update incident state/timeline.

---

## Phase 10 — Notifications

- In-app notification system
- Mock WhatsApp notification
- Mock SMS notification
- Follow-up call avoided metric

**Verification:** Notifications appear for relevant incident changes. Mock channels display messages.

---

## Phase 11 — Testing

- Run full 20-report demo dataset
- Flood scenario correlation testing
- Location resolution testing
- People count rule testing
- Rumor handling testing
- Irrelevant report filtering testing
- State transition testing
- Audio pipeline testing
- Tamil/Hindi report testing
- Resolution verification testing

**Verification:** All test scenarios produce correct results.

---

## Phase 12 — Final Demo

- End-to-end flow verification
- UI polish and consistency
- Error fixing
- Demo preparation and script
- Deployment
- Final presentation

**Verification:** Complete demo runs smoothly from report ingestion to incident resolution.

---

## Critical Rule

> **Do not skip to later phases while earlier foundations are broken.**
>
> Each phase builds on the previous. Verify before proceeding.
