import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// --- Configuration & Constants ---
const STEALTH_TRIGGERS = new Set(["hide", "cancel", "weather", "stop", "exit"]);
const STEALTH_PAYLOAD = "Thank you for subscribing to Lagos Daily Weather. Today is sunny with a high of 32°C. Remember to stay hydrated!";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent";

// --- Utility: Generate Twilio XML Response ---
function generateTwiML(message: string): Response {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <Response>
      <Message>${message}</Message>
    </Response>`;
  
  return new Response(xml, {
    headers: { "Content-Type": "text/xml" },
    status: 200,
  });
}

async function geocodeLocation(locationName: string) {
  if (!locationName || locationName.toLowerCase() === "unknown") return { lat: null, lng: null };
  
  try {
    // Adding "Nigeria" to help scope the search
    const query = encodeURIComponent(`${locationName}, Nigeria`);
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`, {
      headers: { "User-Agent": "Baraza-Hackathon-App" } // Nominatim requires a User-Agent
    });
    const data = await res.json();
    
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch (e) {
    console.error("[Baraza] Geocoding failed:", e);
  }
  return { lat: null, lng: null };
}

// --- Utility: Gemini NLP Pre-processor ---
async function normalizeVernacular(rawText: string): Promise<any> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing in environment.");

  const prompt = `CRITICAL INSTRUCTION: Output ONLY valid JSON. DO NOT use markdown, reasoning, or scratchpads.

  Analyze this Nigerian Pidgin query about a municipal fee. Extract the data into this exact JSON structure:
  {
    "normalized_query": "Formal English translation of the question",
    "location_name": "Name of the neighborhood, city, or market",
    "amount": numeric value of the fee (e.g. 5000) or null if not mentioned,
    "category": "tax", "bribe", "ticket", or "unknown"
  }

  Actual Input: ${rawText}`;

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { 
        temperature: 0.1, 
        maxOutputTokens: 800,
        responseMimeType: "application/json" // This forces the model to return raw JSON!
      },
    }),
  });

  if (!response.ok) {
    // console.error("Gemini API Error:", await response.text());
    // throw new Error("Failed to process NLP normalization.");
    // Read the error from Google
    const errorText = await response.text();
    // Throw it directly so it appears in the fatal crash log!
    throw new Error(`Gemini API Error: ${errorText}`);
  }

  const data = await response.json();
  
  // Log the raw response so we can see exactly what the AI is thinking
  console.log("[Baraza] Raw Gemini Response parts:", JSON.stringify(data.candidates[0].content.parts));

  // --- THIS IS THE UPDATED BOTTOM SECTION ---
  let rawJsonText = data.candidates[0].content.parts[0].text.trim();
  
  try {
    return JSON.parse(rawJsonText);
  } catch (e) {
    console.error("Failed to parse Gemini JSON:", rawJsonText);
    throw new Error("Invalid JSON from NLP model");
  }
}

// --- Main Webhook Handler ---
serve(async (req) => {
  try {
    // 1. Verify Method & Parse Twilio Form Data
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const formData = await req.formData();
    const rawMessage = formData.get("Body")?.toString().trim() || "";
    const senderPhone = formData.get("From")?.toString() || "";

    if (!rawMessage) {
      return generateTwiML("Send a query to verify a municipal fee (e.g., 'Oshodi sanitation fee 2k?'). Type HIDE to clear screen.");
    }

    console.log(`[Baraza] Received query from ${senderPhone}: "${rawMessage}"`);

    // 2. Safety First: The Stealth Escape Hatch
    const normalizedLower = rawMessage.toLowerCase();
    if (STEALTH_TRIGGERS.has(normalizedLower)) {
      console.log(`[Baraza] Stealth mode triggered by ${senderPhone}`);
      return generateTwiML(STEALTH_PAYLOAD);
    }

    // 3. NLP Normalization Pipeline (Pidgin -> English)
    const intelligence = await normalizeVernacular(rawMessage);
    console.log(`[Baraza] Extracted Intelligence:`, intelligence);

    // Geocode the location
    const coords = await geocodeLocation(intelligence.location_name);
    console.log(`[Baraza] Geocoded Coordinates:`, coords);

    // 4. Save to Database
    // Initialize Supabase client with the Service Role key to bypass RLS policies in the backend
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Hash the phone number for privacy (Sybil resistance without exposing identity)
    const phoneHash = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(senderPhone)
    ).then(buf => Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join(''));

    const { error: dbError } = await supabase
      .from("extortion_reports")
      .insert({
        user_query: rawMessage,                          // Updated key
        normalized_query: intelligence.normalized_query, 
        location_name: intelligence.location_name,
        amount: intelligence.amount,
        category: intelligence.category,
        fuzzed_location: `POINT(${coords.lng} ${coords.lat})`, // Converted to PostGIS WKT (Longitude first!)
        user_phone_hash: phoneHash,                      // Updated key
        status: "pending"
      });

    if (dbError) {
    //   console.error("[Baraza] Database Insert Error:", dbError);
    //   throw new Error("Failed to save report.");
        console.error("[Baraza] Database Insert Error:", dbError);
      // Inject the dbError directly into the fatal crash message
      throw new Error(`Failed to save report: ${JSON.stringify(dbError)}`);
    }

    console.log(`[Baraza] Successfully saved report to database.`);

    const userResponse = `[BARAZA]\n\nYour report has been received and normalized to:\n"${intelligence.normalized_query}"\n\nLocation: ${intelligence.location_name}\n\nAmount: ${intelligence.amount}\n\nCategory: ${intelligence.category}\n\nIt is now pending verification.`;
    return generateTwiML(userResponse);

  } catch (error) {
    console.error("[Baraza] Fatal Webhook Error:", error);
    // Graceful degradation for edge networks
    return generateTwiML("Our verification service is temporarily overloaded. Please try again in a few minutes. Text HIDE for safety.");
  }
});