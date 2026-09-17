-- ==============================================================================
-- 1. EXTENSIONS
-- ==============================================================================
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS vector;

-- ==============================================================================
-- 2. VETTED AGENTS (HITL Pipeline Access)
-- ==============================================================================
CREATE TABLE vetted_agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_hash TEXT NOT NULL UNIQUE,
    ngo_affiliation TEXT NOT NULL, 
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ==============================================================================
-- 3. OFFICIAL LEVIES & RULES (The Vector Search DB)
-- ==============================================================================
CREATE TABLE official_levies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    official_amount NUMERIC(10,2) NOT NULL,
    
    -- Spatial Boundary: Used for ST_DWithin filtering before vector search
    applicable_area GEOMETRY(Polygon, 4326) NOT NULL, 
    
    -- HITL Source Tracking
    source_document_url TEXT NOT NULL,
    ai_confidence_score NUMERIC(3,2),
    hitl_reviewed BOOLEAN DEFAULT FALSE,
    reviewed_by UUID REFERENCES vetted_agents(id),
    
    -- AI Semantic Search Embedding (768 dimensions for Gemini 1.5 embeddings)
    embedding VECTOR(768), 
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Spatial index for fast radius filtering
CREATE INDEX official_levies_area_idx ON official_levies USING GIST (applicable_area);

-- HNSW index for lightning-fast semantic vector search
CREATE INDEX official_levies_embedding_idx ON official_levies 
USING hnsw (embedding vector_cosine_ops) 
WITH (m = 16, ef_construction = 64);

-- ==============================================================================
-- 4. EXTORTION REPORTS & ANTI-DOXXING TRIGGERS
-- ==============================================================================
CREATE TABLE extortion_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_phone_hash TEXT NOT NULL,
    reported_levy_id UUID REFERENCES official_levies(id),
    user_query TEXT,
    
    -- Fuzzed geometry for safety
    fuzzed_location GEOMETRY(Point, 4326) NOT NULL, 
    
    reported_at TIMESTAMPTZ DEFAULT NOW()
);

-- The Anti-Doxxing Function (Coordinate Fuzzing)
CREATE OR REPLACE FUNCTION fuzz_gps_coordinate()
RETURNS TRIGGER AS $$
DECLARE
    random_dist FLOAT8;
    random_azi FLOAT8;
BEGIN
    -- Generate random distance (20m to 50m) and random azimuth (0 to 360 degrees)
    random_dist := 20.0 + (random() * 30.0);
    random_azi := random() * pi() * 2.0;

    NEW.fuzzed_location := (
        ST_Project(
            NEW.fuzzed_location::geography, 
            random_dist, 
            random_azi
        )
    )::geometry;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger
CREATE TRIGGER trigger_fuzz_extortion_location
BEFORE INSERT ON extortion_reports
FOR EACH ROW
EXECUTE FUNCTION fuzz_gps_coordinate();

CREATE INDEX extortion_reports_location_idx ON extortion_reports USING GIST (fuzzed_location);

-- ==============================================================================
-- 5. ANTI-SYBIL CLUSTERING ENGINE (The Dashboard View)
-- ==============================================================================
CREATE OR REPLACE VIEW active_extortion_hotspots AS
WITH clustered_reports AS (
    SELECT 
        id,
        user_phone_hash,
        fuzzed_location,
        ST_ClusterDBSCAN(ST_Transform(fuzzed_location, 3857), eps := 100, minpoints := 3) OVER () AS cluster_id
    FROM extortion_reports
    WHERE reported_at >= NOW() - INTERVAL '24 hours'
),
valid_clusters AS (
    SELECT 
        cluster_id,
        COUNT(DISTINCT user_phone_hash) as unique_reporters,
        ST_Centroid(ST_Collect(fuzzed_location)) as hotspot_center,
        COUNT(id) as total_reports
    FROM clustered_reports
    WHERE cluster_id IS NOT NULL
    GROUP BY cluster_id
    HAVING COUNT(DISTINCT user_phone_hash) >= 3
)
SELECT 
    cluster_id,
    unique_reporters,
    total_reports,
    hotspot_center
FROM valid_clusters;