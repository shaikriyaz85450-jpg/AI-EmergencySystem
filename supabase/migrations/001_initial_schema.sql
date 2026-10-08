-- ============================================================================
-- AI Emergency Response Assistant — Phase 2 Initial Database Schema
-- Migration: 001_initial_schema.sql
-- Source of Truth: MVP_SPEC.md, PROJECT_PROCESS.md, PROJECT_RULES.md
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. LANDMARKS (Gazetteer for Location Understanding — MVP_SPEC.md §8)
-- Created first because incidents and reports reference landmarks(id).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.landmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  canonical_name TEXT NOT NULL UNIQUE,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  area TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90.0 AND 90.0),
  longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180.0 AND 180.0),
  radius_meters INTEGER NOT NULL DEFAULT 500 CHECK (radius_meters > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 2. INCIDENTS (Normalized Real-World Incidents — MVP_SPEC.md §5, §8-§13)
-- Created before reports, incident_updates, and notifications so parent
-- incident rows exist before any child rows reference incidents(id).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_code TEXT NOT NULL UNIQUE DEFAULT (
    'INC-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6))
  ),
  title TEXT NOT NULL,
  summary TEXT,
  incident_type TEXT NOT NULL,

  -- Lifecycle state (MVP_SPEC.md §10)
  status TEXT NOT NULL DEFAULT 'Active' CHECK (
    status IN ('Active', 'Escalated', 'Rescue in Progress', 'Resolved')
  ),

  -- Urgency level (MVP_SPEC.md §4, §12)
  urgency TEXT NOT NULL DEFAULT 'Medium' CHECK (
    urgency IN ('Low', 'Medium', 'High', 'Critical')
  ),

  -- Location fields (MVP_SPEC.md §8, §12, §13)
  location_text TEXT NOT NULL,
  landmark_id UUID REFERENCES public.landmarks(id) ON DELETE SET NULL,
  canonical_landmark TEXT,
  area TEXT,
  latitude DOUBLE PRECISION CHECK (latitude IS NULL OR (latitude BETWEEN -90.0 AND 90.0)),
  longitude DOUBLE PRECISION CHECK (longitude IS NULL OR (longitude BETWEEN -180.0 AND 180.0)),
  direction_offset TEXT,
  location_confidence NUMERIC(4,3) CHECK (
    location_confidence IS NULL OR (location_confidence BETWEEN 0.0 AND 1.0)
  ),

  -- People affected rules (MVP_SPEC.md §5: NEVER sum counts across reports;
  -- store latest explicit total from highest-trust source, plus range when
  -- citizen values disagree)
  people_affected_count INTEGER CHECK (
    people_affected_count IS NULL OR people_affected_count >= 0
  ),
  people_affected_min INTEGER CHECK (
    people_affected_min IS NULL OR people_affected_min >= 0
  ),
  people_affected_max INTEGER CHECK (
    people_affected_max IS NULL OR people_affected_max >= 0
  ),
  people_affected_description TEXT,
  people_count_origin TEXT NOT NULL DEFAULT 'ai_extracted' CHECK (
    people_count_origin IN ('ai_extracted', 'responder_confirmed', 'operator')
  ),
  vulnerable_people TEXT[] NOT NULL DEFAULT '{}',

  -- Resources, evidence, origin, and uncertainty (MVP_SPEC.md §4, §12, §13)
  resources_needed TEXT[] NOT NULL DEFAULT '{}',
  information_origin TEXT NOT NULL DEFAULT 'ai_extracted' CHECK (
    information_origin IN ('ai_extracted', 'responder_confirmed', 'operator')
  ),
  confidence_score NUMERIC(4,3) CHECK (
    confidence_score IS NULL OR (confidence_score BETWEEN 0.0 AND 1.0)
  ),
  evidence_summary TEXT,
  uncertainty_notes TEXT,

  -- Related report tracking (MVP_SPEC.md §12)
  related_report_count INTEGER NOT NULL DEFAULT 0 CHECK (related_report_count >= 0),
  latest_update_summary TEXT,

  -- Resolution verification flow (MVP_SPEC.md §10, §11: citizen report sets
  -- resolution_pending = true; ONLY responder/operator confirmation resolves)
  resolution_pending BOOLEAN NOT NULL DEFAULT false,
  resolution_notes TEXT,
  resolved_by TEXT CHECK (
    resolved_by IS NULL OR resolved_by IN ('responder_confirmed', 'operator')
  ),
  resolved_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT incidents_people_range_check CHECK (
    people_affected_min IS NULL
    OR people_affected_max IS NULL
    OR people_affected_min <= people_affected_max
  ),
  CONSTRAINT incidents_resolution_verification_check CHECK (
    status <> 'Resolved' OR resolved_by IN ('responder_confirmed', 'operator')
  )
);

-- ============================================================================
-- 3. REPORTS (Raw Incoming Reports — MVP_SPEC.md §3, §4, §6-§9, §14)
-- Preserves original incoming report data and links to incidents/landmarks.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Input source / channel (MVP_SPEC.md §3)
  source_channel TEXT NOT NULL CHECK (
    source_channel IN ('audio', 'whatsapp', 'sms', 'social_media', 'responder', 'operator')
  ),

  -- Raw & audio transcript fields (MVP_SPEC.md §4, §14, Rule 7)
  raw_content TEXT NOT NULL CHECK (char_length(trim(raw_content)) > 0),
  audio_file_url TEXT,
  audio_format TEXT CHECK (
    audio_format IS NULL OR audio_format IN ('mp3', 'wav', 'm4a', 'webm')
  ),
  original_transcript TEXT,
  edited_transcript TEXT,
  detected_language TEXT NOT NULL DEFAULT 'en',
  english_rendering TEXT,

  -- Classification & origin (MVP_SPEC.md §4, §6, §7)
  classification TEXT NOT NULL DEFAULT 'real_emergency' CHECK (
    classification IN ('real_emergency', 'irrelevant', 'rumor_unverified', 'general_question')
  ),
  filter_reason TEXT,
  information_origin TEXT NOT NULL DEFAULT 'ai_extracted' CHECK (
    information_origin IN ('ai_extracted', 'responder_confirmed', 'operator')
  ),

  -- AI extracted fields per report (MVP_SPEC.md §4, §5)
  extracted_incident_type TEXT,
  extracted_location TEXT,
  extracted_landmark TEXT,
  people_affected_description TEXT,
  people_affected_count INTEGER CHECK (
    people_affected_count IS NULL OR people_affected_count >= 0
  ),
  vulnerable_people TEXT[] NOT NULL DEFAULT '{}',
  resources_needed TEXT[] NOT NULL DEFAULT '{}',
  extracted_urgency TEXT CHECK (
    extracted_urgency IS NULL OR extracted_urgency IN ('Low', 'Medium', 'High', 'Critical')
  ),
  important_evidence TEXT,
  reports_resolution BOOLEAN NOT NULL DEFAULT false,
  extraction_confidence NUMERIC(4,3) CHECK (
    extraction_confidence IS NULL OR (extraction_confidence BETWEEN 0.0 AND 1.0)
  ),

  -- Resolved location fields (MVP_SPEC.md §8)
  landmark_id UUID REFERENCES public.landmarks(id) ON DELETE SET NULL,
  canonical_landmark TEXT,
  resolved_area TEXT,
  latitude DOUBLE PRECISION CHECK (latitude IS NULL OR (latitude BETWEEN -90.0 AND 90.0)),
  longitude DOUBLE PRECISION CHECK (longitude IS NULL OR (longitude BETWEEN -180.0 AND 180.0)),
  direction_offset TEXT,
  location_confidence NUMERIC(4,3) CHECK (
    location_confidence IS NULL OR (location_confidence BETWEEN 0.0 AND 1.0)
  ),

  -- Correlation fields (MVP_SPEC.md §6, §9)
  incident_id UUID REFERENCES public.incidents(id) ON DELETE SET NULL,
  possible_incident_id UUID REFERENCES public.incidents(id) ON DELETE SET NULL,
  correlation_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    correlation_status IN (
      'pending',
      'matched',
      'new_incident',
      'possible_match',
      'no_match',
      'unverified_queue',
      'filtered',
      'operator_assigned'
    )
  ),
  match_score NUMERIC(4,3) CHECK (
    match_score IS NULL OR (match_score BETWEEN 0.0 AND 1.0)
  ),
  match_breakdown JSONB,
  is_unverified_evidence BOOLEAN NOT NULL DEFAULT false,

  reported_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 4. INCIDENT UPDATES (Append-Only Timeline — MVP_SPEC.md §10, §13, §16, §17)
-- Created after incidents and reports so both foreign keys exist.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.incident_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  report_id UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  update_type TEXT NOT NULL CHECK (
    update_type IN (
      'incident_created',
      'report_correlated',
      'status_change',
      'urgency_change',
      'people_count_update',
      'vulnerable_people_update',
      'resource_update',
      'location_update',
      'resolution_pending',
      'resolution_confirmed',
      'reopened',
      'operator_merge',
      'operator_split',
      'operator_reassign',
      'unverified_evidence_attached',
      'general_update'
    )
  ),
  previous_status TEXT CHECK (
    previous_status IS NULL OR previous_status IN ('Active', 'Escalated', 'Rescue in Progress', 'Resolved')
  ),
  new_status TEXT CHECK (
    new_status IS NULL OR new_status IN ('Active', 'Escalated', 'Rescue in Progress', 'Resolved')
  ),
  information_origin TEXT NOT NULL DEFAULT 'ai_extracted' CHECK (
    information_origin IN ('ai_extracted', 'responder_confirmed', 'operator')
  ),
  summary TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 5. NOTIFICATIONS (Operator & Channel Alerts — MVP_SPEC.md §16, §17)
-- Created after incidents and reports so both foreign keys exist.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID NOT NULL REFERENCES public.incidents(id) ON DELETE CASCADE,
  report_id UUID REFERENCES public.reports(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'in_app' CHECK (
    channel IN ('in_app', 'whatsapp', 'sms')
  ),
  notification_type TEXT NOT NULL CHECK (
    notification_type IN (
      'new_incident',
      'incident_escalated',
      'rescue_in_progress',
      'resolution_pending',
      'incident_resolved',
      'incident_reopened',
      'possible_match',
      'status_update'
    )
  ),
  recipient TEXT,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  follow_up_calls_avoided INTEGER NOT NULL DEFAULT 0 CHECK (follow_up_calls_avoided >= 0),
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================================
-- 6. INTEGRITY TRIGGERS (PROJECT_RULES.md Rule 7 & Rule 8)
-- - Automatically maintain incidents.updated_at
-- - Prevent mutation of reports.raw_content or deletion of raw reports
-- - Enforce append-only history on incident_updates (no UPDATE or DELETE)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_incidents_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_incidents_updated_at ON public.incidents;
CREATE TRIGGER trg_incidents_updated_at
BEFORE UPDATE ON public.incidents
FOR EACH ROW
EXECUTE FUNCTION public.set_incidents_updated_at();

CREATE OR REPLACE FUNCTION public.protect_raw_report()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Raw reports must never be deleted (Rule 7).';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.raw_content IS DISTINCT FROM OLD.raw_content THEN
    RAISE EXCEPTION 'reports.raw_content is immutable and cannot be modified (Rule 7).';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_raw_report ON public.reports;
CREATE TRIGGER trg_protect_raw_report
BEFORE UPDATE OR DELETE ON public.reports
FOR EACH ROW
EXECUTE FUNCTION public.protect_raw_report();

CREATE OR REPLACE FUNCTION public.enforce_append_only_incident_updates()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'incident_updates is append-only; historical records cannot be modified or deleted (Rule 8).';
END;
$$;

DROP TRIGGER IF EXISTS trg_append_only_incident_updates ON public.incident_updates;
CREATE TRIGGER trg_append_only_incident_updates
BEFORE UPDATE OR DELETE ON public.incident_updates
FOR EACH ROW
EXECUTE FUNCTION public.enforce_append_only_incident_updates();

-- ============================================================================
-- 7. INDEXES FOR FREQUENT QUERIES
-- ============================================================================

-- Landmarks
CREATE INDEX IF NOT EXISTS idx_landmarks_area ON public.landmarks(area);
CREATE INDEX IF NOT EXISTS idx_landmarks_aliases_gin ON public.landmarks USING GIN (aliases);

-- Incidents
CREATE INDEX IF NOT EXISTS idx_incidents_status ON public.incidents(status);
CREATE INDEX IF NOT EXISTS idx_incidents_incident_type ON public.incidents(incident_type);
CREATE INDEX IF NOT EXISTS idx_incidents_urgency ON public.incidents(urgency);
CREATE INDEX IF NOT EXISTS idx_incidents_landmark_id ON public.incidents(landmark_id);
CREATE INDEX IF NOT EXISTS idx_incidents_updated_at ON public.incidents(updated_at DESC);

-- Reports
CREATE INDEX IF NOT EXISTS idx_reports_incident_id ON public.reports(incident_id);
CREATE INDEX IF NOT EXISTS idx_reports_possible_incident_id ON public.reports(possible_incident_id);
CREATE INDEX IF NOT EXISTS idx_reports_landmark_id ON public.reports(landmark_id);
CREATE INDEX IF NOT EXISTS idx_reports_classification ON public.reports(classification);
CREATE INDEX IF NOT EXISTS idx_reports_correlation_status ON public.reports(correlation_status);
CREATE INDEX IF NOT EXISTS idx_reports_source_channel ON public.reports(source_channel);
CREATE INDEX IF NOT EXISTS idx_reports_reported_at ON public.reports(reported_at DESC);

-- Incident Updates
CREATE INDEX IF NOT EXISTS idx_incident_updates_incident_created
  ON public.incident_updates(incident_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_incident_updates_report_id
  ON public.incident_updates(report_id);

-- Notifications
CREATE INDEX IF NOT EXISTS idx_notifications_incident_id
  ON public.notifications(incident_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread_created
  ON public.notifications(is_read, created_at DESC);

-- ============================================================================
-- 8. ROW LEVEL SECURITY (RLS)
-- Note on Auth Limitation:
-- Authentication / operator login is out of scope in Phase 1-2.
-- Instead of creating insecure "FOR ALL USING (true)" policies:
-- 1. Landmarks are strictly read-only (SELECT only) for client connections.
-- 2. DELETE is denied across operational tables (no DELETE policy exists).
-- 3. incident_updates is strictly append-only (SELECT and INSERT only; no
--    UPDATE or DELETE policy).
-- 4. Scoped SELECT/INSERT/UPDATE policies are defined for MVP operation, while
--    role-based JWT claims (operator vs responder) are documented for future
--    authentication integration.
-- ============================================================================

ALTER TABLE public.landmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Landmarks: Read-only reference gazetteer for anon/authenticated clients
DROP POLICY IF EXISTS landmarks_select_policy ON public.landmarks;
CREATE POLICY landmarks_select_policy
  ON public.landmarks
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Incidents: Read access + validated insert/update (no DELETE policy)
DROP POLICY IF EXISTS incidents_select_policy ON public.incidents;
CREATE POLICY incidents_select_policy
  ON public.incidents
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS incidents_insert_policy ON public.incidents;
CREATE POLICY incidents_insert_policy
  ON public.incidents
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    status IN ('Active', 'Escalated', 'Rescue in Progress', 'Resolved')
    AND (status <> 'Resolved' OR resolved_by IN ('responder_confirmed', 'operator'))
  );

DROP POLICY IF EXISTS incidents_update_policy ON public.incidents;
CREATE POLICY incidents_update_policy
  ON public.incidents
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (
    status IN ('Active', 'Escalated', 'Rescue in Progress', 'Resolved')
    AND (status <> 'Resolved' OR resolved_by IN ('responder_confirmed', 'operator'))
  );

-- Reports: Read access + validated insert + correlation/transcript update (no DELETE policy)
DROP POLICY IF EXISTS reports_select_policy ON public.reports;
CREATE POLICY reports_select_policy
  ON public.reports
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS reports_insert_policy ON public.reports;
CREATE POLICY reports_insert_policy
  ON public.reports
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(trim(raw_content)) > 0
    AND source_channel IN ('audio', 'whatsapp', 'sms', 'social_media', 'responder', 'operator')
  );

DROP POLICY IF EXISTS reports_update_policy ON public.reports;
CREATE POLICY reports_update_policy
  ON public.reports
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (
    char_length(trim(raw_content)) > 0
  );

-- Incident Updates: Append-only (SELECT and INSERT only; no UPDATE or DELETE policy)
DROP POLICY IF EXISTS incident_updates_select_policy ON public.incident_updates;
CREATE POLICY incident_updates_select_policy
  ON public.incident_updates
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS incident_updates_insert_policy ON public.incident_updates;
CREATE POLICY incident_updates_insert_policy
  ON public.incident_updates
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(trim(summary)) > 0
  );

-- Notifications: Read access + insert + mark-as-read update (no DELETE policy)
DROP POLICY IF EXISTS notifications_select_policy ON public.notifications;
CREATE POLICY notifications_select_policy
  ON public.notifications
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS notifications_insert_policy ON public.notifications;
CREATE POLICY notifications_insert_policy
  ON public.notifications
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    channel IN ('in_app', 'whatsapp', 'sms')
  );

DROP POLICY IF EXISTS notifications_update_policy ON public.notifications;
CREATE POLICY notifications_update_policy
  ON public.notifications
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (
    channel IN ('in_app', 'whatsapp', 'sms')
  );

-- ============================================================================
-- 9. SEED DATA — LANDMARK GAZETTEER ONLY (MVP_SPEC.md §8, §15)
-- No fake AI-generated incidents or pre-correlated reports are inserted here.
-- ============================================================================

INSERT INTO public.landmarks (
  canonical_name,
  aliases,
  area,
  latitude,
  longitude,
  radius_meters
)
VALUES
  (
    'Velachery MRTS Station',
    ARRAY[
      'Velachery Railway Station',
      'Velachery Station',
      'MRTS Velachery',
      'Velachery Train Station',
      'Near Velachery MRTS',
      'வேளச்சேரி ரயில் நிலையம்',
      'वेलाचेरी रेलवे स्टेशन'
    ],
    'Velachery',
    12.9756,
    80.2185,
    600
  ),
  (
    'Taramani MRTS Station',
    ARRAY[
      'Taramani Station',
      'Taramani Railway Station',
      'MRTS Taramani',
      'TIDEL Park Signal'
    ],
    'Taramani',
    12.9863,
    80.2432,
    500
  ),
  (
    'Guindy Railway Station',
    ARRAY[
      'Guindy Station',
      'Guindy Metro Station',
      'Guindy Bus Terminus',
      'கிண்டி ரயில் நிலையம்'
    ],
    'Guindy',
    13.0067,
    80.2206,
    500
  ),
  (
    'Saidapet Bridge',
    ARRAY[
      'Saidapet Maraimalai Adigal Bridge',
      'Saidapet River Bridge',
      'Adyar River Bridge Saidapet',
      'சைதாப்பேட்டை பாலம்'
    ],
    'Saidapet',
    13.0213,
    80.2231,
    450
  ),
  (
    'Pallikaranai Marshland Main Road',
    ARRAY[
      'Pallikaranai Main Road',
      'Velachery Tambaram Main Road Pallikaranai',
      'Narayanapuram Lake Road'
    ],
    'Pallikaranai',
    12.9482,
    80.2074,
    700
  ),
  (
    'Adyar Bus Depot',
    ARRAY[
      'Adyar Depot',
      'Adyar Signal',
      'LB Road Adyar',
      'அடையாறு பேருந்து பணிமனை'
    ],
    'Adyar',
    12.9985,
    80.2568,
    450
  )
ON CONFLICT (canonical_name) DO UPDATE
SET
  aliases = EXCLUDED.aliases,
  area = EXCLUDED.area,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  radius_meters = EXCLUDED.radius_meters;
