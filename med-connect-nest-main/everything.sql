
-- Roles
create type public.app_role as enum ('patient','doctor','staff','admin');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  role app_role not null,
  created_at timestamptz not null default now(),
  unique(user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role=_role)
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role in ('staff','admin','doctor'))
$$;

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  student_id text,
  phone text,
  dob date,
  avatar_url text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy "view own profile" on public.profiles for select using (auth.uid() = id or public.is_staff(auth.uid()));
create policy "update own profile" on public.profiles for update using (auth.uid() = id);
create policy "insert own profile" on public.profiles for insert with check (auth.uid() = id);
create policy "admin manage profiles" on public.profiles for all using (public.has_role(auth.uid(),'admin'));

create policy "view own roles" on public.user_roles for select using (auth.uid() = user_id or public.has_role(auth.uid(),'admin'));
create policy "admin manage roles" on public.user_roles for all using (public.has_role(auth.uid(),'admin'));

-- New user trigger: create profile and patient role
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, student_id, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    new.raw_user_meta_data->>'student_id',
    new.raw_user_meta_data->>'phone'
  );
  insert into public.user_roles (user_id, role) values (new.id, 'patient');
  return new;
end; $$;

create trigger on_auth_user_created
after insert on auth.users for each row execute function public.handle_new_user();

-- Doctors
create table public.doctors (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null,
  full_name text not null,
  specialty text not null,
  bio text,
  rating numeric(2,1) default 4.5,
  consultation_fee numeric(10,2) default 0,
  avatar_url text,
  created_at timestamptz not null default now()
);
alter table public.doctors enable row level security;
create policy "anyone view doctors" on public.doctors for select using (auth.uid() is not null);
create policy "admin manage doctors" on public.doctors for all using (public.has_role(auth.uid(),'admin'));

-- Appointments
create type public.appt_status as enum ('pending','confirmed','completed','cancelled');
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references auth.users(id) on delete cascade not null,
  doctor_id uuid references public.doctors(id) on delete set null,
  scheduled_at timestamptz not null,
  reason text,
  status appt_status not null default 'pending',
  notes text,
  created_at timestamptz not null default now()
);
alter table public.appointments enable row level security;
create policy "patients view own appts" on public.appointments for select using (auth.uid() = patient_id or public.is_staff(auth.uid()));
create policy "patients create appts" on public.appointments for insert with check (auth.uid() = patient_id);
create policy "patients update own appts" on public.appointments for update using (auth.uid() = patient_id or public.is_staff(auth.uid()));
create policy "staff delete appts" on public.appointments for delete using (public.is_staff(auth.uid()));

-- Medical records
create table public.medical_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references auth.users(id) on delete cascade not null,
  doctor_id uuid references public.doctors(id) on delete set null,
  visit_date date not null default current_date,
  diagnosis text,
  treatment text,
  notes text,
  created_at timestamptz not null default now()
);
alter table public.medical_records enable row level security;
create policy "view own records" on public.medical_records for select using (auth.uid() = patient_id or public.is_staff(auth.uid()));
create policy "staff manage records" on public.medical_records for all using (public.is_staff(auth.uid()));

create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  record_id uuid references public.medical_records(id) on delete cascade,
  patient_id uuid references auth.users(id) on delete cascade not null,
  drug_name text not null,
  dosage text,
  duration text,
  instructions text,
  created_at timestamptz not null default now()
);
alter table public.prescriptions enable row level security;
create policy "view own rx" on public.prescriptions for select using (auth.uid() = patient_id or public.is_staff(auth.uid()));
create policy "staff manage rx" on public.prescriptions for all using (public.is_staff(auth.uid()));

create table public.allergies (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references auth.users(id) on delete cascade not null,
  allergen text not null,
  severity text default 'mild',
  created_at timestamptz not null default now()
);
alter table public.allergies enable row level security;
create policy "view own allergies" on public.allergies for select using (auth.uid() = patient_id or public.is_staff(auth.uid()));
create policy "staff manage allergies" on public.allergies for all using (public.is_staff(auth.uid()));

create table public.vitals (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references auth.users(id) on delete cascade not null,
  recorded_at timestamptz not null default now(),
  bp text,
  heart_rate int,
  temperature numeric(4,1),
  weight numeric(5,1),
  height numeric(5,1)
);
alter table public.vitals enable row level security;
create policy "view own vitals" on public.vitals for select using (auth.uid() = patient_id or public.is_staff(auth.uid()));
create policy "staff manage vitals" on public.vitals for all using (public.is_staff(auth.uid()));

-- Lab results
create table public.lab_results (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references auth.users(id) on delete cascade not null,
  doctor_id uuid references public.doctors(id) on delete set null,
  test_name text not null,
  result_summary text,
  file_path text,
  status text not null default 'completed',
  created_at timestamptz not null default now()
);
alter table public.lab_results enable row level security;
create policy "view own labs" on public.lab_results for select using (auth.uid() = patient_id or public.is_staff(auth.uid()));
create policy "staff manage labs" on public.lab_results for all using (public.is_staff(auth.uid()));

insert into storage.buckets (id, name, public) values ('lab-results','lab-results', false);
create policy "patients read own lab files" on storage.objects for select using (
  bucket_id='lab-results' and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_staff(auth.uid())
  )
);
create policy "staff upload lab files" on storage.objects for insert with check (
  bucket_id='lab-results' and public.is_staff(auth.uid())
);
create policy "staff update lab files" on storage.objects for update using (
  bucket_id='lab-results' and public.is_staff(auth.uid())
);

-- Invoices & payments
create type public.invoice_status as enum ('pending','paid','overdue','cancelled');
create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid references auth.users(id) on delete cascade not null,
  amount numeric(10,2) not null,
  description text,
  status invoice_status not null default 'pending',
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
alter table public.invoices enable row level security;
create policy "view own invoices" on public.invoices for select using (auth.uid() = patient_id or public.is_staff(auth.uid()));
create policy "staff manage invoices" on public.invoices for all using (public.is_staff(auth.uid()));

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references public.invoices(id) on delete cascade not null,
  patient_id uuid references auth.users(id) on delete cascade not null,
  provider text not null default 'momo_mock',
  network text,
  phone_masked text,
  reference text not null,
  amount numeric(10,2) not null,
  status text not null default 'success',
  created_at timestamptz not null default now()
);
alter table public.payments enable row level security;
create policy "view own payments" on public.payments for select using (auth.uid() = patient_id or public.is_staff(auth.uid()));
create policy "patients create payments" on public.payments for insert with check (auth.uid() = patient_id);
create policy "staff manage payments" on public.payments for all using (public.is_staff(auth.uid()));

-- Drugs
create table public.drugs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text,
  stock int not null default 0,
  unit_price numeric(10,2) not null default 0,
  expiry_date date,
  low_stock_threshold int not null default 10,
  created_at timestamptz not null default now()
);
alter table public.drugs enable row level security;
create policy "staff view drugs" on public.drugs for select using (public.is_staff(auth.uid()));
create policy "staff manage drugs" on public.drugs for all using (public.is_staff(auth.uid()));

create table public.drug_dispenses (
  id uuid primary key default gen_random_uuid(),
  drug_id uuid references public.drugs(id) on delete set null,
  patient_id uuid references auth.users(id) on delete set null,
  quantity int not null default 1,
  dispensed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.drug_dispenses enable row level security;
create policy "staff view dispenses" on public.drug_dispenses for select using (public.is_staff(auth.uid()));
create policy "staff manage dispenses" on public.drug_dispenses for all using (public.is_staff(auth.uid()));

revoke execute on function public.has_role(uuid, public.app_role) from public, anon, authenticated;
revoke execute on function public.is_staff(uuid) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Add nurse role
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'nurse';

-- Invitations table
CREATE TABLE public.staff_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  role app_role NOT NULL,
  invited_by uuid,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_at timestamptz
);

ALTER TABLE public.staff_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage invitations"
  ON public.staff_invitations
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Update handle_new_user to honor invitations
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  invited_role app_role;
begin
  insert into public.profiles (id, full_name, student_id, phone)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',''),
    new.raw_user_meta_data->>'student_id',
    new.raw_user_meta_data->>'phone'
  );

  select role into invited_role
  from public.staff_invitations
  where lower(email) = lower(new.email) and status = 'pending'
  limit 1;

  if invited_role is not null then
    insert into public.user_roles (user_id, role) values (new.id, invited_role);
    update public.staff_invitations
      set status = 'accepted', accepted_at = now()
      where lower(email) = lower(new.email);
  else
    insert into public.user_roles (user_id, role) values (new.id, 'patient');
  end if;

  return new;
end;
$function$;

-- Ensure trigger exists
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, anon;create or replace function public.email_has_invitation(_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.staff_invitations
    where lower(email) = lower(_email) and status = 'pending'
  )
$$;
grant execute on function public.email_has_invitation(text) to anon, authenticated;ALTER TABLE public.medical_records ADD COLUMN IF NOT EXISTS appointment_id uuid;
CREATE INDEX IF NOT EXISTS idx_medical_records_appointment ON public.medical_records(appointment_id);
-- Helper: current user's doctor row id
create or replace function public.current_doctor_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.doctors where profile_id = auth.uid() limit 1
$$;

-- ===================== medical_records =====================
drop policy if exists "staff manage records" on public.medical_records;
drop policy if exists "view own records" on public.medical_records;

create policy "admin full access records"
on public.medical_records for all
using (has_role(auth.uid(), 'admin'))
with check (has_role(auth.uid(), 'admin'));

create policy "staff manage records"
on public.medical_records for all
using (has_role(auth.uid(), 'staff') or has_role(auth.uid(), 'nurse'))
with check (has_role(auth.uid(), 'staff') or has_role(auth.uid(), 'nurse'));

create policy "doctor view all records"
on public.medical_records for select
using (has_role(auth.uid(), 'doctor'));

create policy "doctor insert assigned records"
on public.medical_records for insert
with check (has_role(auth.uid(), 'doctor') and doctor_id = public.current_doctor_id());

create policy "doctor update assigned records"
on public.medical_records for update
using (has_role(auth.uid(), 'doctor') and doctor_id = public.current_doctor_id())
with check (has_role(auth.uid(), 'doctor') and doctor_id = public.current_doctor_id());

create policy "patient view own records"
on public.medical_records for select
using (auth.uid() = patient_id);

-- ===================== appointments =====================
drop policy if exists "patients create appts" on public.appointments;
drop policy if exists "patients update own appts" on public.appointments;
drop policy if exists "patients view own appts" on public.appointments;
drop policy if exists "staff delete appts" on public.appointments;

create policy "admin full access appts"
on public.appointments for all
using (has_role(auth.uid(), 'admin'))
with check (has_role(auth.uid(), 'admin'));

create policy "staff manage appts"
on public.appointments for all
using (has_role(auth.uid(), 'staff') or has_role(auth.uid(), 'nurse'))
with check (has_role(auth.uid(), 'staff') or has_role(auth.uid(), 'nurse'));

create policy "doctor view all appts"
on public.appointments for select
using (has_role(auth.uid(), 'doctor'));

create policy "doctor insert assigned appts"
on public.appointments for insert
with check (has_role(auth.uid(), 'doctor') and doctor_id = public.current_doctor_id());

create policy "doctor update assigned appts"
on public.appointments for update
using (has_role(auth.uid(), 'doctor') and doctor_id = public.current_doctor_id())
with check (has_role(auth.uid(), 'doctor') and doctor_id = public.current_doctor_id());

create policy "patient view own appts"
on public.appointments for select
using (auth.uid() = patient_id);

create policy "patient create own appts"
on public.appointments for insert
with check (auth.uid() = patient_id);

create policy "patient update own appts"
on public.appointments for update
using (auth.uid() = patient_id)
with check (auth.uid() = patient_id);
DROP POLICY IF EXISTS "doctor view all records" ON public.medical_records;

CREATE POLICY "doctor view all records"
ON public.medical_records
FOR SELECT
USING (public.has_role(auth.uid(), 'doctor'::public.app_role));
-- 1. Enum additions (must be in their own statements)
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'nurse';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'lab_technician';

-- =========================================================
-- HELPERS
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select exists(select 1 from public.user_roles
    where user_id=_user_id and role in ('staff','admin','doctor','nurse','lab_technician'))
$$;

CREATE OR REPLACE FUNCTION public.is_nurse(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role='nurse')
$$;

CREATE OR REPLACE FUNCTION public.is_lab_tech(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  select exists(select 1 from public.user_roles where user_id=_user_id and role='lab_technician')
$$;

-- =========================================================
-- INVOICES — fee breakdown
-- =========================================================
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS appointment_id uuid,
  ADD COLUMN IF NOT EXISTS consultation_fee numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS medicine_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lab_cost numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_charge numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS subtotal numeric NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS invoices_appointment_unique
  ON public.invoices (appointment_id) WHERE appointment_id IS NOT NULL;

-- =========================================================
-- PRESCRIPTIONS — pharmacy state
-- =========================================================
ALTER TABLE public.prescriptions
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS quantity integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS drug_id uuid,
  ADD COLUMN IF NOT EXISTS dispensed_at timestamptz,
  ADD COLUMN IF NOT EXISTS dispensed_by uuid;

-- =========================================================
-- LAB REQUESTS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.lab_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid NOT NULL,
  doctor_id uuid,
  appointment_id uuid,
  test_name text NOT NULL,
  test_fee numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  result_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
ALTER TABLE public.lab_requests ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- TRIGGER FUNCTIONS
-- =========================================================

-- Auto-create invoice when appointment status -> completed
CREATE OR REPLACE FUNCTION public.fn_invoice_on_appt_completed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  fee numeric := 0;
  charge numeric := 0;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    IF NEW.doctor_id IS NOT NULL THEN
      SELECT COALESCE(consultation_fee, 0) INTO fee FROM public.doctors WHERE id = NEW.doctor_id;
    END IF;
    charge := round(fee * 0.10, 2);

    INSERT INTO public.invoices (patient_id, appointment_id, description, consultation_fee, service_charge, subtotal, amount, status)
    VALUES (NEW.patient_id, NEW.id, 'Consultation', fee, charge, fee, fee + charge, 'pending')
    ON CONFLICT (appointment_id) DO UPDATE
      SET consultation_fee = EXCLUDED.consultation_fee,
          service_charge   = EXCLUDED.service_charge,
          subtotal         = public.invoices.medicine_cost + public.invoices.lab_cost + EXCLUDED.consultation_fee,
          amount           = public.invoices.medicine_cost + public.invoices.lab_cost + EXCLUDED.consultation_fee + EXCLUDED.service_charge;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_invoice_on_appt_completed ON public.appointments;
CREATE TRIGGER trg_invoice_on_appt_completed
AFTER UPDATE OF status ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.fn_invoice_on_appt_completed();

-- Add lab fee to invoice when a lab_request is completed
CREATE OR REPLACE FUNCTION public.fn_lab_fee_to_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  inv_id uuid;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') AND NEW.appointment_id IS NOT NULL THEN
    SELECT id INTO inv_id FROM public.invoices WHERE appointment_id = NEW.appointment_id;
    IF inv_id IS NOT NULL THEN
      UPDATE public.invoices
        SET lab_cost = lab_cost + COALESCE(NEW.test_fee, 0),
            amount   = consultation_fee + medicine_cost + lab_cost + COALESCE(NEW.test_fee, 0) + service_charge
        WHERE id = inv_id;
    ELSE
      INSERT INTO public.invoices (patient_id, appointment_id, description, lab_cost, subtotal, amount, status)
      VALUES (NEW.patient_id, NEW.appointment_id, 'Lab tests', NEW.test_fee, NEW.test_fee, NEW.test_fee, 'pending');
    END IF;
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lab_fee_to_invoice ON public.lab_requests;
CREATE TRIGGER trg_lab_fee_to_invoice
BEFORE UPDATE OF status ON public.lab_requests
FOR EACH ROW EXECUTE FUNCTION public.fn_lab_fee_to_invoice();

-- Decrement stock + add medicine cost when prescription dispensed
CREATE OR REPLACE FUNCTION public.fn_dispense_prescription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  unit_price numeric := 0;
  appt_id uuid;
  inv_id uuid;
  cost numeric := 0;
BEGIN
  IF NEW.status = 'dispensed' AND (OLD.status IS DISTINCT FROM 'dispensed') THEN
    IF NEW.drug_id IS NOT NULL THEN
      SELECT COALESCE(d.unit_price, 0) INTO unit_price FROM public.drugs d WHERE d.id = NEW.drug_id;
      UPDATE public.drugs SET stock = GREATEST(stock - NEW.quantity, 0) WHERE id = NEW.drug_id;
    END IF;
    cost := unit_price * NEW.quantity;
    NEW.dispensed_at := now();

    -- Find linked invoice via medical_record -> appointment
    SELECT mr.appointment_id INTO appt_id FROM public.medical_records mr WHERE mr.id = NEW.record_id;
    IF appt_id IS NOT NULL THEN
      SELECT id INTO inv_id FROM public.invoices WHERE appointment_id = appt_id;
      IF inv_id IS NOT NULL THEN
        UPDATE public.invoices
          SET medicine_cost = medicine_cost + cost,
              amount = consultation_fee + medicine_cost + cost + lab_cost + service_charge
          WHERE id = inv_id;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_dispense_prescription ON public.prescriptions;
CREATE TRIGGER trg_dispense_prescription
BEFORE UPDATE OF status ON public.prescriptions
FOR EACH ROW EXECUTE FUNCTION public.fn_dispense_prescription();

-- =========================================================
-- RLS — lab_requests
-- =========================================================
DROP POLICY IF EXISTS "patient view own lab requests" ON public.lab_requests;
CREATE POLICY "patient view own lab requests" ON public.lab_requests
  FOR SELECT USING (auth.uid() = patient_id);

DROP POLICY IF EXISTS "staff view lab requests" ON public.lab_requests;
CREATE POLICY "staff view lab requests" ON public.lab_requests
  FOR SELECT USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS "doctor create lab requests" ON public.lab_requests;
CREATE POLICY "doctor create lab requests" ON public.lab_requests
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'doctor') OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "lab tech update requests" ON public.lab_requests;
CREATE POLICY "lab tech update requests" ON public.lab_requests
  FOR UPDATE USING (public.is_lab_tech(auth.uid()) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_lab_tech(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- RLS — vitals (nurse already covered by is_staff which now includes nurse)
-- =========================================================
-- vitals existing policies use is_staff — already updated above.

-- =========================================================
-- RLS — lab_results: lab_tech can manage
-- =========================================================
DROP POLICY IF EXISTS "lab tech manage results" ON public.lab_results;
CREATE POLICY "lab tech manage results" ON public.lab_results
  FOR ALL USING (public.is_lab_tech(auth.uid())) WITH CHECK (public.is_lab_tech(auth.uid()));

-- 1. Extend enums
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'pharmacist';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'receptionist';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'accountant';

ALTER TYPE public.appt_status ADD VALUE IF NOT EXISTS 'checked_in';
ALTER TYPE public.appt_status ADD VALUE IF NOT EXISTS 'waiting_for_nurse';

-- 2. New columns
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ;
ALTER TABLE public.lab_results ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;

-- 3. Refresh is_staff to include new roles
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles
    WHERE user_id=_user_id
    AND role IN ('staff','admin','doctor','nurse','lab_technician','pharmacist','receptionist','accountant'))
$$;

CREATE OR REPLACE FUNCTION public.is_pharmacist(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role='pharmacist') $$;

CREATE OR REPLACE FUNCTION public.is_receptionist(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role='receptionist') $$;

CREATE OR REPLACE FUNCTION public.is_accountant(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role='accountant') $$;

-- 4. Receptionist + accountant invoice/appointment access (is_staff already covers most)
CREATE POLICY "receptionist update appts" ON public.appointments FOR UPDATE
  USING (public.is_receptionist(auth.uid())) WITH CHECK (public.is_receptionist(auth.uid()));

-- 5. Notifications table
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_role public.app_role NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see notifications for their roles" ON public.notifications FOR SELECT
  USING (EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.role=notifications.recipient_role));
CREATE POLICY "users mark their notifications read" ON public.notifications FOR UPDATE
  USING (EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.role=notifications.recipient_role))
  WITH CHECK (EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=auth.uid() AND ur.role=notifications.recipient_role));
CREATE POLICY "admin manage notifications" ON public.notifications FOR ALL
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE INDEX idx_notifications_role_unread ON public.notifications(recipient_role) WHERE read_at IS NULL;

-- 6. Activity logs (audit)
CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  action TEXT NOT NULL,
  patient_id UUID,
  record_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin read activity logs" ON public.activity_logs FOR SELECT
  USING (public.has_role(auth.uid(),'admin'));
CREATE POLICY "auth users insert activity logs" ON public.activity_logs FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE INDEX idx_activity_logs_record ON public.activity_logs(record_id);
CREATE INDEX idx_activity_logs_patient ON public.activity_logs(patient_id);

-- 7. Low-stock notification trigger
CREATE OR REPLACE FUNCTION public.fn_notify_low_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.stock < 50 AND (OLD.stock IS NULL OR OLD.stock >= 50) THEN
    INSERT INTO public.notifications (recipient_role, title, body, link)
    VALUES ('admin', 'Low stock: ' || NEW.name,
            'Stock dropped to ' || NEW.stock || ' units. Consider restocking.',
            '/inventory');
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_low_stock ON public.drugs;
CREATE TRIGGER trg_notify_low_stock AFTER UPDATE OF stock ON public.drugs
  FOR EACH ROW EXECUTE FUNCTION public.fn_notify_low_stock();

-- 8. Audit trigger for medical record edits
CREATE OR REPLACE FUNCTION public.fn_log_record_edit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.activity_logs (user_id, action, patient_id, record_id)
  VALUES (auth.uid(), 'edit_record', NEW.patient_id, NEW.id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_log_record_edit ON public.medical_records;
CREATE TRIGGER trg_log_record_edit AFTER UPDATE ON public.medical_records
  FOR EACH ROW EXECUTE FUNCTION public.fn_log_record_edit();
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
  AND NOT EXISTS (SELECT 1 FROM public.doctors d WHERE d.profile_id = ur.user_id);-- Add status column to profiles and doctors for non-destructive deactivation
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
DELETE FROM public.doctors WHERE profile_id IS NULL;
-- =========================================================
-- 1. Accountant SELECT policies
-- =========================================================
CREATE POLICY "accountant view lab requests" ON public.lab_requests
  FOR SELECT USING (public.is_accountant(auth.uid()));

CREATE POLICY "accountant view prescriptions" ON public.prescriptions
  FOR SELECT USING (public.is_accountant(auth.uid()));

CREATE POLICY "accountant view drug dispenses" ON public.drug_dispenses
  FOR SELECT USING (public.is_accountant(auth.uid()));

CREATE POLICY "accountant view medical records" ON public.medical_records
  FOR SELECT USING (public.is_accountant(auth.uid()));

-- =========================================================
-- 2. Invoice recalc helper + new triggers
-- =========================================================
CREATE OR REPLACE FUNCTION public.fn_recalc_invoice(_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sub numeric := 0;
  svc numeric := 0;
BEGIN
  SELECT COALESCE(consultation_fee,0) + COALESCE(medicine_cost,0) + COALESCE(lab_cost,0)
    INTO sub
    FROM public.invoices WHERE id = _invoice_id;
  svc := round(sub * 0.10, 2);
  UPDATE public.invoices
    SET subtotal = sub,
        service_charge = svc,
        amount = sub + svc
  WHERE id = _invoice_id;
END $$;

-- Replace appt-completed trigger fn: insert/update with consult fee, then recalc
CREATE OR REPLACE FUNCTION public.fn_invoice_on_appt_completed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fee numeric := 0;
  inv_id uuid;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    IF NEW.doctor_id IS NOT NULL THEN
      SELECT COALESCE(consultation_fee, 0) INTO fee FROM public.doctors WHERE id = NEW.doctor_id;
    END IF;

    INSERT INTO public.invoices (patient_id, appointment_id, description, consultation_fee, service_charge, subtotal, amount, status)
    VALUES (NEW.patient_id, NEW.id, 'Consultation', fee, round(fee*0.10,2), fee, fee + round(fee*0.10,2), 'pending')
    ON CONFLICT (appointment_id) DO UPDATE
      SET consultation_fee = EXCLUDED.consultation_fee
    RETURNING id INTO inv_id;

    PERFORM public.fn_recalc_invoice(inv_id);
  END IF;
  RETURN NEW;
END $$;

-- Replace lab-fee trigger fn
CREATE OR REPLACE FUNCTION public.fn_lab_fee_to_invoice()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv_id uuid;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') AND NEW.appointment_id IS NOT NULL THEN
    SELECT id INTO inv_id FROM public.invoices WHERE appointment_id = NEW.appointment_id;
    IF inv_id IS NOT NULL THEN
      UPDATE public.invoices
        SET lab_cost = COALESCE(lab_cost,0) + COALESCE(NEW.test_fee, 0)
        WHERE id = inv_id;
    ELSE
      INSERT INTO public.invoices (patient_id, appointment_id, description, lab_cost, subtotal, amount, status)
      VALUES (NEW.patient_id, NEW.appointment_id, 'Lab tests', COALESCE(NEW.test_fee,0), COALESCE(NEW.test_fee,0), COALESCE(NEW.test_fee,0), 'pending')
      RETURNING id INTO inv_id;
    END IF;
    PERFORM public.fn_recalc_invoice(inv_id);
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END $$;

-- Replace dispense trigger fn
CREATE OR REPLACE FUNCTION public.fn_dispense_prescription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  unit_price numeric := 0;
  appt_id uuid;
  inv_id uuid;
  cost numeric := 0;
BEGIN
  IF NEW.status = 'dispensed' AND (OLD.status IS DISTINCT FROM 'dispensed') THEN
    IF NEW.drug_id IS NOT NULL THEN
      SELECT COALESCE(d.unit_price, 0) INTO unit_price FROM public.drugs d WHERE d.id = NEW.drug_id;
      UPDATE public.drugs SET stock = GREATEST(stock - NEW.quantity, 0) WHERE id = NEW.drug_id;
    END IF;
    cost := unit_price * NEW.quantity;
    NEW.dispensed_at := now();

    SELECT mr.appointment_id INTO appt_id FROM public.medical_records mr WHERE mr.id = NEW.record_id;
    IF appt_id IS NOT NULL THEN
      SELECT id INTO inv_id FROM public.invoices WHERE appointment_id = appt_id;
      IF inv_id IS NULL THEN
        INSERT INTO public.invoices (patient_id, appointment_id, description, medicine_cost, subtotal, amount, status)
        VALUES (NEW.patient_id, appt_id, 'Medication', cost, cost, cost, 'pending')
        RETURNING id INTO inv_id;
      ELSE
        UPDATE public.invoices SET medicine_cost = COALESCE(medicine_cost,0) + cost WHERE id = inv_id;
      END IF;
      PERFORM public.fn_recalc_invoice(inv_id);
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Ensure triggers exist (recreate to be safe; idempotent)
DROP TRIGGER IF EXISTS trg_invoice_on_appt_completed ON public.appointments;
CREATE TRIGGER trg_invoice_on_appt_completed
  AFTER UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.fn_invoice_on_appt_completed();

DROP TRIGGER IF EXISTS trg_lab_fee_to_invoice ON public.lab_requests;
CREATE TRIGGER trg_lab_fee_to_invoice
  BEFORE UPDATE ON public.lab_requests
  FOR EACH ROW EXECUTE FUNCTION public.fn_lab_fee_to_invoice();

DROP TRIGGER IF EXISTS trg_dispense_prescription ON public.prescriptions;
CREATE TRIGGER trg_dispense_prescription
  BEFORE UPDATE ON public.prescriptions
  FOR EACH ROW EXECUTE FUNCTION public.fn_dispense_prescription();

-- Backfill existing invoices
UPDATE public.invoices SET subtotal = COALESCE(consultation_fee,0)+COALESCE(medicine_cost,0)+COALESCE(lab_cost,0);
UPDATE public.invoices SET service_charge = round(subtotal*0.10, 2);
UPDATE public.invoices SET amount = subtotal + service_charge;

-- =========================================================
-- 3. appointments.doctor_email + privacy
-- =========================================================
ALTER TABLE public.appointments ADD COLUMN IF NOT EXISTS doctor_email text;
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_email ON public.appointments(doctor_email);

CREATE OR REPLACE FUNCTION public.fn_set_appointment_doctor_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e text;
BEGIN
  IF NEW.doctor_id IS NOT NULL THEN
    SELECT u.email INTO e
      FROM public.doctors d
      JOIN auth.users u ON u.id = d.profile_id
      WHERE d.id = NEW.doctor_id;
    NEW.doctor_email := e;
  ELSE
    NEW.doctor_email := NULL;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_set_appointment_doctor_email ON public.appointments;
CREATE TRIGGER trg_set_appointment_doctor_email
  BEFORE INSERT OR UPDATE OF doctor_id ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_appointment_doctor_email();

-- Backfill
UPDATE public.appointments a
  SET doctor_email = u.email
  FROM public.doctors d
  JOIN auth.users u ON u.id = d.profile_id
  WHERE a.doctor_id = d.id;

-- Tighten doctor visibility on appointments
DROP POLICY IF EXISTS "doctor view all appts" ON public.appointments;
CREATE POLICY "doctor view own appts by email" ON public.appointments
  FOR SELECT USING (
    public.has_role(auth.uid(), 'doctor')
    AND doctor_email = (auth.jwt() ->> 'email')
  );

-- Tighten doctor visibility on medical records (only their own)
DROP POLICY IF EXISTS "doctor view all records" ON public.medical_records;
CREATE POLICY "doctor view own records" ON public.medical_records
  FOR SELECT USING (
    public.has_role(auth.uid(), 'doctor')
    AND doctor_id = public.current_doctor_id()
  );

-- =========================================================
-- 4. vitals.appointment_id + handover notification
-- =========================================================
ALTER TABLE public.vitals ADD COLUMN IF NOT EXISTS appointment_id uuid;
CREATE INDEX IF NOT EXISTS idx_vitals_appointment_recorded
  ON public.vitals(appointment_id, recorded_at DESC);

CREATE OR REPLACE FUNCTION public.fn_notify_vitals_ready()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pname text;
BEGIN
  IF NEW.appointment_id IS NOT NULL THEN
    SELECT p.full_name INTO pname FROM public.profiles p WHERE p.id = NEW.patient_id;
    INSERT INTO public.notifications (recipient_role, title, body, link)
    VALUES ('doctor', 'Vitals ready: ' || COALESCE(pname,'patient'),
            'Nurse has recorded vitals for the upcoming consultation.',
            '/appointments');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_vitals_ready ON public.vitals;
CREATE TRIGGER trg_notify_vitals_ready
  AFTER INSERT ON public.vitals
  FOR EACH ROW EXECUTE FUNCTION public.fn_notify_vitals_ready();

-- 1) Lab workflow: auto-invoice on insert, default status, release on payment
CREATE OR REPLACE FUNCTION public.fn_lab_default_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status IS NULL OR NEW.status = 'pending' THEN
    NEW.status := 'awaiting_payment';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lab_default_status ON public.lab_requests;
CREATE TRIGGER trg_lab_default_status
BEFORE INSERT ON public.lab_requests
FOR EACH ROW EXECUTE FUNCTION public.fn_lab_default_status();

CREATE OR REPLACE FUNCTION public.fn_lab_request_to_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv_id uuid;
BEGIN
  IF NEW.appointment_id IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO inv_id FROM public.invoices WHERE appointment_id = NEW.appointment_id;
  IF inv_id IS NULL THEN
    INSERT INTO public.invoices (patient_id, appointment_id, description, lab_cost, subtotal, amount, status)
    VALUES (NEW.patient_id, NEW.appointment_id, 'Lab tests', COALESCE(NEW.test_fee,0), COALESCE(NEW.test_fee,0), COALESCE(NEW.test_fee,0), 'pending')
    RETURNING id INTO inv_id;
  ELSE
    UPDATE public.invoices SET lab_cost = COALESCE(lab_cost,0) + COALESCE(NEW.test_fee,0) WHERE id = inv_id;
  END IF;
  PERFORM public.fn_recalc_invoice(inv_id);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lab_request_to_invoice ON public.lab_requests;
CREATE TRIGGER trg_lab_request_to_invoice
AFTER INSERT ON public.lab_requests
FOR EACH ROW EXECUTE FUNCTION public.fn_lab_request_to_invoice();

CREATE OR REPLACE FUNCTION public.fn_invoice_paid_release_labs()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' AND NEW.appointment_id IS NOT NULL THEN
    UPDATE public.lab_requests
      SET status = 'pending'
      WHERE appointment_id = NEW.appointment_id AND status = 'awaiting_payment';
    INSERT INTO public.notifications (recipient_role, title, body, link)
    VALUES ('lab_technician', 'Lab tests ready', 'Payment received. Linked tests are now ready for processing.', '/lab-requests');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_invoice_paid_release_labs ON public.invoices;
CREATE TRIGGER trg_invoice_paid_release_labs
AFTER UPDATE ON public.invoices
FOR EACH ROW EXECUTE FUNCTION public.fn_invoice_paid_release_labs();

-- 2) Doctor cross-patient view (referral / emergency). Audit handled in app.
DROP POLICY IF EXISTS "doctor view any medical record" ON public.medical_records;
CREATE POLICY "doctor view any medical record" ON public.medical_records
FOR SELECT USING (has_role(auth.uid(), 'doctor'::app_role));

DROP POLICY IF EXISTS "doctor view any lab result" ON public.lab_results;
CREATE POLICY "doctor view any lab result" ON public.lab_results
FOR SELECT USING (has_role(auth.uid(), 'doctor'::app_role));

DROP POLICY IF EXISTS "doctor view any vitals" ON public.vitals;
CREATE POLICY "doctor view any vitals" ON public.vitals
FOR SELECT USING (has_role(auth.uid(), 'doctor'::app_role));

DROP POLICY IF EXISTS "doctor view any allergy" ON public.allergies;
CREATE POLICY "doctor view any allergy" ON public.allergies
FOR SELECT USING (has_role(auth.uid(), 'doctor'::app_role));

DROP POLICY IF EXISTS "doctor view any prescription" ON public.prescriptions;
CREATE POLICY "doctor view any prescription" ON public.prescriptions
FOR SELECT USING (has_role(auth.uid(), 'doctor'::app_role));

-- 3) Patient lookup by email (RPC, safe – doctors/admins only)
CREATE OR REPLACE FUNCTION public.find_patient_by_email(_email text)
RETURNS TABLE (id uuid, full_name text, email text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (has_role(auth.uid(),'doctor'::app_role) OR has_role(auth.uid(),'admin'::app_role)) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT p.id, p.full_name, u.email::text
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    JOIN public.user_roles ur ON ur.user_id = u.id AND ur.role = 'patient'::app_role
    WHERE lower(u.email) = lower(_email)
    LIMIT 1;
END $$;

CREATE OR REPLACE FUNCTION public.fn_lab_fee_to_invoice()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    NEW.completed_at := now();
  END IF;
  RETURN NEW;
END $$;

-- 1. Receptionist SELECT policy on appointments
DROP POLICY IF EXISTS "receptionist view appointments" ON public.appointments;
CREATE POLICY "receptionist view appointments"
  ON public.appointments FOR SELECT
  USING (public.is_receptionist(auth.uid()));

-- 2. New appt status
ALTER TYPE public.appt_status ADD VALUE IF NOT EXISTS 'awaiting_payment';

-- 3. Trigger: on check-in, create/update consultation invoice
CREATE OR REPLACE FUNCTION public.fn_invoice_on_checkin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  fee numeric := 0;
  inv_id uuid;
BEGIN
  IF NEW.checked_in_at IS NOT NULL AND OLD.checked_in_at IS NULL THEN
    IF NEW.doctor_id IS NOT NULL THEN
      SELECT COALESCE(consultation_fee, 0) INTO fee FROM public.doctors WHERE id = NEW.doctor_id;
    END IF;

    SELECT id INTO inv_id FROM public.invoices WHERE appointment_id = NEW.id;
    IF inv_id IS NULL THEN
      INSERT INTO public.invoices (patient_id, appointment_id, description, consultation_fee, subtotal, amount, status)
      VALUES (NEW.patient_id, NEW.id, 'Consultation', fee, fee, fee, 'pending')
      RETURNING id INTO inv_id;
    ELSE
      UPDATE public.invoices SET consultation_fee = fee WHERE id = inv_id;
    END IF;
    PERFORM public.fn_recalc_invoice(inv_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_invoice_on_checkin ON public.appointments;
CREATE TRIGGER trg_invoice_on_checkin
  AFTER UPDATE OF checked_in_at ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.fn_invoice_on_checkin();

-- 4. Extend invoice-paid trigger to also release consultation appointments
CREATE OR REPLACE FUNCTION public.fn_invoice_paid_release_labs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status = 'paid' AND OLD.status IS DISTINCT FROM 'paid' AND NEW.appointment_id IS NOT NULL THEN
    UPDATE public.lab_requests
      SET status = 'pending'
      WHERE appointment_id = NEW.appointment_id AND status = 'awaiting_payment';

    UPDATE public.appointments
      SET status = 'confirmed'
      WHERE id = NEW.appointment_id AND status = 'awaiting_payment';

    INSERT INTO public.notifications (recipient_role, title, body, link)
    VALUES ('lab_technician', 'Lab tests ready', 'Payment received. Linked tests are now ready for processing.', '/lab-requests');

    INSERT INTO public.notifications (recipient_role, title, body, link)
    VALUES ('doctor', 'Consultation ready', 'Patient payment received. Ready for consultation.', '/appointments');
  END IF;
  RETURN NEW;
END $$;

-- 1. Add new enum value
ALTER TYPE invoice_status ADD VALUE IF NOT EXISTS 'pending_verification';

-- Trigger: when a payment is inserted, set invoice to pending_verification + notify accountant
CREATE OR REPLACE FUNCTION public.fn_payment_pending_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pname text;
BEGIN
  IF NEW.invoice_id IS NOT NULL THEN
    UPDATE public.invoices
      SET status = 'pending_verification'
      WHERE id = NEW.invoice_id AND status <> 'paid';

    SELECT p.full_name INTO pname FROM public.profiles p WHERE p.id = NEW.patient_id;

    INSERT INTO public.notifications (recipient_role, title, body, link)
    VALUES (
      'accountant',
      'Payment awaiting verification',
      COALESCE(pname,'A patient') || ' submitted a payment of GHS ' || NEW.amount::text || ' (' || NEW.reference || ').',
      '/billing-center'
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_payment_pending_verification ON public.payments;
CREATE TRIGGER trg_payment_pending_verification
  AFTER INSERT ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.fn_payment_pending_verification();

-- Realtime
ALTER TABLE public.invoices REPLICA IDENTITY FULL;
ALTER TABLE public.payments REPLICA IDENTITY FULL;
ALTER TABLE public.appointments REPLICA IDENTITY FULL;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.payments; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;
ALTER TABLE public.vitals REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vitals;
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
CREATE POLICY "doctor insert prescriptions"
ON public.prescriptions FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'doctor'));

CREATE POLICY "doctor insert vitals"
ON public.vitals FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'doctor'));ALTER TABLE public.invoices ADD CONSTRAINT invoices_appointment_id_unique UNIQUE (appointment_id);ALTER TABLE public.doctors ADD CONSTRAINT doctors_profile_id_unique UNIQUE (profile_id);
-- =========================================
-- APPOINTMENT REMINDERS
-- =========================================
CREATE TABLE IF NOT EXISTS public.appointment_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL,
  patient_id uuid NOT NULL,
  sent_by uuid,
  channel text NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app','sms','email')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
  message text,
  sent_at timestamptz,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_on date GENERATED ALWAYS AS ((created_at AT TIME ZONE 'UTC')::date) STORED
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_reminder_per_day
  ON public.appointment_reminders (appointment_id, channel, created_on);

ALTER TABLE public.appointment_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff manage reminders" ON public.appointment_reminders
  FOR ALL USING (is_staff(auth.uid())) WITH CHECK (is_staff(auth.uid()));

CREATE POLICY "patient view own reminders" ON public.appointment_reminders
  FOR SELECT USING (auth.uid() = patient_id);

CREATE OR REPLACE FUNCTION public.fn_deliver_reminder()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.channel = 'in_app' THEN
    INSERT INTO public.notifications (recipient_role, title, body, link)
    VALUES ('patient', 'Appointment reminder',
            COALESCE(NEW.message, 'You have an appointment tomorrow.'),
            '/appointments');
    NEW.status := 'sent';
    NEW.sent_at := now();
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_deliver_reminder ON public.appointment_reminders;
CREATE TRIGGER trg_deliver_reminder
  BEFORE INSERT ON public.appointment_reminders
  FOR EACH ROW EXECUTE FUNCTION public.fn_deliver_reminder();

-- =========================================
-- PRIVATE STAFF CHAT
-- =========================================
CREATE TABLE IF NOT EXISTS public.staff_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL,
  user_b uuid NOT NULL,
  last_message_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_conv_pair_unique UNIQUE (user_a, user_b),
  CONSTRAINT staff_conv_ordered CHECK (user_a < user_b)
);

CREATE TABLE IF NOT EXISTS public.staff_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.staff_conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  body text,
  attachment_url text,
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent','delivered','read')),
  read_at timestamptz,
  deleted_for_sender boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_messages_conv ON public.staff_messages (conversation_id, created_at);

CREATE TABLE IF NOT EXISTS public.staff_presence (
  user_id uuid PRIMARY KEY,
  status text NOT NULL DEFAULT 'offline' CHECK (status IN ('online','offline')),
  typing_in_conversation uuid,
  last_seen timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participants read conv" ON public.staff_conversations
  FOR SELECT USING (auth.uid() = user_a OR auth.uid() = user_b);
CREATE POLICY "staff create conv" ON public.staff_conversations
  FOR INSERT WITH CHECK (
    is_staff(auth.uid()) AND (auth.uid() = user_a OR auth.uid() = user_b)
  );
CREATE POLICY "participants update conv" ON public.staff_conversations
  FOR UPDATE USING (auth.uid() = user_a OR auth.uid() = user_b)
  WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "participants read msg" ON public.staff_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.staff_conversations c
            WHERE c.id = conversation_id
              AND (auth.uid() = c.user_a OR auth.uid() = c.user_b))
  );
CREATE POLICY "participants send msg" ON public.staff_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (SELECT 1 FROM public.staff_conversations c
            WHERE c.id = conversation_id
              AND (auth.uid() = c.user_a OR auth.uid() = c.user_b))
  );
CREATE POLICY "participants update msg" ON public.staff_messages
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.staff_conversations c
            WHERE c.id = conversation_id
              AND (auth.uid() = c.user_a OR auth.uid() = c.user_b))
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.staff_conversations c
            WHERE c.id = conversation_id
              AND (auth.uid() = c.user_a OR auth.uid() = c.user_b))
  );

CREATE POLICY "staff read presence" ON public.staff_presence
  FOR SELECT USING (is_staff(auth.uid()));
CREATE POLICY "user upsert own presence" ON public.staff_presence
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user update own presence" ON public.staff_presence
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.fn_bump_conversation()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.staff_conversations
    SET last_message_at = NEW.created_at
    WHERE id = NEW.conversation_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_bump_conv ON public.staff_messages;
CREATE TRIGGER trg_bump_conv AFTER INSERT ON public.staff_messages
  FOR EACH ROW EXECUTE FUNCTION public.fn_bump_conversation();

-- =========================================
-- FOUND FAMILY GROUP CHAT
-- =========================================
CREATE TABLE IF NOT EXISTS public.staff_group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  body text,
  attachment_url text,
  reply_to uuid REFERENCES public.staff_group_messages(id) ON DELETE SET NULL,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_group_msg_created ON public.staff_group_messages (created_at);

CREATE TABLE IF NOT EXISTS public.staff_group_reactions (
  message_id uuid NOT NULL REFERENCES public.staff_group_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

CREATE TABLE IF NOT EXISTS public.staff_group_mutes (
  user_id uuid PRIMARY KEY,
  muted_until timestamptz NOT NULL,
  muted_by uuid,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_group_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_group_mutes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read group" ON public.staff_group_messages
  FOR SELECT USING (is_staff(auth.uid()));
CREATE POLICY "staff post group" ON public.staff_group_messages
  FOR INSERT WITH CHECK (
    is_staff(auth.uid()) AND sender_id = auth.uid() AND
    NOT EXISTS (SELECT 1 FROM public.staff_group_mutes m
                WHERE m.user_id = auth.uid() AND m.muted_until > now())
  );
CREATE POLICY "admin pin group" ON public.staff_group_messages
  FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "staff read reactions" ON public.staff_group_reactions
  FOR SELECT USING (is_staff(auth.uid()));
CREATE POLICY "staff add reaction" ON public.staff_group_reactions
  FOR INSERT WITH CHECK (is_staff(auth.uid()) AND user_id = auth.uid());
CREATE POLICY "staff remove own reaction" ON public.staff_group_reactions
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "staff read mutes" ON public.staff_group_mutes
  FOR SELECT USING (is_staff(auth.uid()));
CREATE POLICY "admin manage mutes" ON public.staff_group_mutes
  FOR ALL USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-attachments', 'chat-attachments', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "auth read chat-attachments" ON storage.objects
  FOR SELECT USING (bucket_id = 'chat-attachments' AND auth.uid() IS NOT NULL);
CREATE POLICY "staff upload chat-attachments" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'chat-attachments' AND is_staff(auth.uid()));
CREATE POLICY "owner delete chat-attachments" ON storage.objects
  FOR DELETE USING (bucket_id = 'chat-attachments' AND owner = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.appointment_reminders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_presence;
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_group_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_group_reactions;
