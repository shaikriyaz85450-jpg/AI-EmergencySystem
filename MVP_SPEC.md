# AI Emergency Response Assistant — MVP Specification

## 1. Core Problem

Emergency call centres receive many reports from audio calls, WhatsApp, SMS, social media and responders.

Many reports describe the same real-world emergency.

Other reports may be:
- irrelevant
- rumors
- general questions
- incomplete
- noisy

Operators should not have to manually compare every report.

## 2. Core Solution

The AI assistant converts many raw reports into a smaller number of meaningful, continuously updated incidents.

**IMPORTANT:**

This is **NOT** a duplicate-text detector.

It is an **INCIDENT CORRELATION** system.

Different wording can still represent the same incident.

Correlation should consider:
- location
- incident type
- semantic meaning
- time proximity
- consistency of details
- evidence

**Never merge incidents using geographical proximity alone.**

## 3. Input Sources

Support:

- Audio call / transcript
- WhatsApp
- SMS
- Social media
- Responder/operator update

**Audio upload is mandatory for the MVP.**

## 4. AI Information Extraction

For every report extract:

- Incident type
- Location
- Landmark
- People affected
- Number of people affected
- Vulnerable people
- Resources needed
- Urgency
- Important evidence/details
- Timestamp
- Source/channel
- Classification
- Information origin
- Detected language
- English rendering

### Classification

| Value | Description |
|---|---|
| `real_emergency` | Genuine emergency requiring response |
| `irrelevant` | Not related to any emergency |
| `rumor_unverified` | Unverified claim requiring corroboration |
| `general_question` | General inquiry, not a report |

### Information Origin

| Value | Description |
|---|---|
| `ai_extracted` | Extracted by AI from raw report |
| `responder_confirmed` | Confirmed by a field responder |
| `operator` | Entered or confirmed by an operator |

**Unverified information must never automatically become confirmed truth.**

## 5. People Count Rules

**Never add counts from different reports.**

Example:

- Report A = 6 people
- Report B = 8 people

**Do NOT calculate:**

> 6 + 8 = 14

Instead:
- Store each report's count
- Use the latest explicit total from the highest-trust source
- Responder-confirmed values override citizen values
- If citizen values disagree, show a range
- Use the highest credible figure for urgency

Track vulnerable categories such as:
- elderly
- children
- disabled
- pregnant
- injured

## 6. Rumor Handling

A rumor/unverified report:

- Must not automatically create a new incident
- If matching an existing incident, attach as unverified evidence
- Must not change confirmed status/count/urgency
- Otherwise place it into an **Unverified Reports** queue

Promotion requires:
- independent corroboration
  OR
- operator confirmation

## 7. Irrelevant / General Questions

Store these reports but do not attach them to an incident unless they are status enquiries about an existing incident.

Show filtered reports with the filtering reason.

## 8. Location Understanding

Use a landmark gazetteer containing:

- Canonical landmark
- Aliases
- Coordinates
- Area
- Radius

Resolve reports into:

- canonical landmark
- area
- latitude/longitude or approximate location
- direction/offset
- location confidence

GPS should be used when supplied.

**Location is only one input to correlation.**

## 9. Incident Correlation

For every new report:

1. Compare with active incidents
2. Calculate match using:
   - location
   - incident type
   - semantic similarity
   - time proximity
   - consistency of details
3. If match → update existing incident
4. If no match → create new incident
5. Always preserve the raw report

Support:
- match score
- match breakdown
- possible match requiring operator confirmation
- no-match state
- operator merge
- operator split
- report reassignment

## 10. Incident States

### Statuses

| Status | Description |
|---|---|
| `Active` | Incident reported, response pending |
| `Escalated` | Severity increased |
| `Rescue in Progress` | Responders dispatched or on-scene |
| `Resolved` | Incident confirmed resolved |

### Transitions

**Active → Escalated:**
- affected count increases
- vulnerable people reported
- conditions worsen
- critical resource required
- operator escalation

**Active/Escalated → Rescue in Progress:**
- responder/operator reports dispatch
- responder/operator reports arrival
- rescue is underway

**Rescue in Progress → Escalated:**
- conditions worsen
- additional people found

**Any state → Resolved:**
ONLY responder/operator confirmation.

**Resolved → Active:**
Credible new evidence arrives.

> **Elapsed time must NEVER automatically resolve an incident.**

## 11. Resolution

If a citizen reports:

> "Everyone is safe now."

**Do NOT immediately mark Resolved.**

Instead:

```
resolution_pending = true
```

Display:

> "Resolution reported — pending verification"

Only responder/operator confirmation changes the status to Resolved.

## 12. Dashboard

Professional emergency-operations design.

Dashboard should eventually contain:

- Total incoming reports
- Active count
- Escalated count
- Rescue in Progress count
- Resolved count
- Reports grouped into incidents
- Filtered reports
- Incident list
- Map
- Recent updates

### Incident Cards

Incident cards should contain:

- Incident ID
- Title
- Incident type
- Location
- Landmark
- Urgency
- People affected
- Vulnerable people
- Resources
- Status
- Related report count
- Latest update
- Confidence/evidence indicator

**Do not rely on colour alone.**

Use:
- icon
- text label
- colour

## 13. Incident Details

Eventually show:

- Full summary
- Location
- Map
- People affected
- Vulnerable people
- Resources
- Urgency
- Status
- Related reports
- Source
- Timeline
- Latest AI summary
- Evidence
- Uncertainty
- Operator actions

Clearly distinguish:

| Source | Visual Treatment |
|---|---|
| AI-generated information | Clearly marked as AI-extracted |
| Responder-confirmed information | Marked as confirmed |
| Operator information | Marked as operator-provided |

## 14. Audio Test

**Audio upload is mandatory.**

Supported formats:

- mp3
- wav
- m4a
- webm

### Pipeline

```
AUDIO FILE
→ Speech-to-Text
→ TRANSCRIPT
→ AI UNDERSTANDING
→ STRUCTURED INFORMATION
→ INCIDENT CORRELATION
→ CREATE / UPDATE INCIDENT
→ DASHBOARD
```

- Audio must use server-side speech-to-text.
- The transcript must be editable before AI processing.

Keep:
- original-language transcript
- English rendering
- audio file reference

**Support English, Tamil and Hindi.**

If STT is unavailable:
- show an error
- provide an editable transcript box
- allow the pipeline to continue using the transcript

## 15. Demo Dataset

Approximately 20 chronological reports.

**Primary scenario:**
Flood near a railway/MRTS station.

Reports should show:
- different descriptions of same location
- 6 people trapped
- elderly people added
- affected count changes
- water level rising
- rescue dispatched
- rescue in progress
- final responder-confirmed resolution

Also include:
- unrelated emergency
- another different incident
- irrelevant/general question
- rumor/unverified report
- same-area different-type incident
- at least one Tamil or Hindi report

**Target:**

```
20 reports
→ approximately 3–5 real incidents
→ remaining reports filtered or unverified
```

## 16. Technical Architecture

### Modules

| Module | Responsibility |
|---|---|
| Ingestion | Receive and store raw reports |
| Speech-to-text | Convert audio to transcript |
| AI extraction | Extract structured data from text |
| Location resolver | Resolve locations to landmarks/coordinates |
| Incident correlator | Match reports to incidents |
| Incident state machine | Manage incident lifecycle |
| Notifications | Alert operators of changes |
| Dashboard | Operator interface |

### Constraints

- Raw reports and normalized incidents must remain **separate**.
- Raw reports must **never be lost**.
- Incident history must be **append-only**.

AI extraction should have:
- LLM implementation
- deterministic fallback

## 17. Core Data Models

The following models will be implemented during the Database phase:

- **Report** — raw incoming report with source, content, and metadata
- **Incident** — normalized incident with extracted information and state
- **IncidentUpdate** — append-only history of changes to an incident
- **Notification** — operator notifications
- **Landmark** — gazetteer entries for location resolution

> Do not implement these during the documentation phase.
