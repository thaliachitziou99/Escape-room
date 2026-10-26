// Privacy-conscious logging helpers. Pure. Anything credential-like is removed before a log line is written.
const SENSITIVE_LONG = /(cred|secret|token|password|passwd|authorization|cookie|apikey|jwt|pairing|answer|solution|hint|email)/i;
const SENSITIVE_SHORT = /(^|[_-])(ip|key|code)$|[a-z](Ip|Key|Code)$/; // whole-word or camelCase suffix, so 'pgcode' / 'description' are not swallowed
const isSensitiveKey = (k: string) => SENSITIVE_LONG.test(k) || SENSITIVE_SHORT.test(k) || /^(ip|key|code)$/i.test(k);
const JWT = /\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{4,}\b/g;
const LONG_B64 = /\b[A-Za-z0-9_-]{40,}\b/g;
const SIX_DIGIT_IN_URL = /([?&](?:code|c)=)\d{4,8}/gi;

export const REDACTED = '[redacted]';

export function redactString(s: string): string {
  return s.replace(JWT, REDACTED).replace(SIX_DIGIT_IN_URL, `$1${REDACTED}`).replace(LONG_B64, REDACTED);
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return REDACTED;
  if (typeof value === 'string') return redactString(value.length > 500 ? value.slice(0, 500) + '…' : value);
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: redactString(value.message) }; // never the stack
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = isSensitiveKey(k) ? REDACTED : redact(v, depth + 1);
    return out;
  }
  return value;
}

export type OpsEvent =
  | 'session_create_failed' | 'pairing_failed' | 'realtime_disconnect' | 'game_action_error'
  | 'puzzle_validation_error' | 'database_failure' | 'admin_publish_failed' | 'rate_limited' | 'unauthorized_access';

export function logLine(level: 'info' | 'warn' | 'error', event: OpsEvent, fields: Record<string, unknown> = {}, nowIso = new Date().toISOString()): string {
  return JSON.stringify({ t: nowIso, level, event, ...(redact(fields) as object) });
}
