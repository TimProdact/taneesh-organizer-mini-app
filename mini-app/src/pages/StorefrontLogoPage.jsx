import { useState } from 'react';
import { Button } from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { FieldSheet } from '../components/FieldSheet.jsx';
import { haptic, runActionSafe } from '../api.js';

function storefrontOf(snapshot) {
  return snapshot.storefront || snapshot.brand || {};
}

export function StorefrontLogoPage({ snapshot, onSnapshotChange, onDone }) {
  const sf = storefrontOf(snapshot);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const photoPreview = sf.avatarUrl || sf.logoUrl || '';

  const save = async (patch) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await runActionSafe('update_storefront', { storefront: patch });
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
    <SubpageLayout>
      <PageHeader title="Логотип" subtitle="Фото для витрины" />
      <div className="fm-page-body">
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
        <div className="fm-page-cta fm-page-cta--separated">
          <Button mode="filled" size="l" stretched disabled={busy} onClick={() => setSheet(true)}>
            {photoPreview ? 'Заменить фото' : 'Указать ссылку на фото'}
          </Button>
        </div>
      </div>

      <FieldSheet
        open={sheet}
        title="Ссылка на фото"
        value={sf.avatarUrl || ''}
        placeholder="https://..."
        onClose={() => setSheet(false)}
        onSave={saveUrl}
      />
    </SubpageLayout>
  );
}
