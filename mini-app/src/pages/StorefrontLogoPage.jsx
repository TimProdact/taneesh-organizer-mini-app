import { useState } from 'react';
import { Button, List } from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { StickyPageCta } from '../components/StickyPageCta.jsx';
import { FieldSheet } from '../components/FieldSheet.jsx';
import { haptic, runActionSafe } from '../api.js';
import { profileOf } from '../utils.js';

export function StorefrontLogoPage({ snapshot, onSnapshotChange, onDone }) {
  const profile = profileOf(snapshot);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const photoPreview = profile.avatarUrl || profile.logoUrl || '';

  const save = async (patch) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await runActionSafe('update_profile', { profile: patch });
      onSnapshotChange(next);
      haptic('success');
      onDone?.();
    } finally {
      setBusy(false);
    }
  };

  const saveUrl = async (raw) => {
    const avatarUrl = raw.trim();
    if (!avatarUrl) throw new Error('Введите ссылку');
    await save({ avatarUrl, logoEmoji: '' });
    setSheet(false);
  };

  return (
    <SubpageLayout stickyCta>
      <PageHeader title="Логотип" subtitle="Фото профиля" />
      <List className="fm-page-list">
        <div className="fm-storefront-hero">
          <div className="fm-storefront-hero-preview" aria-hidden>
            {photoPreview ? (
              <img src={photoPreview} alt="" className="fm-storefront-hero-img" />
            ) : (
              <span className="fm-storefront-hero-empty">Нет фото</span>
            )}
          </div>
        </div>

        <p className="fm-media-hint">Ссылка на фото логотипа</p>
      </List>

      <StickyPageCta>
        <Button mode="filled" size="l" stretched disabled={busy} onClick={() => setSheet(true)}>
          {photoPreview ? 'Заменить фото' : 'Указать ссылку на фото'}
        </Button>
      </StickyPageCta>

      <FieldSheet
        open={sheet}
        title="Ссылка на фото"
        value={profile.avatarUrl || ''}
        placeholder="https://..."
        onClose={() => setSheet(false)}
        onSave={saveUrl}
      />
    </SubpageLayout>
  );
}
