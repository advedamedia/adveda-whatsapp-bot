// server.js - Multi-Tenant WhatsApp Chatbot SaaS Platform
// Handles ALL clients via single webhook endpoint, routed by phone_number_id
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Serve static dashboard files
app.use(express.static(path.join(__dirname, 'public')));

// Admin specific dashboard route
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
const DEFAULT_GEMINI_KEY = process.env.GEMINI_API_KEY;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_KEY || ''
);

// In-memory session cache: { phone_number_id+from_number: [...chatHistory] }
// Backed by DB for persistence
const sessionCache = {};

// ─────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────

// Load client config from Supabase by phone_number_id
async function getClientByPhoneNumberId(phoneNumberId) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('phone_number_id', phoneNumberId)
    .eq('status', 'active')
    .single();
  if (error || !data) return null;
  return data;
}

// Get or create lead record
async function getOrCreateLead(clientId, fromNumber) {
  const { data: existing } = await supabase
    .from('leads')
    .select('*')
    .eq('client_id', clientId)
    .eq('phone', fromNumber)
    .single();
  if (existing) return existing;

  const { data: newLead } = await supabase
    .from('leads')
    .insert({ client_id: clientId, phone: fromNumber, lead_stage: 'new' })
    .select()
    .single();
  return newLead;
}

// Get or create conversation / session
async function getSession(clientId, leadId, fromNumber) {
  const cacheKey = `${clientId}:${fromNumber}`;
  if (sessionCache[cacheKey]) return sessionCache[cacheKey];

  const { data } = await supabase
    .from('conversations')
    .select('messages')
    .eq('client_id', clientId)
    .eq('lead_id', leadId)
    .single();

  const messages = data?.messages || [];
  sessionCache[cacheKey] = messages;
  return messages;
}

// Save session to DB
async function saveSession(clientId, leadId, fromNumber, messages) {
  const cacheKey = `${clientId}:${fromNumber}`;
  sessionCache[cacheKey] = messages;

  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .eq('client_id', clientId)
    .eq('lead_id', leadId)
    .single();

  if (existing) {
    await supabase
      .from('conversations')
      .update({ messages, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
  } else {
    await supabase
      .from('conversations')
      .insert({ client_id: clientId, lead_id: leadId, from_number: fromNumber, messages });
  }
}

// Update lead state from parsed [STATE] JSON
async function updateLeadState(leadId, state) {
  const updates = {};
  if (state.name) updates.name = state.name;
  if (state.email) updates.email = state.email;
  if (state.budget) updates.budget = state.budget;
  if (state.location) updates.location = state.location;
  if (state.propertyType) updates.property_type = state.propertyType;
  if (state.purpose) updates.purpose = state.purpose;
  if (state.timeline) updates.timeline = state.timeline;
  if (state.phone) updates.contact_phone = state.phone;
  if (state.leadScore) updates.lead_score = state.leadScore;
  if (state.matchedProjectIds) updates.matched_projects = state.matchedProjectIds;
  if (state.siteVisitDate) updates.site_visit_date = state.siteVisitDate;
  if (state.siteVisitTime) updates.site_visit_time = state.siteVisitTime;
  if (state.callDate) updates.call_date = state.callDate;
  if (state.callTime) updates.call_time = state.callTime;

  // Auto-advance lead stage
  if (state.siteVisitDate && state.siteVisitTime) updates.lead_stage = 'site_visit_scheduled';
  else if (state.callDate) updates.lead_stage = 'call_scheduled';
  else if (state.leadScore === 'HOT' || state.leadScore === 'WARM') updates.lead_stage = 'qualified';

  if (Object.keys(updates).length > 0) {
    updates.updated_at = new Date().toISOString();
    await supabase.from('leads').update(updates).eq('id', leadId);
  }
}

// Call Gemini API with fallback chain
async function fetchGeminiResponse(history, systemInstruction, apiKey) {
  const key = apiKey || DEFAULT_GEMINI_KEY;
  const currentKolkataTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const currentDayOfWeek = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long' });

  const dynamicInstruction = `${systemInstruction}

---
CRITICAL TIME CONTEXT FOR SCHEDULING:
- Today is: ${currentDayOfWeek}, ${currentKolkataTime} (Kolkata/India Timezone).
- Current Year: ${new Date().getFullYear()}.
- Always calculate relative date terms (like "aaj", "kal", "parso", "agla hafta", "weekend", "next Monday") relative to today's actual date.
`;

  const payload = {
    contents: history,
    systemInstruction: { parts: [{ text: dynamicInstruction }] },
    generationConfig: { temperature: 0.5, topP: 0.9, maxOutputTokens: 1000 }
  };

  const models = [
    'gemini-2.5-flash',
    'gemini-2.5-flash-lite',
    'gemini-flash-latest',
    'gemini-2.0-flash-lite'
  ];

  let lastError;
  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      const data = await response.json();
      if (data.candidates?.[0]?.content?.parts?.[0]) {
        return data.candidates[0].content.parts[0].text;
      }
    } catch (e) {
      lastError = e;
      console.warn(`Gemini model ${model} failed:`, e.message);
    }
  }
  throw lastError;
}

// Generate customized System Prompt via Gemini 2.5 Flash using Master template
async function generateClientPromptViaGemini(description) {
  const apiKey = DEFAULT_GEMINI_KEY;
  if (!apiKey) {
    throw new Error('Gemini API key is not configured on the server.');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const systemInstruction = `You are an expert AI Prompt Engineer. Your task is to generate a highly optimized WhatsApp Chatbot System Prompt for a client based on a brief description.

You must follow this exact template structure and output ONLY the generated prompt. Do not add any markdown block code wrappers like \`\`\` or extra conversational comments. Just return the prompt text directly.

TEMPLATE STRUCTURE to output:
---
## CRITICAL RULES (STRICT CONSTRAINTS)

1. **MOSTLY SPEAK IN HINGLISH**: Speak in Hinglish (Hindi written in Roman English script). This is the default, primary, and absolute communication style.
2. **EXTREMELY SHORT & CRISP**: Keep your responses to 1 to 2 sentences maximum. Never send long text paragraphs.
3. **ASK EXACTLY ONE QUESTION**: Always ask exactly one question at a time.
4. **REVIEW HISTORY**: Never ask for information that the user has already provided.

## ROLE
You are an expert Lead Qualification and Site Visit Conversion Consultant working for [Client Name].

Your primary responsibility is to understand the buyer's requirements, qualify the lead, identify suitable projects, and guide the prospect toward scheduling a site visit or consultation call.

## CONTEXT
[Context about the client's business, property types, projects, focus areas, and tone. Synthesize this from the description.]

## FIRST MESSAGE RULE
The first message must ALWAYS be in Hinglish/Conversational Hindi.
Start with: "Namaste! Main [Bot Name/Assistant Name] hoon. [Friendly welcoming line tailored to this client's business]"

## LEAD QUALIFICATION FRAMEWORK
[Define what to collect: e.g. Budget Range, Purchase Purpose, Timeline, Preferred Location, or other fields mentioned in description.]

## STATE EXTRACTION RULE
At the absolute end of your response, output: [STATE]{"name": "...", "budget": "...", "location": "...", "propertyType": "...", "purpose": "...", "timeline": "...", "phone": "...", "email": "...", "leadScore": "HOT/WARM/COLD/UNKNOWN", "matchedProjectIds": [], "siteVisitDate": "...", "siteVisitTime": "...", "callDate": "...", "callTime": "..."}[/STATE]
---

Based on the description provided by the user, fill in the placeholders ([Client Name], [Context], [Bot Name/Assistant Name], [Friendly welcoming line], etc.) and tailor the content to match their specific business focus and requirements.`;

  const payload = {
    contents: [
      {
        parts: [
          { text: `Description: ${description}` }
        ]
      }
    ],
    systemInstruction: {
      parts: [
        { text: systemInstruction }
      ]
    },
    generationConfig: {
      temperature: 0.7,
      topP: 0.95,
      maxOutputTokens: 1500
    }
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`HTTP \${response.status}: \${await response.text()}`);
  }

  const data = await response.json();
  const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!generatedText) {
    throw new Error('Gemini API returned an empty response.');
  }

  return generatedText.trim();
}

// Send WhatsApp message via Meta Cloud API
async function sendWhatsAppMessage(phoneNumberId, to, text, accessToken) {
  const token = accessToken || process.env.WHATSAPP_ACCESS_TOKEN;
  const url = `https://graph.facebook.com/v19.0/${phoneNumberId}/messages`;

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { body: text }
  };

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
    if (!response.ok) {
      console.error(`Meta API Error (${response.status}):`, await response.text());
    } else {
      console.log(`✅ Message sent to ${to}`);
    }
  } catch (error) {
    console.error('Network error sending WhatsApp message:', error);
  }
}

// Download audio/voice media from Meta
async function downloadMetaMedia(mediaId, accessToken) {
  const token = accessToken || process.env.WHATSAPP_ACCESS_TOKEN;
  try {
    const mediaResponse = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!mediaResponse.ok) throw new Error(`Media API: ${mediaResponse.status}`);
    const mediaData = await mediaResponse.json();

    const fileResponse = await fetch(mediaData.url, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!fileResponse.ok) throw new Error(`Media download: ${fileResponse.status}`);

    const buffer = await fileResponse.buffer();
    return { buffer, mimeType: mediaData.mime_type || 'audio/ogg' };
  } catch (error) {
    console.error('Error downloading media:', error);
    return null;
  }
}

// Simple auth middleware supporting both Admin and Client keys
function adminAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  const activeToken = token || req.query.token;
  if (!activeToken) return res.status(401).json({ error: 'Unauthorized' });

  if (activeToken === ADMIN_PASSWORD) {
    req.user = { role: 'admin' };
    return next();
  }

  if (activeToken.startsWith('CLIENT_TOKEN:')) {
    const clientId = activeToken.split(':')[1];
    req.user = { role: 'client', clientId };
    return next();
  }
  
  return res.status(401).json({ error: 'Unauthorized' });
}

// ─────────────────────────────────────────────
//  META WEBHOOK ENDPOINTS
// ─────────────────────────────────────────────

// GET /webhook — Meta webhook verification
// Supports both a global verify token and per-client verify tokens
app.get('/webhook', async (req, res) => {
  const globalVerifyToken = (process.env.WHATSAPP_VERIFY_TOKEN || '').trim();
  const mode = req.query['hub.mode'];
  const token = (req.query['hub.verify_token'] || '').trim();
  const challenge = req.query['hub.challenge'];

  if (mode !== 'subscribe') return res.sendStatus(400);

  // Check global token first
  if (token === globalVerifyToken) {
    console.log('Webhook verified (global token)');
    return res.status(200).send(challenge);
  }

  // Check per-client tokens in DB
  try {
    const { data } = await supabase
      .from('clients')
      .select('id, name')
      .eq('verify_token', token)
      .single();
    if (data) {
      console.log(`Webhook verified for client: ${data.name}`);
      return res.status(200).send(challenge);
    }
  } catch (e) { /* ignore */ }

  console.error(`Webhook verification failed. Token: "${token}"`);
  return res.sendStatus(403);
});

// POST /webhook — Receive WhatsApp messages from ALL clients
app.post('/webhook', async (req, res) => {
  const body = req.body;
  console.log('📨 Incoming webhook:', JSON.stringify(body, null, 2));

  // Immediately acknowledge to Meta
  res.sendStatus(200);

  if (body.object !== 'whatsapp_business_account') return;

  try {
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];

    if (!message) return; // Could be a status update, not a message

    const msgType = message.type;
    if (!['text', 'audio', 'voice'].includes(msgType)) return;

    const fromNumber = message.from;
    const phoneNumberId = value.metadata?.phone_number_id;

    console.log(`📱 Message from ${fromNumber} via phone_number_id ${phoneNumberId}`);

    // ── 1. Load client config from DB ──
    const client = await getClientByPhoneNumberId(phoneNumberId);
    if (!client) {
      console.error(`❌ No active client found for phone_number_id: ${phoneNumberId}`);
      return;
    }
    console.log(`✅ Routing to client: ${client.name}`);

    // ── 2. Get or create lead ──
    const lead = await getOrCreateLead(client.id, fromNumber);
    if (!lead) {
      console.error('Failed to get/create lead');
      return;
    }

    // ── 3. Parse incoming message ──
    let incomingMsg = '';
    let audioPart = null;

    if (msgType === 'text') {
      incomingMsg = message.text.body.trim();
      console.log(`💬 Text: "${incomingMsg}"`);
    } else {
      const audioId = message.audio?.id || message.voice?.id;
      console.log(`🎤 Audio message ID: ${audioId}`);
      const media = await downloadMetaMedia(audioId, client.access_token);
      if (media?.buffer) {
        const base64Audio = media.buffer.toString('base64');
        audioPart = { inlineData: { mimeType: media.mimeType, data: base64Audio } };
        incomingMsg = '[Voice note received. Transcribe and understand it. Reply in Hinglish text.]';
      } else {
        incomingMsg = '[Voice note received but failed to download. Ask user to resend as text.]';
      }
    }

    // ── 4. Get chat history / session ──
    let history = await getSession(client.id, lead.id, fromNumber);

    // Initialize with greeting if new session
    if (history.length === 0) {
      history = [
        { role: 'user', parts: [{ text: 'Hello' }] },
        {
          role: 'model',
          parts: [{ text: 'Namaste! Main Kanak hoon, Potential Infinity se aapki property consultant. Kya aap koi property buy karna chahte hain?' }]
        }
      ];
    }

    // ── 5. Add user message to history ──
    history.push({
      role: 'user',
      parts: audioPart ? [{ text: incomingMsg }, audioPart] : [{ text: incomingMsg }]
    });

    // ── 6. Call Gemini with client-specific system prompt ──
    let geminiRaw;
    try {
      geminiRaw = await fetchGeminiResponse(
        history,
        client.system_prompt,
        client.gemini_api_key || DEFAULT_GEMINI_KEY
      );
    } catch (error) {
      console.error('Gemini error:', error);
      let fallback = 'Abhi thodi technical difficulty aa rahi hai. Please thodi der mein dobara message karein.';
      if (error.message?.includes('429')) {
        fallback = 'Abhi bohot requests aa rahi hain. Please 30 seconds mein dobara message karein.';
      }
      await sendWhatsAppMessage(phoneNumberId, fromNumber, fallback, client.access_token);
      return;
    }

    // ── 7. Add model response to history ──
    history.push({ role: 'model', parts: [{ text: geminiRaw }] });

    // ── 8. Save updated session ──
    await saveSession(client.id, lead.id, fromNumber, history);

    // ── 9. Extract [STATE] block, parse & persist lead data ──
    let replyText = geminiRaw;
    const stateMatch = replyText.match(/\[STATE\]([\s\S]*?)\[\/STATE\]/);
    if (stateMatch) {
      replyText = replyText.replace(/\[STATE\][\s\S]*?\[\/STATE\]/, '').trim();
      try {
        const leadState = JSON.parse(stateMatch[1].trim());
        console.log(`📊 Lead state for ${fromNumber}:`, leadState);
        await updateLeadState(lead.id, leadState);
      } catch (err) {
        console.error('Error parsing lead state JSON:', err);
      }
    }

    // ── 10. Send reply via WhatsApp ──
    await sendWhatsAppMessage(phoneNumberId, fromNumber, replyText, client.access_token);

  } catch (error) {
    console.error('Error processing webhook:', error);
  }
});

// ─────────────────────────────────────────────
//  REST API — CLIENT MANAGEMENT
// ─────────────────────────────────────────────

// GET /api/clients — List all clients
app.get('/api/clients', adminAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('clients')
    .select('id, name, business_type, whatsapp_number, phone_number_id, status, contact_person, contact_phone, contact_email, created_at')
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/clients/:id — Get single client
app.get('/api/clients/:id', adminAuth, async (req, res) => {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: 'Client not found' });
  // Mask sensitive tokens
  if (data.access_token) data.access_token = data.access_token.substring(0, 12) + '***';
  res.json(data);
});

// POST /api/clients — Create new client
app.post('/api/clients', adminAuth, async (req, res) => {
  const {
    name, business_type, whatsapp_number, phone_number_id,
    access_token, verify_token, system_prompt, knowledge_base,
    gemini_api_key, contact_person, contact_phone, contact_email
  } = req.body;

  if (!name || !phone_number_id || !access_token || !system_prompt) {
    return res.status(400).json({ error: 'Missing required fields: name, phone_number_id, access_token, system_prompt' });
  }

  // Auto-generate verify token if not provided
  const vToken = verify_token || `VERIFY_${Date.now()}_${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

  const { data, error } = await supabase
    .from('clients')
    .insert({
      name, business_type, whatsapp_number, phone_number_id,
      access_token, verify_token: vToken, system_prompt,
      knowledge_base: knowledge_base || [],
      gemini_api_key: gemini_api_key || null,
      contact_person, contact_phone, contact_email,
      status: 'active'
    })
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, client: data });
});

// POST /api/clients/generate-prompt — Generate system prompt via Gemini
app.post('/api/clients/generate-prompt', adminAuth, async (req, res) => {
  const { description } = req.body;
  if (!description) return res.status(400).json({ error: 'Description is required' });

  try {
    const prompt = await generateClientPromptViaGemini(description);
    res.json({ success: true, prompt });
  } catch (error) {
    console.error('Gemini prompt generation error:', error);
    res.status(500).json({ error: error.message || 'Failed to generate prompt' });
  }
});

// PUT /api/clients/:id — Update client
app.put('/api/clients/:id', adminAuth, async (req, res) => {
  const allowedFields = [
    'name', 'business_type', 'whatsapp_number', 'phone_number_id',
    'access_token', 'system_prompt', 'knowledge_base',
    'gemini_api_key', 'contact_person', 'contact_phone', 'contact_email', 'status', 'verify_token'
  ];
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('clients')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, client: data });
});

// DELETE /api/clients/:id — Soft delete (set inactive)
app.delete('/api/clients/:id', adminAuth, async (req, res) => {
  const { error } = await supabase
    .from('clients')
    .update({ status: 'inactive', updated_at: new Date().toISOString() })
    .eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// ─────────────────────────────────────────────
//  REST API — LEAD MANAGEMENT
// ─────────────────────────────────────────────

// GET /api/leads — List leads with optional filters
app.get('/api/leads', adminAuth, async (req, res) => {
  const { client_id, lead_score, lead_stage, search, limit = 100 } = req.query;

  let query = supabase
    .from('leads')
    .select('id, client_id, name, phone, budget, location, property_type, purpose, timeline, lead_score, lead_stage, site_visit_date, site_visit_time, call_date, call_time, follow_up_date, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(parseInt(limit));

  // If user is client, enforce their client_id
  if (req.user.role === 'client') {
    query = query.eq('client_id', req.user.clientId);
  } else if (client_id) {
    query = query.eq('client_id', client_id);
  }

  if (lead_score) query = query.eq('lead_score', lead_score.toUpperCase());
  if (lead_stage) query = query.eq('lead_stage', lead_stage);
  if (search) query = query.or(`name.ilike.%${search}%,phone.ilike.%${search}%`);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// GET /api/leads/:id — Get lead detail + conversation history
app.get('/api/leads/:id', adminAuth, async (req, res) => {
  const { data: lead, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', req.params.id)
    .single();
  if (error) return res.status(404).json({ error: 'Lead not found' });

  // Enforce client access security
  if (req.user.role === 'client' && lead.client_id !== req.user.clientId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const { data: convo } = await supabase
    .from('conversations')
    .select('messages, updated_at')
    .eq('lead_id', req.params.id)
    .single();

  res.json({ lead, conversation: convo?.messages || [] });
});

// PUT /api/leads/:id — Update lead (notes, stage, follow-up)
app.put('/api/leads/:id', adminAuth, async (req, res) => {
  // Check permission
  const { data: lead } = await supabase.from('leads').select('client_id').eq('id', req.params.id).single();
  if (lead && req.user.role === 'client' && lead.client_id !== req.user.clientId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const allowedFields = ['notes', 'lead_stage', 'follow_up_date', 'site_visit_date', 'site_visit_time', 'call_date', 'call_time', 'lead_score'];
  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true, lead: data });
});

// ─────────────────────────────────────────────
//  REST API — DASHBOARD STATS
// ─────────────────────────────────────────────

// GET /api/dashboard/stats — Summary statistics
app.get('/api/dashboard/stats', adminAuth, async (req, res) => {
  const { client_id } = req.query;

  let query = supabase.from('leads').select('lead_score, lead_stage, site_visit_date, call_date');
  
  if (req.user.role === 'client') {
    query = query.eq('client_id', req.user.clientId);
  } else if (client_id) {
    query = query.eq('client_id', client_id);
  }

  const { data: leads, error } = await query;
  if (error) return res.status(500).json({ error: error.message });

  const today = new Date().toISOString().split('T')[0];
  const stats = {
    total: leads.length,
    hot: leads.filter(l => l.lead_score === 'HOT').length,
    warm: leads.filter(l => l.lead_score === 'WARM').length,
    cold: leads.filter(l => l.lead_score === 'COLD').length,
    today_visits: leads.filter(l => l.site_visit_date === today).length,
    today_calls: leads.filter(l => l.call_date === today).length,
    site_visit_scheduled: leads.filter(l => l.lead_stage === 'site_visit_scheduled').length,
    new_leads_today: leads.filter(l => l.lead_stage === 'new').length,
  };

  res.json(stats);
});

// POST /api/auth — Admin or Client login check
app.post('/api/auth', async (req, res) => {
  const { password, identifier, isAdmin } = req.body;

  if (isAdmin) {
    if (password === ADMIN_PASSWORD) {
      return res.json({ success: true, token: ADMIN_PASSWORD, role: 'admin' });
    }
    return res.status(401).json({ error: 'Invalid admin password' });
  }

  // Client authentication check
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Phone/Email and Password are required' });
  }

  try {
    // Search client matching either contact_phone, whatsapp_number, contact_email or contact_person name, with custom verify_token as password
    const { data: clients, error } = await supabase
      .from('clients')
      .select('id, name, verify_token, whatsapp_number, contact_phone, contact_email')
      .eq('status', 'active');

    if (error || !clients) return res.status(401).json({ error: 'Invalid credentials' });

    // Validate identifier (phone / email / whatsapp_number) and verify_token (password)
    const cleanId = identifier.replace(/[^0-9]/g, '');
    const searchEmail = identifier.trim().toLowerCase();

    const client = clients.find(c => {
      const cleanWa = (c.whatsapp_number || '').replace(/[^0-9]/g, '');
      const cleanPhone = (c.contact_phone || '').replace(/[^0-9]/g, '');
      const clientEmail = (c.contact_email || '').trim().toLowerCase();
      const passMatch = c.verify_token === password;

      const identifierMatches = (
        (cleanId && cleanWa.endsWith(cleanId)) || 
        (cleanId && cleanPhone.endsWith(cleanId)) || 
        (clientEmail && clientEmail === searchEmail) ||
        identifier === c.phone_number_id
      );

      return passMatch && identifierMatches;
    });

    if (client) {
      return res.json({ success: true, token: `CLIENT_TOKEN:${client.id}`, role: 'client', clientId: client.id });
    }
  } catch (e) {
    console.error('Client auth DB check error:', e);
  }

  res.status(401).json({ error: 'Invalid credentials or password' });
});

// POST /api/auth/forgot-verify — Verify client identity by Email/Phone/WhatsApp
app.post('/api/auth/forgot-verify', async (req, res) => {
  const { identifier } = req.body;
  if (!identifier) return res.status(400).json({ error: 'Email or WhatsApp number is required' });

  try {
    const { data: clients, error } = await supabase
      .from('clients')
      .select('id, name, whatsapp_number, contact_phone, contact_email')
      .eq('status', 'active');

    if (error || !clients) return res.status(404).json({ error: 'Identity details mismatch or no active clients found.' });

    const cleanId = identifier.replace(/[^0-9]/g, '');
    const searchEmail = identifier.trim().toLowerCase();

    const client = clients.find(c => {
      const cleanWa = (c.whatsapp_number || '').replace(/[^0-9]/g, '');
      const cleanPhone = (c.contact_phone || '').replace(/[^0-9]/g, '');
      const clientEmail = (c.contact_email || '').trim().toLowerCase();

      const identifierMatches = (
        (cleanId && cleanWa.endsWith(cleanId)) || 
        (cleanId && cleanPhone.endsWith(cleanId)) || 
        (clientEmail && clientEmail === searchEmail)
      );

      return identifierMatches;
    });

    if (!client) {
      return res.status(404).json({ error: 'No active client found with this WhatsApp number or Email' });
    }

    return res.json({ success: true, clientId: client.id, name: client.name });
  } catch (e) {
    console.error('Verify identity DB error:', e);
    return res.status(500).json({ error: 'Database search failed' });
  }
});

// POST /api/auth/forgot-reset — Set new password
app.post('/api/auth/forgot-reset', async (req, res) => {
  const { clientId, password } = req.body;
  if (!clientId || !password) {
    return res.status(400).json({ error: 'Client ID and new password are required' });
  }

  try {
    const { data, error } = await supabase
      .from('clients')
      .update({ verify_token: password, updated_at: new Date().toISOString() })
      .eq('id', clientId)
      .select()
      .single();

    if (error || !data) {
      return res.status(500).json({ error: error ? error.message : 'Client not found or update failed' });
    }

    return res.json({ success: true });
  } catch (e) {
    console.error('Reset password DB error:', e);
    return res.status(500).json({ error: 'Database update failed' });
  }
});

// ─────────────────────────────────────────────
//  START SERVER
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 WhatsApp Chatbot SaaS Platform running on port ${PORT}`);
  console.log(`📊 Dashboard: http://localhost:${PORT}`);
  console.log(`🔗 Webhook:   http://localhost:${PORT}/webhook\n`);
});
