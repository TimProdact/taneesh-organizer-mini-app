import { useEffect, useState } from 'react';
import { Button, Input } from '@telegram-apps/telegram-ui';
import { BottomSheet } from './BottomSheet.jsx';
import { runActionSafe } from '../api.js';
import {
  formatUzMobileMask,
  isCompleteUzMobile,
  parseUzMobileDigits,
  uzPhoneNationalDigitsToE164,
} from '../utils/uzPhoneMask.js';

export function AddControllerSheet({ open, onSnapshotChange, onClose }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName('');
    setPhone('');
    setBusy(false);
  }, [open]);

  const canSave = Boolean(name.trim() && isCompleteUzMobile(phone));

  const save = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    try {
      const next = await runActionSafe('add_controller', {
        name: name.trim(),
        phoneNational: parseUzMobileDigits(phone),
        phone: uzPhoneNationalDigitsToE164(phone),
      });
      onSnapshotChange(next);
      onClose();
    } catch {
      /* alert already shown */
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} title="Новый контролер" subtitle="Доступ по номеру телефона" onClose={onClose}>
      <div className="fm-controller-form">
        <Input
          header="Имя и Фамилия"
          placeholder="Иван Иванов"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          header="Номер телефона"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          placeholder="+998 __ ___ __ __"
          value={formatUzMobileMask(phone)}
          onChange={(e) => setPhone(parseUzMobileDigits(e.target.value))}
        />
        <p className="fm-empty-hint" style={{ marginTop: 0 }}>
          Контролер входит в сканер по этому номеру. Максимум 5 человек.
        </p>
        <div className="fm-wizard-sheet-cta fm-wizard-sheet-cta--separated">
          <Button mode="filled" size="l" stretched disabled={!canSave || busy} onClick={save}>
            Сохранить
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
