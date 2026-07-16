export function PageHeader({ title, subtitle, trailing }) {
  return (
    <header className={`fm-page-header${trailing ? ' fm-page-header--split' : ''}`}>
      <div className="fm-page-header-main">
        <h1 className="fm-page-nav-title">{title}</h1>
        {subtitle ? (
          <p className="fm-page-nav-subtitle">{subtitle}</p>
        ) : null}
      </div>
      {trailing ? <div className="fm-page-header-trailing">{trailing}</div> : null}
    </header>
  );
}

export function SubpageLayout({ children }) {
  return <div className="fm-twa fm-subpage-inset">{children}</div>;
}
