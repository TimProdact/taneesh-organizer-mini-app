import { useRef, useState } from 'react';
import { Button, List } from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { StickyPageCta } from '../components/StickyPageCta.jsx';
import { haptic, runActionSafe, showError } from '../api.js';
import { profileOf } from '../utils.js';

function readPhotoAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file?.type?.startsWith('image/')) {
      reject(new Error('Нужен файл изображения'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Не удалось прочитать файл'));
    reader.readAsDataURL(file);
  });
}

export function StorefrontLogoPage({ snapshot, onSnapshotChange, onDone }) {
  const profile = profileOf(snapshot);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
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

  const pickFile = (files) => {
    const file = Array.from(files || [])[0];
    if (!file) return;
    readPhotoAsDataUrl(file)
      .then((avatarUrl) => save({ avatarUrl, logoEmoji: '' }))
      .catch((e) => showError(e.message || 'Ошибка загрузки'));
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

        <p className="fm-media-hint">Фото логотипа с устройства</p>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            pickFile(e.target.files);
            e.target.value = '';
          }}
        />
      </List>

      <StickyPageCta>
        <Button
          mode="filled"
          size="l"
          stretched
          disabled={busy}
          onClick={() => {
            haptic('selection');
            fileRef.current?.click();
          }}
        >
          {photoPreview ? 'Заменить фото' : 'Загрузить фото'}
        </Button>
      </StickyPageCta>
    </SubpageLayout>
  );
}
