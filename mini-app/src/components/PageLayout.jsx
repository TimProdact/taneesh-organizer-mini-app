export function PageHeader({ title, subtitle, trailing }) {
  return (
    <header className={`fm-page-header${trailing ? ' fm-page-header--trailing' : ''}`}>
      <h1 className="fm-page-nav-title">{title}</h1>
      {subtitle ? (
        <p className="fm-page-nav-subtitle">{subtitle}</p>
      ) : null}
      {trailing ? <div className="fm-page-header-trailing">{trailing}</div> : null}
    </header>
  );
}

export function SubpageLayout({ children, stickyCta = false }) {
  return (
    <div
      className={`fm-twa fm-subpage-inset${stickyCta ? ' fm-subpage-inset--sticky-cta' : ''}`}
    >
      {children}
    </div>
  );
}
