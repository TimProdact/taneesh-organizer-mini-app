import { Icon20Copy } from '@telegram-apps/telegram-ui/dist/icons/20/copy';
import { copyText, haptic } from '../api.js';
import { profileOf, publicPageHost, publicPageUrl } from '../utils.js';

function ShareIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M12 4v10M8 8l4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function QrPage({ snapshot }) {
  const profile = profileOf(snapshot);
  const displayName = profile.displayName || profile.name || 'Taneesh Organizer';
  const avatarUrl = profile.avatarUrl || profile.logoUrl || '';
  const logoEmoji = profile.logoEmoji || '🎟️';
  const url = publicPageUrl();
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
      /* copy */
    }
    if (tg?.openLink) tg.openLink(url);
    else copyText(url);
  };

  return (
    <main className="fm-twa fm-qr-page">
      <div className="fm-qr-card">
        <div className="fm-qr-brand">
          <div className="fm-qr-avatar" aria-hidden>
            {avatarUrl ? (
              <img src={avatarUrl} alt="" />
            ) : (
              <span>{logoEmoji}</span>
            )}
          </div>
          <h1 className="fm-qr-title">{displayName}</h1>
          <p className="fm-qr-handle">{publicPageHost()}</p>
        </div>
        <div className="fm-qr-frame">
          <img src={qrSrc} alt="QR страницы" className="fm-qr-image" width={240} height={240} />
        </div>
        <div className="fm-qr-actions">
          <button type="button" className="fm-qr-action" onClick={handleCopy}>
            <Icon20Copy />
            Копировать
          </button>
          <button type="button" className="fm-qr-action" onClick={handleShare}>
            <ShareIcon />
            Поделиться
          </button>
        </div>
      </div>
    </main>
  );
}
