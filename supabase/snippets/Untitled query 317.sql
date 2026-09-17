-- 1. Create the reports table
CREATE TABLE public.reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  raw_query TEXT NOT NULL,
  normalized_query TEXT NOT NULL,
  phone_hash TEXT,
  status TEXT DEFAULT 'pending'
);

-- 2. Enable Supabase Realtime for the dashboard
ALTER PUBLICATION supabase_realtime ADD TABLE public.reports;

-- 3. Enable Row Level Security (RLS)
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- 4. Create a policy that allows the frontend (anon) to only READ reports
CREATE POLICY "Allow public read access" 
  ON public.reports 
  FOR SELECT 
  TO anon 
  USING (true);