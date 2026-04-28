// /api/quan-ly/stats — analytics dashboard data
// Returns comment stats from D1 + web stats from Cloudflare GraphQL API (if configured)
//
// Required bindings:
//   env.DB                  — D1 database
//   env.ADMIN_PASSWORD      — admin auth
//   env.CLOUDFLARE_API_TOKEN  (optional) — Cloudflare API token with Account.Analytics:Read
//   env.CLOUDFLARE_ACCOUNT_ID (optional) — Cloudflare account ID
//   env.CLOUDFLARE_SITE_TAG   (optional) — Web Analytics site tag

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

  const result = {};

  // ─── D1 comment stats ───
  try {
    result.comments = await getCommentStats(env);
  } catch (e) {
    result.comments = { error: e.message };
  }

  // ─── Cloudflare web analytics (optional) ───
  if (env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID && env.CLOUDFLARE_SITE_TAG) {
    try {
      result.web = await getWebStats(env);
    } catch (e) {
      result.web = { error: e.message };
    }
  } else {
    result.web = { configured: false };
  }

  result.cloudflareLink = 'https://dash.cloudflare.com/' + (env.CLOUDFLARE_ACCOUNT_ID || '0574a8ecc33bcafa5997b9bddaab2343') + '/web-analytics';

  return json(result);
}

async function getCommentStats(env) {
  // Counts by status
  const statusRow = await env.DB.prepare(
    `SELECT status, COUNT(*) AS c FROM comments GROUP BY status`
  ).all();
  const counts = { pending: 0, approved: 0, total: 0 };
  (statusRow.results || []).forEach(r => {
    counts[r.status] = r.c;
    counts.total += r.c;
  });

  // Today / 7d / 30d totals (approved)
  const now = Math.floor(Date.now() / 1000);
  const day = 86400;
  const periods = await env.DB.prepare(
    `SELECT
       SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) AS d1,
       SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) AS d7,
       SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) AS d30
     FROM comments`
  ).bind(now - day, now - 7 * day, now - 30 * day).first();

  // Per page (top 10)
  const perPage = await env.DB.prepare(
    `SELECT page_id, COUNT(*) AS c, SUM(CASE WHEN status='approved' THEN 1 ELSE 0 END) AS approved
     FROM comments GROUP BY page_id ORDER BY c DESC LIMIT 10`
  ).all();

  // Daily trend (last 30 days)
  const dailyTrend = await env.DB.prepare(
    `SELECT
       strftime('%Y-%m-%d', created_at, 'unixepoch') AS day,
       COUNT(*) AS c
     FROM comments
     WHERE created_at > ?
     GROUP BY day ORDER BY day ASC`
  ).bind(now - 30 * day).all();

  // Top commenters (by email, last 30 days)
  const topCommenters = await env.DB.prepare(
    `SELECT author_email, MAX(author_name) AS name, COUNT(*) AS c
     FROM comments
     WHERE created_at > ? AND status = 'approved'
     GROUP BY author_email ORDER BY c DESC LIMIT 5`
  ).bind(now - 30 * day).all();

  // Recent activity (last 10 approved)
  const recent = await env.DB.prepare(
    `SELECT id, page_id, author_name, content, created_at
     FROM comments WHERE status = 'approved' ORDER BY created_at DESC LIMIT 10`
  ).all();

  return {
    counts,
    periods: periods || { d1: 0, d7: 0, d30: 0 },
    perPage: perPage.results || [],
    dailyTrend: dailyTrend.results || [],
    topCommenters: topCommenters.results || [],
    recent: recent.results || []
  };
}

async function getWebStats(env) {
  const accountTag = env.CLOUDFLARE_ACCOUNT_ID;
  const siteTag = env.CLOUDFLARE_SITE_TAG;

  const now = new Date();
  const start7d = new Date(now.getTime() - 7 * 86400 * 1000);
  const start24h = new Date(now.getTime() - 24 * 3600 * 1000);

  const isoNow = now.toISOString();
  const iso7d = start7d.toISOString();
  const iso24h = start24h.toISOString();

  // GraphQL query: page views, visits, top pages, top countries
  const query = `
    query GetWebStats($accountTag: string, $siteTag: string, $start7d: Time, $end: Time, $start24h: Time) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          totals7d: rumPageloadEventsAdaptiveGroups(
            limit: 1
            filter: { siteTag: $siteTag, datetime_geq: $start7d, datetime_lt: $end, bot: false }
          ) {
            sum { visits }
            count
          }
          totals24h: rumPageloadEventsAdaptiveGroups(
            limit: 1
            filter: { siteTag: $siteTag, datetime_geq: $start24h, datetime_lt: $end, bot: false }
          ) {
            sum { visits }
            count
          }
          topPages: rumPageloadEventsAdaptiveGroups(
            limit: 10
            orderBy: [count_DESC]
            filter: { siteTag: $siteTag, datetime_geq: $start7d, datetime_lt: $end, bot: false }
          ) {
            count
            dimensions { metric: requestPath }
          }
          topCountries: rumPageloadEventsAdaptiveGroups(
            limit: 10
            orderBy: [count_DESC]
            filter: { siteTag: $siteTag, datetime_geq: $start7d, datetime_lt: $end, bot: false }
          ) {
            count
            dimensions { country: countryName }
          }
          topReferrers: rumPageloadEventsAdaptiveGroups(
            limit: 10
            orderBy: [count_DESC]
            filter: { siteTag: $siteTag, datetime_geq: $start7d, datetime_lt: $end, bot: false, refererHost_neq: "" }
          ) {
            count
            dimensions { referer: refererHost }
          }
          dailyTrend: rumPageloadEventsAdaptiveGroups(
            limit: 30
            orderBy: [dimensions_date_ASC]
            filter: { siteTag: $siteTag, datetime_geq: $start7d, datetime_lt: $end, bot: false }
          ) {
            count
            dimensions { date: date }
          }
        }
      }
    }
  `;

  const res = await fetch('https://api.cloudflare.com/client/v4/graphql', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + env.CLOUDFLARE_API_TOKEN,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query,
      variables: { accountTag, siteTag, start7d: iso7d, start24h: iso24h, end: isoNow }
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error('Cloudflare API HTTP ' + res.status + ': ' + text.slice(0, 200));
  }

  const body = await res.json();
  if (body.errors && body.errors.length) {
    throw new Error('GraphQL: ' + body.errors.map(e => e.message).join('; '));
  }

  const account = body?.data?.viewer?.accounts?.[0];
  if (!account) return { configured: true, empty: true };

  return {
    configured: true,
    period: { start: iso7d, end: isoNow },
    pageViews7d: account.totals7d?.[0]?.count || 0,
    visits7d: account.totals7d?.[0]?.sum?.visits || 0,
    pageViews24h: account.totals24h?.[0]?.count || 0,
    visits24h: account.totals24h?.[0]?.sum?.visits || 0,
    topPages: (account.topPages || []).map(r => ({ path: r.dimensions?.metric, count: r.count })),
    topCountries: (account.topCountries || []).map(r => ({ country: r.dimensions?.country, count: r.count })),
    topReferrers: (account.topReferrers || []).map(r => ({ referer: r.dimensions?.referer, count: r.count })),
    dailyTrend: (account.dailyTrend || []).map(r => ({ date: r.dimensions?.date, count: r.count }))
  };
}
