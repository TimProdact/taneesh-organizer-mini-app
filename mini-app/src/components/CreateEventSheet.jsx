import { useEffect, useState } from 'react';
import { Button } from '@telegram-apps/telegram-ui';
import { BottomSheet } from './BottomSheet.jsx';
import { haptic, runActionSafe } from '../api.js';

const STEPS = 2;

function toDateValue(iso) {
  const d = iso ? new Date(iso) : new Date(Date.now() + 7 * 86_400_000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeValue() {
  const d = new Date();
  d.setHours(20, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function mergeDateTime(datePart, timePart) {
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  const base = new Date();
  base.setFullYear(y, m - 1, d);
  base.setHours(hh, mm, 0, 0);
  return base.toISOString();
}

export function CreateEventSheet({ open, onSnapshotChange, onClose }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [capacity, setCapacity] = useState(100);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(1);
    setName('');
    setDate(toDateValue());
    setTime(toTimeValue());
    setCapacity(100);
    setBusy(false);
  }, [open]);

  const next = () => {
    if (!name.trim()) return;
    haptic('selection');
    setStep(2);
  };

  const create = async () => {
    if (busy || !name.trim()) return;
    setBusy(true);
    try {
      const nextSnap = await runActionSafe('create_event', {
        name: name.trim(),
        startsAt: mergeDateTime(date, time),
        capacity,
      });
      onSnapshotChange(nextSnap);
      haptic('success');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      title="Новое мероприятие"
      subtitle={`Шаг ${step}/${STEPS}`}
      className="fm-sheet-panel--wizard"
      onClose={onClose}
    >
      {step === 1 ? (
        <div className="fm-wizard-sheet">
          <p className="fm-media-hint">Название и дата</p>
          <input
            type="text"
            className="fm-wizard-input"
            placeholder="Название ивента"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="fm-wizard-datetime" style={{ marginTop: 12 }}>
            <input type="date" className="fm-wizard-input" value={date} onChange={(e) => setDate(e.target.value)} />
            <input type="time" className="fm-wizard-input" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="fm-wizard-sheet-cta fm-wizard-sheet-cta--separated">
            <Button mode="filled" size="l" stretched disabled={!name.trim()} onClick={next}>
              Далее →
            </Button>
          </div>
        </div>
      ) : null}

      {step === 2 ? (
        <div className="fm-wizard-sheet">
          <div className="fm-wizard-picked">
            <span className="fm-wizard-picked-label">Ивент</span>
            <span className="fm-wizard-picked-value">{name.trim() || '—'}</span>
          </div>
          <p className="fm-media-hint">Сколько билетов?</p>
          <div className="fm-wizard-stock">
            <span className="fm-wizard-stock-label">{capacity} билетов</span>
            <div className="fm-stepper fm-stepper--wizard">
              <button type="button" className="fm-stepper-btn" disabled={capacity <= 1} onClick={() => setCapacity((s) => Math.max(1, s - 10))}>−</button>
              <button type="button" className="fm-stepper-btn" onClick={() => setCapacity((s) => s + 10)}>+</button>
            </div>
          </div>
          <div className="fm-wizard-sheet-cta fm-wizard-sheet-cta--separated">
            <Button mode="filled" size="l" stretched disabled={busy} onClick={create}>
              Создать мероприятие
            </Button>
          </div>
        </div>
      ) : null}
    </BottomSheet>
  );
}
