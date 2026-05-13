
-- 1. Extend enums
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'pharmacist';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'receptionist';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'accountant';

ALTER TYPE public.appt_status ADD VALUE IF NOT EXISTS 'checked_in';
ALTER TYPE public.appt_status ADD VALUE IF NOT EXISTS 'waiting_for_nurse';

-- 2. New columns
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;
ALTER TABLE public.lab_results ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;
