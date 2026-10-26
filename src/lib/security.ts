import 'server-only';
import { createHmac, randomBytes, randomInt } from 'node:crypto';
import { NextResponse } from 'next/server';
import { env } from '@/lib/env';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const PAIRING_TTL_MS = 5 * 60 * 1000;
export const CONTROLLER_LIVE_MS = 15 * 1000; // heartbeat timeout (heartbeat endpoint comes later)

export const newCredential = () => randomBytes(32).toString('base64url');
export const newPairingCode = () => String(randomInt(0, 1_000_000)).padStart(6, '0');
const hmac = (value: string) => createHmac('sha256', env.pairingSecret).update(value).digest('hex');
export const hashCode = (sessionId: string, code: string) => hmac(`code:${sessionId}:${code}`);
export const hashCredential = (cred: string) => hmac(`cred:${cred}`);

export type Role = 'display' | 'controller';
export const cookieName = (role: Role, sessionId: string) => `e13_${role[0]}_${sessionId}`;

export function setCredentialCookie(res: NextResponse, role: Role, sessionId: string, cred: string) {
  res.cookies.set(cookieName(role, sessionId), cred, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 4 * 60 * 60,
  });
}

/** CSRF defence for state-changing routes: Origin must match APP_BASE_URL. */
export function originOk(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(env.baseUrl).origin;
  } catch {
    return false;
  }
}

export const fail = (code: string, message: string, status: number) =>
  NextResponse.json({ ok: false, error: { code, message } }, { status });
export const ok = (data: unknown, status = 200) => NextResponse.json({ ok: true, data }, { status });
