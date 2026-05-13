-- Auto-create doctors row when user_roles gets a 'doctor' entry
CREATE OR REPLACE FUNCTION public.fn_create_doctor_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'doctor' THEN
    INSERT INTO public.doctors (profile_id, full_name, specialty, consultation_fee)
    SELECT NEW.user_id,
           COALESCE(NULLIF(p.full_name, ''), 'Doctor'),
           'General Practitioner',
           0
    FROM public.profiles p
    WHERE p.id = NEW.user_id
      AND NOT EXISTS (SELECT 1 FROM public.doctors d WHERE d.profile_id = NEW.user_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_create_doctor_record ON public.user_roles;
CREATE TRIGGER trg_create_doctor_record
AFTER INSERT ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.fn_create_doctor_record();

-- Backfill any doctor-role users missing a doctors row
INSERT INTO public.doctors (profile_id, full_name, specialty, consultation_fee)
SELECT ur.user_id,
       COALESCE(NULLIF(p.full_name, ''), 'Doctor'),
       'General Practitioner',
       0
FROM public.user_roles ur
JOIN public.profiles p ON p.id = ur.user_id
WHERE ur.role = 'doctor'
  AND NOT EXISTS (SELECT 1 FROM public.doctors d WHERE d.profile_id = ur.user_id);