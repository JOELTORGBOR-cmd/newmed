ALTER TABLE public.vitals REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vitals;