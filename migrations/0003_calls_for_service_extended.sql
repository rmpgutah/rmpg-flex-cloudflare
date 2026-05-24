-- Phase 2 extended columns for calls_for_service.
-- Ports the 53 addCol() migrations from the legacy Express schema
-- (server/src/models/database.ts) that were not carried into 0001_initial.sql.
-- The PUT /api/dispatch/calls/:id handler accepts these field names from
-- the client and was 500ing with "no such column" until this migration.
--
-- Apply with:
--   wrangler d1 execute rmpg-flex-db --file=migrations/0003_calls_for_service_extended.sql --remote

-- Geography (legacy 4-tier: sector / zone / beat)
ALTER TABLE calls_for_service ADD COLUMN sector_id TEXT;
ALTER TABLE calls_for_service ADD COLUMN sector_name TEXT;
ALTER TABLE calls_for_service ADD COLUMN zone_id TEXT;
ALTER TABLE calls_for_service ADD COLUMN zone_name TEXT;
ALTER TABLE calls_for_service ADD COLUMN zone_beat TEXT;
ALTER TABLE calls_for_service ADD COLUMN beat_id TEXT;
ALTER TABLE calls_for_service ADD COLUMN beat_name TEXT;
ALTER TABLE calls_for_service ADD COLUMN beat_descriptor TEXT;
ALTER TABLE calls_for_service ADD COLUMN section_name TEXT;

-- Caller / location detail
ALTER TABLE calls_for_service ADD COLUMN caller_relationship TEXT DEFAULT '';
ALTER TABLE calls_for_service ADD COLUMN caller_address TEXT DEFAULT '';
ALTER TABLE calls_for_service ADD COLUMN cross_street TEXT;
ALTER TABLE calls_for_service ADD COLUMN location_building TEXT;
ALTER TABLE calls_for_service ADD COLUMN location_floor TEXT;
ALTER TABLE calls_for_service ADD COLUMN location_room TEXT;
ALTER TABLE calls_for_service ADD COLUMN contact_method TEXT;

-- Subject / vehicle descriptors
ALTER TABLE calls_for_service ADD COLUMN num_subjects INTEGER;
ALTER TABLE calls_for_service ADD COLUMN num_victims INTEGER;
ALTER TABLE calls_for_service ADD COLUMN subject_description TEXT;
ALTER TABLE calls_for_service ADD COLUMN vehicle_description TEXT;
ALTER TABLE calls_for_service ADD COLUMN direction_of_travel TEXT;
ALTER TABLE calls_for_service ADD COLUMN weapons_involved TEXT;

-- Scene conditions
ALTER TABLE calls_for_service ADD COLUMN scene_safety TEXT;
ALTER TABLE calls_for_service ADD COLUMN weather_conditions TEXT;
ALTER TABLE calls_for_service ADD COLUMN lighting_conditions TEXT;
ALTER TABLE calls_for_service ADD COLUMN secondary_type TEXT;
ALTER TABLE calls_for_service ADD COLUMN dispatch_code TEXT;

-- Officer / response
ALTER TABLE calls_for_service ADD COLUMN responding_officer TEXT;
ALTER TABLE calls_for_service ADD COLUMN responding_vehicle_id INTEGER;
ALTER TABLE calls_for_service ADD COLUMN action_taken TEXT;

-- Damage
ALTER TABLE calls_for_service ADD COLUMN damage_estimate REAL;
ALTER TABLE calls_for_service ADD COLUMN damage_description TEXT;

-- LE / supervisor coordination
ALTER TABLE calls_for_service ADD COLUMN le_agency TEXT;
ALTER TABLE calls_for_service ADD COLUMN le_case_number TEXT;
ALTER TABLE calls_for_service ADD COLUMN le_notified INTEGER DEFAULT 0;
ALTER TABLE calls_for_service ADD COLUMN supervisor_notified INTEGER DEFAULT 0;

-- Boolean tactical flags (15)
ALTER TABLE calls_for_service ADD COLUMN injuries_reported INTEGER DEFAULT 0;
ALTER TABLE calls_for_service ADD COLUMN alcohol_involved INTEGER DEFAULT 0;
ALTER TABLE calls_for_service ADD COLUMN drugs_involved INTEGER DEFAULT 0;
ALTER TABLE calls_for_service ADD COLUMN domestic_violence INTEGER DEFAULT 0;
ALTER TABLE calls_for_service ADD COLUMN mental_health_crisis INTEGER DEFAULT 0;
ALTER TABLE calls_for_service ADD COLUMN juvenile_involved INTEGER DEFAULT 0;
ALTER TABLE calls_for_service ADD COLUMN felony_in_progress INTEGER DEFAULT 0;
ALTER TABLE calls_for_service ADD COLUMN officer_safety_caution INTEGER DEFAULT 0;
ALTER TABLE calls_for_service ADD COLUMN k9_requested INTEGER DEFAULT 0;
ALTER TABLE calls_for_service ADD COLUMN ems_requested INTEGER DEFAULT 0;
ALTER TABLE calls_for_service ADD COLUMN fire_requested INTEGER DEFAULT 0;
ALTER TABLE calls_for_service ADD COLUMN hazmat INTEGER DEFAULT 0;
ALTER TABLE calls_for_service ADD COLUMN gang_related INTEGER DEFAULT 0;
ALTER TABLE calls_for_service ADD COLUMN evidence_collected INTEGER DEFAULT 0;
ALTER TABLE calls_for_service ADD COLUMN body_camera_active INTEGER DEFAULT 0;
ALTER TABLE calls_for_service ADD COLUMN photos_taken INTEGER DEFAULT 0;
ALTER TABLE calls_for_service ADD COLUMN trespass_issued INTEGER DEFAULT 0;
ALTER TABLE calls_for_service ADD COLUMN vehicle_pursuit INTEGER DEFAULT 0;
ALTER TABLE calls_for_service ADD COLUMN foot_pursuit INTEGER DEFAULT 0;

-- PSO (private security operations) — billing + service windows
ALTER TABLE calls_for_service ADD COLUMN pso_requestor_name TEXT;
ALTER TABLE calls_for_service ADD COLUMN pso_requestor_phone TEXT;
ALTER TABLE calls_for_service ADD COLUMN pso_requestor_email TEXT;
ALTER TABLE calls_for_service ADD COLUMN pso_service_type TEXT;
ALTER TABLE calls_for_service ADD COLUMN pso_billing_code TEXT;
ALTER TABLE calls_for_service ADD COLUMN pso_authorization TEXT;
ALTER TABLE calls_for_service ADD COLUMN pso_72hr_deadline TEXT;
ALTER TABLE calls_for_service ADD COLUMN pso_72hr_notified TEXT;
ALTER TABLE calls_for_service ADD COLUMN pso_service_windows TEXT;
ALTER TABLE calls_for_service ADD COLUMN pso_attempt_number INTEGER DEFAULT 1;

-- Process service (subpoenas, summons, evictions, etc.)
ALTER TABLE calls_for_service ADD COLUMN process_service_type TEXT;
ALTER TABLE calls_for_service ADD COLUMN process_served_to TEXT;
ALTER TABLE calls_for_service ADD COLUMN process_served_address TEXT;
ALTER TABLE calls_for_service ADD COLUMN process_attempts INTEGER DEFAULT 0;
ALTER TABLE calls_for_service ADD COLUMN process_served_at TEXT;
ALTER TABLE calls_for_service ADD COLUMN process_service_result TEXT;

-- Cross-linking
ALTER TABLE calls_for_service ADD COLUMN case_id INTEGER;
ALTER TABLE calls_for_service ADD COLUMN case_number TEXT;
ALTER TABLE calls_for_service ADD COLUMN client_id INTEGER;
ALTER TABLE calls_for_service ADD COLUMN contract_id TEXT;

-- Lifecycle / metrics
ALTER TABLE calls_for_service ADD COLUMN previous_status TEXT;
ALTER TABLE calls_for_service ADD COLUMN status_changed_at TEXT;
ALTER TABLE calls_for_service ADD COLUMN archived_at TEXT;
ALTER TABLE calls_for_service ADD COLUMN received_at TEXT;
ALTER TABLE calls_for_service ADD COLUMN updated_at TEXT;
ALTER TABLE calls_for_service ADD COLUMN priority_score INTEGER DEFAULT 0;
ALTER TABLE calls_for_service ADD COLUMN response_time_seconds REAL;
ALTER TABLE calls_for_service ADD COLUMN onscene_duration_seconds REAL;
ALTER TABLE calls_for_service ADD COLUMN starting_mileage REAL;
ALTER TABLE calls_for_service ADD COLUMN ending_mileage REAL;
ALTER TABLE calls_for_service ADD COLUMN pinned INTEGER DEFAULT 0;
ALTER TABLE calls_for_service ADD COLUMN overdue_notified TEXT;

-- Indexes that show up in legacy hot paths (status + priority + zone filters).
CREATE INDEX IF NOT EXISTS idx_cfs_status ON calls_for_service(status);
CREATE INDEX IF NOT EXISTS idx_cfs_priority ON calls_for_service(priority);
CREATE INDEX IF NOT EXISTS idx_cfs_zone ON calls_for_service(zone_id);
CREATE INDEX IF NOT EXISTS idx_cfs_beat ON calls_for_service(beat_id);
CREATE INDEX IF NOT EXISTS idx_cfs_case ON calls_for_service(case_id);
CREATE INDEX IF NOT EXISTS idx_cfs_client ON calls_for_service(client_id);
