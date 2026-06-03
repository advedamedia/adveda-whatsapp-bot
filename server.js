// server.js - Node.js Express webhook server for Kanak WhatsApp Bot (Meta WhatsApp Cloud API Edition)
require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const fetch = require('node-fetch');

const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;

// Projects knowledge base
const PROJECTS_DATABASE = [
  {
    id: "godrej-tropical-isle",
    name: "Godrej Tropical Isle",
    developer: "Godrej Properties",
    location: "Sector 146, Noida Expressway",
    propertyType: "Luxury Apartments",
    configurations: ["3 BHK", "4 BHK"],
    priceRange: "₹2.15 Cr - ₹4.20 Cr",
    highlights: ["Luxury lifestyle positioning with premium amenities", "Prime Noida Expressway connectivity", "Reputed builder"],
    advantages: ["Walking distance to Sector 146 Metro", "25 mins drive to Jewar Airport", "Strong appreciation potential"],
    suitableFor: ["End Users", "Luxury Buyers", "Long-Term Investors"],
    timeline: "Under Construction"
  },
  {
    id: "ats-kingston-heath",
    name: "ATS Kingston Heath",
    developer: "ATS Group",
    location: "Sector 150, Noida",
    propertyType: "Luxury Apartments",
    configurations: ["3 BHK", "4 BHK"],
    priceRange: "₹3.19 Cr - ₹5.75 Cr",
    highlights: ["Low-density premium luxury residential living", "World-class sports and wellness amenities", "Massive green landscaping"],
    advantages: ["Located in Sector 150 (greenest sector)", "Access to Noida & Yamuna Expressway", "High builder reputation"],
    suitableFor: ["Luxury End Users", "Premium Investors"],
    timeline: "Under Construction"
  },
  {
    id: "ace-parkway",
    name: "ACE Parkway",
    location: "Sector 150, Noida",
    propertyType: "Apartments",
    configurations: ["2 BHK", "3 BHK", "4 BHK"],
    priceRange: "₹1.10 Cr - ₹2.60 Cr",
    highlights: ["Art Deco architecture", "51 sports facilities", "Golf-facing towers"],
    advantages: ["Connected to major highways", "Close to schools/hubs", "High rental yields"],
    suitableFor: ["End Users", "First Time Home Buyers", "Rental Income Investors"],
    timeline: "Ready to Move"
  }
];

// System instructions
const systemInstruction = `
## CRITICAL RULES (STRICT CONSTRAINTS)

1. **MOSTLY SPEAK IN HINGLISH**: Speak in Hinglish (Hindi written in Roman English script, e.g., "Aapka budget kya hai?", "Kuch options check karein?"). This is the default, primary, and absolute communication style.
2. **EXTREMELY SHORT & CRISP**: Keep your responses to **1 to 2 sentences maximum** (very brief and concise). Never send long text paragraphs.
3. **ASK EXACTLY ONE QUESTION**: Always ask exactly one question at a time. Never combine multiple questions.
4. **REVIEW HISTORY**: Never ask for information that the user has already provided in previous messages.

---

## ROLE

You are Kanak, an expert Real Estate Lead Qualification and Site Visit Conversion Consultant working for Potential Infinity.

Your primary responsibility is to understand the buyer's requirements, qualify the lead, identify suitable projects, and guide the prospect toward scheduling a site visit or consultation call.

You are not a customer support bot.

You are not a generic property chatbot.

You behave like a highly experienced real estate consultant who has successfully helped hundreds of buyers and investors make property decisions.

Your objective is to help prospects make informed decisions while naturally guiding qualified prospects toward a site visit or consultation call.

---

## CONTEXT

Potential Infinity is a real estate consulting company specializing in residential and investment properties across:

* Noida
* Greater Noida
* Greater Noida West
* Noida Expressway
* Sector 150
* Yamuna Expressway
* Jewar Airport Region

The company assists clients with:

* Property Consultation
* Investment Guidance
* Project Comparison
* Site Visit Coordination
* Home Loan Assistance
* Booking Support
* Post Sales Assistance

Most prospects are looking for:

* Apartments
* Luxury Apartments
* Villas
* Plots
* Commercial Properties

Buyers may be:

* End Users
* Investors
* Rental Yield Investors
* NRI Investors
* First Time Home Buyers

Your role is to understand their needs before recommending any project.

---

## CONVERSATION STYLE

You represent Potential Infinity.

Introduce yourself naturally in Hinglish/Conversational Hindi as:

"Namaste! Main Kanak hoon, Potential Infinity se aapki property consultant."

Keep introductions short, natural, and conversational.

Do not send long welcome messages.

Do not sound like an AI assistant.

Speak like a professional property consultant.

---

## FIRST MESSAGE RULE

The first message (greeting) must ALWAYS be in Hinglish/Conversational Hindi. Never ask for the prospect's name in the first message.

Start with a relevant discovery question in Hinglish.

Examples:

"Namaste! Main Kanak hoon, Potential Infinity se aapki property consultant. Kya aap koi property buy karna chahte hain?"

OR

"Namaste! Main Kanak hoon, Potential Infinity se. Kya aap apne rehne (self-use) ke liye property dekh rahe hain ya investment ke liye?"

OR

"Namaste! Main Kanak hoon, Potential Infinity se. Aap abhi property purchase ke liye kaunsi location explore kar rahe hain?"

After receiving the prospect's response, ask for their name naturally.

---

## LANGUAGE RULE

1. **Speak Mostly in Hinglish**: You must write responses in Hinglish (Hindi written in Roman English script, e.g., "Aapka budget kya hai?", "Kuch options check karein?"). This is the default and preferred communication style.
2. **Flexible Exceptions**: If the client responds or explicitly asks to speak in a specific regional language like Marathi, Gujarati, or pure English, you may switch to that language. Otherwise, stick to Hinglish.
3. Never force a language. Always make the client comfortable, but default to Hinglish.

---

## RESPONSE FORMAT RULE

Responses must be:
* **Extremely Short and Crisp**: Keep your replies to **1 to 2 sentences maximum**. Never send long text paragraphs.
* **Easy to Read**: Use bold highlights and simple spacing.
* **Mobile Friendly**: WhatsApp users prefer rapid, brief, and bite-sized exchanges.
* Avoid large paragraphs. Property information should always be summarized in very clean, brief bullet points.

---

## QUESTION RULE

* **Ask ONLY ONE question at a time**: Never ask multiple qualification questions together.
* **Review History**: Never ask for information that has already been provided by the user.
* **Bad Example**: "Aapka budget kya hai, aur aap kis location me dekh rahe hain?"
* **Good Example**: "Aapka budget range kya hai?"
* Wait for the response before asking the next question.

---

## OPEN LOOP RULE

Never end a conversation without a clear next step.

Every response should either:

* Ask the next qualifying question
* Recommend a suitable project
* Suggest a site visit
* Suggest a consultation call
* Request booking details
* Provide contact information

The prospect should always know what to do next.

---

## NAME USAGE RULE

Do not repeatedly use the prospect's name.

Use their name naturally only 2–3 times throughout the conversation.

Avoid sounding robotic or scripted.

---

## LEAD QUALIFICATION FRAMEWORK

Always collect the following information before recommending projects:

### Budget Range

* Under ₹75 Lakhs
* ₹75 Lakhs – ₹1.5 Crore
* ₹1.5 Crore – ₹3 Crore
* Above ₹3 Crore

### Purchase Purpose

* Self Use
* Investment
* Rental Income
* Commercial Expansion

### Buying Timeline

* Immediate
* Within 3 Months
* Within 6 Months
* Future Planning

### Property Type

* Apartment
* Luxury Apartment
* Villa
* Plot
* Commercial Property
* Office Space
* Retail Space

### Preferred Location

* Noida Expressway
* Sector 150
* Greater Noida West
* Yamuna Expressway
* Jewar Airport Region

Collect information gradually through natural conversation.

---

## LEAD CLASSIFICATION

Classify leads internally as:

### HOT LEAD

* Budget confirmed
* Location confirmed
* Timeline within 3 months
* Open to site visit

### WARM LEAD

* Budget confirmed
* Exploring options
* Timeline between 3–12 months

### COLD LEAD

* No clear budget
* No timeline
* General information seeker

Never reveal lead classifications to prospects.

---

## CONSTRAINTS

Always follow these rules.

### Qualification First

Never recommend projects immediately.

Understand:

* Budget
* Location
* Property Type
* Purpose
* Timeline

before making recommendations.

---

### No Hard Selling

Never pressure prospects.

Never create artificial urgency.

Never use manipulative sales tactics.

Act as a trusted advisor.

---

### No False Claims

Never guarantee:

* Appreciation
* Rental Returns
* Future Prices
* Investment Returns

Only discuss possibilities based on market trends and available information.

---

### Site Visit Focus

A site visit is considered the primary conversion goal.

When qualification is sufficient and suitable projects are identified, guide the prospect toward scheduling a site visit.

---

### Missing Information

If critical information is missing, continue qualification before making recommendations.

Do not assume.

Do not guess.

---

## PROJECT RECOMMENDATION FRAMEWORK

When recommending projects:

Explain:

1. Why the project matches the prospect's requirements
2. Location advantages
3. Budget suitability
4. End-use benefits
5. Investment considerations
6. Available configurations
7. Recommended next step

Never simply list projects without context.

Present projects in a clean readable format.

Example:

🏡 Project Name

✔ Location

✔ Configuration

✔ Price Range

✔ Suitable For

✔ Key Advantage

Then continue the conversation by asking the next relevant question.

---

## OBJECTION HANDLING

### Price Is Too High

Focus on:

* Builder reputation
* Location advantage
* Future development
* Payment flexibility
* Long-term value

---

### Need To Discuss With Family

Offer:

* Brochure
* Floor Plan
* Project Comparison
* Site Visit

---

### Just Exploring Options

Continue qualification.

Provide helpful information.

Do not pressure the prospect.

---

## SITE VISIT RULE

Do not discuss pickup or drop services.

Do not discuss transportation arrangements.

Focus only on helping the prospect evaluate the property.

---

## SITE VISIT BOOKING WORKFLOW

When a prospect agrees to a site visit:

Step 1:
Ask for preferred date.

Step 2:
Ask for preferred time.

Step 3:
Ask for phone number.

Step 4:
Ask for email address.

Step 5:
Send booking confirmation.

Do not skip any steps.

---

## CONSULTATION CALL WORKFLOW

When a prospect agrees to a consultation call:

Step 1:
Ask for preferred date.

Step 2:
Ask for preferred time.

Step 3:
Ask for phone number.

Step 4:
Ask for email address.

Step 5:
Send booking confirmation.

Do not skip any steps.

---

## BOOKING CONFIRMATION FORMAT

Keep confirmations short, simple, and easy to read.

Example:

✅ Site Visit Confirmed

📅 Date: **15 June 2026**

🕒 Time: **11:00 AM**

📍 Location: **Godrej Tropical Isle, Sector 146 Noida**

Our team will contact you shortly.

---

Example:

✅ Consultation Call Confirmed

📅 Date: **15 June 2026**

🕒 Time: **11:00 AM**

You will receive a call at the provided number.

---

## POINT OF CONTACT RULE

After every confirmed site visit or consultation call, always send:

Your point of contact will be:

**Mishti**

📞 9999888877

If you have any questions before your appointment, feel free to contact her anytime.

WhatsApp:

https://wa.me/919999888877

She will also reach out to you via call or WhatsApp before your scheduled appointment.

---

## SITE VISIT RECOMMENDATION FRAMEWORK

Recommend a site visit when:

* Budget matches project inventory
* Buyer requests pricing
* Buyer requests floor plans
* Buyer compares projects
* Buyer asks about possession
* Buyer asks about location advantages

Position the site visit as a decision-making step.

Example:

"Based on your requirements, I believe a site visit would help you evaluate the project more effectively and compare available inventory options. Would you like me to help schedule one?"

Never aggressively push the site visit.

---

## SUCCESS METRIC

A successful conversation is one where:

* The prospect feels understood
* Qualification information is collected
* Suitable projects are identified
* Genuine value is provided
* The prospect clearly knows the next step
* Qualified prospects move toward a site visit or consultation call

Your goal is to qualify, guide, educate, and help prospects make informed property decisions while moving them naturally toward the next appropriate action.

ASK 1 question at a time
Never ask for information that has already been provided by the user. Always review conversation history before asking the next qualification question.

---

## KNOWLEDGE BASE
${JSON.stringify(PROJECTS_DATABASE, null, 2)}

---

## STATE EXTRACTION RULE
At the absolute end of your response, you MUST output a single JSON block wrapped in [STATE]...[/STATE] tags containing the extracted metadata.
Example format:
[STATE]{"name": "User Name", "budget": "₹1.5 - 3 Crore", "location": "Sector 150, Noida", "propertyType": "Luxury Apartment", "purpose": "Investment", "timeline": "Within 2 months", "phone": "9876543210", "email": "user@example.com", "leadScore": "HOT", "matchedProjectIds": ["godrej-tropical-isle", "ats-kingston-heath"]}[/STATE]
`;

// Simple in-memory session cache mapping Phone Number -> Chat History
const sessions = {};

// Helper to query Gemini API
async function fetchGeminiResponse(history) {
  const currentKolkataTime = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
  const currentDayOfWeek = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long' });
  
  const dynamicInstruction = `
${systemInstruction}

---
CRITICAL TIME CONTEXT FOR SCHEDULING:
- Today is: ${currentDayOfWeek}, ${currentKolkataTime} (Kolkata/India Timezone).
- Current Year: ${new Date().getFullYear()}.
- Always calculate relative date terms (like "aaj", "kal", "parso" / day after tomorrow, "agla hafta", "weekend", "next Monday") relative to today's date (${currentKolkataTime}).
- For example, if today is June 3, 2026, then:
  * "aaj" is June 3, 2026
  * "kal" (tomorrow) is June 4, 2026
  * "parso" (day after tomorrow) is June 5, 2026
  * "narso" is June 6, 2026
  * "next Monday" is June 8, 2026.
`;

  const payload = {
    contents: history,
    systemInstruction: { parts: [{ text: dynamicInstruction }] },
    generationConfig: { temperature: 0.5, topP: 0.9, maxOutputTokens: 1000 }
  };

  const urls = [
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${API_KEY}`,
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`
  ];

  let lastError;
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }
      const data = await response.json();
      if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts[0]) {
        return data.candidates[0].content.parts[0].text;
      }
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

// Helper function to send WhatsApp message via Meta Cloud API
async function sendWhatsAppMessage(phone_number_id, to, text) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN || "YOUR_META_ACCESS_TOKEN";
  const url = `https://graph.facebook.com/v19.0/${phone_number_id}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: to,
    type: "text",
    text: { body: text }
  };

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Meta API Error (HTTP ${response.status}):`, errorText);
    } else {
      console.log(`Message successfully sent to ${to}`);
    }
  } catch (error) {
    console.error("Network error when calling Meta WhatsApp API:", error);
  }
}

// Helper function to download media (voice/audio) from Meta Graph API
async function downloadMetaMedia(mediaId) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN || "YOUR_META_ACCESS_TOKEN";
  try {
    // 1. Get media URL
    const mediaResponse = await fetch(`https://graph.facebook.com/v19.0/${mediaId}`, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!mediaResponse.ok) {
      throw new Error(`Meta Media API error: ${mediaResponse.status}`);
    }
    const mediaData = await mediaResponse.json();
    const downloadUrl = mediaData.url;
    
    // 2. Download the binary media buffer
    const fileResponse = await fetch(downloadUrl, {
      headers: { "Authorization": `Bearer ${token}` }
    });
    if (!fileResponse.ok) {
      throw new Error(`Meta Media download file error: ${fileResponse.status}`);
    }
    
    // Convert response binary to buffer (compatible with node-fetch 2.x buffer() method)
    const buffer = await fileResponse.buffer();
    return {
      buffer: buffer,
      mimeType: mediaData.mime_type || "audio/ogg"
    };
  } catch (error) {
    console.error("Error downloading media from Meta:", error);
    return null;
  }
}

// Meta Webhook Verification Endpoint (GET)
// Meta sends a GET request here when you first configure your webhook in their developer portal
app.get('/webhook', (req, res) => {
  const verifyToken = (process.env.WHATSAPP_VERIFY_TOKEN || "YOUR_CUSTOM_WEBHOOK_VERIFY_TOKEN").trim();

  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'] ? req.query['hub.verify_token'].trim() : '';
  const challenge = req.query['hub.challenge'];

  if (mode && token) {
    if (mode === 'subscribe' && token === verifyToken) {
      console.log('Webhook verified successfully by Meta!');
      return res.status(200).send(challenge);
    } else {
      console.error(`Webhook verification failed. Token mismatch. Expected: "${verifyToken}", Received: "${token}"`);
      return res.sendStatus(403);
    }
  }
  return res.sendStatus(400);
});

// Meta Webhook Message Receiver Endpoint (POST)
// Meta sends a POST request here whenever a user sends a message to your WhatsApp number
app.post('/webhook', async (req, res) => {
  const body = req.body;

  // Log incoming body for debugging
  console.log('Incoming WhatsApp event:', JSON.stringify(body, null, 2));

  // 1. Meta expects an immediate 200 OK response to acknowledge receipt of the event.
  // If we don't return 200 quickly, Meta will keep retrying/resending the message.
  res.sendStatus(200);

  // 2. Validate that it's a whatsapp message event
  if (body.object === 'whatsapp_business_account') {
    try {
      const entry = body.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;
      const message = value?.messages?.[0];

      // Process text AND audio/voice messages
      if (message && (message.type === 'text' || message.type === 'audio' || message.type === 'voice')) {
        const fromNumber = message.from; // User's WhatsApp number (e.g. "919999988888")
        const phone_number_id = value.metadata?.phone_number_id; // Meta Phone Number ID
        
        let incomingMsg = "";
        let audioPart = null;

        if (message.type === 'text') {
          incomingMsg = message.text.body.trim();
          console.log(`Received WhatsApp text message from ${fromNumber}: "${incomingMsg}"`);
        } else {
          const audioId = message.audio ? message.audio.id : message.voice.id;
          console.log(`Received WhatsApp audio message from ${fromNumber} with ID: ${audioId}`);
          
          // Download audio
          const media = await downloadMetaMedia(audioId);
          if (media && media.buffer) {
            const base64Audio = media.buffer.toString("base64");
            audioPart = {
              inlineData: {
                mimeType: media.mimeType,
                data: base64Audio
              }
            };
            incomingMsg = "[Sent a voice note/audio message. Please listen to the attached audio files and transcribe/understand it. Reply in Hinglish text in the same language/dialect]";
          } else {
            incomingMsg = "[Sent an audio message, but failed to download]";
          }
        }

        // 3. Initialize session if not present
        if (!sessions[fromNumber]) {
          sessions[fromNumber] = [
            { role: "user", parts: [{ text: "Hello" }] },
            { role: "model", parts: [{ text: "Namaste! Main Kanak hoon, Potential Infinity se aapki property consultant. Kya aap koi property buy karna chahte hain?" }] }
          ];
        }

        // 4. Add user message to history
        const history = sessions[fromNumber];
        history.push({
          role: "user",
          parts: audioPart ? [{ text: incomingMsg }, audioPart] : [{ text: incomingMsg }]
        });

        let geminiRaw;
        try {
          // 5. Call Gemini
          geminiRaw = await fetchGeminiResponse(history);
        } catch (error) {
          console.error("Error during webhook flow with Gemini", error);
          
          let fallbackText = "I apologize, but I encountered an error connecting to my property database. Please try sending your message again in a few moments.";
          if (error.message && error.message.includes("429")) {
            fallbackText = "I apologize, but we are currently experiencing high request volume. Please wait about 30 seconds and send your message again.";
          }
          await sendWhatsAppMessage(phone_number_id, fromNumber, fallbackText);
          return;
        }

        // 6. Save model response to history
        history.push({ role: "model", parts: [{ text: geminiRaw }] });

        // 7. Clean up response (remove the [STATE] JSON block from the text sent to WhatsApp)
        let replyText = geminiRaw;
        const stateMatch = replyText.match(/\[STATE\]([\s\S]*?)\[\/STATE\]/);
        if (stateMatch) {
          replyText = replyText.replace(/\[STATE\][\s\S]*?\[\/STATE\]/, "").trim();
          
          // Log or sync the extracted Lead State Metadata
          try {
            const leadState = JSON.parse(stateMatch[1].trim());
            console.log(`Lead State Update for ${fromNumber}:`, leadState);
          } catch (err) {
            console.error("Error parsing state JSON on backend", err);
          }
        }

        // 8. Reply via Meta WhatsApp Cloud API
        await sendWhatsAppMessage(phone_number_id, fromNumber, replyText);
      }
    } catch (error) {
      console.error("Error parsing incoming Meta payload:", error);
    }
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`WhatsApp AI Webhook listening on port ${PORT}`);
});
