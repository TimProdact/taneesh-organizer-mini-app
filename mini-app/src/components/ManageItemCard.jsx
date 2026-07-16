import { Switch } from '@telegram-apps/telegram-ui';
import { formatLinkClicks } from '../utils.js';

function DragHandleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <circle cx="5" cy="4" r="1.25" />
      <circle cx="11" cy="4" r="1.25" />
      <circle cx="5" cy="8" r="1.25" />
      <circle cx="11" cy="8" r="1.25" />
      <circle cx="5" cy="12" r="1.25" />
      <circle cx="11" cy="12" r="1.25" />
    </svg>
  );
}

function ClicksIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
      <rect x="2" y="9" width="2.5" height="5" rx="0.5" fill="currentColor" opacity="0.55" />
      <rect x="6.75" y="6" width="2.5" height="8" rx="0.5" fill="currentColor" opacity="0.75" />
      <rect x="11.5" y="3" width="2.5" height="11" rx="0.5" fill="currentColor" />
    </svg>
  );
}

function ProductManageCard({
  id,
  title,
  price,
  clicks,
  visible,
  onToggleVisible,
  thumbSrc,
  thumbAcronym,
  onClick,
  dragHandleProps,
  showDragHandle,
  isDragging,
  isDragOver,
}) {
  const clickable = typeof onClick === 'function';

  return (
    <article
      className={[
        'fm-manage-card',
        'fm-manage-card--product',
        isDragging ? 'fm-manage-card--dragging' : '',
        isDragOver ? 'fm-manage-card--over' : '',
      ].filter(Boolean).join(' ')}
      data-manage-id={id}
    >
      <div className="fm-product-card__media">
        <div className="fm-product-card__image">
          {thumbSrc ? <img src={thumbSrc} alt="" /> : (
            <span className="fm-product-card__letter">{thumbAcronym}</span>
          )}
        </div>
        {showDragHandle ? (
          <button
            type="button"
            className="fm-product-card__drag"
            aria-label="Перетащить"
            {...dragHandleProps}
          >
            <DragHandleIcon />
          </button>
        ) : null}
      </div>

      <div
        className={`fm-product-card__content${clickable ? ' fm-product-card__content--clickable' : ''}`}
        onClick={clickable ? onClick : undefined}
        onKeyDown={clickable ? (e) => { if (e.key === 'Enter') onClick(e); } : undefined}
        role={clickable ? 'button' : undefined}
        tabIndex={clickable ? 0 : undefined}
      >
        <div className="fm-product-card__text">
          <span className="fm-product-card__title">{title}</span>
          {price ? <span className="fm-product-card__price">{price}</span> : null}
        </div>
        <div className="fm-product-card__meta">
          <span className="fm-product-card__clicks">
            <ClicksIcon />
            <span>{formatLinkClicks(clicks)}</span>
          </span>
          <span
            className="fm-product-card__toggle"
            onClick={e => e.stopPropagation()}
            onKeyDown={e => e.stopPropagation()}
            role="presentation"
          >
            <Switch
              className="fm-switch-compact"
              checked={visible !== false}
              onChange={e => onToggleVisible?.(e)}
            />
          </span>
        </div>
      </div>
    </article>
  );
}

export function ManageItemCard({
  id,
  variant = 'link',
  title,
  link,
  linkPlaceholder = 'https://…',
  linkEditable = false,
  onLinkChange,
  price,
  clicks = 0,
  visible = true,
  onToggleVisible,
  leading,
  thumbSrc,
  thumbAcronym = '?',
  onClick,
  dragHandleProps = {},
  showDragHandle = true,
  isDragging = false,
  isDragOver = false,
  className = '',
}) {
  if (variant === 'product') {
    return (
      <ProductManageCard
        id={id}
        title={title}
        price={price}
        clicks={clicks}
        visible={visible}
        onToggleVisible={onToggleVisible}
        thumbSrc={thumbSrc}
        thumbAcronym={thumbAcronym}
        onClick={onClick}
        dragHandleProps={dragHandleProps}
        showDragHandle={showDragHandle}
        isDragging={isDragging}
        isDragOver={isDragOver}
      />
    );
  }

  const clickable = typeof onClick === 'function';

  const toggle = (
    <span
      className="fm-manage-card__toggle"
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
      role="presentation"
    >
      <Switch
        checked={visible !== false}
        onChange={e => onToggleVisible?.(e)}
      />
    </span>
  );

  return (
    <article
      className={[
        'fm-manage-card',
        isDragging ? 'fm-manage-card--dragging' : '',
        isDragOver ? 'fm-manage-card--over' : '',
        clickable ? 'fm-manage-card--clickable' : '',
        !showDragHandle ? 'fm-manage-card--no-handle' : '',
        className,
      ].filter(Boolean).join(' ')}
      data-manage-id={id}
      onClick={clickable ? onClick : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter') onClick(e); } : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      {showDragHandle ? (
        <button
          type="button"
          className="fm-manage-card__handle"
          aria-label="Перетащить"
          {...dragHandleProps}
        >
          <DragHandleIcon />
        </button>
      ) : null}

      {leading ? (
        <div className="fm-manage-card__lead" aria-hidden>{leading}</div>
      ) : null}

      <div className="fm-manage-card__body">
        <div className="fm-manage-card__head">
          <span className="fm-manage-card__title">{title}</span>
          {toggle}
        </div>
        <div
          className="fm-manage-card__link-row"
          onClick={e => e.stopPropagation()}
          onKeyDown={e => e.stopPropagation()}
          role="presentation"
        >
          {linkEditable ? (
            <input
              className="fm-manage-card__link-input"
              value={link || ''}
              onChange={e => onLinkChange?.(e.target.value)}
              placeholder={linkPlaceholder}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
            />
          ) : (
            <span className={`fm-manage-card__link-text${link ? '' : ' fm-manage-card__link-text--empty'}`}>
              {link || linkPlaceholder}
            </span>
          )}
        </div>
        <div className="fm-manage-card__footer">
          {price ? (
            <span className="fm-manage-card__price">{price}</span>
          ) : (
            <span className="fm-manage-card__price fm-manage-card__price--empty" aria-hidden />
          )}
          <span className="fm-manage-card__clicks">
            <ClicksIcon />
            <span>{formatLinkClicks(clicks)}</span>
          </span>
        </div>
      </div>
    </article>
  );
}
