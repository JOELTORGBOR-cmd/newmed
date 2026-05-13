ALTER TABLE public.medical_records ADD COLUMN IF NOT EXISTS appointment_id uuid;
CREATE INDEX IF NOT EXISTS idx_medical_records_appointment ON public.medical_records(appointment_id);