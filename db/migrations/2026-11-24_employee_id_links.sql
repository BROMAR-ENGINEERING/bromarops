-- Issue #18: link records by employees.id instead of name text.
-- Run in the Supabase SQL editor. Shared project: affects Bromar Hub too.
-- Non-breaking: adds nullable columns, keeps employee_name. Run BEFORE deploying Ops V1.37 scheduling.
-- Step 0: check duplicate names first (must return no rows, or fix by hand):
--   select full_name, count(*) from employees group by full_name having count(*) > 1;
-- Step 0b: confirm which tables really have employee_name:
--   select table_name from information_schema.columns
--   where column_name = 'employee_name' and table_schema = 'public';

do $$
declare t text;
begin
  -- Tables known/expected to hold employee_name. Missing tables are skipped.
  foreach t in array array[
    'notifications','schedule_assignments','timesheets','callout_roster','rdo_roster',
    'inductions','employee_skills','employee_certs','employee_cert_history',
    'equipment_movements','swms_signoffs'
  ] loop
    if exists (select 1 from information_schema.columns
               where table_schema='public' and table_name=t and column_name='employee_name') then
      execute format('alter table public.%I add column if not exists employee_id uuid references public.employees(id) on update cascade on delete set null', t);
      execute format('create index if not exists %I on public.%I (employee_id)', t||'_employee_id_idx', t);
      -- Backfill by exact name match
      execute format('update public.%I x set employee_id = e.id from public.employees e where x.employee_id is null and x.employee_name = e.full_name', t);

      -- Safety net: fill employee_id from name when a writer (old Hub/PWA cache) omits it
      execute format($f$
        create or replace function public.%I() returns trigger language plpgsql as $b$
        begin
          if new.employee_id is null and new.employee_name is not null then
            select id into new.employee_id from public.employees where full_name = new.employee_name limit 1;
          end if;
          return new;
        end $b$;$f$, 'fill_employee_id_'||t);
      execute format('drop trigger if exists %I on public.%I', 'trg_fill_employee_id_'||t, t);
      execute format('create trigger %I before insert or update on public.%I for each row execute function public.%I()',
                     'trg_fill_employee_id_'||t, t, 'fill_employee_id_'||t);
    end if;
  end loop;
end $$;

-- Job sheet labour entries: table/column names unconfirmed. Inspect job_sheets first, then add the same
-- employee_id to wherever labour lines live (a jsonb array would need employee_id added inside each entry).

-- Check for unmatched rows after backfill (repeat per table):
--   select count(*) from timesheets where employee_id is null;
-- Do NOT set NOT NULL until Hub writes IDs and the counts are zero.
