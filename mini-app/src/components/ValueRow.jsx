import { Cell, Navigation, Switch } from '@telegram-apps/telegram-ui';
import { haptic } from '../api.js';

/** Settings row — Telegram UI `Cell` */
export function ValueRow({
  label,
  value,
  onClick,
  last = false,
  muted = false,
  leading = null,
  subtitle,
}) {
  void last;
  return (
    <Cell
      before={leading || undefined}
      subtitle={subtitle || undefined}
      after={
        onClick ? (
          <Navigation>
            <span className={muted ? 'fm-cell-muted' : undefined}>{value}</span>
          </Navigation>
        ) : (
          <span className={`fm-cell-static${muted ? ' fm-cell-muted' : ''}`}>{value}</span>
        )
      }
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
