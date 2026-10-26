// OFFLINE TYPE-CHECK STUBS. No npm access here, so node_modules does not exist. These loose ambient declarations let `tsc` check
// everything that is OUR code (types, imports, property names) against our own modules. They are NOT a substitute for compiling with
// the real @types/react, next, @supabase/*: that has never been done.
declare const process: { env: Record<string, string | undefined> };
declare module 'react' {
  export type ReactNode = any;
  export function useState<T>(i: T | (() => T)): [T, (v: T | ((p: T) => T)) => void];
  export function useEffect(fn: () => void | (() => void), deps?: unknown[]): void;
  export function useRef<T>(i: T | null): { current: T };
  export function useMemo<T>(fn: () => T, deps: unknown[]): T;
  export function useCallback<T extends (...a: any[]) => any>(fn: T, deps: unknown[]): T;
  export function createContext<T>(d: T): { Provider: any; Consumer: any; _t?: T };
  export function useContext<T>(c: { _t?: T }): T;
}
declare module 'motion/react' { export const motion: any; export const AnimatePresence: any; export const MotionConfig: any }
declare namespace React { type PointerEvent = any; type FormEvent = any; type ReactNode = any }
type H = (e: any) => void;
type El = { [k: string]: any; onChange?: H; onClick?: H; onKeyDown?: H; onPointerDown?: H; onPointerMove?: H; onPointerUp?: H; onPointerCancel?: H; onFocus?: H; onMouseEnter?: H; onMouseLeave?: H; onSubmit?: H };
declare namespace JSX { interface IntrinsicElements { [tag: string]: El } interface IntrinsicAttributes { key?: any } interface ElementChildrenAttribute { children: {} } type Element = any }
declare module 'react/jsx-runtime' { export const jsx: any; export const jsxs: any; export const Fragment: any }
declare module 'next/link' { const Link: (p: any) => any; export default Link }
declare module 'next/navigation' { export function notFound(): never; export function redirect(u: string): never }
declare module 'next/headers' { export function cookies(): Promise<{ getAll(): { name: string; value: string }[]; get(n: string): { value: string } | undefined; set(...a: any[]): void }> }
declare module 'next' { export type Metadata = any }
declare module 'next/server' {
  export class NextResponse extends Response { static json(b: any, i?: any): NextResponse; static next(o?: any): NextResponse; static redirect(u: any): NextResponse; cookies: { set(...a: any[]): void } }
  export type NextRequest = { nextUrl: { pathname: string; clone(): any }; cookies: { getAll(): any[]; set(n: string, v: string): void } };
}
type Row = any[] & { [k: string]: any };
type Res = { data: any; error: { message: string; code?: string } | null; count?: number | null };
type Q = { [k: string]: (...a: any[]) => Q } & PromiseLike<Res>;
type SBClient = { realtime: any; channel(...a: any[]): any; removeChannel(...a: any[]): any; from(t: string): Q; rpc(f: string, a?: any): Q; storage: { from(b: string): any }; auth: any };
declare module '@supabase/supabase-js' { export function createClient(...a: any[]): SBClient }
declare module '@supabase/ssr' { export function createServerClient(...a: any[]): SBClient; export function createBrowserClient(...a: any[]): any }
declare module 'jose' { export const SignJWT: any }
declare module 'qrcode' { const q: any; export default q }
declare module 'server-only' {}
declare module 'node:crypto' { export function createHmac(a: string, k: string): any; export function randomBytes(n: number): any; export function randomInt(a: number, b: number): number }
declare module '*.css';
