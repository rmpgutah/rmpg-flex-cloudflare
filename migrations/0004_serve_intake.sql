-- Phase 4: ServeIntake — intake forms for PSO, process service, and general calls
-- Includes AI-generated fields and scanned document data.

CREATE TABLE IF NOT EXISTS serve_intake (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  intake_number TEXT UNIQUE,

  -- Type & status
  type TEXT NOT NULL CHECK(type IN ('pso', 'process_service', 'general')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','in_progress','completed','converted','cancelled')),

  -- Common caller fields
  caller_name TEXT,
  caller_phone TEXT,
  caller_email TEXT,
  caller_relationship TEXT,

  -- Location
  location_address TEXT,
  latitude REAL,
  longitude REAL,
  property_id INTEGER,
  cross_street TEXT,
  location_building TEXT,
  location_floor TEXT,
  location_room TEXT,

  -- Incident details
  incident_type TEXT,
  priority TEXT CHECK(priority IN ('P1','P2','P3','P4')),
  description TEXT,
  notes TEXT,
  source TEXT DEFAULT 'phone',

  -- PSO-specific fields
  pso_requestor_name TEXT,
  pso_requestor_phone TEXT,
  pso_requestor_email TEXT,
  pso_service_type TEXT,
  pso_billing_code TEXT,
  pso_authorization TEXT,
  pso_72hr_deadline TEXT,
  pso_72hr_notified TEXT,
  pso_service_windows TEXT,
  pso_attempt_number INTEGER DEFAULT 1,

  -- Process service-specific fields
  process_service_type TEXT,
  process_served_to TEXT,
  process_served_address TEXT,
  process_attempts INTEGER DEFAULT 0,
  process_served_at TEXT,
  process_service_result TEXT,

  -- Subject / vehicle descriptors
  subject_description TEXT,
  vehicle_description TEXT,
  num_subjects INTEGER,
  num_victims INTEGER,
  weapons_involved TEXT,
  direction_of_travel TEXT,

  -- Tactical flags
  injuries_reported INTEGER DEFAULT 0,
  domestic_violence INTEGER DEFAULT 0,
  mental_health_crisis INTEGER DEFAULT 0,
  juvenile_involved INTEGER DEFAULT 0,
  officer_safety_caution INTEGER DEFAULT 0,

  -- AI-generated fields
  ai_description TEXT,
  ai_summary TEXT,
  ai_extracted_data TEXT,    -- JSON blob from extractStructuredData
  ai_suggestions TEXT,       -- JSON blob from intakeAssist

  -- Scanned document data
  scanned_type TEXT,         -- 'qr', 'id', 'pdf417'
  scanned_data TEXT,         -- raw decoded string from scanner
  scanned_parsed TEXT,       -- JSON blob from scanExtract

  -- Linking
  call_id INTEGER,           -- linked calls_for_service after conversion
  client_id INTEGER,
  contract_id TEXT,

  -- Audit
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (call_id) REFERENCES calls_for_service(id),
  FOREIGN KEY (property_id) REFERENCES properties(id),
  FOREIGN KEY (client_id) REFERENCES clients(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_si_status ON serve_intake(status);
CREATE INDEX IF NOT EXISTS idx_si_type ON serve_intake(type);
CREATE INDEX IF NOT EXISTS idx_si_created ON serve_intake(created_at);
CREATE INDEX IF NOT EXISTS idx_si_call ON serve_intake(call_id);
