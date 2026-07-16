import { Icon24ChevronRight } from '@telegram-apps/telegram-ui/dist/icons/24/chevron_right';
import { haptic } from '../api.js';

export function EntityListRow({
  glyph,
  title,
  subtitle,
  onClick,
  last = false,
}) {
  return (
    <button
      type="button"
      className={`fm-entity-row fm-tap${last ? ' fm-entity-row--last' : ''}`}
      onClick={() => { haptic('selection'); onClick?.(); }}
    >
      <div className="fm-entity-row-copy">
        <span className="fm-entity-row-title">
          {glyph ? <span className="fm-entity-row-glyph" aria-hidden>{glyph}</span> : null}
          {title}
        </span>
        {subtitle ? <span className="fm-entity-row-sub">{subtitle}</span> : null}
      </div>
      <Icon24ChevronRight className="fm-entity-row-chevron" />
    </button>
  );
}
