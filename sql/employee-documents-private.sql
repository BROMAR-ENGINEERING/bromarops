-- Make the employee-documents bucket private and limit access to admins.
-- Run in the Supabase SQL editor (project iwtvlpfprxqwveqadlwl). NOT applied automatically.
-- Deploy the matching Ops code (employees.js V1.14) first or at the same time,
-- otherwise images will stop loading until it is live.

update storage.buckets set public = false where id = 'employee-documents';

-- Admin = employees.is_admin for the signed-in user's email (same rule as login.html).
drop policy if exists "employee-documents admin all" on storage.objects;
create policy "employee-documents admin all"
on storage.objects for all to authenticated
using (
  bucket_id = 'employee-documents'
  and exists (select 1 from public.employees e
              where lower(e.email) = lower(auth.jwt() ->> 'email') and e.is_admin = true)
)
with check (
  bucket_id = 'employee-documents'
  and exists (select 1 from public.employees e
              where lower(e.email) = lower(auth.jwt() ->> 'email') and e.is_admin = true)
);

-- Also drop any older permissive policies on this bucket (check Storage > Policies):
--   select policyname from pg_policies where schemaname='storage' and tablename='objects';
-- Employee self-access for the Hub (optional) would need a policy on the folder name
-- (files are stored under "<safe full name>/..."), e.g. matching employees.full_name.
