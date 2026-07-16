import { Cell, Navigation, Switch } from '@telegram-apps/telegram-ui';
import { haptic } from '../api.js';

/** One-line preview for settings values — never wraps */
export function previewLine(value, empty = '—') {
  if (value == null) return empty;
  const s = String(value).replace(/\s+/g, ' ').trim();
  return s || empty;
}

/**
 * Settings row — label full width (no ellipsis), value single-line ellipsis.
 * Long text opens via onClick / sheet, not a second row.
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
      className="fm-value-row"
      before={leading || undefined}
      hint={(
        <span className={`fm-value-hint${muted ? ' fm-value-hint--muted' : ''}`}>
          {preview}
        </span>
      )}
      after={onClick ? <Navigation /> : undefined}
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
      className="fm-value-row"
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
      className="fm-value-row"
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
