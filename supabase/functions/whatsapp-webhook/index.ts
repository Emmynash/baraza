import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// --- Configuration & Constants ---
const STEALTH_TRIGGERS = new Set(["hide", "cancel", "weather", "stop", "exit"]);
const STEALTH_PAYLOAD = "Thank you for subscribing to Lagos Daily Weather. Today is sunny with a high of 32°C. Remember to stay hydrated!";
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent";

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

// --- Utility: Gemini NLP Pre-processor ---
async function normalizeVernacular(rawText: string): Promise<string> {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing in environment.");

  const prompt = `CRITICAL INSTRUCTION: Output the translation immediately. DO NOT use any internal reasoning, thoughts, or scratchpads. 
  
  Translate the following Nigerian Pidgin query into a formal English question suitable for a municipal database search.
  Extract the core entity, the location, and the monetary amount.
  Respond ONLY with the translated formal query. Do not add quotes, labels, markdown, or conversational filler.
  
  Example Input: dem say make I pay 2k for oshodi market ticket
  Example Output: Is there a 2000 NGN market ticket fee in Oshodi?
  
  Actual Input: ${rawText}
  Actual Output:`;

  const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 800 }, // Increased tokens
    }),
  });

  if (!response.ok) {
    console.error("Gemini API Error:", await response.text());
    throw new Error("Failed to process NLP normalization.");
  }

  const data = await response.json();
  
  // Log the raw response so we can see exactly what the AI is thinking
  console.log("[Baraza] Raw Gemini Response parts:", JSON.stringify(data.candidates[0].content.parts));

  let result = data.candidates[0].content.parts[0].text.trim();
  
  // Strip out any rogue leading or trailing quotation marks the model might add
  result = result.replace(/^["']|["']$/g, '').trim();

  return result;
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
    const normalizedQuery = await normalizeVernacular(rawMessage);
    console.log(`[Baraza] Normalized Query: "${normalizedQuery}"`);

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
      .from("reports")
      .insert({
        raw_query: rawMessage,
        normalized_query: normalizedQuery,
        phone_hash: phoneHash,
        status: "pending"
      });

    if (dbError) {
      console.error("[Baraza] Database Insert Error:", dbError);
      throw new Error("Failed to save report.");
    }

    console.log(`[Baraza] Successfully saved report to database.`);

    const userResponse = `[BARAZA]\n\nYour report has been received and normalized to:\n"${normalizedQuery}"\n\nIt is now pending verification by our team.`;
    return generateTwiML(userResponse);

  } catch (error) {
    console.error("[Baraza] Fatal Webhook Error:", error);
    // Graceful degradation for edge networks
    return generateTwiML("Our verification service is temporarily overloaded. Please try again in a few minutes. Text HIDE for safety.");
  }
});