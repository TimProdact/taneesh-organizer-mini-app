import { useState } from 'react';
import { Button } from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { InsetSection } from '../components/InsetSection.jsx';
import { haptic, runActionSafe } from '../api.js';

const LOGO_EMOJIS = ['🐱', '💄', '✨', '🌸', '🧴', '💎', '🦋', '🌙'];

export function BrandEditPage({ snapshot, onSnapshotChange, onDone }) {
  const brand = snapshot.brand || {};
  const [logoEmoji, setLogoEmoji] = useState(brand.logoEmoji || '🐱');
  const [logoUrl, setLogoUrl] = useState(brand.logoUrl || '');
  const [bio, setBio] = useState(brand.bio || '');
  const [telegram, setTelegram] = useState(brand.socials?.telegram || '');
  const [instagram, setInstagram] = useState(brand.socials?.instagram || '');
  const [tiktok, setTiktok] = useState(brand.socials?.tiktok || '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await runActionSafe('update_brand', {
        brand: {
          logoEmoji,
          logoUrl: logoUrl.trim(),
          bio: bio.trim(),
          socials: {
            telegram: telegram.trim(),
            instagram: instagram.trim(),
            tiktok: tiktok.trim(),
          },
        },
      });
      onSnapshotChange(next);
      haptic('success');
      onDone?.();
    } finally {
      setBusy(false);
    }
  };

  return (
    <SubpageLayout>
      <PageHeader title="Профиль бренда" subtitle="Лого, описание, соцсети" />
      <InsetSection>
        <div className="fm-brand-form">
          <label className="fm-brand-label">Логотип</label>
          <div className="fm-brand-emoji-grid">
            {LOGO_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={`fm-brand-emoji${logoEmoji === emoji && !logoUrl ? ' fm-brand-emoji--active' : ''}`}
                onClick={() => { setLogoEmoji(emoji); setLogoUrl(''); haptic('selection'); }}
              >
                {emoji}
              </button>
            ))}
          </div>

          <label className="fm-brand-label">Или ссылка на фото</label>
          <input
            className="fm-brand-input"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://..."
          />

          <label className="fm-brand-label">Описание</label>
          <textarea
            className="fm-brand-textarea"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Коротко о бренде и дропе"
            rows={3}
          />

          <label className="fm-brand-label">Telegram</label>
          <input
            className="fm-brand-input"
            value={telegram}
            onChange={(e) => setTelegram(e.target.value)}
            placeholder="https://t.me/..."
          />

          <label className="fm-brand-label">Instagram</label>
          <input
            className="fm-brand-input"
            value={instagram}
            onChange={(e) => setInstagram(e.target.value)}
            placeholder="https://instagram.com/..."
          />

          <label className="fm-brand-label">TikTok</label>
          <input
            className="fm-brand-input"
            value={tiktok}
            onChange={(e) => setTiktok(e.target.value)}
            placeholder="https://tiktok.com/@..."
          />

          <Button mode="filled" size="l" stretched disabled={busy} onClick={save}>
            Сохранить
          </Button>
        </div>
      </InsetSection>
    </SubpageLayout>
  );
}
