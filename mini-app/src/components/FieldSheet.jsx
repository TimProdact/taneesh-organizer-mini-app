import { useEffect, useState } from 'react';
import { Button } from '@telegram-apps/telegram-ui';
import { BottomSheet } from './BottomSheet.jsx';
import { haptic } from '../api.js';

export function FieldSheet({
  open,
  title,
  value,
  type = 'text',
  inputMode,
  placeholder,
  multiline = false,
  onClose,
  onSave,
}) {
  const [draft, setDraft] = useState(value ?? '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setDraft(value ?? '');
  }, [open, value]);

  const done = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onSave?.(draft);
      haptic('success');
      onClose?.();
    } finally {
      setBusy(false);
    }
  };

  const InputTag = multiline ? 'textarea' : 'input';

  return (
    <BottomSheet open={open} title={title} onClose={onClose}>
      <div className="fm-field-sheet">
        <InputTag
          className={`fm-field-sheet-input${multiline ? ' fm-field-sheet-input--area' : ''}`}
          type={multiline ? undefined : type}
          inputMode={inputMode}
          value={draft}
          placeholder={placeholder}
          rows={multiline ? 4 : undefined}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
        />
        <Button mode="filled" size="l" stretched disabled={busy} onClick={done}>
          Готово
        </Button>
      </div>
    </BottomSheet>
  );
}
