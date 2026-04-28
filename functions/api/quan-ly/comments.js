// /api/admin/comments — admin moderation API
// Bindings: env.DB (D1), env.ADMIN_PASSWORD
//
// GET /api/admin/comments?status=all|pending|approved&page=so-good
//   → list comments (auth required)
// POST /api/admin/comments
//   body: { id, action: 'approve'|'delete' }
//   → approve or delete a comment (auth required)

// Constant-time string compare via SHA-256 (prevents timing attack)
async function checkAuth(request, env) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  if (!token || !env.ADMIN_PASSWORD) return false;
  const enc = new TextEncoder();
  const h1 = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(token)));
  const h2 = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(env.ADMIN_PASSWORD)));
  let diff = 0;
  for (let i = 0; i < 32; i++) diff |= h1[i] ^ h2[i];
  return diff === 0;
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

export async function onRequestGet({ request, env }) {
  if (!(await checkAuth(request, env))) return json({ error: 'Unauthorized' }, 401);

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'all';
  const page = url.searchParams.get('page') || 'all';

  let sql = `SELECT id, page_id, parent_id, author_name, author_email, content, status,
                    created_at, verified_at
             FROM comments`;
  const conditions = [];
  const binds = [];

  if (status !== 'all') {
    conditions.push('status = ?');
    binds.push(status);
  }
  if (page !== 'all') {
    conditions.push('page_id = ?');
    binds.push(page);
  }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY created_at DESC LIMIT 500';

  const stmt = env.DB.prepare(sql);
  const { results } = binds.length ? await stmt.bind(...binds).all() : await stmt.all();

  // Stats
  const stats = await env.DB.prepare(
    `SELECT status, COUNT(*) AS c FROM comments GROUP BY status`
  ).all();
  const counts = { pending: 0, approved: 0 };
  (stats.results || []).forEach(r => { counts[r.status] = r.c; });

  // Distinct pages
  const pagesRes = await env.DB.prepare(
    `SELECT page_id, COUNT(*) AS c FROM comments GROUP BY page_id ORDER BY c DESC`
  ).all();

  return json({
    comments: results || [],
    counts,
    pages: pagesRes.results || []
  });
}

export async function onRequestPost({ request, env }) {
  if (!(await checkAuth(request, env))) return json({ error: 'Unauthorized' }, 401);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const id = parseInt(body.id, 10);
  const action = (body.action || '').trim();

  if (!Number.isInteger(id) || id <= 0) return json({ error: 'Invalid id' }, 400);

  if (action === 'approve') {
    await env.DB.prepare(
      `UPDATE comments SET status = 'approved', verified_at = unixepoch() WHERE id = ?`
    ).bind(id).run();
    return json({ success: true, message: 'Approved' });
  }

  if (action === 'unapprove') {
    await env.DB.prepare(
      `UPDATE comments SET status = 'pending', verified_at = NULL WHERE id = ?`
    ).bind(id).run();
    return json({ success: true, message: 'Set to pending' });
  }

  if (action === 'delete') {
    await env.DB.prepare(`DELETE FROM comments WHERE id = ?`).bind(id).run();
    return json({ success: true, message: 'Deleted' });
  }

  return json({ error: 'Invalid action. Use: approve | unapprove | delete' }, 400);
}
