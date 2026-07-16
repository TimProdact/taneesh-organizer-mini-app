import { useMemo, useState } from 'react';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { FieldSheet } from '../components/FieldSheet.jsx';
import { ValueGroup } from '../components/ValueGroup.jsx';
import { ValueRow } from '../components/ValueRow.jsx';
import { runActionSafe } from '../api.js';
import { FIXED_SOCIAL_PLATFORMS, normalizeSocialLinks } from '../utils.js';
import { SCREENS } from '../navigation/screens.js';

const FIELDS = {
  name: 'name',
  bio: 'bio',
};

function storefrontOf(snapshot) {
  return snapshot.storefront || snapshot.brand || {};
}

function logoSummary(sf) {
  if (sf.avatarUrl || sf.logoUrl) return 'Фото';
  return 'Не указано';
}

export function StorefrontEditPage({ snapshot, onSnapshotChange, push }) {
  const sf = useMemo(() => storefrontOf(snapshot), [snapshot]);
  const socialCount = normalizeSocialLinks(snapshot.socialLinks).filter((l) => l.url?.trim()).length;
  const [sheet, setSheet] = useState(null);
  const [busy, setBusy] = useState(false);

  const saveField = async (patch) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await runActionSafe('update_storefront', { storefront: patch });
      onSnapshotChange(next);
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async (raw) => {
    if (sheet === FIELDS.name) {
      const displayName = raw.trim();
      if (!displayName) throw new Error('Введите название');
      await saveField({ displayName });
    } else if (sheet === FIELDS.bio) {
      await saveField({ bio: raw.trim() });
    }
  };

  const avatarUrl = sf.avatarUrl || sf.logoUrl || '';
  const displayName = sf.displayName || sf.name || '';

  return (
    <SubpageLayout>
      <PageHeader title="Профиль организатора" subtitle="Лого, описание, соцсети" />
      <div className="fm-page-body">
        <div className="fm-storefront-hero">
          <div className="fm-storefront-hero-preview" aria-hidden>
            {avatarUrl ? (
              <img src={avatarUrl} alt="" className="fm-storefront-hero-img" />
            ) : (
              <span className="fm-storefront-hero-empty">Нет фото</span>
            )}
          </div>
        </div>

        <ValueGroup>
          <ValueRow
            label="Логотип"
            value={logoSummary(sf)}
            muted={!avatarUrl}
            onClick={() => push(SCREENS.STOREFRONT_LOGO)}
          />
          <ValueRow
            label="Название"
            value={displayName || '—'}
            onClick={() => setSheet(FIELDS.name)}
          />
          <ValueRow
            label="Описание"
            value={sf.bio?.trim() || '—'}
            onClick={() => setSheet(FIELDS.bio)}
          />
          <ValueRow
            label="Соцсети"
            value={`${socialCount} из ${FIXED_SOCIAL_PLATFORMS.length}`}
            onClick={() => push(SCREENS.SOCIALS)}
            last
          />
        </ValueGroup>
      </div>

      <FieldSheet
        open={sheet === FIELDS.name}
        title="Название"
        value={displayName}
        placeholder="SILK REPAIR"
        onClose={() => setSheet(null)}
        onSave={handleSave}
      />
      <FieldSheet
        open={sheet === FIELDS.bio}
        title="Описание"
        value={sf.bio || ''}
        placeholder="Коротко о бренде и дропе"
        multiline
        onClose={() => setSheet(null)}
        onSave={handleSave}
      />
    </SubpageLayout>
  );
}
