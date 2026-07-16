import { useEffect, useRef } from 'react';

const ITEM_H = 36;
const VISIBLE = 5;

function pad(n) {
  return String(n).padStart(2, '0');
}

function WheelColumn({ values, value, onChange, ariaLabel }) {
  const ref = useRef(null);
  const lock = useRef(false);
  const scrollTimer = useRef(null);
  const index = Math.max(0, values.indexOf(value));

  useEffect(() => {
    const el = ref.current;
    if (!el || lock.current) return;
    const top = index * ITEM_H;
    if (Math.abs(el.scrollTop - top) > 1) {
      el.scrollTop = top;
    }
  }, [index, value]);

  useEffect(() => () => clearTimeout(scrollTimer.current), []);

  const onScrollEnd = () => {
    const el = ref.current;
    if (!el) return;
    const next = Math.round(el.scrollTop / ITEM_H);
    const clamped = Math.max(0, Math.min(values.length - 1, next));
    const snapped = clamped * ITEM_H;
    if (Math.abs(el.scrollTop - snapped) > 0.5) {
      el.scrollTo({ top: snapped, behavior: 'smooth' });
    }
    const nextVal = values[clamped];
    if (nextVal !== value) onChange(nextVal);
  };

  return (
    <div className="fm-wheel-col" aria-label={ariaLabel}>
      <div
        ref={ref}
        className="fm-wheel-scroll"
        onScroll={() => {
          lock.current = true;
          clearTimeout(scrollTimer.current);
          scrollTimer.current = setTimeout(() => {
            lock.current = false;
            onScrollEnd();
          }, 80);
        }}
      >
        <div className="fm-wheel-pad" style={{ height: ITEM_H * Math.floor(VISIBLE / 2) }} />
        {values.map((v) => (
          <div
            key={v}
            className={`fm-wheel-item${v === value ? ' fm-wheel-item--on' : ''}`}
            style={{ height: ITEM_H }}
          >
            {pad(v)}
          </div>
        ))}
        <div className="fm-wheel-pad" style={{ height: ITEM_H * Math.floor(VISIBLE / 2) }} />
      </div>
    </div>
  );
}

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 }, (_, i) => i);

/** iOS / Telegram-style dual drum for HH:mm */
export function TimeWheelPicker({ time, onChange }) {
  const [hh, mm] = String(time || '00:00').split(':').map((x) => Number(x) || 0);

  const setHour = (h) => onChange(`${pad(h)}:${pad(mm)}`);
  const setMinute = (m) => onChange(`${pad(hh)}:${pad(m)}`);

  return (
    <div
      className="fm-wheel"
      style={{ '--fm-wheel-item-h': `${ITEM_H}px`, '--fm-wheel-visible': VISIBLE }}
      role="group"
      aria-label="Выбор времени"
    >
      <div className="fm-wheel-highlight" aria-hidden />
      <div className="fm-wheel-cols">
        <WheelColumn values={HOURS} value={hh} onChange={setHour} ariaLabel="Часы" />
        <WheelColumn values={MINUTES} value={mm} onChange={setMinute} ariaLabel="Минуты" />
      </div>
    </div>
  );
}
