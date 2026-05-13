
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
