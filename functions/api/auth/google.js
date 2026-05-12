// GET /api/auth/google?redirect=/some-path
// Bắt đầu Google OAuth flow: tạo state CSRF, redirect tới Google.
//
// Bindings cần: env.DB, env.GOOGLE_CLIENT_ID, env.SITE_URL

import { randomToken, redirect, json } from './_lib.js';

export async function onRequestGet({ request, env }) {
  if (!env.GOOGLE_CLIENT_ID) {
    return json({ error: 'Google OAuth chưa được cấu hình (thiếu GOOGLE_CLIENT_ID).' }, 500);
  }

  const url = new URL(request.url);
  const wantRedirect = (url.searchParams.get('redirect') || '/').trim();
  // Chỉ cho redirect same-origin (path bắt đầu bằng /)
  const safeRedirect = wantRedirect.startsWith('/') && !wantRedirect.startsWith('//')
    ? wantRedirect : '/';

  const state = randomToken(24);
  const expires = Math.floor(Date.now() / 1000) + 600; // 10 phút
  await env.DB.prepare(
    `INSERT INTO oauth_states (state, redirect, expires_at) VALUES (?, ?, ?)`
  ).bind(state, safeRedirect, expires).run();

  const siteUrl = env.SITE_URL || `${url.protocol}//${url.host}`;
  const redirectUri = `${siteUrl}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account'
  });

  return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
}
