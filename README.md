# 🛡️ Baraza: Command Center

**Real-time municipal extortion reporting, powered by AI and WhatsApp.**

Baraza is an end-to-end civic intelligence platform designed to eliminate the friction of reporting municipal extortion. By leveraging WhatsApp and Natural Language Processing, civilians can report incidents anonymously in everyday language (including Nigerian Pidgin). The system extracts the data, geocodes it, and plots it on a real-time spatial dashboard for authorities.

---

## 🚀 The Problem & Solution
**The Problem:** Municipal extortion thrives in the dark. Citizens rarely report incidents due to complicated government forms, language barriers, and fear of retaliation.
**The Solution:** Meet the citizens where they already are—WhatsApp. 

With Baraza, a user simply sends a voice note or text in their local dialect (e.g., *"LASTMA boys dey collect 5k for Oshodi"*). Our pipeline instantly translates the text, extracts the structured financial and geographic data, hashes their identity for safety, and pushes it to a live Command Center.

## 🏗️ Technical Architecture
Baraza is built with a modern, real-time edge stack:

1. **Ingestion:** Twilio WhatsApp Sandbox API
2. **Compute Pipeline:** Deno Edge Functions (Supabase)
3. **AI / NLP Extraction:** Google Gemini 3.6 Flash
4. **Geocoding:** OpenStreetMap (Nominatim API)
5. **Database & Pub/Sub:** PostgreSQL + Supabase Realtime
6. **Frontend:** Next.js 14 (App Router) + Tailwind CSS + React-Leaflet

### System Flow
1. User messages the Twilio WhatsApp number.
2. Twilio triggers a webhook to our Supabase Edge Function.
3. The Edge Function passes the raw text to Gemini with a strict JSON-schema prompt to translate Pidgin and extract `amount`, `location`, and `category`.
4. The extracted location name is sent to Nominatim to retrieve Latitude/Longitude.
5. The user's phone number is cryptographically hashed (SHA-256) for Sybil-resistance without compromising identity.
6. The structured report is inserted into Postgres.
7. Supabase Realtime broadcasts the database `INSERT` event via WebSockets to the Next.js frontend, instantly updating the map and metrics without a page refresh.

---

## ✨ Key Features
* **Zero-Friction Reporting:** No apps to download, no accounts to create. Just text the bot.
* **Dialect Normalization:** Natively understands Nigerian Pidgin and slang.
* **Privacy-Preserving:** Phone numbers are one-way hashed. Authorities can see *how many* unique people are reporting an area, but not *who* they are.
* **Live Spatial Intelligence:** Real-time hot-spot mapping using Leaflet and Next.js Server-Side Rendering bypasses.
* **Stealth Mode:** Built-in triggers (e.g., sending "Weather") instantly return benign responses if a user's phone is inspected.

---

## 💻 Local Development Setup

### Prerequisites
* Docker (for Supabase Local Studio)
* Node.js 18+
* Twilio Account (WhatsApp Sandbox)
* Google Gemini API Key

### 1. Clone & Install
```bash
git clone https://github.com/Emmynash/baraza.git
cd baraza

# Install frontend dependencies
cd web
npm install
```

### 2. Environment Variables
Create a `.env.local` file in the `web/` directory:
```env
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_local_anon_key
```

Create a `.env` file in the `supabase/` directory:
```env
GEMINI_API_KEY=your_gemini_api_key
```

### 3. Start the Backend (Supabase)
In the root directory, start the local Supabase stack and Edge Functions:
```bash
supabase start
supabase functions serve whatsapp-webhook --no-verify-jwt --env-file ./supabase/.env
```

### 4. Start the Frontend (Next.js)
In the `web/` directory:
```bash
npm run dev
```
The Command Center will be available at `http://localhost:3000`.

### 5. Connect Twilio (Ngrok)
Expose your local Edge Function to the internet:
```bash
ngrok http 54321
```
Paste your Ngrok URL into the Twilio WhatsApp Sandbox Webhook settings:
`https://<YOUR_NGROK_URL>/functions/v1/whatsapp-webhook`

---

## 🗺️ V2 Roadmap
* **Toponym Resolution:** Implement dynamic clarification for ambiguous locations.
* **USSD Integration:** Expand access to feature phones without internet via USSD.
* **Verification Queues:** Admin tools to upgrade report statuses.