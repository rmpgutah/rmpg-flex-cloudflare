import { Hono } from 'hono';
import type { Env } from '../types';
import { getDb, query, queryFirst, execute } from '../utils/db';
import {
  generateDescription,
  summarizeNotes,
  extractStructuredData,
  intakeAssist,
  scanExtract,
} from '../services/ai';

const serveIntake = new Hono<Env>();

// GET /serve-intake - List intake records
serveIntake.get('/', async (c) => {
  try {
    const db = getDb(c.env);
    const { status, type, search, page, limit } = c.req.query();

    let where = 'WHERE 1=1';
    const params: unknown[] = [];

    if (status) { where += ' AND si.status = ?'; params.push(status); }
    if (type) { where += ' AND si.type = ?'; params.push(type); }
    if (search) {
      where += ' AND (si.intake_number LIKE ? OR si.caller_name LIKE ? OR si.location_address LIKE ? OR si.description LIKE ?)';
      const s = `%${search}%`; params.push(s, s, s, s);
    }

    const pageNum = Math.max(1, parseInt(page || '1', 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit || '50', 10)));
    const offset = (pageNum - 1) * limitNum;

    const [{ total }] = await query<{ total: number }>(db, `SELECT COUNT(*) as total FROM serve_intake si ${where}`, ...params);

    const rows = await query<Record<string, unknown>>(db, `
      SELECT si.*, u.full_name as created_by_name, p.name as property_name
      FROM serve_intake si
      LEFT JOIN users u ON si.created_by = u.id
      LEFT JOIN properties p ON si.property_id = p.id
      ${where}
      ORDER BY si.created_at DESC
      LIMIT ? OFFSET ?
    `, ...params, limitNum, offset);

    return c.json({
      data: rows,
      pagination: { page: pageNum, limit: limitNum, total, totalPages: Math.ceil(total / limitNum) },
    });
  } catch (err) {
    console.error('List serve intake error:', err);
    return c.json({ error: 'Failed to list intake records' }, 500);
  }
});

// POST /serve-intake - Create intake record
serveIntake.post('/', async (c) => {
  try {
    const db = getDb(c.env);
    const body = await c.req.json<Record<string, unknown>>();
    const userId = c.get('userId') as number;

    const type = body.type as string;
    if (!type || !['pso', 'process_service', 'general'].includes(type)) {
      return c.json({ error: 'type must be pso, process_service, or general' }, 400);
    }

    // Generate intake number
    const year = new Date().getFullYear().toString().slice(-2);
    const prefix = type === 'pso' ? 'PSO' : type === 'process_service' ? 'PSV' : 'GEN';
    const [{ max }] = await query<{ max: string | null }>(
      db,
      "SELECT MAX(intake_number) as max FROM serve_intake WHERE intake_number LIKE ?",
      `${year}-${prefix}%`,
    );
    const seq = max ? String(parseInt(max.split(`${prefix}`)[1] || '0', 10) + 1).padStart(4, '0') : '0001';
    const intakeNumber = `${year}-${prefix}${seq}`;

    const cols = ['intake_number', 'created_by'];
    const vals = ['?', '?'];
    const bindParams: unknown[] = [intakeNumber, userId];

    const allowedCols = [
      'type', 'caller_name', 'caller_phone', 'caller_email', 'caller_relationship',
      'location_address', 'latitude', 'longitude', 'property_id', 'cross_street',
      'location_building', 'location_floor', 'location_room',
      'incident_type', 'priority', 'description', 'notes', 'source',
      'pso_requestor_name', 'pso_requestor_phone', 'pso_requestor_email',
      'pso_service_type', 'pso_billing_code', 'pso_authorization',
      'pso_72hr_deadline', 'pso_72hr_notified', 'pso_service_windows', 'pso_attempt_number',
      'process_service_type', 'process_served_to', 'process_served_address',
      'process_attempts', 'process_served_at', 'process_service_result',
      'subject_description', 'vehicle_description', 'num_subjects', 'num_victims',
      'weapons_involved', 'direction_of_travel',
      'injuries_reported', 'domestic_violence', 'mental_health_crisis',
      'juvenile_involved', 'officer_safety_caution',
      'client_id', 'contract_id',
    ];

    for (const key of allowedCols) {
      if (body[key] !== undefined) {
        cols.push(key);
        vals.push('?');
        bindParams.push(body[key] ?? null);
      }
    }

    const result = await execute(
      db,
      `INSERT INTO serve_intake (${cols.join(',')}) VALUES (${vals.map(() => '?').join(',')})`,
      ...bindParams,
    );
    const intakeId = Number(result.meta.last_row_id);
    const record = await queryFirst<Record<string, unknown>>(db, 'SELECT * FROM serve_intake WHERE id = ?', intakeId);

    return c.json(record, 201);
  } catch (err) {
    console.error('Create serve intake error:', err);
    return c.json({ error: 'Failed to create intake record' }, 500);
  }
});

// GET /serve-intake/:id - Single intake record
serveIntake.get('/:id', async (c) => {
  try {
    const db = getDb(c.env);
    const id = c.req.param('id');
    const record = await queryFirst<Record<string, unknown>>(db, `
      SELECT si.*, u.full_name as created_by_name, p.name as property_name,
        cl.name as client_name
      FROM serve_intake si
      LEFT JOIN users u ON si.created_by = u.id
      LEFT JOIN properties p ON si.property_id = p.id
      LEFT JOIN clients cl ON si.client_id = cl.id
      WHERE si.id = ?
    `, id);

    if (!record) return c.json({ error: 'Intake record not found' }, 404);
    return c.json(record);
  } catch (err) {
    console.error('Get serve intake error:', err);
    return c.json({ error: 'Failed to get intake record' }, 500);
  }
});

// PUT /serve-intake/:id - Update intake record
serveIntake.put('/:id', async (c) => {
  try {
    const db = getDb(c.env);
    const id = c.req.param('id');
    const existing = await queryFirst<Record<string, unknown>>(db, 'SELECT * FROM serve_intake WHERE id = ?', id);
    if (!existing) return c.json({ error: 'Intake record not found' }, 404);

    const body = await c.req.json<Record<string, unknown>>();
    const updates: string[] = [];
    const params: unknown[] = [];

    const allowedCols = [
      'status', 'caller_name', 'caller_phone', 'caller_email', 'caller_relationship',
      'location_address', 'latitude', 'longitude', 'property_id', 'cross_street',
      'location_building', 'location_floor', 'location_room',
      'incident_type', 'priority', 'description', 'notes', 'source',
      'pso_requestor_name', 'pso_requestor_phone', 'pso_requestor_email',
      'pso_service_type', 'pso_billing_code', 'pso_authorization',
      'pso_72hr_deadline', 'pso_72hr_notified', 'pso_service_windows', 'pso_attempt_number',
      'process_service_type', 'process_served_to', 'process_served_address',
      'process_attempts', 'process_served_at', 'process_service_result',
      'subject_description', 'vehicle_description', 'num_subjects', 'num_victims',
      'weapons_involved', 'direction_of_travel',
      'injuries_reported', 'domestic_violence', 'mental_health_crisis',
      'juvenile_involved', 'officer_safety_caution',
      'client_id', 'contract_id',
      'ai_description', 'ai_summary', 'ai_extracted_data', 'ai_suggestions',
      'scanned_type', 'scanned_data', 'scanned_parsed',
      'call_id',
    ];

    for (const key of allowedCols) {
      if (body[key] !== undefined) {
        updates.push(`${key} = ?`);
        params.push(body[key] ?? null);
      }
    }

    if (updates.length === 0) return c.json({ message: 'No changes' });

    updates.push("updated_at = datetime('now')");
    params.push(id);
    await execute(db, `UPDATE serve_intake SET ${updates.join(', ')} WHERE id = ?`, ...params);

    const updated = await queryFirst<Record<string, unknown>>(db, 'SELECT * FROM serve_intake WHERE id = ?', id);
    return c.json(updated);
  } catch (err) {
    console.error('Update serve intake error:', err);
    return c.json({ error: 'Failed to update intake record' }, 500);
  }
});

// DELETE /serve-intake/:id
serveIntake.delete('/:id', async (c) => {
  try {
    const db = getDb(c.env);
    const id = c.req.param('id');
    await execute(db, 'DELETE FROM serve_intake WHERE id = ?', id);
    return c.json({ message: 'Intake record deleted' });
  } catch (err) {
    return c.json({ error: 'Failed to delete intake record' }, 500);
  }
});

// POST /serve-intake/:id/generate - AI-generate description
serveIntake.post('/:id/generate', async (c) => {
  try {
    const db = getDb(c.env);
    const id = c.req.param('id');
    const record = await queryFirst<Record<string, unknown>>(db, 'SELECT * FROM serve_intake WHERE id = ?', id);
    if (!record) return c.json({ error: 'Intake record not found' }, 404);
    if (!c.env.QWEN_API_KEY) return c.json({ error: 'AI service not configured' }, 503);

    const description = await generateDescription(c.env.QWEN_API_KEY, {
      incident_type: String(record.incident_type || ''),
      priority: String(record.priority || 'P3'),
      location_address: String(record.location_address || ''),
      caller_name: String(record.caller_name || ''),
      dispatch_code: undefined,
      property_name: String(record.property_name || ''),
      subject_description: String(record.subject_description || ''),
      vehicle_description: String(record.vehicle_description || ''),
      weapons_involved: String(record.weapons_involved || ''),
      notes: String(record.notes || record.description || ''),
    }, c.env.QWEN_BASE_URL);

    await execute(db, "UPDATE serve_intake SET ai_description = ?, updated_at = datetime('now') WHERE id = ?", description, id);
    return c.json({ ai_description: description });
  } catch (err) {
    console.error('AI generate description error:', err);
    return c.json({ error: 'Failed to generate description' }, 500);
  }
});

// POST /serve-intake/:id/summarize - AI-summarize notes
serveIntake.post('/:id/summarize', async (c) => {
  try {
    const db = getDb(c.env);
    const id = c.req.param('id');
    const record = await queryFirst<Record<string, unknown>>(db, 'SELECT * FROM serve_intake WHERE id = ?', id);
    if (!record) return c.json({ error: 'Intake record not found' }, 404);
    if (!c.env.QWEN_API_KEY) return c.json({ error: 'AI service not configured' }, 503);

    const notesText = String(record.notes || record.description || '');
    if (!notesText.trim()) return c.json({ error: 'No notes to summarize' }, 400);

    const summary = await summarizeNotes(c.env.QWEN_API_KEY, notesText, {
      incident_type: String(record.incident_type || ''),
      call_number: String(record.intake_number || ''),
    }, c.env.QWEN_BASE_URL);

    await execute(db, "UPDATE serve_intake SET ai_summary = ?, updated_at = datetime('now') WHERE id = ?", summary, id);
    return c.json({ ai_summary: summary });
  } catch (err) {
    console.error('AI summarize error:', err);
    return c.json({ error: 'Failed to summarize notes' }, 500);
  }
});

// POST /serve-intake/:id/extract - AI-extract structured data
serveIntake.post('/:id/extract', async (c) => {
  try {
    const db = getDb(c.env);
    const id = c.req.param('id');
    const record = await queryFirst<Record<string, unknown>>(db, 'SELECT * FROM serve_intake WHERE id = ?', id);
    if (!record) return c.json({ error: 'Intake record not found' }, 404);
    if (!c.env.QWEN_API_KEY) return c.json({ error: 'AI service not configured' }, 503);

    const text = [record.description, record.notes, record.scanned_data]
      .filter(Boolean)
      .join('\n');
    if (!text.trim()) return c.json({ error: 'No text to extract from' }, 400);

    const extracted = await extractStructuredData(c.env.QWEN_API_KEY, text, c.env.QWEN_BASE_URL);

    await execute(
      db,
      "UPDATE serve_intake SET ai_extracted_data = ?, updated_at = datetime('now') WHERE id = ?",
      JSON.stringify(extracted),
      id,
    );
    return c.json({ ai_extracted_data: extracted });
  } catch (err) {
    console.error('AI extract error:', err);
    return c.json({ error: 'Failed to extract data' }, 500);
  }
});

// POST /serve-intake/:id/assist - AI intake assist (suggest completions)
serveIntake.post('/:id/assist', async (c) => {
  try {
    const db = getDb(c.env);
    const id = c.req.param('id');
    const record = await queryFirst<Record<string, unknown>>(db, 'SELECT * FROM serve_intake WHERE id = ?', id);
    if (!record) return c.json({ error: 'Intake record not found' }, 404);
    if (!c.env.QWEN_API_KEY) return c.json({ error: 'AI service not configured' }, 503);

    const suggestions = await intakeAssist(c.env.QWEN_API_KEY, record as Record<string, unknown>, c.env.QWEN_BASE_URL);

    await execute(
      db,
      "UPDATE serve_intake SET ai_suggestions = ?, updated_at = datetime('now') WHERE id = ?",
      JSON.stringify(suggestions),
      id,
    );
    return c.json({ ai_suggestions: suggestions });
  } catch (err) {
    console.error('AI assist error:', err);
    return c.json({ error: 'Failed to get AI suggestions' }, 500);
  }
});

// POST /serve-intake/:id/scan - Process scanned document data
serveIntake.post('/:id/scan', async (c) => {
  try {
    const db = getDb(c.env);
    const id = c.req.param('id');
    const record = await queryFirst<Record<string, unknown>>(db, 'SELECT * FROM serve_intake WHERE id = ?', id);
    if (!record) return c.json({ error: 'Intake record not found' }, 404);

    const { scan_type, raw_data } = await c.req.json<{ scan_type: string; raw_data: string }>();
    if (!scan_type || !raw_data) return c.json({ error: 'scan_type and raw_data required' }, 400);
    if (!['qr', 'id', 'pdf417'].includes(scan_type)) return c.json({ error: 'scan_type must be qr, id, or pdf417' }, 400);

    let parsed: Record<string, unknown> = { raw: raw_data };

    if (c.env.QWEN_API_KEY) {
      try {
        parsed = await scanExtract(c.env.QWEN_API_KEY, scan_type as 'qr' | 'id' | 'pdf417', raw_data, c.env.QWEN_BASE_URL);
      } catch {
        // Fall back to raw data if AI parsing fails
        parsed = { raw: raw_data, parse_error: true };
      }
    }

    await execute(
      db,
      "UPDATE serve_intake SET scanned_type = ?, scanned_data = ?, scanned_parsed = ?, updated_at = datetime('now') WHERE id = ?",
      scan_type,
      raw_data,
      JSON.stringify(parsed),
      id,
    );

    return c.json({ scanned_type: scan_type, scanned_parsed: parsed });
  } catch (err) {
    console.error('Scan process error:', err);
    return c.json({ error: 'Failed to process scan' }, 500);
  }
});

// POST /serve-intake/:id/convert - Convert intake to a calls_for_service record
serveIntake.post('/:id/convert', async (c) => {
  try {
    const db = getDb(c.env);
    const id = c.req.param('id');
    const record = await queryFirst<Record<string, unknown>>(db, 'SELECT * FROM serve_intake WHERE id = ?', id);
    if (!record) return c.json({ error: 'Intake record not found' }, 404);

    // Generate call number
    const year = new Date().getFullYear().toString().slice(-2);
    const [{ max }] = await query<{ max: string | null }>(db, "SELECT MAX(call_number) as max FROM calls_for_service WHERE call_number LIKE ?", `${year}-CFS%`);
    const seq = max ? String(parseInt(max.split('-CFS')[1] || '0', 10) + 1).padStart(5, '0') : '00001';
    const callNumber = `${year}-CFS${seq}`;

    const result = await execute(db, `
      INSERT INTO calls_for_service (
        call_number, incident_type, priority, status, caller_name, caller_phone,
        location_address, property_id, latitude, longitude, description, notes, source,
        dispatcher_id, client_id, contract_id
      ) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      callNumber,
      record.incident_type || 'General',
      record.priority || 'P3',
      record.caller_name,
      record.caller_phone,
      record.location_address,
      record.property_id,
      record.latitude,
      record.longitude,
      record.ai_description || record.description,
      record.notes,
      record.source || 'intake',
      record.created_by,
      record.client_id,
      record.contract_id,
    );

    const callId = Number(result.meta.last_row_id);

    // Update intake record
    await execute(
      db,
      "UPDATE serve_intake SET call_id = ?, status = 'converted', updated_at = datetime('now') WHERE id = ?",
      callId,
      id,
    );

    const call = await queryFirst<Record<string, unknown>>(db, 'SELECT * FROM calls_for_service WHERE id = ?', callId);
    return c.json({ call, intake_id: id, message: 'Intake converted to call' }, 201);
  } catch (err) {
    console.error('Convert intake error:', err);
    return c.json({ error: 'Failed to convert intake to call' }, 500);
  }
});

export default serveIntake;
