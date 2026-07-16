import { Children } from 'react';

export function InsetSection({ title, children, className = '' }) {
  return (
    <section className={`fm-inset-section ${className}`.trim()}>
      {title && <h2 className="fm-inset-section-label">{title}</h2>}
      <div className="fm-inset-card fm-tap-group">{children}</div>
    </section>
  );
}
