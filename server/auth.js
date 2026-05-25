import jwt from 'jsonwebtoken';
import { pool } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
const APP_URL = process.env.APP_URL || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_SENDER = process.env.RESEND_SENDER || 'onboarding@resend.dev';

const COOKIE_NAME = 'session';
const SESSION_TTL_DAYS = 30;
const LOGIN_TOKEN_TTL_MIN = 15;

export function isAllowed(email) {
  if (!email) return false;
  const e = email.toLowerCase();
  if (ALLOWED_EMAILS.length === 0) return false;
  if (ALLOWED_EMAILS.includes('*')) return true;
  return ALLOWED_EMAILS.includes(e);
}

export function makeLoginToken(email) {
  return jwt.sign({ sub: email, type: 'login' }, JWT_SECRET, { expiresIn: `${LOGIN_TOKEN_TTL_MIN}m` });
}

export function makeSessionToken(email) {
  return jwt.sign({ sub: email, type: 'session' }, JWT_SECRET, { expiresIn: `${SESSION_TTL_DAYS}d` });
}

function verifyToken(token, expectedType) {
  try {
    const claims = jwt.verify(token, JWT_SECRET);
    if (claims.type !== expectedType) return null;
    return claims;
  } catch (_) {
    return null;
  }
}

export function verifyLoginToken(token) {
  return verifyToken(token, 'login');
}

export function authFromRequest(req) {
  const cookieHeader = req.headers.cookie || '';
  const m = new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`).exec(cookieHeader);
  if (!m) return null;
  const claims = verifyToken(decodeURIComponent(m[1]), 'session');
  return claims ? { email: claims.sub } : null;
}

export function requireAuth(req, res, next) {
  const auth = authFromRequest(req);
  if (!auth) {
    res.status(401).json({ error: 'auth required' });
    return;
  }
  req.user = auth;
  next();
}

export function setSessionCookie(res, email) {
  const token = makeSessionToken(email);
  const secure = process.env.NODE_ENV === 'production' ? 'Secure; ' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; ${secure}SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_DAYS * 24 * 60 * 60}`,
  );
}

export function clearSessionCookie(res) {
  const secure = process.env.NODE_ENV === 'production' ? 'Secure; ' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE_NAME}=; HttpOnly; ${secure}SameSite=Lax; Path=/; Max-Age=0`,
  );
}

export async function sendMagicLink(email, link) {
  if (!RESEND_API_KEY) {
    // Dev fallback: print the link to logs so the operator can test before
    // hooking up Resend. Tells the user what's happening rather than failing
    // silently.
    console.log(`\n[auth] No RESEND_API_KEY set — magic link for ${email}:\n    ${link}\n`);
    return { delivered: 'logged' };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `Virtual Warehouse <${RESEND_SENDER}>`,
      to: email,
      subject: 'Your Virtual Warehouse sign-in link',
      html: `
        <div style="font-family: -apple-system, system-ui, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h1 style="font-size: 18px; margin-bottom: 8px;">Sign in to Virtual Warehouse</h1>
          <p style="color: #475569; font-size: 14px;">Click the button below to sign in. The link expires in ${LOGIN_TOKEN_TTL_MIN} minutes.</p>
          <p style="margin: 24px 0;">
            <a href="${link}" style="display: inline-block; padding: 10px 16px; background: #2563eb; color: #ffffff; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">Sign in</a>
          </p>
          <p style="color: #94a3b8; font-size: 12px;">If you didn't request this, you can ignore this email.</p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend ${res.status}: ${body.slice(0, 200)}`);
  }
  return { delivered: 'sent' };
}

export function appUrl(req) {
  if (APP_URL) return APP_URL.replace(/\/$/, '');
  const proto = req.get('x-forwarded-proto') || req.protocol;
  return `${proto}://${req.get('host')}`;
}

export async function logAudit(email, action, payload) {
  try {
    await pool.query(
      `INSERT INTO audit_log (user_email, action, payload) VALUES ($1, $2, $3::jsonb)`,
      [email || null, action, JSON.stringify(payload || {})],
    );
  } catch (e) {
    console.warn('[audit] insert failed:', e.message);
  }
}
