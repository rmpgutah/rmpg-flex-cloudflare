import { Hono } from 'hono';
import type { Env } from '../types';
import {
  generateDescription,
  summarizeNotes,
  extractStructuredData,
  intakeAssist,
  scanExtract,
  chatCompletion,
} from '../services/ai';

const ai = new Hono<Env>();

// POST /ai/generate-description
ai.post('/generate-description', async (c) => {
  try {
    if (!c.env.QWEN_API_KEY) return c.json({ error: 'AI service not configured' }, 503);

    const body = await c.req.json<{
      incident_type: string;
      priority: string;
      location_address: string;
      caller_name?: string;
      caller_phone?: string;
      dispatch_code?: string;
      property_name?: string;
      subject_description?: string;
      vehicle_description?: string;
      weapons_involved?: string;
      notes?: string;
    }>();

    if (!body.incident_type || !body.priority || !body.location_address) {
      return c.json({ error: 'incident_type, priority, and location_address are required' }, 400);
    }

    const description = await generateDescription(c.env.QWEN_API_KEY, body, c.env.QWEN_BASE_URL);
    return c.json({ description });
  } catch (err) {
    console.error('AI generate-description error:', err);
    return c.json({ error: 'Failed to generate description' }, 500);
  }
});

// POST /ai/summarize-notes
ai.post('/summarize-notes', async (c) => {
  try {
    if (!c.env.QWEN_API_KEY) return c.json({ error: 'AI service not configured' }, 503);

    const { notes, incident_type, call_number } = await c.req.json<{
      notes: string;
      incident_type?: string;
      call_number?: string;
    }>();

    if (!notes?.trim()) return c.json({ error: 'notes field is required' }, 400);

    const summary = await summarizeNotes(c.env.QWEN_API_KEY, notes, { incident_type, call_number }, c.env.QWEN_BASE_URL);
    return c.json({ summary });
  } catch (err) {
    console.error('AI summarize-notes error:', err);
    return c.json({ error: 'Failed to summarize notes' }, 500);
  }
});

// POST /ai/extract
ai.post('/extract', async (c) => {
  try {
    if (!c.env.QWEN_API_KEY) return c.json({ error: 'AI service not configured' }, 503);

    const { text } = await c.req.json<{ text: string }>();
    if (!text?.trim()) return c.json({ error: 'text field is required' }, 400);

    const extracted = await extractStructuredData(c.env.QWEN_API_KEY, text, c.env.QWEN_BASE_URL);
    return c.json({ extracted });
  } catch (err) {
    console.error('AI extract error:', err);
    return c.json({ error: 'Failed to extract data' }, 500);
  }
});

// POST /ai/assist
ai.post('/assist', async (c) => {
  try {
    if (!c.env.QWEN_API_KEY) return c.json({ error: 'AI service not configured' }, 503);

    const partialData = await c.req.json<Record<string, unknown>>();
    if (!partialData || Object.keys(partialData).length === 0) {
      return c.json({ error: 'Request body with form fields required' }, 400);
    }

    const suggestions = await intakeAssist(c.env.QWEN_API_KEY, partialData, c.env.QWEN_BASE_URL);
    return c.json({ suggestions });
  } catch (err) {
    console.error('AI assist error:', err);
    return c.json({ error: 'Failed to get suggestions' }, 500);
  }
});

// POST /ai/scan
ai.post('/scan', async (c) => {
  try {
    if (!c.env.QWEN_API_KEY) return c.json({ error: 'AI service not configured' }, 503);

    const { scan_type, raw_data } = await c.req.json<{ scan_type: string; raw_data: string }>();
    if (!scan_type || !raw_data) return c.json({ error: 'scan_type and raw_data required' }, 400);
    if (!['qr', 'id', 'pdf417'].includes(scan_type)) {
      return c.json({ error: 'scan_type must be qr, id, or pdf417' }, 400);
    }

    const parsed = await scanExtract(c.env.QWEN_API_KEY, scan_type as 'qr' | 'id' | 'pdf417', raw_data, c.env.QWEN_BASE_URL);
    return c.json({ parsed });
  } catch (err) {
    console.error('AI scan error:', err);
    return c.json({ error: 'Failed to process scan' }, 500);
  }
});

// POST /ai/chat - General-purpose chat endpoint (for future use)
ai.post('/chat', async (c) => {
  try {
    if (!c.env.QWEN_API_KEY) return c.json({ error: 'AI service not configured' }, 503);

    const { messages, temperature, max_tokens } = await c.req.json<{
      messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
      temperature?: number;
      max_tokens?: number;
    }>();

    if (!messages?.length) return c.json({ error: 'messages array is required' }, 400);

    const response = await chatCompletion(c.env.QWEN_API_KEY, { messages, temperature, max_tokens }, c.env.QWEN_BASE_URL);
    return c.json(response);
  } catch (err) {
    console.error('AI chat error:', err);
    return c.json({ error: 'Chat request failed' }, 500);
  }
});

export default ai;
