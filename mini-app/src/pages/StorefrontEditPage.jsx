import { useMemo, useState } from 'react';
import { List } from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { FieldSheet } from '../components/FieldSheet.jsx';
import { ValueGroup } from '../components/ValueGroup.jsx';
import { ValueRow } from '../components/ValueRow.jsx';
import { runActionSafe } from '../api.js';
import { FIXED_SOCIAL_PLATFORMS, normalizeSocialLinks, profileOf } from '../utils.js';
import { SCREENS } from '../navigation/screens.js';

const FIELDS = { name: 'name', bio: 'bio' };

function logoSummary(profile) {
  if (profile.avatarUrl || profile.logoUrl) return 'Фото';
  return 'Не указано';
}

export function StorefrontEditPage({ snapshot, onSnapshotChange, push }) {
  const profile = useMemo(() => profileOf(snapshot), [snapshot]);
  const socialCount = normalizeSocialLinks(snapshot.socialLinks).filter((l) => l.url?.trim()).length;
  const [sheet, setSheet] = useState(null);
  const [busy, setBusy] = useState(false);

  const saveField = async (patch) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await runActionSafe('update_profile', { profile: patch });
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

  const avatarUrl = profile.avatarUrl || profile.logoUrl || '';
  const displayName = profile.displayName || profile.name || '';

  return (
    <SubpageLayout>
      <PageHeader title="Профиль организатора" subtitle="Лого, описание, соцсети" />
      <List className="fm-page-list">
        <ValueGroup header="Профиль">
          <ValueRow
            label="Логотип"
            value={logoSummary(profile)}
            muted={!avatarUrl}
            onClick={() => push(SCREENS.PROFILE_LOGO)}
          />
          <ValueRow
            label="Название"
            value={displayName || '—'}
            onClick={() => setSheet(FIELDS.name)}
          />
          <ValueRow
            label="Описание"
            value={profile.bio?.trim() || '—'}
            onClick={() => setSheet(FIELDS.bio)}
          />
          <ValueRow
            label="Соцсети"
            value={`${socialCount} из ${FIXED_SOCIAL_PLATFORMS.length}`}
            onClick={() => push(SCREENS.SOCIALS)}
          />
        </ValueGroup>
      </List>

      <FieldSheet
        open={sheet === FIELDS.name}
        title="Название"
        value={displayName}
        placeholder="Название организатора"
        onClose={() => setSheet(null)}
        onSave={handleSave}
      />
      <FieldSheet
        open={sheet === FIELDS.bio}
        title="Описание"
        value={profile.bio || ''}
        placeholder="Коротко об организаторе"
        multiline
        onClose={() => setSheet(null)}
        onSave={handleSave}
      />
    </SubpageLayout>
  );
}
