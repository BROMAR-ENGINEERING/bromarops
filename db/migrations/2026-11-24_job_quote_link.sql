-- Issue #17: link a job to the quote it was created from.
-- quotes.id is text, so quote_id is text. Safe to run more than once.
alter table public.job_number_register add column if not exists quote_id text;
create index if not exists job_number_register_quote_id_idx on public.job_number_register (quote_id);
