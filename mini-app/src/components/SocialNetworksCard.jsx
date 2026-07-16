import { Icon24ChevronRight } from '@telegram-apps/telegram-ui/dist/icons/24/chevron_right';
import { haptic } from '../api.js';
import { PLATFORM_LABELS, FIXED_SOCIAL_PLATFORMS } from '../utils.js';

function hasPlatformLink(links, platform) {
  return links.some(l => l.platform === platform && String(l.url || '').trim());
}

function ShareIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="18" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="18" cy="19" r="2.5" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8.2 11l7.6-4M8.2 13l7.6 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function SocialNetworksCard({ links = [], onOpen }) {
  const filled = links.filter(l => l.url?.trim());
  const count = filled.length;
  const missingPlatforms = FIXED_SOCIAL_PLATFORMS.filter(p => !hasPlatformLink(links, p));

  return (
    <button
      type="button"
      className="fm-social-card fm-tap fm-ds-card-pad"
      onClick={() => { haptic('selection'); onOpen?.(); }}
    >
      <div className="fm-social-card-head fm-ds-row-grid">
        <span className="fm-social-card-icon fm-ds-icon-md" aria-hidden>
          <ShareIcon />
        </span>
        <span className="fm-social-card-title">Ссылки</span>
        <span className="fm-social-card-meta">
          {count ? `${count} связано` : 'Не добавлены'}
        </span>
        <Icon24ChevronRight className="fm-social-card-chevron fm-ds-chevron" />
      </div>
      {missingPlatforms.length > 0 && (
        <div className="fm-social-card-pills fm-ds-section-split fm-ds-pill-wrap">
          {missingPlatforms.map(platform => (
            <span key={platform} className="fm-social-pill fm-ds-pill fm-social-pill--add">
              <span className="fm-social-pill-dot fm-ds-pill-dot fm-social-pill-dot--warn" aria-hidden />
              {`Добавить ${PLATFORM_LABELS[platform]}`}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}
