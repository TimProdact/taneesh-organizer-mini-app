import { useEffect, useMemo, useState } from 'react';
import { List } from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { FieldSheet } from '../components/FieldSheet.jsx';
import { ValueGroup } from '../components/ValueGroup.jsx';
import { ValueRow, SwitchRow } from '../components/ValueRow.jsx';
import { PlatformIcon } from '../components/PlatformIcon.jsx';
import { haptic, runActionSafe } from '../api.js';
import {
  PLATFORM_LABELS,
  FIXED_SOCIAL_PLATFORMS,
  normalizeSocialLinks,
} from '../utils.js';

function linkPlaceholder(platform) {
  if (platform === 'website') return 'https://…';
  if (platform === 'telegram') return 'https://t.me/…';
  return `https://${platform}.com/…`;
}

function linkValueSummary(link) {
  if (link.visible === false) return { text: 'Скрыто', muted: false };
  const url = link.url?.trim();
  if (!url) return { text: 'Не указано', muted: true };
  return {
    text: url.replace(/^https?:\/\//i, '').replace(/\/$/, ''),
    muted: false,
  };
}

export function SocialsPage({ snapshot, onSnapshotChange }) {
  const tg = window.Telegram?.WebApp;
  const links = useMemo(
    () => normalizeSocialLinks(snapshot.socialLinks),
    [snapshot.socialLinks],
  );
  const [sheetPlatform, setSheetPlatform] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    tg?.MainButton?.hide();
  }, [tg]);

  const filledCount = links.filter((l) => l.url?.trim()).length;
  const editingLink = links.find((l) => l.platform === sheetPlatform);

  const persist = async (nextLinks) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await runActionSafe('update_social_links', { socialLinks: nextLinks });
      onSnapshotChange(next);
      haptic('success');
    } finally {
      setBusy(false);
    }
  };

  const saveUrl = async (raw) => {
    if (!sheetPlatform) return;
    const url = raw.trim();
    const nextLinks = links.map((l) => (
      l.platform === sheetPlatform ? { ...l, url } : l
    ));
    await persist(nextLinks);
    setSheetPlatform(null);
  };

  const toggleVisible = async (platform, visible) => {
    const nextLinks = links.map((l) => (
      l.platform === platform ? { ...l, visible } : l
    ));
    await persist(nextLinks);
  };

  return (
    <SubpageLayout>
      <PageHeader title="Ссылки" subtitle={`${filledCount} из ${FIXED_SOCIAL_PLATFORMS.length}`} />
      <List className="fm-page-list">
        {links.map((link) => {
          const summary = linkValueSummary(link);
          const label = PLATFORM_LABELS[link.platform] || link.platform;

          return (
            <ValueGroup key={link.platform} header={label}>
              <ValueRow
                label="URL"
                value={summary.text}
                muted={summary.muted}
                leading={<PlatformIcon platform={link.platform} />}
                onClick={() => setSheetPlatform(link.platform)}
              />
              <SwitchRow
                label="На странице"
                checked={link.visible !== false}
                onChange={(checked) => toggleVisible(link.platform, checked)}
              />
            </ValueGroup>
          );
        })}
      </List>

      <FieldSheet
        open={Boolean(sheetPlatform)}
        title={editingLink ? (PLATFORM_LABELS[editingLink.platform] || 'Ссылка') : 'Ссылка'}
        value={editingLink?.url || ''}
        placeholder={sheetPlatform ? linkPlaceholder(sheetPlatform) : 'https://…'}
        onClose={() => setSheetPlatform(null)}
        onSave={saveUrl}
      />
    </SubpageLayout>
  );
}
