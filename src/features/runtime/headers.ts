// Security headers for next.config.ts. Pure so they can be tested without Next.
export function securityHeaders(opts: { supabaseUrl?: string; dev?: boolean } = {}): { key: string; value: string }[] {
  const supa = opts.supabaseUrl ? new URL(opts.supabaseUrl) : null;
  const connect = ["'self'", ...(supa ? [supa.origin, `wss://${supa.host}`] : [])];
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${opts.dev ? " 'unsafe-eval'" : ''}`, // Next injects inline bootstrap scripts; nonce-based CSP is a documented follow-up
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob:${supa ? ' ' + supa.origin : ''}`,
    `media-src 'self' blob:${supa ? ' ' + supa.origin : ''}`,
    `connect-src ${connect.join(' ')}`,
    "font-src 'self' data:",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; ');
  return [
    { key: 'Content-Security-Policy', value: csp },
    { key: 'Referrer-Policy', value: 'no-referrer' }, // the /join URL briefly carries a pairing code
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'X-Frame-Options', value: 'DENY' },
    { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
  ];
}
