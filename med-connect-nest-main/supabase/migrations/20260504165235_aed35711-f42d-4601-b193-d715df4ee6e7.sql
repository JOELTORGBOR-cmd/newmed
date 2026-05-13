
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
