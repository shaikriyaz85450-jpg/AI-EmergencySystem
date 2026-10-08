/**
 * ============================================================================
 * PHASE 3 — ISOLATED FRONTEND PREVIEW / DEMO UI DATA ONLY
 * ============================================================================
 * IMPORTANT:
 * - This module provides static preview data strictly for evaluating the
 *   Phase 3 Dashboard UI.
 * - None of this preview data is inserted into Supabase.
 * - Later phases (Phases 4–10) will replace these preview records with live
 *   Supabase database queries.
 * ============================================================================
 */

export type PreviewIncidentStatus =
  | "Active"
  | "Escalated"
  | "Rescue in Progress"
  | "Resolved";

export type PreviewUrgencyLevel = "Critical" | "High" | "Medium" | "Low";

export type PreviewCanonicalLandmark =
  | "Velachery MRTS Station"
  | "Taramani MRTS Station"
  | "Guindy Railway Station"
  | "Saidapet Bridge"
  | "Pallikaranai Marshland Main Road"
  | "Adyar Bus Depot";

export type PreviewArea =
  | "Velachery"
  | "Taramani"
  | "Guindy"
  | "Saidapet"
  | "Pallikaranai"
  | "Adyar";

export type PreviewSourceChannel =
  | "Audio"
  | "WhatsApp"
  | "SMS"
  | "Social Media"
  | "Responder"
  | "Operator";

export type PreviewReportClassification =
  | "Real Emergency"
  | "Irrelevant"
  | "Rumor / Unverified"
  | "General Question";

export type PreviewInformationOrigin =
  | "AI Extracted"
  | "Responder Confirmed"
  | "Operator";

export type PreviewLocationMatchLevel = "High" | "Medium" | "Low";

export interface PreviewIncident {
  id: string;
  incidentCode: string;
  incidentType: string;
  status: PreviewIncidentStatus;
  urgency: PreviewUrgencyLevel;
  confidence: string;
  locationMatch: PreviewLocationMatchLevel;
  location: PreviewCanonicalLandmark;
  area: PreviewArea;
  reportedAtLabel: string;
  relatedReportsCount: number;
  relatedChannelsSummary?: string;
  /** Kept strictly separate from vulnerablePeople per Rule 6 / Phase 3 §8 */
  peopleAffected: string;
  /** Kept strictly separate from peopleAffected per Phase 3 §8 */
  vulnerablePeople: string;
  vulnerableLabelPrefix: "Vulnerable People" | "Vulnerable";
  resourcesNeeded: string;
  resourcesSubtext?: string;
  latestUpdateSummary: string;
  latestUpdateAgo: string;
  informationOrigin: PreviewInformationOrigin;
  resolutionPending?: boolean;
  resolutionNotes?: string | null;
  resolvedBy?: "responder_confirmed" | "operator" | null;
  resolvedAt?: string | null;
}

export interface PreviewReport {
  id: string;
  sourceChannel: PreviewSourceChannel;
  reportContent: string;
  location: PreviewCanonicalLandmark;
  area: PreviewArea;
  classification: PreviewReportClassification;
  informationOrigin: PreviewInformationOrigin;
  correlatedIncidentCode: string | null;
  correlationStatusLabel: string;
  matchPercentage: number | null;
  timeAgo: string;
}

export interface PreviewIncidentUpdate {
  id: string;
  incidentCode: string;
  updateSummary: string;
  informationOrigin: PreviewInformationOrigin;
  previousStatus: PreviewIncidentStatus | null;
  newStatus: PreviewIncidentStatus;
  timeAgo: string;
  icon: "water_drop" | "medical_services" | "traffic" | "bolt" | "check_circle";
  accentTone: "error" | "tertiary" | "neutral" | "primary";
}

export interface PreviewLandmarkPin {
  canonicalName: PreviewCanonicalLandmark;
  shortLabel: string;
  area: PreviewArea;
  topPercent: string;
  leftPercent: string;
  activeIncidentCode?: string;
  urgency?: PreviewUrgencyLevel;
  status?: PreviewIncidentStatus;
}

export interface PreviewNotificationItem {
  id: string;
  incidentCode: string;
  channel: "In-App" | "WhatsApp (Preview)" | "SMS (Preview)";
  title: string;
  message: string;
  status: PreviewIncidentStatus;
  urgency: PreviewUrgencyLevel;
  timeAgo: string;
}

export const PREVIEW_CANONICAL_LANDMARKS: readonly PreviewCanonicalLandmark[] = [
  "Velachery MRTS Station",
  "Taramani MRTS Station",
  "Guindy Railway Station",
  "Saidapet Bridge",
  "Pallikaranai Marshland Main Road",
  "Adyar Bus Depot",
] as const;

export const PREVIEW_PIPELINE_SUMMARY = {
  totalReports: 20,
  correlatedIncidents: 5,
  correlatedReports: 16,
  inReviewReports: 4,
  pendingCorrelation: 0,
} as const;

export const PREVIEW_DASHBOARD_STATS = {
  totalReports: 20,
  activeIncidents: 5,
  escalatedIncidents: 2,
  rescueInProgress: 1,
  resolvedIncidents: 3,
} as const;

export const PREVIEW_INCIDENTS: readonly PreviewIncident[] = [
  {
    id: "preview-inc-001",
    incidentCode: "INC-2026-001",
    incidentType: "Flood",
    status: "Escalated",
    urgency: "Critical",
    confidence: "0.98",
    locationMatch: "High",
    location: "Velachery MRTS Station",
    area: "Velachery",
    reportedAtLabel: "First reported 14:18 UTC",
    relatedReportsCount: 8,
    relatedChannelsSummary: "(Audio, WhatsApp, SMS)",
    peopleAffected: "25",
    vulnerablePeople: "Elderly",
    vulnerableLabelPrefix: "Vulnerable People",
    resourcesNeeded: "Rescue assistance, Flood barriers",
    resourcesSubtext: "Medical triage support",
    latestUpdateSummary:
      "Water level continues to rise near the station. Ground floor concourse submerged up to 4.2 feet. Commuters relocated to elevated platforms.",
    latestUpdateAgo: "2 mins ago",
    informationOrigin: "AI Extracted",
  },
  {
    id: "preview-inc-002",
    incidentCode: "INC-2026-002",
    incidentType: "Medical Emergency",
    status: "Rescue in Progress",
    urgency: "High",
    confidence: "0.94",
    locationMatch: "High",
    location: "Guindy Railway Station",
    area: "Guindy",
    reportedAtLabel: "Reported 14:24 UTC",
    relatedReportsCount: 4,
    relatedChannelsSummary: "(Audio)",
    peopleAffected: "1 critically injured",
    vulnerablePeople: "Yes",
    vulnerableLabelPrefix: "Vulnerable",
    resourcesNeeded: "Ambulance support",
    resourcesSubtext: "Paramedic team",
    latestUpdateSummary:
      "Emergency situation confirmed near Guindy Railway Station. Responder on scene providing stabilization.",
    latestUpdateAgo: "7 mins ago",
    informationOrigin: "Responder Confirmed",
  },
  {
    id: "preview-inc-003",
    incidentCode: "INC-2026-003",
    incidentType: "Road Accident",
    status: "Active",
    urgency: "Medium",
    confidence: "0.86",
    locationMatch: "High",
    location: "Saidapet Bridge",
    area: "Saidapet",
    reportedAtLabel: "Reported 14:19 UTC",
    relatedReportsCount: 3,
    relatedChannelsSummary: "(Social Media, WhatsApp)",
    peopleAffected: "Multiple vehicles, minor injury",
    vulnerablePeople: "No",
    vulnerableLabelPrefix: "Vulnerable",
    resourcesNeeded: "Medical & Traffic clearance",
    resourcesSubtext: "Tow vehicle support",
    latestUpdateSummary:
      "Traffic movement affected near Saidapet Bridge. Initial assessment completed, lane 2 obstructed.",
    latestUpdateAgo: "12 mins ago",
    informationOrigin: "AI Extracted",
  },
  {
    id: "preview-inc-004",
    incidentCode: "INC-2026-004",
    incidentType: "Power Outage",
    status: "Active",
    urgency: "High",
    confidence: "0.82",
    locationMatch: "High",
    location: "Taramani MRTS Station",
    area: "Taramani",
    reportedAtLabel: "Reported 14:27 UTC",
    relatedReportsCount: 2,
    peopleAffected: "Unknown",
    vulnerablePeople: "Unknown",
    vulnerableLabelPrefix: "Vulnerable People",
    resourcesNeeded: "Electrical repair support",
    latestUpdateSummary:
      "Power outage reported near Taramani MRTS Station. Cause is not yet confirmed.",
    latestUpdateAgo: "4 mins ago",
    informationOrigin: "AI Extracted",
  },
  {
    id: "preview-inc-005",
    incidentCode: "INC-2026-005",
    incidentType: "Fire",
    status: "Resolved",
    urgency: "Critical",
    confidence: "0.97",
    locationMatch: "High",
    location: "Adyar Bus Depot",
    area: "Adyar",
    reportedAtLabel: "Reported 14:10 UTC",
    relatedReportsCount: 3,
    peopleAffected: "4",
    vulnerablePeople: "None reported",
    vulnerableLabelPrefix: "Vulnerable People",
    resourcesNeeded: "Fire response support",
    latestUpdateSummary:
      "Responder confirmed the reported fire was handled and affected people were safe.",
    latestUpdateAgo: "18 mins ago",
    informationOrigin: "Responder Confirmed",
  },
] as const;

export const PREVIEW_LANDMARK_PINS: readonly PreviewLandmarkPin[] = [
  {
    canonicalName: "Velachery MRTS Station",
    shortLabel: "Velachery MRTS Station",
    area: "Velachery",
    topPercent: "52%",
    leftPercent: "62%",
    activeIncidentCode: "INC-2026-001",
    urgency: "Critical",
    status: "Escalated",
  },
  {
    canonicalName: "Guindy Railway Station",
    shortLabel: "Guindy Railway Station",
    area: "Guindy",
    topPercent: "36%",
    leftPercent: "34%",
    activeIncidentCode: "INC-2026-002",
    urgency: "High",
    status: "Rescue in Progress",
  },
  {
    canonicalName: "Saidapet Bridge",
    shortLabel: "Saidapet Bridge",
    area: "Saidapet",
    topPercent: "28%",
    leftPercent: "48%",
    activeIncidentCode: "INC-2026-003",
    urgency: "Medium",
    status: "Active",
  },
  {
    canonicalName: "Taramani MRTS Station",
    shortLabel: "Taramani",
    area: "Taramani",
    topPercent: "68%",
    leftPercent: "54%",
  },
  {
    canonicalName: "Pallikaranai Marshland Main Road",
    shortLabel: "Pallikaranai",
    area: "Pallikaranai",
    topPercent: "78%",
    leftPercent: "72%",
  },
  {
    canonicalName: "Adyar Bus Depot",
    shortLabel: "Adyar",
    area: "Adyar",
    topPercent: "32%",
    leftPercent: "70%",
  },
] as const;

export const PREVIEW_INCIDENT_UPDATES: readonly PreviewIncidentUpdate[] = [
  {
    id: "preview-upd-001",
    incidentCode: "INC-2026-001",
    updateSummary:
      "Water level continues to rise near Velachery MRTS Station.",
    informationOrigin: "AI Extracted",
    previousStatus: "Active",
    newStatus: "Escalated",
    timeAgo: "2 min ago",
    icon: "water_drop",
    accentTone: "error",
  },
  {
    id: "preview-upd-002",
    incidentCode: "INC-2026-002",
    updateSummary:
      "Emergency situation confirmed near Guindy Railway Station.",
    informationOrigin: "Responder Confirmed",
    previousStatus: "Active",
    newStatus: "Rescue in Progress",
    timeAgo: "7 min ago",
    icon: "medical_services",
    accentTone: "tertiary",
  },
  {
    id: "preview-upd-003",
    incidentCode: "INC-2026-003",
    updateSummary: "Traffic movement affected near Saidapet Bridge.",
    informationOrigin: "AI Extracted",
    previousStatus: null,
    newStatus: "Active",
    timeAgo: "12 min ago",
    icon: "traffic",
    accentTone: "neutral",
  },
] as const;

/**
 * 20 Preview Incoming Reports:
 * - First 5 rows match the exact 5 rows in the reference HTML table
 * - Channel distribution matches the HTML channel filter buttons:
 *   Audio (7), WhatsApp (6), SMS (3), Social Media (2), Responder (2) = 20 total
 * - Correlation distribution matches HTML header:
 *   16 Correlated | 4 In Review / Filtered
 */
export const PREVIEW_REPORTS: readonly PreviewReport[] = [
  // --- PAGE 1 (EXACT 5 ROWS FROM REFERENCE HTML) ---
  {
    id: "preview-rep-001",
    sourceChannel: "Audio",
    reportContent:
      "“Water has entered the road near Velachery MRTS Station, people trapped on bus stop roof...”",
    location: "Velachery MRTS Station",
    area: "Velachery",
    classification: "Real Emergency",
    informationOrigin: "AI Extracted",
    correlatedIncidentCode: "INC-2026-001",
    correlationStatusLabel: "Correlated → INC-2026-001",
    matchPercentage: 98,
    timeAgo: "2m ago",
  },
  {
    id: "preview-rep-002",
    sourceChannel: "WhatsApp",
    reportContent:
      "“People are stranded near the station, water is waist deep now please send help”",
    location: "Velachery MRTS Station",
    area: "Velachery",
    classification: "Real Emergency",
    informationOrigin: "AI Extracted",
    correlatedIncidentCode: "INC-2026-001",
    correlationStatusLabel: "Correlated → INC-2026-001",
    matchPercentage: 95,
    timeAgo: "4m ago",
  },
  {
    id: "preview-rep-003",
    sourceChannel: "Responder",
    reportContent:
      "“Emergency situation confirmed near Guindy Railway Station.”",
    location: "Guindy Railway Station",
    area: "Guindy",
    classification: "Real Emergency",
    informationOrigin: "Responder Confirmed",
    correlatedIncidentCode: "INC-2026-002",
    correlationStatusLabel: "Correlated → INC-2026-002",
    matchPercentage: 99,
    timeAgo: "7m ago",
  },
  {
    id: "preview-rep-004",
    sourceChannel: "SMS",
    reportContent:
      "“Is there flooding near Velachery station right now? Need to commute.”",
    location: "Velachery MRTS Station",
    area: "Velachery",
    classification: "General Question",
    informationOrigin: "AI Extracted",
    correlatedIncidentCode: null,
    correlationStatusLabel: "Filtered (Non-Incident)",
    matchPercentage: null,
    timeAgo: "9m ago",
  },
  {
    id: "preview-rep-005",
    sourceChannel: "Social Media",
    reportContent:
      "“Large crowd reported near Saidapet Bridge after multi-vehicle pile up...”",
    location: "Saidapet Bridge",
    area: "Saidapet",
    classification: "Rumor / Unverified",
    informationOrigin: "AI Extracted",
    correlatedIncidentCode: "INC-2026-003",
    correlationStatusLabel: "Correlated → INC-2026-003",
    matchPercentage: 86,
    timeAgo: "12m ago",
  },

  // --- PAGE 2 ---
  {
    id: "preview-rep-006",
    sourceChannel: "Audio",
    reportContent:
      "“Six commuters including elderly residents are waiting on the Velachery station staircase as water rises.”",
    location: "Velachery MRTS Station",
    area: "Velachery",
    classification: "Real Emergency",
    informationOrigin: "AI Extracted",
    correlatedIncidentCode: "INC-2026-001",
    correlationStatusLabel: "Correlated → INC-2026-001",
    matchPercentage: 96,
    timeAgo: "14m ago",
  },
  {
    id: "preview-rep-007",
    sourceChannel: "WhatsApp",
    reportContent:
      "“Power outage near Taramani MRTS Station, traffic signal and street lights completely dark.”",
    location: "Taramani MRTS Station",
    area: "Taramani",
    classification: "Real Emergency",
    informationOrigin: "AI Extracted",
    correlatedIncidentCode: "INC-2026-004",
    correlationStatusLabel: "Correlated → INC-2026-004",
    matchPercentage: 91,
    timeAgo: "15m ago",
  },
  {
    id: "preview-rep-008",
    sourceChannel: "Audio",
    reportContent:
      "“Passenger collapsed near Guindy Railway Station ticket counter, needs immediate ambulance.”",
    location: "Guindy Railway Station",
    area: "Guindy",
    classification: "Real Emergency",
    informationOrigin: "AI Extracted",
    correlatedIncidentCode: "INC-2026-002",
    correlationStatusLabel: "Correlated → INC-2026-002",
    matchPercentage: 94,
    timeAgo: "16m ago",
  },
  {
    id: "preview-rep-009",
    sourceChannel: "SMS",
    reportContent:
      "“Water level at Velachery MRTS parking lot has crossed 4 feet, vehicles submerged.”",
    location: "Velachery MRTS Station",
    area: "Velachery",
    classification: "Real Emergency",
    informationOrigin: "AI Extracted",
    correlatedIncidentCode: "INC-2026-001",
    correlationStatusLabel: "Correlated → INC-2026-001",
    matchPercentage: 93,
    timeAgo: "17m ago",
  },
  {
    id: "preview-rep-010",
    sourceChannel: "Responder",
    reportContent:
      "“Responder confirmed the reported fire at Adyar Bus Depot was handled and affected people were safe.”",
    location: "Adyar Bus Depot",
    area: "Adyar",
    classification: "Real Emergency",
    informationOrigin: "Responder Confirmed",
    correlatedIncidentCode: "INC-2026-005",
    correlationStatusLabel: "Correlated → INC-2026-005",
    matchPercentage: 99,
    timeAgo: "18m ago",
  },

  // --- PAGE 3 ---
  {
    id: "preview-rep-011",
    sourceChannel: "WhatsApp",
    reportContent:
      "“Two cars collided on Saidapet Bridge northbound lane, traffic backing up.”",
    location: "Saidapet Bridge",
    area: "Saidapet",
    classification: "Real Emergency",
    informationOrigin: "AI Extracted",
    correlatedIncidentCode: "INC-2026-003",
    correlationStatusLabel: "Correlated → INC-2026-003",
    matchPercentage: 89,
    timeAgo: "19m ago",
  },
  {
    id: "preview-rep-012",
    sourceChannel: "Audio",
    reportContent:
      "“வேளச்சேரி ரயில் நிலையம் அருகே வெள்ளம் அதிகமாக உள்ளது, முதியவர்கள் சிக்கியுள்ளனர்.”",
    location: "Velachery MRTS Station",
    area: "Velachery",
    classification: "Real Emergency",
    informationOrigin: "AI Extracted",
    correlatedIncidentCode: "INC-2026-001",
    correlationStatusLabel: "Correlated → INC-2026-001",
    matchPercentage: 97,
    timeAgo: "20m ago",
  },
  {
    id: "preview-rep-013",
    sourceChannel: "WhatsApp",
    reportContent:
      "“Heard a rumor that Pallikaranai Marshland Main Road is completely closed for 3 days, is it true?”",
    location: "Pallikaranai Marshland Main Road",
    area: "Pallikaranai",
    classification: "Rumor / Unverified",
    informationOrigin: "AI Extracted",
    correlatedIncidentCode: null,
    correlationStatusLabel: "In Review (Unverified Queue)",
    matchPercentage: null,
    timeAgo: "21m ago",
  },
  {
    id: "preview-rep-014",
    sourceChannel: "Audio",
    reportContent:
      "“Need medical help at Guindy station platform 1, person is unconscious.”",
    location: "Guindy Railway Station",
    area: "Guindy",
    classification: "Real Emergency",
    informationOrigin: "AI Extracted",
    correlatedIncidentCode: "INC-2026-002",
    correlationStatusLabel: "Correlated → INC-2026-002",
    matchPercentage: 92,
    timeAgo: "22m ago",
  },
  {
    id: "preview-rep-015",
    sourceChannel: "SMS",
    reportContent:
      "“When will the regular train schedule resume tomorrow morning?”",
    location: "Guindy Railway Station",
    area: "Guindy",
    classification: "Irrelevant",
    informationOrigin: "AI Extracted",
    correlatedIncidentCode: null,
    correlationStatusLabel: "Filtered (Non-Incident)",
    matchPercentage: null,
    timeAgo: "24m ago",
  },

  // --- PAGE 4 ---
  {
    id: "preview-rep-016",
    sourceChannel: "WhatsApp",
    reportContent:
      "“Complete power cut near Taramani station entrance and adjacent road.”",
    location: "Taramani MRTS Station",
    area: "Taramani",
    classification: "Real Emergency",
    informationOrigin: "AI Extracted",
    correlatedIncidentCode: "INC-2026-004",
    correlationStatusLabel: "Correlated → INC-2026-004",
    matchPercentage: 88,
    timeAgo: "25m ago",
  },
  {
    id: "preview-rep-017",
    sourceChannel: "Audio",
    reportContent:
      "“Smoke spotted near Adyar Bus Depot workshop bay, four staff members evacuating.”",
    location: "Adyar Bus Depot",
    area: "Adyar",
    classification: "Real Emergency",
    informationOrigin: "AI Extracted",
    correlatedIncidentCode: "INC-2026-005",
    correlationStatusLabel: "Correlated → INC-2026-005",
    matchPercentage: 95,
    timeAgo: "27m ago",
  },
  {
    id: "preview-rep-018",
    sourceChannel: "WhatsApp",
    reportContent:
      "“Fire tender requested at Adyar Bus Depot entrance near signal.”",
    location: "Adyar Bus Depot",
    area: "Adyar",
    classification: "Real Emergency",
    informationOrigin: "AI Extracted",
    correlatedIncidentCode: "INC-2026-005",
    correlationStatusLabel: "Correlated → INC-2026-005",
    matchPercentage: 94,
    timeAgo: "28m ago",
  },
  {
    id: "preview-rep-019",
    sourceChannel: "Audio",
    reportContent:
      "“Water entering ground floor concourse at Velachery MRTS Station, ~25 commuters moving to upper platform.”",
    location: "Velachery MRTS Station",
    area: "Velachery",
    classification: "Real Emergency",
    informationOrigin: "AI Extracted",
    correlatedIncidentCode: "INC-2026-001",
    correlationStatusLabel: "Correlated → INC-2026-001",
    matchPercentage: 97,
    timeAgo: "30m ago",
  },
  {
    id: "preview-rep-020",
    sourceChannel: "Social Media",
    reportContent:
      "“Unverified post claiming transformer spark near Pallikaranai Marshland Main Road.”",
    location: "Pallikaranai Marshland Main Road",
    area: "Pallikaranai",
    classification: "Rumor / Unverified",
    informationOrigin: "AI Extracted",
    correlatedIncidentCode: null,
    correlationStatusLabel: "In Review (Unverified Queue)",
    matchPercentage: null,
    timeAgo: "32m ago",
  },
] as const;

export const PREVIEW_NOTIFICATIONS: readonly PreviewNotificationItem[] = [
  {
    id: "preview-notif-001",
    incidentCode: "INC-2026-001",
    channel: "In-App",
    title: "Incident Escalated — Velachery MRTS Station",
    message:
      "INC-2026-001 status transitioned from Active to Escalated based on rising water level and vulnerable elderly commuters.",
    status: "Escalated",
    urgency: "Critical",
    timeAgo: "2 mins ago",
  },
  {
    id: "preview-notif-002",
    incidentCode: "INC-2026-002",
    channel: "WhatsApp (Preview)",
    title: "Rescue in Progress — Guindy Railway Station",
    message:
      "Responder confirmed on-scene stabilization for INC-2026-002 at Guindy Railway Station.",
    status: "Rescue in Progress",
    urgency: "High",
    timeAgo: "7 mins ago",
  },
  {
    id: "preview-notif-003",
    incidentCode: "INC-2026-005",
    channel: "SMS (Preview)",
    title: "Resolution Verified — Adyar Bus Depot",
    message:
      "INC-2026-005 marked Resolved following Responder Confirmed verification at Adyar Bus Depot.",
    status: "Resolved",
    urgency: "Critical",
    timeAgo: "18 mins ago",
  },
] as const;
