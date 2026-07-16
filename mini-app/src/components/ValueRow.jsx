import { Icon24ChevronRight } from '@telegram-apps/telegram-ui/dist/icons/24/chevron_right';
import { Switch } from '@telegram-apps/telegram-ui';
import { haptic } from '../api.js';

export function ValueRow({
  label,
  value,
  onClick,
  last = false,
  muted = false,
  leading = null,
}) {
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={[
        'fm-value-row',
        onClick ? 'fm-value-row--chevron fm-tap' : 'fm-value-row--static',
        last ? 'fm-value-row--last' : '',
      ].filter(Boolean).join(' ')}
      onClick={() => { if (onClick) { haptic('selection'); onClick(); } }}
    >
      <span className={`fm-value-row-label${leading ? ' fm-value-row-label--with-leading' : ''}`}>
        {leading ? <span className="fm-value-row-leading">{leading}</span> : null}
        {label}
      </span>
      <span className={`fm-value-row-value${muted ? ' fm-value-row-value--muted' : ''}`}>{value}</span>
      {onClick ? <Icon24ChevronRight className="fm-value-row-chevron" /> : null}
    </Tag>
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
  return (
    <div className={`fm-value-row fm-value-row--control${last ? ' fm-value-row--last' : ''}`}>
      <span className="fm-value-row-label">{label}</span>
      <div className="fm-value-row-control">
        <div className="fm-stepper fm-stepper--compact">
          <button
            type="button"
            className="fm-stepper-btn"
            disabled={decrementDisabled}
            onClick={onDecrement}
          >
            −
          </button>
          <span className="fm-stepper-value">{value}</span>
          <button
            type="button"
            className="fm-stepper-btn"
            disabled={incrementDisabled}
            onClick={onIncrement}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}

export function SwitchRow({ label, checked, onChange, last = false }) {
  return (
    <div className={`fm-value-row fm-value-row--control fm-value-row--switch${last ? ' fm-value-row--last' : ''}`}>
      <span className="fm-value-row-label">{label}</span>
      <div className="fm-value-row-control">
        <Switch
          className="fm-switch-compact"
          checked={checked}
          onChange={(e) => {
            haptic('selection');
            const next = typeof e === 'boolean' ? e : e?.target?.checked;
            onChange?.(next);
          }}
        />
      </div>
    </div>
  );
}
