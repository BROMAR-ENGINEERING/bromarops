-- Link feedback_reports to the GitHub issue created from them.
alter table public.feedback_reports
  add column if not exists github_issue_number integer,
  add column if not exists github_issue_url text;
