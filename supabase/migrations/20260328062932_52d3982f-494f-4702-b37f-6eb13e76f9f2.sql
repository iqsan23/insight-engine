
-- Drop overly permissive insert policies
DROP POLICY "Service role can insert employee logs" ON public.employee_logs;
DROP POLICY "Service role can insert log embeddings" ON public.log_embeddings;

-- Recreate with service role restriction (inserts only via edge functions)
CREATE POLICY "Service role inserts employee logs" ON public.employee_logs FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role inserts log embeddings" ON public.log_embeddings FOR INSERT TO service_role WITH CHECK (true);
