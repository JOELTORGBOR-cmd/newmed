-- Add status column to profiles and doctors for non-destructive deactivation
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';
ALTER TABLE public.doctors  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_status_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_status_check CHECK (status IN ('active','dormant'));
ALTER TABLE public.doctors  DROP CONSTRAINT IF EXISTS doctors_status_check;
ALTER TABLE public.doctors  ADD CONSTRAINT doctors_status_check CHECK (status IN ('active','dormant'));

CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_doctors_status  ON public.doctors(status);

-- Cascade profile.status -> doctors.status
CREATE OR REPLACE FUNCTION public.fn_sync_doctor_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.doctors SET status = NEW.status WHERE profile_id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_doctor_status ON public.profiles;
CREATE TRIGGER trg_sync_doctor_status
AFTER UPDATE OF status ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_doctor_status();

-- Allow patients to read profile.status so the auth gate can check it
CREATE POLICY "anyone read own status"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);
