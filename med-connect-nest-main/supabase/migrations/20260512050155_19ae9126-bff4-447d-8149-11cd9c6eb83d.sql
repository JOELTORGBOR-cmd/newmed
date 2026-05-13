CREATE POLICY "doctor insert prescriptions"
ON public.prescriptions FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'doctor'));

CREATE POLICY "doctor insert vitals"
ON public.vitals FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'doctor'));