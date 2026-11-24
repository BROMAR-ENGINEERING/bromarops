# CLAUDE.md — Bromar Ops

Guide for Claude (and people) working in this repo. Read this before changing anything.

## 1. What this app is

**Bromar Ops** is the office/admin job management web app for **Bromar Electrical Services (Aust)**.
It covers jobs, quotes, scheduling, timesheets, employees, IMS (ISO quality/safety documents), fleet,
equipment, clients, tasks, materials and admin tools.

- **Hosting:** Netlify (static site, no build step). Repo root is the publish directory.
- **Backend:** Supabase (Postgres + Auth + Storage + Edge Functions), project ref `iwtvlpfprxqwveqadlwl`.
- **Sister app:** **Bromar Hub** — the field-staff app in a separate repo, hosted at `bromarhub.netlify.app`.
  It shares the **same Supabase project** (see section 4). Code comments call it "Bromar Hub".
- **Who can log in:** only users whose `employees` row has `is_admin = true` (checked in `login.html`).
- Installable PWA (`manifest.json`, `sw.js`).

## 2. Pages / modules

The app is a single page shell (`index.html`). Each page is a plain JS file that registers itself on
`window.BromarPages.<id>`; `js/core.js` builds the sidebar and swaps pages by URL hash (`#jobs`, `#quotes`…).

R = reads, W = writes (insert/update/delete). "Fn" = server function called.

| Page (file) | What it does | Supabase tables / storage | Functions called |
|---|---|---|---|
| **Login** (`login.html`) | Email + password sign-in; signs out anyone who isn't admin | R `employees` | — |
| **Dashboard** (`js/pages/dashboard.js`) | Date, Melbourne weather, who's on call-out standby, pending leave requests | R `callout_roster`, `leave_requests` | — |
| **Jobs** (`js/pages/jobs.js`) | Job register (list/create/edit) and per-job overview + PDF | R `job_number_register`, `job_types`, `job_number_counters`, `clients`, `client_sites` (falls back to `sites`), `job_sheets`, `purchase_orders`, `quotes`; W `job_number_register`; RPC `create_new_job` | — |
| **Quotes** (`js/pages/quotes.js`) | Quotes & estimates builder, review/approve flow, favourites, PDF | RW `quotes`, `quote_favourites`; R `clients`, `client_sites` (insert into `jobs` is commented out) | — |
| **Scheduling** (`js/pages/scheduling.js`) | Drag-drop weekly staff schedule; notify staff of changes | RW `schedule_assignments`, `pinned_sites`; W `notifications`; R `employees`, `client_sites`, `job_number_register`, `rdo_roster` | Supabase Edge Fn `send-notification` |
| **Timesheets** (`js/pages/timesheets.js`) | Read-only: who has submitted for the pay week, lookup, analysis, PDF export | R `timesheets`, `employees` | — |
| **Employees** (`js/pages/employees.js`) | Staff records, licences/certs (with history & images), inductions, skills | RW `employees`, `employee_certs`, `cert_types`, `employee_cert_history`, `inductions`, `employee_skills`; header also lists `employee_cert_images`. Storage bucket `employee-documents` | — |
| **IMS** (`js/pages/ims.js` + `js/pages/ims/*`) | ISO management system: Safety / Quality / Environment / Other / Audit / Bromar Hub tabs. Sub-tabs plug in via `window.BromarIMS.registerSubTab()` | see IMS rows below | — |
| ↳ Documents (`ims-document-builder.js`) | Build/version/publish IMS documents & forms, two-person review | RW `ims_documents`, `ims_document_revisions`; R `employees` | — |
| ↳ Audit exports (`ims-audit.js`) | Audit pack PDF, document register CSV, revision log CSV | R `ims_documents`, `ims_document_revisions` | — |
| ↳ Job Types (`ims-bromar-hub-job-requirements.js`) | Manage job types (category, prefix, name) | RW `job_types` | — |
| ↳ Jobsheets (`ims-bromar-hub-jobsheets.js`) | Custom fields per job type shown on the Hub daily jobsheet | R `job_types`, `ims_documents`; RW `job_type_fields` | — |
| ↳ Approved SWMS (`ims-safety-approved-swms.js`) | Read-only SWMS templates | R `swms_templates` | — |
| ↳ Placeholders (`ims-placeholders.js`) | "Coming soon" tabs + SWMS master tab | — | — |
| ↳ SWMS (`ims-safety-swms.js`) ⚠ not loaded | Draft → pending → approved SWMS workflow | RW `swms`, `swms_revisions`, `swms_signoffs`; R `swms_hrcw_categories`, `job_types`, `employees`; Hub reads view `swms_approved_current` | — |
| ↳ ITC builder (`ims-quality-itc-builder.js`) ⚠ not loaded | Inspection & test checklist forms | RW `itc_forms`, `itc_form_revisions` | — |
| ↳ Reports (`ims-reports.js`) ⚠ not loaded | View submitted IMS forms | R `ims_form_submissions`, `ims_documents`, `ims_document_revisions` | — |
| **Fleet** (`js/pages/fleet.js`) | Vehicles, audits (from Hub), fuel card imports, costs | RW `vehicles`, `vehicle_costs`; W `fuel_transactions`, `vehicle_audits` (actioned flag); R `vehicle_audit_checks`, `employees` | — |
| **Equipment** (`js/pages/equipment.js`) | Test equipment register, sign-out/in, calibration records, badge for overdue | RW `equipment`, `equipment_categories`, `equipment_records`; R `equipment_movements`, `employees`, view `v_equipment_compliance`. Storage bucket `Equipment` (private) | — |
| **Clients & Sites** (`js/pages/clients.js`) | Client register, sites, site contacts | RW `clients`, `client_sites`, `site_contacts` | — |
| **Tasks & Announcements** (`js/pages/tasks.js`) | Tasks (completable) and announcements (acknowledgeable) for staff | RW `tasks`; R `employees` | — |
| **Materials** (`js/pages/materials.js`) | Materials register, purchase orders, AI invoice import (admin reviews before save) | RW `materials`, `purchase_orders`, `purchase_order_items` | Netlify Fn `extract-invoice` |
| **Admin Tools** (`js/pages/admin.js`) | Call-out roster, public holidays, RDO roster (xlsx upload), supplier directory, bug/feedback reports | RW `callout_roster`, `public_holidays`, `rdo_roster`, `suppliers`, `feedback_reports`. Storage bucket `Templates` (public xlsx templates) | Supabase Edge Fn `send-notification` (email) |
| ↳ Test & Tag (`js/pages/testtag.js`) | Turns WinPATS HTML export into PDF; register of issued reports | RW `test_tag_reports`. Storage bucket `test-tag-reports` | — |
| ↳ Client Portal (`js/pages/compliance.js`) | Approve/decline client portal access, manage client logins & sections | R `client_access_requests`, `client_users`, `employees` | Netlify Fn `client-user-admin` (on **bromarhub.netlify.app**) |
| **Components** (`js/pages/_components.js`) | Hidden dev reference of UI elements (`#_components`) | R `employees` | — |
| **Thermal Imaging** (`thermalimaging.html`) | Standalone thermal imaging report builder (no database) | — | — |

Shared code:
- `js/bromar-form-kit.js`: renders IMS forms from schema. R `ims_documents`, W `ims_form_submissions`.
- `js/bromar-report-kit.js`: shared PDF branding (meant to be identical in the Hub repo).
- `js/pages/ims/ims-report-kit.js`: IMS document PDF template.
- `js/utils.js`: date/format helpers (`window.BromarUtils`).

## 3. Server functions

**There is no `netlify/functions` folder and no `netlify.toml` in this repo.** Functions it calls live elsewhere:

| Function | Type / location | What it does | Triggered by |
|---|---|---|---|
| `client-user-admin` | Netlify function in the **Bromar Hub** site (`https://bromarhub.netlify.app/.netlify/functions/client-user-admin`) | Client portal user admin. Actions: `approve_request`, `decline_request`, `create_user`, `update_sections`, `send_reset`, `enable_user`, `disable_user`, `delete_user`. Sends the user's session token as Bearer | Admin clicks in Admin Tools → Client Portal |
| `extract-invoice` | Netlify function, relative path `/.netlify/functions/extract-invoice` — **does not exist yet** | AI extraction of line items from an uploaded supplier invoice (expects `{ items: [...] }`) | Materials → Import Invoice |
| `send-notification` | **Supabase Edge Function** (not Netlify) | Sends staff notification (scheduling) or email `{type:'email', to, subject, body}` (feedback) | Scheduling "notify" buttons; Admin → feedback status change |

No Xero sync, push-notification (VAPID/web push) or scheduled functions were found in this repo. If they exist,
they are in the Hub repo or in Supabase.

## 4. Shared Supabase project

This repo and **Bromar Hub** use the **same** Supabase project. Any schema, RLS or data change here affects the Hub.

### Every table/view/RPC/bucket this repo touches

Tables: `callout_roster`, `cert_types`, `client_access_requests`, `client_sites`, `client_users`, `clients`,
`employee_cert_history`, `employee_cert_images`, `employee_certs`, `employee_skills`, `employees`, `equipment`,
`equipment_categories`, `equipment_movements`, `equipment_records`, `feedback_reports`, `fuel_transactions`,
`ims_document_revisions`, `ims_documents`, `ims_form_submissions`, `inductions`, `itc_form_revisions`, `itc_forms`,
`job_number_counters`, `job_number_register`, `job_sheets`, `job_type_fields`, `job_types`, `jobs` (commented out),
`leave_requests`, `materials`, `notifications`, `pinned_sites`, `public_holidays`, `purchase_order_items`,
`purchase_orders`, `quote_favourites`, `quotes`, `rdo_roster`, `schedule_assignments`, `site_contacts`,
`sites` (fallback only), `suppliers`, `swms`, `swms_hrcw_categories`, `swms_revisions`, `swms_signoffs`,
`swms_templates`, `tasks`, `test_tag_reports`, `timesheets`, `vehicle_audit_checks`, `vehicle_audits`,
`vehicle_costs`, `vehicles`.

Views: `v_equipment_compliance`, `swms_approved_current` (Hub). RPC: `create_new_job`.
Storage buckets: `employee-documents`, `Equipment`, `Templates`, `test-tag-reports`.

### Tables clearly shared with Bromar Hub (from code comments)

`employees`, `ims_documents` / `ims_form_submissions` (Hub fills forms), `job_types` / `job_type_fields` (Hub jobsheet),
`job_sheets`, `timesheets`, `leave_requests`, `vehicle_audits` / `vehicle_audit_checks`, `notifications`, `tasks`,
`schedule_assignments`, `itc_forms` (published to Hub), `swms*`, `client_users` / `client_access_requests`.

### ⚠ Possible clashes — check before changing

1. **Two job tables:** Jobs uses `job_number_register`; Quotes has commented-out code writing to `jobs`; Jobs looks up
   `client_sites` *and* `sites`. Confirm which are real and which the Hub uses.
2. **Anon key used as the login token.** Timesheets, Tasks, Admin Tools, Test & Tag, Employees (and fallbacks in
   Fleet/Jobs/Scheduling) call Supabase with `Authorization: Bearer <anon key>` instead of the signed-in user's token.
   Those requests run as `anon`, so either RLS lets **anyone with the public key** read/write these tables, or the
   calls only work because RLS is off. Same risk for the Hub.
3. **`employee-documents` is read via a public URL** — staff licence images may be publicly viewable.
4. **`timesheets` and `job_sheets`** are written by the Hub and only read here — adding draft tables (section 5)
   must not change these tables' shape.
5. **`notifications`** — rows here are keyed by `employee_name` (text), not an ID. Renaming an employee breaks the link.
   *Migration in progress (issue #18):* `db/migrations/2026-11-24_employee_id_links.sql` adds `employee_id` (uuid → `employees.id`) with backfill and a fill-from-name trigger. Scheduling (`schedule_assignments`, `notifications`) now dual-writes the ID. Other pages and the Hub still use names; reads switch to ID later.
6. **`bromar-report-kit.js`** must stay identical in both repos (per its header).
7. **`ims_documents.slug`** is how the Hub loads forms — don't rename slugs.

## 5. Draft workflow (timesheet_drafts, job_sheet_drafts)

Intended flow:
1. Claude fills a row in `timesheet_drafts` or `job_sheet_drafts` (e.g. from notes, photos or messages).
2. The user opens the draft in the app, reviews and edits it.
3. The user submits → the app copies it into the real table (`timesheets` / `job_sheets`) and marks or deletes the draft.

**Status in this repo: not built.** Neither draft table is referenced anywhere in the code yet, and nothing here
writes to `timesheets` or `job_sheets` (the Hub does). Rules for building it:
- Claude writes **only** to the `*_drafts` tables — never directly to `timesheets` or `job_sheets`.
- Only a signed-in human submits. Keep a `status` (`draft` → `submitted`), `created_by` (e.g. `claude`) and `submitted_by`.
- Draft columns should mirror the real table so submit is a straight copy.
- RLS: user can only see/submit their own drafts (or admins all).
- Decide whether review/submit lives in Ops, Hub, or both (see open questions).

## 6. Conventions

**File structure**
```
index.html            app shell; loads every page script in order
login.html            sign-in page
thermalimaging.html   standalone tool
sw.js, manifest.json  PWA
css/styles.css        global theme (light/dark)
js/config.js          Supabase URL + anon key (only place they should live)
js/auth.js            session guard, creates window.supabaseClient
js/core.js            sidebar, header, router, nav badges
js/utils.js, js/bromar-*.js   shared helpers / kits
js/pages/<page>.js    one file per sidebar page
js/pages/ims/ims-<section>-<name>.js   IMS sub-tabs
assets/               logos, icons
```

**Naming & patterns**
- No framework, no build step, no npm. Plain JS loaded by `<script>` tags; libraries from CDN (supabase-js, jsPDF, SheetJS, pdf.js).
- Page = `window.BromarPages.<id> = { title, version, render(container), destroy(), badge()? }`. Add new pages to
  the `files` list in `index.html` **and** the nav list in `js/core.js`.
- IMS sub-tab = `window.BromarIMS.registerSubTab(section, { id, label, order, render, destroy })`, loaded after `ims.js`.
- Admin sub-modules (`testtag.js`, `compliance.js`) must load **before** `admin.js`.
- Each file has a header comment with a version (`V1.xx`); bump +0.01 per change, major only on request.
- Tables: `snake_case`, plural. Dates: Australian format, Melbourne time; pay week Mon–Sun.
- Bump the `CACHE` name in `sw.js` when you need clients to drop old cached files.

**Auth & row-level security**
- `js/auth.js` loads supabase-js, checks the session, redirects to `login.html` if signed out, and exposes
  `window.supabaseClient` and `window.BromarAuth` (`user()`, `employee()`, `isAdmin()`, `signOut()`).
- Employee is matched by **email** (`employees.email = auth user email`). Admin = `employees.is_admin`.
- The admin check happens **in the browser only**. Real protection must come from RLS policies in Supabase.
- New code should use `window.supabaseClient` (it sends the user's token so RLS applies) — not raw `fetch` with the anon key.
- RLS policies are not stored in this repo; they live in the Supabase dashboard.

**Where keys live**
- The Supabase **anon (public) key** and URL are in `js/config.js`. This key is meant to be public, but it is also
  hard-coded in `admin.js`, `testtag.js`, `timesheets.js`, `tasks.js`, `fleet.js`, `jobs.js`, `scheduling.js`,
  `employees.js` — new code should read `window.BROMAR_CONFIG` instead.
- **Never put secret keys in code** (Supabase service-role key, Xero, OpenAI/Anthropic, email, VAPID private keys).
  They go in **Netlify environment variables** (for Netlify functions) or **Supabase Edge Function secrets**.

## 7. Open questions

1. The task says the other repo is "Bromar Ops" — the code calls it **Bromar Hub**. Confirm the name/repo.
2. Where is the source for `client-user-admin` and `send-notification`? Should Ops get its own `netlify/functions` folder?
3. `extract-invoice` doesn't exist — which repo will host it, and which AI provider/key?
4. Xero sync and push notifications: do they exist (Hub? Supabase?) and which tables do they touch?
5. `timesheet_drafts` / `job_sheet_drafts`: do these tables exist yet? Review in Ops, Hub, or both?
6. Is RLS enabled on all tables, and do policies allow `anon`? (See clash #2.)
7. Which job table is current: `job_number_register`, `jobs`, or both? Is `sites` still used?
8. `ims-safety-swms.js`, `ims-quality-itc-builder.js`, `ims-reports.js` are not loaded in `index.html` — intentional?
9. `employee_cert_images` is listed in the Employees header but not found in calls — still used?
10. Is the `employee-documents` bucket meant to be public?
