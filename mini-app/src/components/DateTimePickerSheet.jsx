import { useEffect, useMemo, useState } from 'react';
import { Button } from '@telegram-apps/telegram-ui';

const WEEKDAYS = ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'];
const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

function pad(n) {
  return String(n).padStart(2, '0');
}

export function toLocalParts(iso) {
  const d = iso ? new Date(iso) : new Date();
  return {
    y: d.getFullYear(),
    m: d.getMonth(),
    day: d.getDate(),
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function partsToIso({ y, m, day, time }) {
  const [hh, mm] = String(time || '20:00').split(':').map(Number);
  const d = new Date(y, m, day, hh || 0, mm || 0, 0, 0);
  return d.toISOString();
}

function sameDay(a, b) {
  return a.y === b.y && a.m === b.m && a.day === b.day;
}

function isToday(parts) {
  const n = new Date();
  return sameDay(parts, { y: n.getFullYear(), m: n.getMonth(), day: n.getDate() });
}

function buildMonthCells(y, m) {
  const first = new Date(y, m, 1);
  // Monday-first
  let start = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < start; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function ctaLabel(parts) {
  const time = parts.time || '00:00';
  if (isToday(parts)) return `Сегодня в ${time}`;
  const d = new Date(parts.y, parts.m, parts.day);
  const dateStr = d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  return `${dateStr}, ${time}`;
}

/**
 * Модалка выбора даты+времени (как в Telegram schedule).
 * Без строки «Повторять».
 */
export function DateTimePickerSheet({
  open,
  title = 'Дата и время',
  valueIso,
  onClose,
  onSave,
  busy = false,
}) {
  const [viewY, setViewY] = useState(() => toLocalParts(valueIso).y);
  const [viewM, setViewM] = useState(() => toLocalParts(valueIso).m);
  const [selected, setSelected] = useState(() => toLocalParts(valueIso));

  useEffect(() => {
    if (!open) return;
    const parts = toLocalParts(valueIso);
    setSelected(parts);
    setViewY(parts.y);
    setViewM(parts.m);
  }, [open, valueIso]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const cells = useMemo(() => buildMonthCells(viewY, viewM), [viewY, viewM]);

  const shiftMonth = (delta) => {
    const d = new Date(viewY, viewM + delta, 1);
    setViewY(d.getFullYear());
    setViewM(d.getMonth());
  };

  if (!open) return null;

  const handleSave = () => {
    onSave?.(partsToIso(selected));
  };

  return (
    <div className="fm-sheet-root" role="presentation" onClick={onClose}>
      <div className="fm-sheet-backdrop" />
      <div
        className="fm-sheet-panel fm-sheet-panel--datetime"
        role="dialog"
        aria-modal
        onClick={(e) => e.stopPropagation()}
      >
        <header className="fm-dt-header">
          <button type="button" className="fm-dt-icon-btn" aria-label="Закрыть" onClick={onClose}>
            ✕
          </button>
          <div className="fm-dt-title">{title}</div>
          <span className="fm-dt-icon-btn fm-dt-icon-btn--ghost" aria-hidden />
        </header>

        <div className="fm-dt-body">
          <div className="fm-dt-month-bar">
            <span className="fm-dt-month-label">
              {MONTHS[viewM]} {viewY}
            </span>
            <div className="fm-dt-month-nav">
              <button type="button" className="fm-dt-nav-btn" onClick={() => shiftMonth(-1)} aria-label="Предыдущий месяц">
                ‹
              </button>
              <button type="button" className="fm-dt-nav-btn" onClick={() => shiftMonth(1)} aria-label="Следующий месяц">
                ›
              </button>
            </div>
          </div>

          <div className="fm-dt-weekdays">
            {WEEKDAYS.map((w) => (
              <span key={w} className="fm-dt-weekday">{w}</span>
            ))}
          </div>

          <div className="fm-dt-grid">
            {cells.map((day, idx) => {
              if (!day) return <span key={`e-${idx}`} className="fm-dt-day fm-dt-day--empty" />;
              const parts = { y: viewY, m: viewM, day };
              const selectedDay = sameDay(selected, parts);
              return (
                <button
                  key={`${viewY}-${viewM}-${day}`}
                  type="button"
                  className={`fm-dt-day${selectedDay ? ' fm-dt-day--selected' : ''}`}
                  onClick={() => setSelected((s) => ({ ...s, y: viewY, m: viewM, day }))}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="fm-dt-rows">
            <label className="fm-dt-row">
              <span className="fm-dt-row-label">Время</span>
              <input
                type="time"
                className="fm-dt-time-pill"
                value={selected.time}
                onChange={(e) => setSelected((s) => ({ ...s, time: e.target.value }))}
              />
            </label>
          </div>
        </div>

        <div className="fm-dt-footer">
          <Button mode="filled" size="l" stretched disabled={busy} onClick={handleSave}>
            {ctaLabel(selected)}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function formatEventDateTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}
