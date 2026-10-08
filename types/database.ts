export type ReportSourceChannel =
  | "audio"
  | "whatsapp"
  | "sms"
  | "social_media"
  | "responder"
  | "operator";

export type ReportClassification =
  | "real_emergency"
  | "irrelevant"
  | "rumor_unverified"
  | "general_question";

export type InformationOrigin =
  | "ai_extracted"
  | "responder_confirmed"
  | "operator";

export type IncidentStatus =
  | "Active"
  | "Escalated"
  | "Rescue in Progress"
  | "Resolved";

export type UrgencyLevel = "Low" | "Medium" | "High" | "Critical";

export type AudioFormat = "mp3" | "wav" | "m4a" | "webm";

export type CorrelationStatus =
  | "pending"
  | "matched"
  | "new_incident"
  | "possible_match"
  | "no_match"
  | "unverified_queue"
  | "filtered"
  | "operator_assigned";

export type IncidentUpdateType =
  | "incident_created"
  | "report_correlated"
  | "status_change"
  | "urgency_change"
  | "people_count_update"
  | "vulnerable_people_update"
  | "resource_update"
  | "location_update"
  | "resolution_pending"
  | "resolution_confirmed"
  | "reopened"
  | "operator_merge"
  | "operator_split"
  | "operator_reassign"
  | "unverified_evidence_attached"
  | "general_update";

export type NotificationChannel = "in_app" | "whatsapp" | "sms";

export type NotificationType =
  | "new_incident"
  | "incident_escalated"
  | "rescue_in_progress"
  | "resolution_pending"
  | "incident_resolved"
  | "incident_reopened"
  | "possible_match"
  | "status_update";

export interface MatchBreakdown {
  location_score?: number;
  incident_type_score?: number;
  semantic_similarity_score?: number;
  time_proximity_score?: number;
  detail_consistency_score?: number;
  explanation?: string;
}

export interface LandmarkRecord {
  id: string;
  canonical_name: string;
  aliases: string[];
  area: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  created_at: string;
}

export interface IncidentRecord {
  id: string;
  incident_code: string;
  title: string;
  summary: string | null;
  incident_type: string;
  status: IncidentStatus;
  urgency: UrgencyLevel;
  location_text: string;
  landmark_id: string | null;
  canonical_landmark: string | null;
  area: string | null;
  latitude: number | null;
  longitude: number | null;
  direction_offset: string | null;
  location_confidence: number | null;
  people_affected_count: number | null;
  people_affected_min: number | null;
  people_affected_max: number | null;
  people_affected_description: string | null;
  people_count_origin: InformationOrigin;
  vulnerable_people: string[];
  resources_needed: string[];
  information_origin: InformationOrigin;
  confidence_score: number | null;
  evidence_summary: string | null;
  uncertainty_notes: string | null;
  related_report_count: number;
  latest_update_summary: string | null;
  resolution_pending: boolean;
  resolution_notes: string | null;
  resolved_by: "responder_confirmed" | "operator" | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReportRecord {
  id: string;
  source_channel: ReportSourceChannel;
  raw_content: string;
  audio_file_url: string | null;
  audio_format: AudioFormat | null;
  original_transcript: string | null;
  edited_transcript: string | null;
  detected_language: string;
  english_rendering: string | null;
  classification: ReportClassification;
  filter_reason: string | null;
  information_origin: InformationOrigin;
  extracted_incident_type: string | null;
  extracted_location: string | null;
  extracted_landmark: string | null;
  people_affected_description: string | null;
  people_affected_count: number | null;
  vulnerable_people: string[];
  resources_needed: string[];
  extracted_urgency: UrgencyLevel | null;
  important_evidence: string | null;
  reports_resolution: boolean;
  extraction_confidence: number | null;
  landmark_id: string | null;
  canonical_landmark: string | null;
  resolved_area: string | null;
  latitude: number | null;
  longitude: number | null;
  direction_offset: string | null;
  location_confidence: number | null;
  incident_id: string | null;
  possible_incident_id: string | null;
  correlation_status: CorrelationStatus;
  match_score: number | null;
  match_breakdown: MatchBreakdown | null;
  is_unverified_evidence: boolean;
  reported_at: string;
  created_at: string;
}

export interface IncidentUpdateRecord {
  id: string;
  incident_id: string;
  report_id: string | null;
  update_type: IncidentUpdateType;
  previous_status: IncidentStatus | null;
  new_status: IncidentStatus | null;
  information_origin: InformationOrigin;
  summary: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface NotificationRecord {
  id: string;
  incident_id: string;
  report_id: string | null;
  channel: NotificationChannel;
  notification_type: NotificationType;
  recipient: string | null;
  title: string;
  message: string;
  follow_up_calls_avoided: number;
  is_read: boolean;
  created_at: string;
}
