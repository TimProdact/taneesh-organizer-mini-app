import { useEffect } from 'react';

export function BottomSheet({ open, title, subtitle, onClose, children, className = '' }) {
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
      <div className={`fm-sheet-panel ${className}`.trim()} role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
        <div className="fm-sheet-handle" />
        {title ? (
          <div className="fm-sheet-header">
            <div className="fm-sheet-title">{title}</div>
            {subtitle ? <div className="fm-sheet-subtitle">{subtitle}</div> : null}
          </div>
        ) : null}
        <div className="fm-sheet-body">{children}</div>
      </div>
    </div>
  );
}
