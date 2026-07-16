import { Icon20Copy } from '@telegram-apps/telegram-ui/dist/icons/20/copy';
import { copyText, haptic } from '../api.js';
import { vitrinaShortUrl, vitrinaUrl } from '../utils.js';

function ShareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M12 4v10M8 8l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function QrPage({ snapshot }) {
  const storefront = snapshot.storefront || {};
  const brand = snapshot.brand || {};
  const displayName = storefront.displayName || brand.name || 'Taneesh Organizer';
  const avatarUrl = storefront.avatarUrl || brand.logoUrl || '';
  const logoEmoji = storefront.logoEmoji || brand.logoEmoji || '🎟️';
  const url = vitrinaUrl();
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=12&data=${encodeURIComponent(url)}`;

  const handleCopy = () => {
    haptic('light');
    copyText(url);
  };

  const handleShare = async () => {
    haptic('light');
    const tg = window.Telegram?.WebApp;
    try {
      if (navigator.share) {
        await navigator.share({ title: displayName, url });
        return;
      }
    } catch {
      // fall through to copy
    }
    if (tg?.openLink) tg.openLink(url);
    else copyText(url);
  };

  return (
    <main className="fm-twa fm-qr-page fm-qr-page--tiktok">
      <div className="fm-qr-bg" aria-hidden />

      <div className="fm-qr-stage">
        <div className="fm-qr-avatar-wrap">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="fm-qr-avatar" />
          ) : (
            <div className="fm-qr-avatar fm-qr-avatar--emoji">{logoEmoji}</div>
          )}
        </div>

        <div className="fm-qr-card">
          <h2 className="fm-qr-name">{displayName}</h2>
          <p className="fm-qr-handle">{vitrinaShortUrl()}</p>
          <img src={qrSrc} alt="QR страницы" className="fm-qr-image" width={240} height={240} />
        </div>
      </div>

      <div className="fm-qr-actions">
        <button type="button" className="fm-qr-action" onClick={handleCopy}>
          <Icon20Copy />
          <span>Скопировать</span>
        </button>
        <button type="button" className="fm-qr-action" onClick={handleShare}>
          <ShareIcon />
          <span>Поделиться</span>
        </button>
      </div>
    </main>
  );
}
