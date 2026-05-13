
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
