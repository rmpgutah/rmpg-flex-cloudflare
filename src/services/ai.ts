const QWEN_BASE_URL_DEFAULT = 'http://localhost:11434/v1';

export function getQwenBaseUrl(env: { QWEN_BASE_URL?: string }): string {
  return env.QWEN_BASE_URL || QWEN_BASE_URL_DEFAULT;
}

export interface AiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AiChatRequest {
  messages: AiMessage[];
  temperature?: number;
  max_tokens?: number;
}

export interface AiChatResponse {
  choices: { message: { content: string }; finish_reason: string }[];
  usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export async function chatCompletion(
  apiKey: string,
  request: AiChatRequest,
  baseUrl?: string,
): Promise<AiChatResponse> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  // Bypass ngrok free-tier interstitial page
  if ((baseUrl || QWEN_BASE_URL_DEFAULT).includes('ngrok')) {
    headers['ngrok-skip-browser-warning'] = 'true';
  }
  const res = await fetch(`${baseUrl || QWEN_BASE_URL_DEFAULT}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: 'qwen3.6',
      messages: request.messages,
      temperature: request.temperature ?? 0.3,
      max_tokens: request.max_tokens ?? 2048,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`AI API error ${res.status}: ${body}`);
  }

  return res.json() as Promise<AiChatResponse>;
}

export async function generateDescription(
  apiKey: string,
  data: {
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
  },
  baseUrl?: string,
): Promise<string> {
  const systemPrompt = `You are a security dispatch AI assistant. Generate a concise, professional call description for a dispatch record. 
Write in third person. Include: incident type, location, key details from caller/notes, any subject/vehicle descriptors, and threat level implied by priority.
Keep it under 300 words. Do not fabricate details — only use what is provided.`;

  const userParts = [
    `Incident Type: ${data.incident_type}`,
    `Priority: ${data.priority}`,
    `Location: ${data.location_address}`,
    data.property_name ? `Property: ${data.property_name}` : '',
    data.caller_name ? `Caller: ${data.caller_name}` : '',
    data.dispatch_code ? `Dispatch Code: ${data.dispatch_code}` : '',
    data.subject_description ? `Subject: ${data.subject_description}` : '',
    data.vehicle_description ? `Vehicle: ${data.vehicle_description}` : '',
    data.weapons_involved ? `Weapons: ${data.weapons_involved}` : '',
    data.notes ? `Caller Notes: ${data.notes}` : '',
  ].filter(Boolean).join('\n');

  const response = await chatCompletion(apiKey, {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userParts },
    ],
    temperature: 0.3,
    max_tokens: 512,
  }, baseUrl);

  return response.choices[0]?.message?.content?.trim() ?? '';
}

export async function summarizeNotes(
  apiKey: string,
  notes: string,
  context?: { incident_type?: string; call_number?: string },
  baseUrl?: string,
): Promise<string> {
  const systemPrompt = `You are a dispatch note summarizer. Condense raw call/incident notes into a clear, structured summary suitable for shift handoff and supervisor review.
Format as bullet points. Highlight: key facts, actions taken, current status, and any follow-up needed. 
Do not add information not present in the original notes.`;

  const contextLine = context
    ? `Call: ${context.call_number ?? 'N/A'} | Type: ${context.incident_type ?? 'N/A'}`
    : '';

  const response = await chatCompletion(apiKey, {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `${contextLine}\n\nRaw Notes:\n${notes}` },
    ],
    temperature: 0.2,
    max_tokens: 512,
  }, baseUrl);

  return response.choices[0]?.message?.content?.trim() ?? '';
}

export async function extractStructuredData(
  apiKey: string,
  freeText: string,
  baseUrl?: string,
): Promise<{
  subjects: string[];
  vehicles: string[];
  addresses: string[];
  phone_numbers: string[];
  names: string[];
  flags: string[];
}> {
  const systemPrompt = `You are a data extraction assistant. Extract structured data from free-text incident notes or intake descriptions.
Return a JSON object with these fields (use empty arrays for missing data):
- subjects: physical descriptions of people
- vehicles: vehicle descriptions (make, model, color, plate)
- addresses: street addresses or locations mentioned
- phone_numbers: any phone numbers
- names: person names mentioned
- flags: safety/tactical flags (e.g., "weapons_involved", "domestic", "mental_health", "juvenile", "felony")
Return ONLY valid JSON, no markdown.`;

  const response = await chatCompletion(apiKey, {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: freeText },
    ],
    temperature: 0.1,
    max_tokens: 1024,
  }, baseUrl);

  const raw = response.choices[0]?.message?.content?.trim() ?? '{}';
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return { subjects: [], vehicles: [], addresses: [], phone_numbers: [], names: [], flags: [] };
  }
}

export async function intakeAssist(
  apiKey: string,
  partialData: Record<string, unknown>,
  baseUrl?: string,
): Promise<{
  suggested_incident_type?: string;
  suggested_priority?: string;
  filled_fields: Record<string, string>;
  warnings: string[];
}> {
  const systemPrompt = `You are a dispatch intake assistant. Given partial intake form data, suggest completions and validate.
Return a JSON object with:
- suggested_incident_type: best match from common types (e.g., "Theft", "Trespass", "Disturbance", "Alarm", "Welfare Check", "Process Service", "PSO Request")
- suggested_priority: P1-P4 based on described situation
- filled_fields: object of fields you can reasonably infer/suggest
- warnings: array of any data quality issues or missing required fields
Return ONLY valid JSON.`;

  const response = await chatCompletion(apiKey, {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(partialData) },
    ],
    temperature: 0.2,
    max_tokens: 512,
  }, baseUrl);

  const raw = response.choices[0]?.message?.content?.trim() ?? '{}';
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return { filled_fields: {}, warnings: ['AI response parsing failed'] };
  }
}

export async function scanExtract(
  apiKey: string,
  scanType: 'qr' | 'id' | 'pdf417',
  rawData: string,
  baseUrl?: string,
): Promise<Record<string, unknown>> {
  const systemPrompt = {
    qr: `You are a QR code data parser. Given decoded QR code data, extract and structure the relevant fields. Return JSON.`,
    id: `You are an ID document parser. Given raw OCR/scan data from a government ID (driver's license, state ID), extract: full_name, date_of_birth, address, license_number, state, expiration_date, gender, height, weight, eye_color, hair_color. Return JSON.`,
    pdf417: `You are a PDF417 barcode parser. PDF417 barcodes on US driver's licenses encode structured data (AAMVA format). Given the raw decoded data, parse and extract all available fields including: full_name, date_of_birth, address (street, city, state, zip), license_number, issue_date, expiration_date, gender, height, weight, eye_color, hair_color, restrictions, endorsements. Return JSON.`,
  }[scanType];

  const response = await chatCompletion(apiKey, {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: rawData },
    ],
    temperature: 0.1,
    max_tokens: 1024,
  }, baseUrl);

  const raw = response.choices[0]?.message?.content?.trim() ?? '{}';
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return { raw: rawData, parse_error: true };
  }
}
