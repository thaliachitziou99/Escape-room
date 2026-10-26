'use client';
import { Btn, Panel, Stepper } from './ui';
import { usePlay } from './PlayProvider';
import { DEFAULT_SETTINGS } from '@/features/runtime/settings';
import type { LinkStatus } from './useInputChannel';

const LINK_EL: Record<LinkStatus, string> = { connecting: 'Σύνδεση…', connected: 'Συνδεδεμένο', reconnecting: 'Επανασύνδεση…', failed: 'Αποσυνδέθηκε' };

export function SettingsPanel({ onClose, link, controller, fullscreen }: {
  onClose: () => void; link: LinkStatus; controller?: { paired: boolean; connected: boolean } | null;
  fullscreen?: { active: boolean; supported: boolean; error: string; toggle: () => void };
}) {
  const { settings: s, update } = usePlay();
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <Panel title="Ρυθμίσεις" onClose={onClose}>
      <div className="divide-y divide-white/10">
        <section aria-label="Ήχος" className="pb-3">
          <Stepper label="Γενική ένταση" value={s.masterVolume} onChange={(v) => update({ masterVolume: v })} />
          <Stepper label="Μουσική" value={s.musicVolume} onChange={(v) => update({ musicVolume: v })} />
          <Stepper label="Ατμόσφαιρα" value={s.ambientVolume} onChange={(v) => update({ ambientVolume: v })} />
          <Stepper label="Εφέ ήχου" value={s.sfxVolume} onChange={(v) => update({ sfxVolume: v })} />
          <div className="flex items-center justify-between py-2">
            <span className="text-lg">Σίγαση</span>
            <Btn onClick={() => update({ muted: !s.muted })} label="Σίγαση" kind={s.muted ? 'gold' : 'ghost'}>{s.muted ? 'Ναι — χωρίς ήχο' : 'Όχι'}</Btn>
          </div>
        </section>
        <section aria-label="Δείκτης" className="py-3">
          <Stepper label="Ευαισθησία δείκτη" value={s.cursorSensitivity} min={0} max={100} step={10} onChange={(v) => update({ cursorSensitivity: v })} format={(v) => `${Math.round(v)}`} />
          <div className="flex items-center justify-between py-2">
            <span className="text-lg">Εμφάνιση δείκτη</span>
            <Btn onClick={() => update({ cursorVisible: !s.cursorVisible })} label="Εμφάνιση δείκτη" kind={s.cursorVisible ? 'gold' : 'ghost'}>{s.cursorVisible ? 'Ναι' : 'Όχι'}</Btn>
          </div>
        </section>
        <section aria-label="Εμφάνιση" className="py-3">
          <div className="flex items-center justify-between py-2">
            <span className="text-lg">Μείωση κίνησης</span>
            <span className="flex gap-2">
              {([['system', 'Σύστημα'], ['on', 'Ναι'], ['off', 'Όχι']] as const).map(([v, t]) => (
                <Btn key={v} onClick={() => update({ reducedMotion: v })} kind={s.reducedMotion === v ? 'gold' : 'ghost'} label={`Μείωση κίνησης: ${t}`}>{t}</Btn>
              ))}
            </span>
          </div>
          {fullscreen && (
            <div className="flex items-center justify-between py-2">
              <span className="text-lg">Πλήρης οθόνη</span>
              <span className="flex items-center gap-2">
                <Btn onClick={() => update({ fullscreenPreferred: !s.fullscreenPreferred })} kind={s.fullscreenPreferred ? 'gold' : 'ghost'} label="Προτίμηση πλήρους οθόνης">{s.fullscreenPreferred ? 'Προτίμηση: ναι' : 'Προτίμηση: όχι'}</Btn>
                <Btn onClick={fullscreen.toggle} disabled={!fullscreen.supported} cursor={false} label="Πλήρης οθόνη">{fullscreen.active ? 'Έξοδος' : 'Ενεργοποίηση'}</Btn>
              </span>
            </div>
          )}
          {fullscreen?.error && <p role="alert" className="text-[#e7a3a1]">{fullscreen.error}</p>}
          {fullscreen && <p className="text-sm text-[#9CA7B8]">Η πλήρης οθόνη απαιτεί κλικ με ποντίκι/πληκτρολόγιο στην οθόνη (κανόνας του browser) ή το πλήκτρο F11.</p>}
          <div className="flex items-center justify-between py-2"><span className="text-lg">Γλώσσα</span><span>Ελληνικά</span></div>
        </section>
        <section aria-label="Σύνδεση" className="pt-3">
          <h3 className="mb-1 text-lg">Χειριστήριο</h3>
          <dl className="grid grid-cols-2 gap-1 text-[#9CA7B8]">
            <dt>Κανάλι</dt><dd>{LINK_EL[link]}</dd>
            <dt>Κινητό</dt><dd>{controller ? (controller.paired ? (controller.connected ? 'Συνδεδεμένο' : 'Δεν ανταποκρίνεται') : 'Δεν έχει συνδεθεί') : '—'}</dd>
          </dl>
        </section>
      </div>
      <div className="mt-4 flex justify-between">
        <Btn onClick={() => update({ ...DEFAULT_SETTINGS })} label="Επαναφορά προεπιλογών">Επαναφορά</Btn>
        <Btn kind="gold" onClick={onClose}>Έτοιμο</Btn>
      </div>
      <p className="sr-only">{pct(s.masterVolume)}</p>
    </Panel>
  );
}
