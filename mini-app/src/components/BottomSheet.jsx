import { useEffect } from 'react';
import { Icon24ChevronLeft } from '@telegram-apps/telegram-ui/dist/icons/24/chevron_left';

export function BottomSheet({
  open,
  title,
  subtitle,
  counter,
  onBack,
  onClose,
  children,
  className = '',
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  const wizardHeader = Boolean(onBack && counter);

  return (
    <div className="fm-sheet-root" role="presentation" onClick={onClose}>
      <div className="fm-sheet-backdrop" />
      <div
        className={`fm-sheet-panel ${className}`.trim()}
        role="dialog"
        aria-modal
        onClick={(e) => e.stopPropagation()}
      >
        <div className="fm-sheet-handle" />
        {title ? (
          <div
            className={[
              'fm-sheet-header',
              onBack ? 'fm-sheet-header--with-back' : '',
              wizardHeader ? 'fm-sheet-header--wizard' : '',
            ].filter(Boolean).join(' ')}
          >
            {onBack ? (
              <button
                type="button"
                className="fm-sheet-back"
                aria-label="Назад"
                onClick={(e) => {
                  e.stopPropagation();
                  onBack();
                }}
              >
                <Icon24ChevronLeft />
              </button>
            ) : null}
            {wizardHeader ? (
              <>
                <h2 className="fm-sheet-title fm-sheet-title--wizard">{title}</h2>
                <span className="fm-sheet-counter" aria-label={`Шаг ${counter}`}>
                  {counter}
                </span>
              </>
            ) : (
              <>
                <div className="fm-sheet-header-text">
                  <div className="fm-sheet-title">{title}</div>
                  {subtitle ? <div className="fm-sheet-subtitle">{subtitle}</div> : null}
                </div>
                {onBack ? <span className="fm-sheet-back-spacer" aria-hidden /> : null}
              </>
            )}
          </div>
        ) : null}
        <div className="fm-sheet-body">{children}</div>
      </div>
    </div>
  );
}
