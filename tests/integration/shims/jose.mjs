import { createHmac } from 'node:crypto';
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
export class SignJWT {
  constructor(claims) { this.claims = { ...claims }; this.header = {}; }
  setProtectedHeader(h) { this.header = h; return this; }
  setAudience(a) { this.claims.aud = a; return this; }
  setSubject(s) { this.claims.sub = s; return this; }
  setIssuedAt() { this.claims.iat = Math.floor(Date.now() / 1000); return this; }
  setExpirationTime(t) { const m = /^(\d+)m$/.exec(t); this.claims.exp = Math.floor(Date.now() / 1000) + Number(m[1]) * 60; return this; }
  async sign(key) { const data = `${b64(this.header)}.${b64(this.claims)}`; return `${data}.${createHmac('sha256', Buffer.from(key)).update(data).digest('base64url')}`; }
}
