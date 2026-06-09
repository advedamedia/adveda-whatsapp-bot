-- ═══════════════════════════════════════════
--  WhatsApp Chatbot SaaS - Supabase Schema
--  Run this in Supabase → SQL Editor
-- ═══════════════════════════════════════════

-- TABLE 1: clients
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  business_type TEXT DEFAULT 'Real Estate',
  whatsapp_number TEXT,
  phone_number_id TEXT UNIQUE NOT NULL,
  access_token TEXT NOT NULL,
  verify_token TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  knowledge_base JSONB DEFAULT '[]',
  gemini_api_key TEXT,
  contact_person TEXT,
  contact_phone TEXT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'setup')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABLE 2: leads
CREATE TABLE IF NOT EXISTS leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  name TEXT,
  phone TEXT NOT NULL,
  email TEXT,
  budget TEXT,
  location TEXT,
  property_type TEXT,
  purpose TEXT,
  timeline TEXT,
  contact_phone TEXT,
  lead_score TEXT DEFAULT 'UNKNOWN' CHECK (lead_score IN ('HOT', 'WARM', 'COLD', 'UNKNOWN')),
  matched_projects JSONB DEFAULT '[]',
  conversation_summary TEXT,
  notes TEXT,
  site_visit_date TEXT,
  site_visit_time TEXT,
  site_visit_location TEXT,
  call_date TEXT,
  call_time TEXT,
  follow_up_date TEXT,
  lead_stage TEXT DEFAULT 'new' CHECK (lead_stage IN ('new', 'qualified', 'site_visit_scheduled', 'call_scheduled', 'converted', 'lost')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- TABLE 3: conversations
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  from_number TEXT NOT NULL,
  messages JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- INDEXES for performance
CREATE INDEX IF NOT EXISTS idx_clients_phone_number_id ON clients(phone_number_id);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_leads_client_id ON leads(client_id);
CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(lead_score);
CREATE INDEX IF NOT EXISTS idx_leads_stage ON leads(lead_stage);
CREATE INDEX IF NOT EXISTS idx_conversations_lead_id ON conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_client_id ON conversations(client_id);

-- ═══════════════════════════════════════════
--  SEED: Insert Potential Infinity as first client
--  (Replace YOUR_PHONE_NUMBER_ID and YOUR_ACCESS_TOKEN)
-- ═══════════════════════════════════════════

INSERT INTO clients (
  name,
  business_type,
  whatsapp_number,
  phone_number_id,
  access_token,
  verify_token,
  contact_person,
  contact_phone,
  system_prompt,
  knowledge_base,
  status
) VALUES (
  'Potential Infinity',
  'Real Estate',
  'YOUR_WHATSAPP_NUMBER',
  'YOUR_PHONE_NUMBER_ID',
  'YOUR_ACCESS_TOKEN',
  'AGWAVERIFYTOKEN',
  'Mishti',
  '9999888877',
  '## CRITICAL RULES (STRICT CONSTRAINTS)

1. **MOSTLY SPEAK IN HINGLISH**: Speak in Hinglish (Hindi written in Roman English script). This is the default, primary, and absolute communication style.
2. **EXTREMELY SHORT & CRISP**: Keep your responses to 1 to 2 sentences maximum. Never send long text paragraphs.
3. **ASK EXACTLY ONE QUESTION**: Always ask exactly one question at a time.
4. **REVIEW HISTORY**: Never ask for information that the user has already provided.

## ROLE
You are Kanak, an expert Real Estate Lead Qualification and Site Visit Conversion Consultant working for Potential Infinity.

Your primary responsibility is to understand the buyer''s requirements, qualify the lead, identify suitable projects, and guide the prospect toward scheduling a site visit or consultation call.

## CONTEXT
Potential Infinity is a real estate consulting company specializing in residential and investment properties across: Noida, Greater Noida, Greater Noida West, Noida Expressway, Sector 150, Yamuna Expressway, Jewar Airport Region.

## FIRST MESSAGE RULE
The first message must ALWAYS be in Hinglish/Conversational Hindi.
Start with: "Namaste! Main Kanak hoon, Potential Infinity se aapki property consultant. Kya aap Noida ya nearby areas mein property search kar rahe hain?"

## LEAD QUALIFICATION FRAMEWORK
Collect: Budget Range, Purchase Purpose (Self Use/Investment/Rental), Buying Timeline, Property Type, Preferred Location

## LEAD CLASSIFICATION
HOT: Budget confirmed + Location confirmed + Timeline within 3 months + Open to site visit
WARM: Budget confirmed + Exploring options + Timeline 3-12 months
COLD: No clear budget + No timeline + General info seeker

## SITE VISIT BOOKING WORKFLOW
Step 1: Ask preferred date. Step 2: Ask preferred time. Step 3: Ask phone number. Step 4: Ask email. Step 5: Send confirmation.

## BOOKING CONFIRMATION FORMAT
After confirmed site visit, always send point of contact:
Your point of contact will be: Mishti 📞 9999888877
WhatsApp: https://wa.me/919999888877

## STATE EXTRACTION RULE
At the absolute end of your response, output: [STATE]{"name": "...", "budget": "...", "location": "...", "propertyType": "...", "purpose": "...", "timeline": "...", "phone": "...", "email": "...", "leadScore": "HOT/WARM/COLD/UNKNOWN", "matchedProjectIds": [], "siteVisitDate": "...", "siteVisitTime": "...", "callDate": "...", "callTime": "..."}[/STATE]',
  '[
    {"id": "godrej-tropical-isle", "name": "Godrej Tropical Isle", "developer": "Godrej Properties", "location": "Sector 146, Noida Expressway", "propertyType": "Luxury Apartments", "configurations": ["3 BHK", "4 BHK"], "priceRange": "₹2.15 Cr - ₹4.20 Cr", "highlights": ["Luxury lifestyle", "Prime Noida Expressway connectivity", "Reputed builder"], "advantages": ["Walking distance to Sector 146 Metro", "25 mins drive to Jewar Airport"], "suitableFor": ["End Users", "Luxury Buyers", "Long-Term Investors"], "timeline": "Under Construction"},
    {"id": "ats-kingston-heath", "name": "ATS Kingston Heath", "developer": "ATS Group", "location": "Sector 150, Noida", "propertyType": "Luxury Apartments", "configurations": ["3 BHK", "4 BHK"], "priceRange": "₹3.19 Cr - ₹5.75 Cr", "highlights": ["Low-density premium living", "World-class sports amenities", "Massive green landscaping"], "advantages": ["Located in Sector 150", "Access to Noida & Yamuna Expressway"], "suitableFor": ["Luxury End Users", "Premium Investors"], "timeline": "Under Construction"},
    {"id": "ace-parkway", "name": "ACE Parkway", "location": "Sector 150, Noida", "propertyType": "Apartments", "configurations": ["2 BHK", "3 BHK", "4 BHK"], "priceRange": "₹1.10 Cr - ₹2.60 Cr", "highlights": ["Art Deco architecture", "51 sports facilities", "Golf-facing towers"], "advantages": ["Connected to major highways", "High rental yields"], "suitableFor": ["End Users", "First Time Home Buyers", "Rental Income Investors"], "timeline": "Ready to Move"}
  ]',
  'active'
);
