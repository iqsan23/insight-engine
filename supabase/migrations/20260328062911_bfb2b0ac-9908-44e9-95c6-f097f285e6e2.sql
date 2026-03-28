
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- Create employee_logs table
CREATE TABLE public.employee_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id INTEGER NOT NULL,
  employee_name TEXT,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  event_type TEXT NOT NULL CHECK (event_type IN ('entry', 'exit')),
  location TEXT DEFAULT 'Main Office',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create embeddings table for RAG
CREATE TABLE public.log_embeddings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  log_id UUID REFERENCES public.employee_logs(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(768),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for vector similarity search
CREATE INDEX ON public.log_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create index on employee_logs for common queries
CREATE INDEX idx_employee_logs_employee_id ON public.employee_logs(employee_id);
CREATE INDEX idx_employee_logs_timestamp ON public.employee_logs(timestamp);
CREATE INDEX idx_employee_logs_event_type ON public.employee_logs(event_type);

-- Enable RLS
ALTER TABLE public.employee_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.log_embeddings ENABLE ROW LEVEL SECURITY;

-- Allow public read access (enterprise internal tool)
CREATE POLICY "Anyone can read employee logs" ON public.employee_logs FOR SELECT USING (true);
CREATE POLICY "Anyone can read log embeddings" ON public.log_embeddings FOR SELECT USING (true);
CREATE POLICY "Service role can insert employee logs" ON public.employee_logs FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can insert log embeddings" ON public.log_embeddings FOR INSERT WITH CHECK (true);

-- Create a function for similarity search
CREATE OR REPLACE FUNCTION public.match_log_embeddings(
  query_embedding vector(768),
  match_threshold FLOAT DEFAULT 0.3,
  match_count INT DEFAULT 5,
  filter_metadata JSONB DEFAULT '{}'
)
RETURNS TABLE (
  id UUID,
  log_id UUID,
  content TEXT,
  metadata JSONB,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    le.id,
    le.log_id,
    le.content,
    le.metadata,
    1 - (le.embedding <=> query_embedding) AS similarity
  FROM public.log_embeddings le
  WHERE 
    1 - (le.embedding <=> query_embedding) > match_threshold
    AND (
      filter_metadata = '{}'::jsonb 
      OR le.metadata @> filter_metadata
    )
  ORDER BY le.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
