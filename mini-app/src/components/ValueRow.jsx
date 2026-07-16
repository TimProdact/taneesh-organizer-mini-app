import { Cell, Navigation, Switch } from '@telegram-apps/telegram-ui';
import { haptic } from '../api.js';

/** One-line preview for settings values — never wraps */
export function previewLine(value, empty = '—') {
  if (value == null) return empty;
  const s = String(value).replace(/\s+/g, ' ').trim();
  return s || empty;
}

/**
 * Settings row — one line: [label] …… [value…] [>]
 * Do not put value in Cell `hint` (breaks layout with hashed kit classes).
 */
export function ValueRow({
  label,
  value,
  onClick,
  last = false,
  muted = false,
  leading = null,
}) {
  void last;
  const preview = previewLine(value);

  return (
    <Cell
      className="fm-tgui-value-row"
      before={leading || undefined}
      after={(
        <span className="fm-value-after">
          <span className={`fm-value-text${muted ? ' fm-value-text--muted' : ''}`}>
            {preview}
          </span>
          {onClick ? <Navigation /> : null}
        </span>
      )}
      onClick={
        onClick
          ? () => {
              haptic('selection');
              onClick();
            }
          : undefined
      }
    >
      {label}
    </Cell>
  );
}

export function StepperRow({
  label,
  value,
  onDecrement,
  onIncrement,
  decrementDisabled = false,
  incrementDisabled = false,
  last = false,
}) {
  void last;
  return (
    <Cell
      className="fm-tgui-value-row"
      after={(
        <div className="fm-stepper fm-stepper--compact">
          <button
            type="button"
            className="fm-stepper-btn"
            disabled={decrementDisabled}
            onClick={(e) => {
              e.stopPropagation();
              onDecrement?.();
            }}
          >
            −
          </button>
          <span className="fm-stepper-value">{value}</span>
          <button
            type="button"
            className="fm-stepper-btn"
            disabled={incrementDisabled}
            onClick={(e) => {
              e.stopPropagation();
              onIncrement?.();
            }}
          >
            +
          </button>
        </div>
      )}
    >
      {label}
    </Cell>
  );
}

export function SwitchRow({ label, checked, onChange, last = false }) {
  void last;
  return (
    <Cell
      className="fm-tgui-value-row"
      after={(
        <Switch
          checked={checked}
          onChange={(e) => {
            haptic('selection');
            onChange?.(e.target.checked);
          }}
        />
      )}
    >
      {label}
    </Cell>
  );
}
