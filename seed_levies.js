import { createClient } from "@supabase/supabase-js";
import OpenAI from "openai";
import "dotenv/config";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const openaiKey = process.env.OPENAI_API_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase URL or Key in .env file.");
}

const supabase = createClient(supabaseUrl, supabaseKey);

const openai = new OpenAI({
  apiKey: openaiKey,
});

// Added 'applicable_area' to each levy
const lagosLevies = [
  {
    name: "Local Government Open Market Levy",
    description: "Daily or periodic collections from registered traders operating within official local government markets.",
    applicable_area: "Local Government Area (LGA)"
  },
  {
    name: "Motor Park Levy",
    description: "Daily levy imposed by Local Governments on commercial transport operators, including Danfo buses, tricycles (Keke), and motorcycles (Okada) using designated parks.",
    applicable_area: "Local Government Area (LGA)"
  },
  {
    name: "LASPA Parking Levy",
    description: "Lagos State Parking Authority (LASPA) fee for parking on public setbacks or running commercial parking lots. Officially stands at ₦80,000 per vehicle slot annually.",
    applicable_area: "Statewide"
  },
  {
    name: "Local Government Shop and Kiosk Rates",
    description: "Annual shop rate and daily kiosk rates collected by Local Council Development Areas (LCDAs) from large, medium, and small retail shops or distributors' outlets.",
    applicable_area: "Local Council Development Area (LCDA)"
  },
  {
    name: "LASAA Signage and Advertisement Permit",
    description: "Lagos State Signage and Advertisement Agency (LASAA) permit fee required for any business displaying a billboard, directional sign, or wall branding.",
    applicable_area: "Statewide"
  },
  {
    name: "Business Premises Registration",
    description: "State-wide business registration and annual renewal fee collected by the Lagos State Government (Central) for operating a business premise.",
    applicable_area: "Statewide"
  }
];

async function seedDatabase() {
  console.log("🌱 Starting database seeding...");

  for (const levy of lagosLevies) {
    console.log(`Processing embedding for: ${levy.name}...`);
    
    const textToEmbed = `${levy.name}: ${levy.description}`;

    try {
      const embeddingReq = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: textToEmbed,
        dimensions: 768, 
      });
      
      const embedding = embeddingReq.data[0].embedding;

      // Included 'applicable_area' in the insert payload
      const { error } = await supabase
        .from("official_levies")
        .insert({
          name: levy.name,
          title: levy.name,
          description: levy.description,
          embedding: embedding,
          official_amount: levy.official_amount || 0,
          applicable_area: "POLYGON((3.0 6.4, 4.0 6.4, 4.0 6.7, 3.0 6.7, 3.0 6.4))",
          source_document_url: "https://lagosstate.gov.ng/approved-levies-law"
        });

      if (error) {
        console.error(`❌ Error inserting ${levy.name}:`, error.message);
      } else {
        console.log(`✅ Successfully seeded: ${levy.name}`);
      }

    } catch (error) {
      console.error(`Failed to process ${levy.name}:`, error);
    }
  }
  
  console.log("🎉 Seeding complete!");
}

seedDatabase();