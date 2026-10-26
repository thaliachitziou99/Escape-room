const cookieString = (name, value, o = {}) =>
  [`${name}=${encodeURIComponent(value)}`, o.path && `Path=${o.path}`, o.maxAge != null && `Max-Age=${o.maxAge}`, o.httpOnly && 'HttpOnly', o.secure && 'Secure', o.sameSite && `SameSite=${o.sameSite}`].filter(Boolean).join('; ');
export class NextResponse extends Response {
  static json(body, init = {}) { return new NextResponse(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } }); }
  static redirect(url, status = 307) { return new NextResponse(null, { status, headers: { location: String(url) } }); }
  get cookies() { return { set: (name, value, o) => { this.headers.append('set-cookie', cookieString(name, value, o)); return this; } }; }
}
export class NextRequest extends Request {}
