DROP POLICY IF EXISTS "doctor view all records" ON public.medical_records;

CREATE POLICY "doctor view all records"
ON public.medical_records
FOR SELECT
USING (public.has_role(auth.uid(), 'doctor'::public.app_role));