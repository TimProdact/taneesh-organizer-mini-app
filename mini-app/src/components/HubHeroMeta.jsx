import { buildHubHeroCombos } from '../utils.js';

export function HubHeroMeta({ snapshot }) {
  const { pills } = buildHubHeroCombos(snapshot);

  return (
    <div className="fm-hub-meta">
      {pills.length > 0 ? (
        <div className="fm-hub-status-strip">
          {pills.map((pill) => (
            <span
              key={pill.id}
              className={`fm-hub-status-pill fm-hub-status-pill--${pill.tone}`}
            >
              {pill.label}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
