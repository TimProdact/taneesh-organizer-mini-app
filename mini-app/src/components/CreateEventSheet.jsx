import { useEffect, useState } from 'react';
import { Button } from '@telegram-apps/telegram-ui';
import { BottomSheet } from './BottomSheet.jsx';
import { DateTimePickerSheet, formatEventDateTime, partsToIso, toLocalParts } from './DateTimePickerSheet.jsx';
import { haptic, runActionSafe } from '../api.js';
import { ValueGroup } from './ValueGroup.jsx';
import { ValueRow } from './ValueRow.jsx';

const STEPS = 2;

export function CreateEventSheet({ open, onSnapshotChange, onClose }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [picker, setPicker] = useState(null);
  const [capacity, setCapacity] = useState(100);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const start = partsToIso({ ...toLocalParts(new Date(Date.now() + 7 * 86_400_000).toISOString()), time: '20:00' });
    const end = new Date(new Date(start).getTime() + 3 * 3600_000).toISOString();
    setStep(1);
    setName('');
    setStartsAt(start);
    setEndsAt(end);
    setCapacity(100);
    setBusy(false);
    setPicker(null);
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
        startsAt,
        endsAt,
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
    <>
      <BottomSheet
        open={open && !picker}
        title="Новое мероприятие"
        subtitle={`Шаг ${step}/${STEPS}`}
        className="fm-sheet-panel--wizard"
        onClose={onClose}
      >
        {step === 1 ? (
          <div className="fm-wizard-sheet">
            <p className="fm-media-hint">Название</p>
            <input
              type="text"
              className="fm-wizard-input"
              placeholder="Название ивента"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <ValueGroup className="fm-value-group--spaced">
              <ValueRow
                label="Начало"
                value={formatEventDateTime(startsAt)}
                onClick={() => setPicker('start')}
              />
              <ValueRow
                label="Конец"
                value={formatEventDateTime(endsAt)}
                onClick={() => setPicker('end')}
                last
              />
            </ValueGroup>
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

      <DateTimePickerSheet
        open={open && picker === 'start'}
        title="Начало"
        valueIso={startsAt}
        onClose={() => setPicker(null)}
        onSave={(iso) => {
          setStartsAt(iso);
          if (endsAt && new Date(endsAt) <= new Date(iso)) {
            setEndsAt(new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString());
          }
          setPicker(null);
        }}
      />

      <DateTimePickerSheet
        open={open && picker === 'end'}
        title="Конец"
        valueIso={endsAt}
        onClose={() => setPicker(null)}
        onSave={(iso) => {
          setEndsAt(iso);
          setPicker(null);
        }}
      />
    </>
  );
}
