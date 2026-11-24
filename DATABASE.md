# DATABASE.md — Bromar shared Supabase schema

Project ref `iwtvlpfprxqwveqadlwl`. Shared by **Bromar Ops** (this repo) and **Bromar Hub** (field app, separate repo).

> **Keep this file current.** Update it in the same change as any schema, RLS, storage or JSON-shape change.
> Keep an identical copy in the Bromar Hub repo. `CLAUDE.md` points here.

## How this document was built (read first)

- There are **no SQL/migration files** in this repo and RLS policies live only in the Supabase dashboard.
- This file was **inferred from the Ops code** (select strings, insert/update payloads, row mappers, error handling).
  It has **not** been checked against the live database.
- **Verified from DDL in code comments:** `ims_document_revisions`, `itc_forms`, `itc_form_revisions`, and the column list of `ims_documents`.
  Everything else is inferred. Types marked *(inferred)* are guesses.
- **Hub-only usage is not covered** (the Hub repo wasn't read). Where a table is "written by Hub", that comes from Ops code comments.
- To verify/complete it, run in the Supabase SQL editor and paste the results into the placeholders below:
  - Columns: `select table_name, column_name, data_type, is_nullable, column_default from information_schema.columns where table_schema='public' order by 1, ordinal_position;`
  - RLS state: `select tablename, rowsecurity from pg_tables where schemaname='public';`
  - Policies: `select tablename, policyname, cmd, roles, qual, with_check from pg_policies where schemaname='public' order by 1;`
  - Views/functions: `select pg_get_viewdef('v_equipment_compliance'::regclass); select pg_get_functiondef('create_new_job'::regproc);`

Legend: **Ops** = this repo, **Hub** = Bromar Hub. R/W = read/write. "Ops (anon)" = Ops calls it with the anon key as the bearer token
(runs as role `anon`; see CLAUDE.md §4 clash #2), otherwise it uses the signed-in user's token.

## RLS policies in plain English

**Not documented yet — cannot be read from code.** What the code tells us:

- Ops pages using the anon key (`timesheets`, `tasks`, `admin`/`testtag` tables, `employees` and the `employee_*` tables, plus fallbacks in fleet/jobs/scheduling)
  only work if `anon` is allowed to read/write those tables. Either RLS is off or the policies allow `anon`.
- Several writers check that `.select()` returns a row and report "check RLS policies" otherwise (`quotes`, `job_number_register`, `job_type_fields`, `swms*`),
  which suggests RLS is on for at least those.
- The admin gate (`employees.is_admin`) is enforced in the browser only.

TODO (needs dashboard access): fill the table below from the `pg_policies` query above.

| Table | RLS on? | Who can read | Who can write |
|---|---|---|---|
| *(all)* | ? | ? | ? |

---

## Conventions seen across tables

- Primary keys named `id` are probably uuid *(inferred)*. `created_at`/`updated_at` are timestamptz; several `updated_at` values are set by the client.
- **People are linked by name text, not id**: `employee_name` (or `assigned_to`, `created_by`, `prepared_by`…) holds `employees.full_name`.
  Renaming an employee breaks those links. Exceptions: `ims_form_submissions.submitted_by` (employee id).
- JSON columns written with `JSON.stringify` (`schedule_assignments.skip_dates`, `tasks.assigned_individuals`, `tasks.acknowledged_by`): readers accept both a real array and a JSON string. The real column type (jsonb vs text) is unconfirmed.
- Soft delete is common: `is_active=false` / `active=false` (not row delete).
- Optional columns: Ops retries without a column when the DB says it is missing (see `quotes`, `ims_document_revisions.reviewed_by`, `itc_forms`, `ims_form_submissions.review_status`). Those may not exist in every deployment.

---

# Tables

## People

### employees
Ops: R (everywhere), **W in Employees page only** (PATCH by `full_name`, POST). Hub: R/W (shared). Ops (anon) in Employees/Timesheets/Tasks.

| column | type | notes |
|---|---|---|
| id | uuid? | not used by Ops |
| full_name | text | de-facto unique key; used as join key by many tables |
| first_name, last_name | text | |
| email | text | login match: `employees.email = auth user email` |
| mobile | text | |
| dob | text `YYYY-MM` | month input |
| employee_type | text | Apprentice, Electrician, Senior Electrician, Junior Engineer, Engineer, Admin, Operations |
| role | text | read by Scheduling/Tasks/Client Portal: electrician, senior_electrician, apprentice, engineer, unassigned; `admin` checked in Client Portal. Relation to `employee_type` unclear |
| a_grade | bool | Scheduling only |
| is_active | bool | Fleet/Equipment treat `!== false` as active |
| departed_at | date | set when marked former |
| is_admin | bool | **login gate for Ops** |

### employee_certs — Ops RW/D (Employees). Licences/certs per employee.
`id`, `employee_name`, `cert_type_id` (→ cert_types), `licence_number`, `expiry_date`, `notes`. Expiry: past = expired, <60 days = expiring.

### cert_types — Ops RW/D (Employees)
`id`, `label`, `group_name` (Medical & Health, First Aid, Electrical, Safety, Plant, Rail, Education, Accreditations, Other, or new), `has_expiry`, `has_notes`, `has_licence_number` (bools), `sort_order` int, `is_active`.

### employee_cert_history — Ops RW (append-only)
`employee_name`, `changed_field`, `old_value`, `new_value`, `changed_at` (DB default). Despite the name it logs edits to employee fields (mobile, email, employee_type, dob).

### employee_cert_images
Named in the Employees header but **never queried**. Cert images live in storage bucket `employee-documents`. Probably unused.

### inductions — Ops RW/D (Employees)
`id`, `employee_name`, `induction_type`, `site_or_client`, `document_name`, `completed_date`, `expiry_date`, `notes`.

### employee_skills — Ops RW/D (Employees)
`id`, `employee_name`, `skill_name`, `notes`.

## Jobs, clients, quotes

### job_number_register — Ops: R/W (Jobs; Scheduling reads). Hub: likely R. Rows are **created by RPC `create_new_job`**, updated directly by Ops.
| column | type | notes |
|---|---|---|
| id | pk | |
| job_number | text | prefix + 4-digit sequence, e.g. `BM0042`. Joins to `job_sheets.job_number` |
| prefix | text | BM, BS, BC, BA, BE (matches `job_types.code`) |
| status | text | `active`, `completed`, `on_hold`, `cancelled` |
| client_name | text | free text |
| client_id | fk? | → clients.id |
| site_id | fk? | → client_sites.id |
| site_name, site_address | text | |
| job_type | text | stores `job_types.name`, not the id |
| work_type | text | set from quote `job_title` when created from a quote |
| contact_person, contact_phone, contact_role | text | |
| notes | text | e.g. "From quote BQ000001 v1" |
| created_by | text | |
| created_at | timestamptz | |
| completed_at | timestamptz | set when status becomes `completed`, else null |

### job_number_counters — Ops R (Jobs preview); written by the RPC
`prefix` (key), `last_sequence` int. Next number = `prefix` + (`last_sequence`+1) padded to 4.

### job_types — Ops RW (IMS → Job Types); R in Jobs/Jobsheets. Hub: R.
`id`, `category`, `code` (job-number prefix), `name`, `sort_order`, `active` (soft delete). SWMS code also tolerates `is_active` — unconfirmed which exists.

### job_type_fields — Ops RW (IMS → Jobsheets). Hub: R (renders the daily jobsheet).
| column | notes |
|---|---|
| id | |
| job_type_id | → job_types.id |
| field_key | slug of label (lowercase, `_`, ≤50 chars, `f_` prefix if starts with digit). Never changes after creation |
| label | |
| field_type | `heading`, `yesno`, `checkbox`, `number`, `text`, `textarea`, `select`, `date`, `photo`, `file`, `form` |
| unit | number fields only, ≤20 chars |
| options | JSON string array — see below |
| required | bool (forced false for heading) |
| sort_order | int, rewritten in steps of 10 |
| active | bool, soft delete |

`options` shapes: `select` → `["Pass","Fail","N/A"]`; `yesno` → `["Yes","No"]` or `["Yes","No","N/A"]`; `form` → `[ims_documents.slug]` (an `is_form` document); other types `[]`.

### job_sheets — **Written by Hub**, Ops R only (Jobs overview). Do not change shape without the Hub.
`id`, `job_sheet_number` text, `job_number` text, `sheet_date` date, `created_by` text, `is_service_report` bool, and JSON columns (array, or JSON string of an array):
- `tasks`: `[string | { description | text }]`
- `labour`: `[{ employee, normalHours, overtimeHours }]` (Ops also accepts aliases `normal`, `ot`)
- `materials`: `[{ name, quantity (alias qty), unit? }]`
- `notes`: `[string | { text }]`

### quotes — Ops RW (Quotes; Jobs reads for search). Upsert key `id`.
`id` text (client-generated `q<ts><rand>`), `doc_type` (`quote`|`estimate`), `root_number` (`BQ000001`, manual numbers allowed), `version` int, `nickname`, `site_name`, `client` (text name, **not an FK**, default `Unassigned`), `client_email`, `site_contact_name/phone/email`, `site_address`, `prepared_by`, `status` (`draft`, `allocated`, `sent`, `accepted`, `rejected`, `converted`), `created_at` and `published_at` (date strings), `global_markup`, `sections` (jsonb), `converted_to_quote_id/number`, `converted_at`, `converted_from_estimate_id/number`.

Optional columns (Ops retries without them if missing): `valid_days` int default 30; `accepted_job_number`, `accepted_at`, `edited_after_publish`; review group `review_status` (`in_review`|`changes`|`approved`), `review_requested_by`, `reviewed_by`, `reviewed_at`, `review_note`.

⚠ Jobs' quote search selects `client_contact`, `client_address`, `job_title`, which Quotes never writes (it writes `site_contact_name`, `site_address`, `nickname`). Those columns may not exist — verify.

`sections` = array of `{ id, type, name, show, internal, data }`. Types: `introduction`, `references`, `scopeOfWorks`, `description`, `materials`, `labour`, `costingSummary`, `optionsSummary`, `scheduleOfRates`, `quoteTotal`, `pageBreak`, `notes`, `exclusions`, `inclusions`, `assumptions`, `conclusion`, `pcSums`, `travel`, `variations`, `payment`. `data` by type:
- text types: `{ text, html? }`; bullet types: `{ bullets: [string] }`
- scopeOfWorks: `{ intro, scopes: [{ id, heading, bullets: [{ text, hidden }] }] }`
- materials: `{ items: [{ desc, part, price, markup|null, qty }], columns, clientView, alloc, markup? }` (line = qty × price × (1+markup/100))
- labour: `{ items: [{ desc, role, rate, hours, days, workers }], columns, clientView, alloc }` (role ∈ electrician, seniorElectrician, engineer, seniorEngineer, gradEngineer, apprentice)
- pcSums/travel: `{ items: [{ desc, amount }], clientView, alloc }`
- costingSummary: `{ selectedIds: [sectionId], showTotal, isOption?, rollup? }`; optionsSummary: `{ note, showGrand, grandLabel }`
- scheduleOfRates: `{ scheduleId, title }` (→ `quote_favourites` row); quoteTotal: `{ picks, showGrand, grandLabel, topText, bottomText, useStdNote }`

### quote_favourites — Ops RW (Quotes). One table, several record kinds (`id` prefix / `type`):
`id` text, `name`, `type`, `data` jsonb.
- `settings:default` / `settings` → `{ markup, rates: { <roleId>: number } }`
- `schedule:<…>` / `rateSchedule` → `{ rows: [{ role, ordinary, overtime }], notes: [string], clientId }`
- `pb_<…>` / section type → copy of a section's `data` (prebuilt section)
- `blt_<…>` / `bullet:<sectionType>` → `{ text }` (bullet library)

### clients — Ops RW/D (Clients & Sites). Hub: likely R.
`id`, `name` (required), `legal_name`, `contact_name`, `email`, `phone`, `website`, `abn`, `address`, `city`, `region`, `postcode`, `notes`, `is_active`.

### client_sites — Ops RW/D (Clients & Sites); R in Jobs/Quotes/Scheduling.
`id`, `client_id` (→ clients), `site_name` (required), `address`, `city`, `region`, `postcode`, `notes`, `is_active`. Quotes also reads `contact_name`, `phone`, `email` (not written by Clients page — legacy/optional?).

### sites — fallback only. Jobs tries `client_sites` then `sites` (reads `name|site_name|site`, `address|site_address|full_address`, `client_id`, `is_active`). May not exist.

### site_contacts — Ops RW/D (Clients & Sites)
`id`, `site_id` (→ client_sites), `name` (required), `role`, `phone`, `email`, `notes`, `is_primary` (one primary per site, enforced by the client).

### purchase_orders — Ops RW (Materials). (Jobs does **not** read it despite earlier docs.)
`id`, `po_number` (`PO-<n>`), `supplier`, `job_ref`, `status` (`draft`, `sent`, `received`, `cancelled`), `notes`, `created_at`. Total is computed client-side. Read with embedded `purchase_order_items(*)`. On edit, items are deleted and re-inserted.

### purchase_order_items — Ops RW (Materials)
`id`, `po_id` (→ purchase_orders), `material_id` (→ materials, null for one-off lines), `description`, `qty`, `unit_cost`.

### materials — Ops RW (Materials)
`id`, `name`, `category`, `supplier`, `unit`, `current_stock`, `reorder_point`, `unit_cost`, `location`, `notes`, `is_active` (soft delete). Marking a PO `received` adds `qty` to `current_stock` (client-side read-modify-write, not atomic).

## Scheduling & roster

### schedule_assignments — Ops RW (Scheduling). Hub: R (and reads for staff schedule).
| column | notes |
|---|---|
| id | |
| employee_name | text, null allowed |
| type | `job` (default), `site`, `leave`, `workshop` |
| job_number, site_id, site_name, client_name | site_id → client_sites |
| schedule | `oneoff` (default), `duration`, `indefinite` |
| start_date, end_date | dates |
| skip_dates | JSON array of `YYYY-MM-DD` (excluded days of a recurring assignment), written stringified |
| notes, location (`site`|`workshop`), start_time, end_time | |
| notified, was_notified | bool |
| is_active | soft delete |

RDO rows shown on the schedule are synthesised from `rdo_roster` (not stored).

### pinned_sites — Ops RW (Scheduling). `id`, `site_id` (**unique**; duplicate insert ignored), `site_name`, `client_name`.

### notifications — Ops W (Scheduling). Hub reads (not read by Ops).
`employee_name` (text key, not id), `message`, `type` (`schedule_change`, `schedule_live`). Other columns (id, created_at, read flags) unknown.

### rdo_roster — Ops RW (Admin; Scheduling reads)
`id`, `employee_name`, `rdo_group` (`A`|`B`), `rdo_date`, `notes`, `updated_at`. xlsx upload deletes rows in the uploaded date range, then inserts in batches of 50.

### callout_roster — Ops RW (Admin); R in Dashboard
`id`, `employee_name`, `start_date`, `end_date`, `shift_type`, `notes`, `updated_at`. Upload deletes rows whose `start_date` is in the uploaded range, then inserts.

### public_holidays — Ops RW (Admin)
`id`, `date`, `name`, `state` (VIC, NSW, QLD, SA, WA, TAS, ACT, NT, NATIONAL), `notes`, `updated_at`. Import uses merge-duplicates; a unique key on (date, state, name) is hinted but unconfirmed.

### leave_requests — **Written by Hub**; Ops R (Dashboard, `status='pending'`)
`employee_name`, `leave_type`, `last_day_of_work`, `return_to_work`, `working_days`, `notes`, `status` (only `pending` is known).

### timesheets — **Written by Hub**; Ops R only (Timesheets; Ops anon). Do not change shape.
`id`, `employee_name`, `employee_email`, `employee_type`, `week_starting` (Monday), `submitted_at`, `total_hours`, `total_normal_hours`, `total_overtime_hours`, `total_travel_hours`, `on_call_standby` bool, `allowance_first_aid` bool, `allowance_construction_wiring` bool, `general_comments`, `timesheet_entries` (jsonb array, or JSON string):
```
{ day: 'Monday'..'Sunday', date: 'YYYY-MM-DD' (may be blank), shift, type: 'Job Number: …' (text before ':' is the category),
  normal_hours, overtime_hours, travel_hours (number or numeric string), job_number, client, allowances, comment }
```
`type` categories: Job types `Job Number`, `Tender/Quote`, `Call Out`, `Travel`; leave types `RDO`, `Annual Leave`, `Sick`, `Trade School`, `TIL`, `Long Service`, `Stand Down`. Late = submitted after the Tuesday deadline.

### tasks — Ops RW/D (Tasks; Ops anon). Hub reads/updates (completion, acknowledgement).
`id`, `category` (`task`|`announcement`), `type` (tasks: Induction, Training, Safety Alert, Document Review, General; announcements: Company Announcement, Toolbox Talk, Policy Update, Safety Notice, General), `title`, `assign_type` (`everyone`, `frontline`, `operations`, `individuals`), `assigned_individuals` (JSON array of full names), `priority` (Low, Medium, High, Urgent), `status` (tasks: Pending, In Progress, Complete, Overdue; announcements: Active, Acknowledged), `due_date`, `link`, `description`, `acknowledged_by` (JSON array of names), `created_at`, `updated_at`.

## Fleet

### vehicles — Ops RW/D (Fleet)
`id`, `plant_no` (required), `plant_name`, `rego_no` (uppercase, ≤6), `make`, `model`, `year`, `plant_type` (Van, Ute, Car, Truck, Forklift, Trailer), `vin`, `assigned_to` (employee name), `assigned_to_other`, `status` (`active`, `out_of_service`, `retired`, `sold`), `current_odometer` (auto-updated from fuel/analysis PDFs), `next_service_km`, `date_of_purchase`, `fleet_card_no`, `linkt_tag_id`, `notes`, `last_audit_date` (read only).

### vehicle_audits — **Created by Hub**; Ops R + update (mark actioned)
`id`, `vehicle_id`, `submitted_at`, `audit_type_id`, `week_commencing`, `operator_name`, `current_km_hours`, `ok_count`, `fault_count`, `na_count`, `notes`, `defect_details`, `defect_reported_by`, `defect_date`, `actioned` bool, `actioned_by`, `actioned_at`, `action_notes`. Ops writes only the `actioned*`/`action_notes` columns. Audit due after 90 days.

### vehicle_audit_checks — Hub writes; Ops R
`id`, `audit_id`, `sort_order`, `item_text`, `status` (`OK`, `FAULT`, `NA`), `comment`.

### vehicle_costs — Ops RW/D (Fleet)
`id`, `vehicle_id`, `cost_date`, `category` (service, parts, tyres, registration, insurance, repair, other), `description`, `amount_ex_gst`, `gst`, `total_inc_gst`, `supplier`, `invoice_ref`.

### fuel_transactions — Ops W (Fleet PDF import) + R. Keyed by `rego_no` text.
`rego_no`, `vehicle_id` (null if no match), `card_no`, `driver_name`, `transaction_date`, `supplier`, `odometer_reading`, `reference_no`, `quantity_litres`, `product`, `price_ex_gst`, `gst`, `total_inc_gst`, `billing_period` (text). A unique constraint exists (duplicate insert = code 23505 → skipped); its columns are unknown.

## Equipment

### equipment — Ops RW (Equipment). Hub: sign out/in (writes `equipment_movements`).
`id`, `asset_no` (**unique**), `name`, `category_id` (→ equipment_categories), `serial_no`, `make`, `model`, `purchase_date`, `home_location`, `status` (`available`, `signed_out`, `out_for_service`, `faulty`, `retired`), `assigned_to`, `assigned_at`, `is_active` (false when retired), `requires_service`, `service_interval_months`, `next_service_due`, `last_service_date`, `requires_calibration`, `calibration_interval_months`, `next_calibration_due`, `last_calibration_date`, `notes`. The `last_*` dates are not written by Ops (probably a DB trigger on `equipment_records` — unconfirmed).

### equipment_categories — Ops RW (soft delete)
`id`, `name` (**unique**), `service_interval_months`, `calibration_interval_months`, `sort_order`, `is_active`.

### equipment_records — Ops RW (soft delete)
`id`, `equipment_id`, `record_type` (service, calibration, repair, inspection), `record_date`, `result` (pass, fail, adjusted, n/a), `next_due`, `provider`, `certificate_no`, `cost`, `notes`, `file_path`, `file_name` (bucket `Equipment`), `created_by` (user email), `is_active`.

### equipment_movements — Ops RW (Equipment), Hub writes too. Ops reads latest 300.
`id`, `created_at`, `equipment_id`, `action` (`sign_out`, `sign_in`, `status_change` from Ops; `assign`, `unassign` from elsewhere), `employee_name`, `job_ref`, `location`, `notes`, `performed_by`, `source` (`ops`|`hub`).

## IMS (ISO documents & forms)

### ims_documents — Ops RW (IMS → Documents); Hub R (fetches by `slug`, requires `is_active = true`). **Never rename slugs.**
| column | notes |
|---|---|
| id | uuid |
| slug | permanent id; from doc number (lowercased, non-alnum → `-`, `-<base36 ts>` on collision) |
| section | `safety`, `quality`, `environment`, `other` (legacy aliases tolerated by Reports) |
| title | |
| schema | jsonb, see below |
| revision | int, = highest published revision (0/null = never published) |
| is_active | live flag (false while draft/editing/archived) |
| is_form | true for form/checklist/itc, false for policy/procedure/plan |
| is_featured, hub_order, hub_icon | in DDL comment only; not used by Ops |
| created_at | |

`schema` (common): `{ doc_type, category, description, doc_seq, doc_number, doc_code, doc_desc, doc_desc_code, archived?, _draft?: { status: 'draft'|'in_review', editors: [{email,name}], version_date, version_description }, fields: […] (forms) | blocks: […] (content docs) }`. `_draft` is stripped on publish. Status is derived: archived if `schema.archived`; published if `is_active`; in review if `_draft.status='in_review'`; else draft. A draft editor cannot approve their own draft (two-person review).
Doc number format: `IMS-{SAFE|QUAL|ENVIRO|OTHER}-{TYPE}-{NN}-{DESC}`.

Form `fields[]`: `{ name, type, label, required, help?, placeholder?, default?, min?, max?, step?, rows?, pattern?, options? (string[] | [{value,label}]), checkboxLabel?, addLabel?/addButtonLabel?, pdf?: { pageBreakBefore?, spaceBefore?, fullWidth? } }`. Types: `text, textarea, number, date, time, datetime, email, tel, select, radio, checkbox, multiselect, passfail, signature, photo, dynamiclist, heading`.
⚠ Builder writes `addButtonLabel`, form kit reads `addLabel` for `dynamiclist`.

Content `blocks[]`: `{ id, type: heading|paragraph|bullets|signatory|table|spacer|pagebreak, text?, items?, name?, title?, height?, columns?: [{label, type: text|check}], rows?: [{cells}] }`.

### ims_document_revisions — Ops RW (builder; DDL in code). Hub: likely none.
`id` uuid PK, `document_id` → ims_documents ON DELETE CASCADE, `revision` int, `schema` jsonb (null = legacy row with no snapshot), `version_date` date, `version_description`, `prepared_by`, `reviewed_by` (optional; Ops retries without), `created_at`. Unique (`document_id`, `revision`).

### ims_form_submissions — **Written by Hub** and Ops form kit (`bromar-form-kit.js`); Ops R in Reports (not loaded)
`id`, `form_id` (→ ims_documents.id), `revision_at_submission` int, `data` jsonb, `linked_record_type`, `linked_record_id`, `submitted_by` (employee id), `submitted_at` (DB default), `review_status` (optional column; values seen: reviewed/completed/closed/approved/actioned vs submitted/new/open/pending).
`data` is a flat object keyed by `field.name` (headings omitted): string for text/select/radio/date/time/etc.; number|null for number; boolean for checkbox; string[] for multiselect and dynamiclist; `'pass'|'fail'|'na'|''` for passfail; PNG data-URL for signature; JPEG data-URL for photo.

### itc_forms / itc_form_revisions — Ops RW (ITC builder, **not loaded** in index.html); Hub reads published (DDL in code)
`itc_forms`: `id`, `title`, `form_code`*, `category`*, `description`, `status` (`draft`|`published`|`archived`), `published_revision`, `latest_revision`, `created_by`, `created_at`, `updated_at`. (*added by a later migration.)
`itc_form_revisions`: `id`, `form_id` → itc_forms ON DELETE CASCADE, `revision`, `fields` jsonb, `status` (`draft`|`published`|`superseded`), `change_note` (unused), `created_by`, `created_at`, `published_at`; unique (`form_id`, `revision`).
`fields[]`: `{ id, type, label, required, options?: string[], placeholder?, addButtonLabel? }`, types `text, dropdown, checkbox, passfail, signature, photo, dynamiclist, heading`. Uses `id`/`dropdown` rather than the form kit's `name`/`select`, so it is a separate pipeline from `ims_documents`.

### SWMS (Ops page **not loaded**; Hub reads approved)
- **swms**: `id`, `swms_number` (unique, `SWMS-…`), `title`, `current_revision` (0 = never approved), `draft_status` (`none`, `draft`, `pending`, `rejected`), `draft_content` jsonb, `draft_updated_by/at`, `submitted_by/at`, `rejection_comment`, `review_due` (default approval + 12 months), `is_active`, `created_by`, `updated_at`.
- **swms_revisions** (insert-only): `id`, `swms_id`, `revision`, `title`, `content` jsonb, `change_summary`, `prepared_by`, `submitted_at`, `approved_by`, `approved_at`, `review_due`.
- **swms_signoffs**: `id`, `swms_id`, `revision`, `employee_name`, `job_ref`, `recorded_by`, `method` (`office`|`hub`), `signed_at`, `is_active` (soft delete).
- **swms_hrcw_categories**: `label` (or `name`), `sort_order`, `is_active`. Optional (a built-in list of 18 is used if missing).
- **swms_templates** — Ops R (IMS → Approved SWMS): `id`, `name`, `title`, `category`, `template_version`, `is_archived`, text columns (`activity_description`, `legislation`, `qualifications`, `training_required`, `plant_required`, `plant_inspections`, `materials_used`, `msds_required`, `relevant_procedures`, `ppe_mandatory`, `ppe_additional`), `hazards_json` (array of free-key objects), `default_developed_by`, `default_reviewed_by`, `created_by_name`, `updated_at`.

SWMS content JSON (`draft_content` / `swms_revisions.content`): `{ title, scope, job_types: [string], hrcw: [string], ppe: [string], ppe_other, steps: [{ task, hazards, risk_before, controls, risk_after, responsible }], emergency, references, change_summary, review_due }` with risk ∈ Low, Medium, High, Extreme.

## Admin

### suppliers — Ops RW (Admin)
`id`, `name`, `branch`, `home_branch`, `category` (Electrical, Hire, Pneumatic, General, Tools, Hardware), `order_method` (Walk-in, Call, Online, or combinations), `requires_po`, `abn`, `account_number`, `contact_name/phone/email`, `website`, `address`, `sales_rep_name/phone/email`, `notes`, `is_active` (read only), `updated_at`. Bulk upload uses merge-duplicates (conflict key unknown).

### feedback_reports — Ops RW/D (Admin)
`id`, `user_name`, `user_email`, `report_type` (Bug, Improvement, Feature Request, Other), `subject`, `description`, `page_url`, `browser`, `priority` (Low, Medium, High, Critical), `status` (`open`, `in_progress`, `resolved`, `closed`), `created_at`, `updated_at`.

### test_tag_reports — Ops RW/D (Test & Tag). **Unique on `cert_no`** (upsert `on_conflict=cert_no`).
`id`, `cert_no`, `job_number`, `customer`, `site_name`, `site_address`, `contact`, `contact_email`, `phone`, `date_range` (text), `installation_type`, `tested_by`, `generated_date` (text), counts `total`, `pass`, `fail`, `oos`, `boards`, `overdue`, `note`, `pdf_path` (bucket `test-tag-reports`; only sent when a PDF was uploaded), `report_data` jsonb, `updated_at`, `created_at`.
`report_data`: `{ head: {customer, site, address, contact, email, phone, range, cert, generated}, stats: {label: string}, assets: [{ location, Sublocation, Barcode, …header→value pairs, 'Test Date', 'Final Status', Comments, 'Test Performed', state: 'pass'|'fail'|'oos', params: [{type, uom, status, result, lower, upper}] }], form: {customer, site, address, contact, phone, email, range, cert, job, tester, licence, licenceType, instrument, instrSerial, instrCal, instType, summary, note, techNotes, detail, oosOnly, showTester}, scope: {mode, values, times} }`.

### client_access_requests / client_users — Ops R (Admin → Client Portal). **Writes go through the Hub's Netlify function `client-user-admin`**, not Ops.
`client_access_requests`: `id`, `status` (`pending` known; others treated as handled), `full_name`, `email`, `company`, `position`, `phone`, `reason`, `sections` (text[]; keys `emergency_lighting`, `rcd_testing`, `test_tagging`), `review_notes`, `created_at`.
`client_users`: `user_id` (auth uid), `full_name`, `email`, `company`, `position`, `sections` (text[]), `active`, `last_login`, `created_at`, `client_slug` (sent on create; only `tyrecycle` offered).

---

# Views

- **v_equipment_compliance** — Ops R (Equipment badge). Column used: `compliance_state` (`overdue`, `no_record`, `due_soon`, presumably `ok`). Other columns unknown.
- **swms_approved_current** — Hub reads; not queried by Ops. Presumably `swms` joined to its current `swms_revisions` row. Definition unknown.

# RPC / functions

- **`create_new_job`** (RPC) — Ops (Jobs). Args: `p_prefix`, `p_client_id`, `p_site_id`, `p_job_type`, `p_contact_person`, `p_contact_phone`, `p_contact_role`. Returns the new job number as a string. Presumably bumps `job_number_counters` and inserts into `job_number_register`. After it returns, Ops updates the row with quote details (`work_type`, `site_address`, `notes`, `contact_person`).
- **`send-notification`** (Supabase Edge Function) — push: `{ employee_name, message }`; email: `{ type: 'email', to, subject, body }`.
- **`client-user-admin`** (Netlify, Hub site) — see CLAUDE.md §3.
- **`extract-invoice`** (Netlify) — does not exist yet. Expected: multipart POST with field `file`; response `{ supplier?, invoice_number?, items: [{ description, qty, unit_cost }] }`.

# Storage buckets

| bucket | access | path convention | used by |
|---|---|---|---|
| `employee-documents` | **public URLs** | `<safe full_name>/profile/photo`; `<safe full_name>/certs/<employee_certs.id>/front` or `/back` | Ops (Employees) |
| `Equipment` | private, signed URL (5 min) | `<equipment_id>/<timestamp>-<sanitised filename>`; path stored in `equipment_records.file_path` | Ops (Equipment) |
| `Templates` | public | `callout-roster/…`, `public-holidays/…`, `rdo-roster/…`, `suppliers/…` xlsx templates | Ops (Admin) |
| `test-tag-reports` | unknown | `<sanitised cert_no>.pdf`, upsert on redo; path in `test_tag_reports.pdf_path` | Ops (Test & Tag) |

# Open questions for whoever has dashboard access

1. Run the SQL at the top and replace "inferred" content with the real column types, defaults, constraints and FKs.
2. Fill in the RLS table, in particular what `anon` can do.
3. Do `quotes.client_contact` / `client_address` / `job_title` exist? Does `sites` exist? Is `job_types.active` or `is_active` the real name?
4. What are `fuel_transactions`' unique key, `public_holidays`/`suppliers` conflict keys, and `v_equipment_compliance` / `swms_approved_current` definitions?
5. Are `equipment.last_service_date` / `last_calibration_date` / `next_*_due` maintained by triggers?
6. Add the Hub's own usage of each table.
