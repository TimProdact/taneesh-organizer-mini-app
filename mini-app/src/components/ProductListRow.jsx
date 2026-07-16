import { Icon24ChevronRight } from '@telegram-apps/telegram-ui/dist/icons/24/chevron_right';
import { ProductPreview } from './ProductPreview.jsx';
import { formatPrice } from '../utils.js';
import { haptic } from '../api.js';

export function ProductListRow({
  product,
  title,
  subtitle,
  onClick,
  last = false,
  selected = false,
  pickMode = false,
}) {
  const displayTitle = title ?? (product.name || 'Без названия');
  const displaySub = subtitle ?? (product.edition || formatPrice(product.price || 0));

  return (
    <button
      type="button"
      className={[
        'fm-entity-row',
        'fm-entity-row--media',
        'fm-tap',
        last ? 'fm-entity-row--last' : '',
        selected ? 'fm-entity-row--selected' : '',
      ].filter(Boolean).join(' ')}
      onClick={() => { haptic('selection'); onClick?.(); }}
    >
      <div className="fm-entity-row-thumb" aria-hidden>
        <ProductPreview product={product} size="sm" list />
      </div>
      <div className="fm-entity-row-copy">
        <span className="fm-entity-row-title fm-entity-row-title--plain">{displayTitle}</span>
        <span className="fm-entity-row-sub">{displaySub}</span>
      </div>
      {pickMode ? (
        <span className={`fm-pick-indicator${selected ? ' fm-pick-indicator--on' : ''}`} aria-hidden />
      ) : (
        <Icon24ChevronRight className="fm-entity-row-chevron" />
      )}
    </button>
  );
}
