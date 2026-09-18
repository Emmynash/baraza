import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import OpenAI from "npm:openai";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function hashPhoneNumber(phone: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(phone);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const rawMessage = formData.get("Body")?.toString() || "";
    const fromNumber = formData.get("From")?.toString() || "";

    if (!rawMessage || !fromNumber) {
      return new Response("Missing Body or From", { status: 400, headers: corsHeaders });
    }

    const phoneHash = await hashPhoneNumber(fromNumber);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "" 
    );
    
    const openai = new OpenAI({
      apiKey: Deno.env.get("OPENAI_API_KEY") ?? "",
    });

    // 1. OpenAI Extraction & Strict Classification
    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `You are an intelligence extractor analyzing Nigerian Pidgin extortion and levy reports. 
          Respond ONLY with a JSON object containing exactly these keys:
          - "normalized_query": Standard English translation of the core claim.
          - "location_name": Specific location mentioned (e.g., "Oshodi", "Ikeja").
          - "amount": Numeric amount demanded in Naira (only the number). null if not mentioned.
          - "category": You MUST classify this into one of the following official database categories ONLY if it strictly meets all context rules:
              
              * "Motor Park Levy" 
                -> YES: 'Agbero', 'Danfo', 'Keke', 'garage', 'motor park', NURTW. Amounts usually ₦100 - ₦2,000.
                -> NO: If at a private house, a highway police checkpoint, or amounts > ₦3,000.
              
              * "LASPA Parking Levy" 
                -> YES: 'Setback', 'state parking authority', corporate parking. Usually high annual fees (e.g., ₦15,000+).
                -> NO: Local street boys (omo onile) or residential estate parking.
              
              * "Local Government Shop and Kiosk Rates" 
                -> YES: 'Council people', 'lock my shop', 'kiosk'. Amounts vary based on size (₦5,000 - ₦50,000+).
                -> NO: If they lock a residential house, flat, or private apartment.
              
              * "LASAA Signage and Advertisement Permit" 
                -> YES: 'billboard', 'banner', 'signboard', 'branding'. 
              
              * "Local Government Open Market Levy" 
                -> YES: 'market', 'trader', 'open space', 'iyalaja', daily market ticket.
              
              * "Business Premises Registration" 
                -> YES: 'new office', 'business registration', 'corporate affairs'.
              
              * "Unknown/Other" 
                -> USE IF: No clear match, police/military extortion, highway checkpoints, residential/landlord issues, community vigilante (CDA) fees, or personal disputes.

          - "latitude": Estimated latitude for the location (approximate is fine).
          - "longitude": Estimated longitude for the location.
          
          CRITICAL INSTRUCTIONS: 
          1. WEIGH AMOUNT & ENTITY: Do not classify blindly by keyword. A ₦5,000 fee for a daily "keke" ticket is extortion, not a standard "Motor Park Levy". A "parking fee" demanded by police on a highway is "Unknown/Other", not "LASPA". 
          2. CONTEXT PLAUSIBILITY: The physical domain must make sense. You do not pay "shop rates" for a private house, nor "motor park fees" in your living room. Route absurd mismatches to "Unknown/Other".
          3. GEOGRAPHIC BOUNDARY: This database is STRICTLY for Lagos State. If the location is outside Lagos State (e.g., Jos, Abuja, Ogun), output "Unknown/Other".`
        },
        { role: "user", content: rawMessage }
      ]
    });

    const intelligence = JSON.parse(chatCompletion.choices[0].message.content || "{}");

    // 2. OpenAI Embedding (Using normalized_query + category to ensure strict DB matching)
    // By appending the categorized name, we guarantee the vector search hits the exact DB row
    const embeddingText = intelligence.category && intelligence.category !== "Unknown/Other" 
      ? intelligence.category 
      : intelligence.normalized_query;
      
    const embeddingReq = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: embeddingText,
      dimensions: 768, 
    });
    const embedding = embeddingReq.data[0].embedding;

    // 3. Semantic Cross-Reference via pgvector
    const { data: matchData, error: matchError } = await supabase.rpc("match_official_levies", {
      query_embedding: embedding,
      match_threshold: 0.70,
      match_count: 1,
    });

    let reportedLevyId = null;
    let status = "pending";
    
    // Default reply for unrecognized/unofficial levies
    let smsReply = `[BARAZA]\n\nYour report has been received and normalized to:\n"${intelligence.normalized_query}"\n\nLocation: ${intelligence.location_name}\nAmount: ₦${intelligence.amount || "Unspecified"}\nCategory: ${intelligence.category}\n\nIt is now pending verification.`;

    // 4. Override reply if an official government levy is detected
    if (!matchError && matchData && matchData.length > 0) {
      reportedLevyId = matchData[0].id;
      status = "flagged";
      
      // Updated rich SMS response
      smsReply = `[BARAZA ALERT] Official Levy Match ⚠️\n\nCategory: ${matchData[0].levy_name}\nLocation: ${intelligence.location_name || "Unspecified"}\nAmount Demanded: ₦${intelligence.amount || "Unspecified"}\n\nThe fee you mentioned matches an official government levy. Ensure you are paying the correct mandated amount and demand a state receipt. Your report is tracked.`;
    }

    // 5. Database Insertion
    const safeLng = intelligence.longitude || 0.0;
    const safeLat = intelligence.latitude || 0.0;

    const { error: dbError } = await supabase
      .from("extortion_reports")
      .insert({
        user_query: rawMessage,
        normalized_query: intelligence.normalized_query,
        location_name: intelligence.location_name,
        amount: intelligence.amount,
        category: intelligence.category,
        fuzzed_location: `POINT(${safeLng} ${safeLat})`,
        user_phone_hash: phoneHash,
        status: status,
        reported_levy_id: reportedLevyId,
      });

    if (dbError) throw dbError;

    // 6. Send the informative TwiML SMS back to the user
    const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${smsReply}</Message></Response>`;
    
    return new Response(twiml, {
      headers: { ...corsHeaders, "Content-Type": "text/xml" },
    });

  } catch (error) {
    console.error("Webhook Error:", error);
    
    const fallbackMessage = '<?xml version="1.0" encoding="UTF-8"?><Response><Message>Our verification service is temporarily overloaded. Please try again in a few minutes. Text HIDE for safety.</Message></Response>';
    
    return new Response(fallbackMessage, { 
      status: 200, 
      headers: { ...corsHeaders, "Content-Type": "text/xml" }
    });
  }
});