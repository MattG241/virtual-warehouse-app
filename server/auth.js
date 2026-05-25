import jwt from 'jsonwebtoken';
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { pool } from './db.js';

const scrypt = promisify(scryptCb);

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const ALLOWED_EMAILS = (process.env.ALLOWED_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

const COOKIE_NAME = 'session';
const SESSION_TTL_DAYS = 30;
const SCRYPT_KEYLEN = 64;
const PASSWORD_MIN_LENGTH = 8;

export function isAllowed(email) {
  if (!email) return false;
  const e = email.toLowerCase();
  if (ALLOWED_EMAILS.length === 0) return false;
  if (ALLOWED_EMAILS.includes('*')) return true;
  return ALLOWED_EMAILS.includes(e);
}

export function validateEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePassword(password) {
  return typeof password === 'string' && password.length >= PASSWORD_MIN_LENGTH;
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString('hex')}$${derived.toString('hex')}`;
}

export async function verifyPasswordHash(password, stored) {
  if (!stored || !stored.startsWith('scrypt$')) return false;
  const [, saltHex, hashHex] = stored.split('$');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const derived = await scrypt(password, salt, SCRYPT_KEYLEN);
  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

export async function findUser(email) {
  const r = await pool.query(
    `SELECT id, email, password_hash, created_at, last_login_at FROM users WHERE email = $1`,
    [email.toLowerCase()],
  );
  return r.rows[0] || null;
}

export async function createUser(email, password) {
  const hash = await hashPassword(password);
  const r = await pool.query(
    `INSERT INTO users (email, password_hash) VALUES ($1, $2)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email, created_at`,
    [email.toLowerCase(), hash],
  );
  return r.rows[0] || null;
}

export async function markLogin(email) {
  await pool.query(`UPDATE users SET last_login_at = NOW() WHERE email = $1`, [
    email.toLowerCase(),
  ]);
}

function makeSessionToken(email) {
  return jwt.sign({ sub: email, type: 'session' }, JWT_SECRET, {
    expiresIn: `${SESSION_TTL_DAYS}d`,
  });
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

export const PASSWORD_MIN = PASSWORD_MIN_LENGTH;
