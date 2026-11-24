-- Issue #6: enforce Ops admin access in Postgres (RLS), not just in the browser.
-- Run in the Supabase SQL editor (project iwtvlpfprxqwveqadlwl). NOT applied automatically.
-- Shared project: affects Bromar Hub too. Read the notes below BEFORE running.
--
-- Approach
--   * public.is_admin()  : true when the caller's JWT email matches an employees row with is_admin = true.
--   * RESTRICTIVE policies are added on top of whatever policies already exist. Restrictive policies are
--     AND-ed with the existing permissive ones, so this migration can only REMOVE access, never add it,
--     and it does not need to know the current (dashboard-only) policies.
--   * Field-staff paths the Hub needs stay open: tables in tier B keep read access for signed-in users,
--     and only writes become admin-only.
--   * Restrictive policies only apply when RLS is enabled on the table. This script does NOT enable RLS
--     (enabling it on a table with no permissive policy would lock everyone out). See step 0.
--
-- Step 0 (check first): which tables have RLS off?
--   select tablename from pg_tables where schemaname='public' and not rowsecurity order by 1;
--   For each table in the lists below that shows up, make sure a permissive policy exists for the
--   Hub's needs, then `alter table public.<t> enable row level security;`
--
-- Step 1: test in Ops AND Hub with a non-admin account after running. Rollback at the bottom.

-- ---------------------------------------------------------------------------
-- 1. Helper
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER so the lookup on employees is not itself blocked/recursed by employees RLS.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.employees e
    where lower(e.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
      and e.is_admin = true
  );
$$;

revoke all on function public.is_admin() from public;
-- anon needs execute too, otherwise any policy that calls it errors for anon instead of returning false.
grant execute on function public.is_admin() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Policies (table-driven; missing tables are skipped)
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  c text;
  -- Tier A: Ops-only tables. Admins only, for reads and writes. Hub does not touch these (per Ops code).
  tier_a text[] := array[
    'suppliers','quotes','quote_favourites','test_tag_reports',
    'job_number_counters','client_users'
  ];
  -- Tier B: Hub (or field staff) needs to READ these. Writes are admin only.
  tier_b text[] := array[
    'callout_roster','rdo_roster','public_holidays',
    'job_number_register','clients','client_sites','site_contacts',
    'job_types','job_type_fields',
    'ims_documents','ims_document_revisions','swms_templates',
    'schedule_assignments','pinned_sites',
    'materials','purchase_orders','purchase_order_items',
    'equipment_categories','cert_types',
    'employee_certs','employee_cert_history','employee_skills','inductions',
    'vehicle_costs','fuel_transactions'
  ];
begin
  -- Tier A: one restrictive ALL policy
  foreach t in array tier_a loop
    if to_regclass('public.'||t) is not null then
      execute format('drop policy if exists %I on public.%I', 'admin_only_'||t, t);
      execute format(
        'create policy %I on public.%I as restrictive for all to anon, authenticated using (public.is_admin()) with check (public.is_admin())',
        'admin_only_'||t, t);
    end if;
  end loop;

  -- Tier B: restrictive policies on INSERT / UPDATE / DELETE only (SELECT left as-is)
  foreach t in array tier_b loop
    if to_regclass('public.'||t) is not null then
      foreach c in array array['insert','update','delete'] loop
        execute format('drop policy if exists %I on public.%I', 'admin_write_'||c||'_'||t, t);
        if c = 'insert' then
          execute format(
            'create policy %I on public.%I as restrictive for insert to anon, authenticated with check (public.is_admin())',
            'admin_write_'||c||'_'||t, t);
        elsif c = 'update' then
          execute format(
            'create policy %I on public.%I as restrictive for update to anon, authenticated using (public.is_admin()) with check (public.is_admin())',
            'admin_write_'||c||'_'||t, t);
        else
          execute format(
            'create policy %I on public.%I as restrictive for delete to anon, authenticated using (public.is_admin())',
            'admin_write_'||c||'_'||t, t);
        end if;
      end loop;
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Tables with special rules
-- ---------------------------------------------------------------------------

-- employees: everyone signed in can read (Hub + login check). Only admins insert/delete.
-- UPDATE: admins, or a user editing their own row (Hub profile edits).
-- NOTE: a user editing their own row could set is_admin = true. The trigger below blocks that.
do $$ begin
  if to_regclass('public.employees') is not null then
    drop policy if exists admin_write_insert_employees on public.employees;
    drop policy if exists admin_write_update_employees on public.employees;
    drop policy if exists admin_write_delete_employees on public.employees;
    create policy admin_write_insert_employees on public.employees as restrictive for insert
      to anon, authenticated with check (public.is_admin());
    create policy admin_write_update_employees on public.employees as restrictive for update
      to anon, authenticated
      using (public.is_admin() or lower(email) = lower(coalesce(auth.jwt() ->> 'email','')))
      with check (public.is_admin() or lower(email) = lower(coalesce(auth.jwt() ->> 'email','')));
    create policy admin_write_delete_employees on public.employees as restrictive for delete
      to anon, authenticated using (public.is_admin());
  end if;
end $$;

-- Block privilege escalation: only an admin may change is_admin (or email, which is the login key).
create or replace function public.employees_protect_admin_cols()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Allow server-side/service-role/SQL-editor changes (no JWT email).
  if auth.jwt() ->> 'email' is null then return new; end if;
  if not public.is_admin() then
    if new.is_admin is distinct from old.is_admin or new.email is distinct from old.email then
      raise exception 'Only an admin can change is_admin or email';
    end if;
  end if;
  return new;
end $$;

do $$ begin
  if to_regclass('public.employees') is not null then
    drop trigger if exists trg_employees_protect_admin_cols on public.employees;
    create trigger trg_employees_protect_admin_cols before update on public.employees
      for each row execute function public.employees_protect_admin_cols();
  end if;
end $$;

-- feedback_reports: staff (Hub) may submit; only admins may change status or delete.
do $$ begin
  if to_regclass('public.feedback_reports') is not null then
    drop policy if exists admin_write_update_feedback_reports on public.feedback_reports;
    drop policy if exists admin_write_delete_feedback_reports on public.feedback_reports;
    create policy admin_write_update_feedback_reports on public.feedback_reports as restrictive for update
      to anon, authenticated using (public.is_admin()) with check (public.is_admin());
    create policy admin_write_delete_feedback_reports on public.feedback_reports as restrictive for delete
      to anon, authenticated using (public.is_admin());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- NOT covered here (needs a decision / knowledge of Hub behaviour):
--   tasks, notifications, timesheets, job_sheets, leave_requests, vehicle_audits, vehicle_audit_checks,
--   ims_form_submissions, equipment, equipment_records, equipment_movements, vehicles, itc_forms*, swms*,
--   client_access_requests (public portal sign-up), jobs, sites.
--   These are written by field staff / clients, so they need per-row rules (e.g. "own rows only").
--   Storage buckets: employee-documents -> sql/employee-documents-private.sql. Equipment, Templates,
--   test-tag-reports still need admin-only storage policies.
-- ---------------------------------------------------------------------------

-- Rollback (per table):  drop policy admin_only_<t> / admin_write_<insert|update|delete>_<t> on public.<t>;
-- Rollback (all):
--   do $$ declare r record; begin
--     for r in select schemaname, tablename, policyname from pg_policies
--              where schemaname='public' and (policyname like 'admin\_only\_%' or policyname like 'admin\_write\_%')
--     loop execute format('drop policy %I on %I.%I', r.policyname, r.schemaname, r.tablename); end loop;
--   end $$;
