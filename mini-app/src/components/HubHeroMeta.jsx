import { buildHubHeroCombos } from '../utils.js';

export function HubHeroMeta({ snapshot }) {
  const storefront = snapshot.storefront || {};
  const brand = snapshot.brand || {};
  const bio = (storefront.bio || brand.bio || '').trim();
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
      {bio ? <p className="fm-hub-bio">{bio}</p> : null}
    </div>
  );
}
