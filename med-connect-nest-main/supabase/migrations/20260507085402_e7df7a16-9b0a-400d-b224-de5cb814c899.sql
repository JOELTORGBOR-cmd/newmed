create or replace function public.email_has_invitation(_email text)
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
grant execute on function public.email_has_invitation(text) to anon, authenticated;