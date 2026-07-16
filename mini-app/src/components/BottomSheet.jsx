import { useEffect } from 'react';
import { Icon24ChevronLeft } from '@telegram-apps/telegram-ui/dist/icons/24/chevron_left';

export function BottomSheet({
  open,
  title,
  subtitle,
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
          <div className={`fm-sheet-header${onBack ? ' fm-sheet-header--with-back' : ''}`}>
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
            <div className="fm-sheet-header-text">
              <div className="fm-sheet-title">{title}</div>
              {subtitle ? <div className="fm-sheet-subtitle">{subtitle}</div> : null}
            </div>
            <span className="fm-sheet-back-spacer" aria-hidden />
          </div>
        ) : null}
        <div className="fm-sheet-body">{children}</div>
      </div>
    </div>
  );
}
