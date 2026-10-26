'use client';
import { useState } from 'react';
import type { PuzzleAnswer, PuzzleConfig } from '@/features/game-engine/types';
import { Btn } from './ui';
import type { PublicPuzzle } from './types';

/** TV: read-only board so everyone can see the pieces; answers are entered on the phone. */
export function PuzzleSummary({ puzzle, hint }: { puzzle: PublicPuzzle; hint: string | null }) {
  const c = puzzle.config;
  return (
    <div className="grid gap-4">
      <p className="text-[1.6cqw] text-[#9CA7B8]">{puzzle.description}</p>
      {c.type === 'numeric' && <p className="text-[4cqw] tracking-[0.5em]" aria-label={`Κωδικός ${c.length} ψηφίων`}>{'▢'.repeat(c.length)}</p>}
      {c.type === 'sequence' && <Chips items={c.controls.map((x) => x.label)} numbered={false} />}
      {c.type === 'symbol' && <div className="grid gap-2"><Chips items={c.symbols.map((x) => x.glyph)} numbered={false} /><Chips items={c.slots.map((x) => x.label)} numbered={false} /></div>}
      {c.type === 'cipher' && <><p className="font-mono text-[2.4cqw] tracking-widest">{c.encoded}</p>{c.options && <Chips items={c.options.map((o) => o.text)} numbered={false} />}</>}
      {c.type === 'assembly' && <Chips items={c.fragments.map((f) => f.text)} numbered={false} />}
      {c.type === 'evidence' && <Chips items={c.events.map((e) => e.text)} numbered={false} />}
      {c.type === 'contextual' && <p className="text-[#C7A76C]">Εξερεύνησε το δωμάτιο για να το λύσεις.</p>}
      {c.type !== 'contextual' && <p className="text-[1.4cqw] text-[#C7A76C]">Η απάντηση δίνεται από το κινητό.</p>}
      {hint && <p role="status" className="rounded-lg border border-[#C7A76C]/50 bg-[#C7A76C]/10 p-3 text-[1.6cqw]"><strong>Βοήθεια: </strong>{hint}</p>}
    </div>
  );
}

function Chips({ items, numbered }: { items: string[]; numbered: boolean }) {
  return <ul className="flex flex-wrap gap-2">{items.map((t, i) => <li key={i} className="rounded-md border border-white/20 px-3 py-1 text-[1.6cqw]">{numbered ? `${i + 1}. ` : ''}{t}</li>)}</ul>;
}

/* ---------------- phone: interactive inputs. Every state is shown with text/numbers, never colour alone. ---------------- */

type Props = { puzzle: PublicPuzzle; discoveredClues: string[]; busy: boolean; onSubmit: (answer: PuzzleAnswer) => void };

export function PuzzleInputs({ puzzle, discoveredClues, busy, onSubmit }: Props) {
  const c = puzzle.config;
  switch (c.type) {
    case 'numeric': return <Numeric length={c.length} busy={busy} onSubmit={onSubmit} />;
    case 'sequence': return <OrderPicker items={c.controls.map((x) => ({ id: x.id, text: x.label }))} repeat length={c.length} busy={busy} onSubmit={onSubmit} />;
    case 'assembly': return <OrderPicker items={c.fragments.map((x) => ({ id: x.id, text: x.text }))} busy={busy} onSubmit={onSubmit} />;
    case 'evidence': return <OrderPicker items={c.events.map((x) => ({ id: x.id, text: x.text, locked: !discoveredClues.includes(x.requiresClue) }))} busy={busy} onSubmit={onSubmit} />;
    case 'symbol': return <Symbols config={c} busy={busy} onSubmit={onSubmit} />;
    case 'cipher': return <Cipher config={c} busy={busy} onSubmit={onSubmit} />;
    case 'contextual': return <p className="p-4 text-center text-[#C7A76C]">Αυτό το παζλ λύνεται εξερευνώντας το δωμάτιο, όχι με απάντηση.</p>;
  }
}

function Numeric({ length, busy, onSubmit }: { length: number; busy: boolean; onSubmit: (a: PuzzleAnswer) => void }) {
  const [v, setV] = useState('');
  return (
    <div className="grid gap-3">
      <p className="text-center text-4xl tracking-[0.4em]" aria-live="polite" aria-label={`Έχεις πληκτρολογήσει ${v.length} από ${length} ψηφία`}>{(v + '·'.repeat(length - v.length)).split('').join(' ')}</p>
      <div className="grid grid-cols-3 gap-2">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <Btn key={d} big onClick={() => v.length < length && setV(v + d)} label={`Ψηφίο ${d}`} cursor={false}>{d}</Btn>)}
        <Btn big onClick={() => setV('')} label="Καθαρισμός" cursor={false}>✕</Btn>
        <Btn big onClick={() => v.length < length && setV(v + '0')} label="Ψηφίο 0" cursor={false}>0</Btn>
        <Btn big onClick={() => setV(v.slice(0, -1))} label="Διαγραφή ψηφίου" cursor={false}>⌫</Btn>
      </div>
      <Btn kind="gold" big disabled={busy || v.length !== length} onClick={() => onSubmit(v)} cursor={false}>Δοκιμή</Btn>
    </div>
  );
}

type Item = { id: string; text: string; locked?: boolean };
function OrderPicker({ items, repeat, length, busy, onSubmit }: { items: Item[]; repeat?: boolean; length?: number; busy: boolean; onSubmit: (a: PuzzleAnswer) => void }) {
  const [order, setOrder] = useState<string[]>([]);
  const target = length ?? items.length;
  const text = (id: string) => items.find((x) => x.id === id)?.text ?? id;
  return (
    <div className="grid gap-3">
      <ol className="min-h-12 rounded-lg border border-white/15 p-2" aria-label="Η σειρά σου">
        {order.length === 0 && <li className="text-[#9CA7B8]">Διάλεξε με τη σειρά ({target})</li>}
        {order.map((id, i) => <li key={i} className="py-0.5"><strong>{i + 1}.</strong> {text(id)}</li>)}
      </ol>
      <ul className="grid gap-2">
        {items.map((it) => {
          const used = !repeat && order.includes(it.id);
          return (
            <li key={it.id}>
              <Btn onClick={() => !it.locked && !used && order.length < target && setOrder([...order, it.id])} disabled={it.locked || used || order.length >= target} cursor={false}
                label={`${it.text}${it.locked ? ' (λείπει στοιχείο)' : used ? ' (ήδη επιλεγμένο)' : ''}`}>
                <span className="block w-full text-left">{it.text}{it.locked ? ' 🔒 λείπει στοιχείο' : used ? ' ✓' : ''}</span>
              </Btn>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-2">
        <Btn onClick={() => setOrder(order.slice(0, -1))} disabled={!order.length} cursor={false}>↶ Αναίρεση</Btn>
        <Btn onClick={() => setOrder([])} disabled={!order.length} cursor={false}>Καθαρισμός</Btn>
        <span className="flex-1" />
        <Btn kind="gold" disabled={busy || order.length !== target} onClick={() => { onSubmit(order); setOrder([]); }} cursor={false}>Δοκιμή</Btn>
      </div>
    </div>
  );
}

function Symbols({ config, busy, onSubmit }: { config: Extract<PuzzleConfig, { type: 'symbol' }>; busy: boolean; onSubmit: (a: PuzzleAnswer) => void }) {
  const [pick, setPick] = useState<Record<string, string>>({});
  const done = config.slots.every((s) => pick[s.id]);
  return (
    <div className="grid gap-3">
      {config.slots.map((s) => (
        <fieldset key={s.id} className="rounded-lg border border-white/15 p-2">
          <legend className="px-1">{s.label}{pick[s.id] ? ' ✓' : ''}</legend>
          <div className="flex flex-wrap gap-2">
            {config.symbols.map((y) => (
              <Btn key={y.id} kind={pick[s.id] === y.id ? 'gold' : 'ghost'} onClick={() => setPick({ ...pick, [s.id]: y.id })} cursor={false} label={`${s.label}: σύμβολο ${y.glyph}${pick[s.id] === y.id ? ' (επιλεγμένο)' : ''}`}>{y.glyph}</Btn>
            ))}
          </div>
        </fieldset>
      ))}
      <Btn kind="gold" big disabled={busy || !done} onClick={() => onSubmit(pick)} cursor={false}>Δοκιμή</Btn>
    </div>
  );
}

function Cipher({ config, busy, onSubmit }: { config: Extract<PuzzleConfig, { type: 'cipher' }>; busy: boolean; onSubmit: (a: PuzzleAnswer) => void }) {
  const [text, setText] = useState('');
  const [choice, setChoice] = useState('');
  return (
    <div className="grid gap-3">
      <p className="rounded-lg border border-white/15 p-3 font-mono text-xl tracking-widest">{config.encoded}</p>
      {config.mode === 'text' ? (
        <>
          <label htmlFor="cipher" className="text-[#9CA7B8]">Η απάντησή σου</label>
          <input id="cipher" value={text} onChange={(e: { target: { value: string } }) => setText(e.target.value.slice(0, 120))} autoComplete="off" autoCapitalize="none" spellCheck={false}
            className="rounded-lg border border-white/25 bg-[#0b0f18] px-3 py-3 text-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#C7A76C]" />
          <Btn kind="gold" big disabled={busy || !text.trim()} onClick={() => onSubmit(text.trim())} cursor={false}>Δοκιμή</Btn>
        </>
      ) : (
        <>
          <ul className="grid gap-2" role="radiogroup" aria-label="Επιλογές">
            {(config.options ?? []).map((o) => (
              <li key={o.id}><Btn kind={choice === o.id ? 'gold' : 'ghost'} onClick={() => setChoice(o.id)} cursor={false} label={`${o.text}${choice === o.id ? ' (επιλεγμένο)' : ''}`}><span className="block w-full text-left">{choice === o.id ? '● ' : '○ '}{o.text}</span></Btn></li>
            ))}
          </ul>
          <Btn kind="gold" big disabled={busy || !choice} onClick={() => onSubmit(choice)} cursor={false}>Δοκιμή</Btn>
        </>
      )}
    </div>
  );
}
