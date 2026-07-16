export function HubSectionHead({ title, subtitle }) {
  return (
    <header className="fm-hub-section-head">
      <h2 className="fm-hub-section-title">{title}</h2>
      {subtitle ? (
        <p className="fm-hub-section-sub">{subtitle}</p>
      ) : null}
    </header>
  );
}
