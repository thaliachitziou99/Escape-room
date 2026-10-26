import 'server-only';
import { logLine, type OpsEvent } from '@/features/runtime/redact';

/** Structured, redacted operational log (stdout -> hosting provider logs). Never pass raw request bodies. */
export function logOps(level: 'info' | 'warn' | 'error', event: OpsEvent, fields: Record<string, unknown> = {}): void {
  const line = logLine(level, event, fields);
  if (level === 'error') console.error(line); else if (level === 'warn') console.warn(line); else console.log(line);
}
