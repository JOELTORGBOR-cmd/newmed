
-- Backfill doctors rows for any user with the doctor role missing one
INSERT INTO public.doctors (profile_id, full_name, specialty, consultation_fee)
SELECT ur.user_id,
       COALESCE(NULLIF(p.full_name, ''), 'Doctor'),
       'General Practitioner',
       0
FROM public.user_roles ur
LEFT JOIN public.profiles p ON p.id = ur.user_id
WHERE ur.role = 'doctor'
  AND NOT EXISTS (SELECT 1 FROM public.doctors d WHERE d.profile_id = ur.user_id);

-- Allow doctors to update their assigned appointment by email (covers cases where doctor_id linkage is indirect)
DROP POLICY IF EXISTS "doctor complete own consultation" ON public.appointments;
CREATE POLICY "doctor complete own consultation"
ON public.appointments
FOR UPDATE
USING (
  has_role(auth.uid(), 'doctor'::app_role)
  AND doctor_email = (auth.jwt() ->> 'email')
)
WITH CHECK (
  has_role(auth.uid(), 'doctor'::app_role)
  AND doctor_email = (auth.jwt() ->> 'email')
);

-- Allow doctors to insert/update medical records when the linked appointment matches their email
DROP POLICY IF EXISTS "doctor insert records via appt email" ON public.medical_records;
CREATE POLICY "doctor insert records via appt email"
ON public.medical_records
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'doctor'::app_role)
  AND (
    appointment_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.id = medical_records.appointment_id
        AND a.doctor_email = (auth.jwt() ->> 'email')
    )
  )
);

DROP POLICY IF EXISTS "doctor update records via appt email" ON public.medical_records;
CREATE POLICY "doctor update records via appt email"
ON public.medical_records
FOR UPDATE
USING (
  has_role(auth.uid(), 'doctor'::app_role)
  AND appointment_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = medical_records.appointment_id
      AND a.doctor_email = (auth.jwt() ->> 'email')
  )
)
WITH CHECK (
  has_role(auth.uid(), 'doctor'::app_role)
  AND appointment_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.appointments a
    WHERE a.id = medical_records.appointment_id
      AND a.doctor_email = (auth.jwt() ->> 'email')
  )
);
