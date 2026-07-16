export function PageHeader({ title, subtitle }) {
  return (
    <header className="fm-page-header">
      <h1 className="fm-page-nav-title">{title}</h1>
      {subtitle ? (
        <p className="fm-page-nav-subtitle">{subtitle}</p>
      ) : null}
    </header>
  );
}

export function SubpageLayout({ children }) {
  return <div className="fm-twa fm-subpage-inset">{children}</div>;
}
