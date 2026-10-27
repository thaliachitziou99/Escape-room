import { createElement, forwardRef, Fragment } from 'react';
const DROP = new Set(['initial', 'animate', 'exit', 'transition', 'variants', 'whileHover', 'whileTap', 'layout', 'layoutId', 'custom']);
const cache: Record<string, unknown> = {};
export const motion = new Proxy({}, { get: (_t, tag: string) => (cache[tag] ??= forwardRef((props: Record<string, unknown>, ref) => {
  const rest = Object.fromEntries(Object.entries(props).filter(([k]) => !DROP.has(k)));
  return createElement(tag, { ...rest, ref });
})) }) as Record<string, never>;
export const AnimatePresence = ({ children }: { children?: unknown }) => createElement(Fragment, null, children as never);
export const MotionConfig = AnimatePresence;
