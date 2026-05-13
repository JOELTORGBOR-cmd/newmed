
-- 1. Enum additions (must be in their own statements)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'nurse';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'lab_technician';
