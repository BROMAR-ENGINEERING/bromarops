// Supabase Edge Function: feedback-to-github
// Creates a GitHub issue from a feedback_reports row, stores the issue number/url
// on the row, and emails the admin (via the existing send-notification function).
//
// Secrets (supabase secrets set ...):
//   GITHUB_TOKEN   fine-grained PAT, Issues: read/write on the repo
//   GITHUB_REPO    e.g. BROMAR-ENGINEERING/bromarops
//   ADMIN_NOTIFY_EMAIL  where the "new issue" email goes
// SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY are provided automatically.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const ghToken = Deno.env.get('GITHUB_TOKEN');
  const ghRepo = Deno.env.get('GITHUB_REPO');
  const notifyTo = Deno.env.get('ADMIN_NOTIFY_EMAIL');
  if (!ghToken || !ghRepo) return json({ error: 'GITHUB_TOKEN / GITHUB_REPO not configured' }, 500);

  // 1. Authenticate caller and require an admin employee.
  const authHeader = req.headers.get('Authorization') || '';
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await userClient.auth.getUser();
  const email = userData?.user?.email;
  if (!email) return json({ error: 'Not signed in' }, 401);

  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { data: emp } = await admin.from('employees').select('is_admin').eq('email', email).maybeSingle();
  if (!emp?.is_admin) return json({ error: 'Admins only' }, 403);

  // 2. Load the report.
  let reportId: string | undefined;
  try { reportId = (await req.json()).report_id; } catch { /* fallthrough */ }
  if (!reportId) return json({ error: 'report_id required' }, 400);

  const { data: r, error: rErr } = await admin.from('feedback_reports').select('*').eq('id', reportId).maybeSingle();
  if (rErr || !r) return json({ error: 'Report not found' }, 404);
  if (r.github_issue_number) {
    return json({ issue_number: r.github_issue_number, issue_url: r.github_issue_url, already_linked: true });
  }

  // 3. Create the issue.
  const body = [
    `**Type:** ${r.report_type || '-'}  `,
    `**Priority:** ${r.priority || '-'}  `,
    `**Page / area:** ${r.page_url || '-'}  `,
    `**Reported by:** ${r.user_name || '-'}  `,
    `**Reported:** ${r.created_at || '-'}  `,
    `**Browser:** ${r.browser || '-'}`,
    '',
    '### Description',
    r.description || '',
    '',
    `<sub>Created from in-app feedback report \`${r.id}\`.</sub>`,
  ].join('\n');

  const ghRes = await fetch(`https://api.github.com/repos/${ghRepo}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ghToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'bromar-ops-feedback',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title: `[${r.report_type || 'Feedback'}] ${r.subject}`, body }),
  });
  if (!ghRes.ok) return json({ error: 'GitHub error: ' + (await ghRes.text()) }, 502);
  const issue = await ghRes.json();

  // 4. Link it back on the row.
  const { error: upErr } = await admin.from('feedback_reports')
    .update({ github_issue_number: issue.number, github_issue_url: issue.html_url })
    .eq('id', reportId);

  // 5. Email the admin (non-fatal).
  let emailSent = false;
  if (notifyTo) {
    try {
      const mail = await fetch(`${url}/functions/v1/send-notification`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'email',
          to: notifyTo,
          subject: `New GitHub issue #${issue.number} — ${r.subject}`,
          body: `A feedback report from ${r.user_name} was sent to GitHub.\n\n` +
            `${r.report_type || ''}${r.priority ? ' · ' + r.priority : ''}\n${r.subject}\n\n` +
            `${r.description}\n\n${issue.html_url}`,
        }),
      });
      emailSent = mail.ok;
    } catch (_) { /* ignore */ }
  }

  return json({
    issue_number: issue.number, issue_url: issue.html_url,
    email_sent: emailSent, link_saved: !upErr,
  });
});
