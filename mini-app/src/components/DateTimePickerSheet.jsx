import { useEffect, useMemo, useState } from 'react';
import { Button, Cell, List } from '@telegram-apps/telegram-ui';
import { Icon24Close } from '@telegram-apps/telegram-ui/dist/icons/24/close';
import { Icon24ChevronLeft } from '@telegram-apps/telegram-ui/dist/icons/24/chevron_left';
import { Icon24ChevronRight } from '@telegram-apps/telegram-ui/dist/icons/24/chevron_right';
import { TimeWheelPicker } from './TimeWheelPicker.jsx';
import { haptic } from '../api.js';

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
 * Модалка даты+времени в стиле Telegram schedule.
 * Тап по «Время» открывает барабан HH:mm поверх календаря.
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
  const [timeOpen, setTimeOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const parts = toLocalParts(valueIso);
    setSelected(parts);
    setViewY(parts.y);
    setViewM(parts.m);
    setTimeOpen(false);
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
            <Icon24Close />
          </button>
          <div className="fm-dt-title">{title}</div>
          <span className="fm-dt-icon-btn fm-dt-icon-btn--ghost" aria-hidden />
        </header>

        <div className="fm-dt-body">
          <div className="fm-dt-cal-wrap">
            <div className="fm-dt-month-bar">
              <span className="fm-dt-month-label">
                {MONTHS[viewM]} {viewY}
              </span>
              <div className="fm-dt-month-nav">
                <button type="button" className="fm-dt-nav-btn" onClick={() => shiftMonth(-1)} aria-label="Предыдущий месяц">
                  <Icon24ChevronLeft />
                </button>
                <button type="button" className="fm-dt-nav-btn" onClick={() => shiftMonth(1)} aria-label="Следующий месяц">
                  <Icon24ChevronRight />
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
                    onClick={() => {
                      setTimeOpen(false);
                      setSelected((s) => ({ ...s, y: viewY, m: viewM, day }));
                      haptic('selection');
                    }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {timeOpen ? (
              <div className="fm-dt-wheel-layer">
                <button
                  type="button"
                  className="fm-dt-wheel-scrim"
                  aria-label="Закрыть выбор времени"
                  onClick={() => setTimeOpen(false)}
                />
                <div className="fm-dt-wheel-card">
                  <TimeWheelPicker
                    time={selected.time}
                    onChange={(time) => {
                      setSelected((s) => ({ ...s, time }));
                      haptic('selection');
                    }}
                  />
                </div>
              </div>
            ) : null}
          </div>

          <List className="fm-dt-rows">
            <Cell
              className="fm-dt-cell"
              after={(
                <span className={`fm-dt-time-pill${timeOpen ? ' fm-dt-time-pill--on' : ''}`}>
                  {selected.time}
                </span>
              )}
              onClick={() => {
                haptic('selection');
                setTimeOpen((v) => !v);
              }}
            >
              Время
            </Cell>
          </List>
        </div>

        <div className="fm-dt-footer">
          <Button
            mode="filled"
            size="l"
            stretched
            disabled={busy}
            onClick={() => onSave?.(partsToIso(selected))}
          >
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
