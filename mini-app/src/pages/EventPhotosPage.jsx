import { useMemo, useRef, useState } from 'react';
import { Button, List } from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { StickyPageCta } from '../components/StickyPageCta.jsx';
import { FieldSheet } from '../components/FieldSheet.jsx';
import { haptic, runActionSafe, showError } from '../api.js';

const MAX = 6;

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

function photosSummary(count) {
  if (!count) return 'Не указано';
  return `${count} из ${MAX}`;
}

/** Event cover photos — same fields as create wizard step 1 / admin photos[] */
export function EventPhotosPage({ snapshot, onSnapshotChange, eventId }) {
  const event = useMemo(() => {
    const list = snapshot.events || [];
    return list.find((e) => e.id === eventId) || {};
  }, [snapshot, eventId]);

  const [photos, setPhotos] = useState(() => [...(event.photos || [])].slice(0, MAX));
  const [busy, setBusy] = useState(false);
  const [urlSheet, setUrlSheet] = useState(false);
  const fileRef = useRef(null);

  const dirty = JSON.stringify(photos) !== JSON.stringify([...(event.photos || [])].slice(0, MAX));

  const persist = async (nextPhotos) => {
    if (busy || !event.id) return;
    setBusy(true);
    try {
      const next = await runActionSafe('update_event', {
        eventId: event.id,
        photos: nextPhotos,
      });
      onSnapshotChange(next);
      haptic('success');
    } catch (e) {
      showError(e.message || 'Не удалось сохранить фото');
    } finally {
      setBusy(false);
    }
  };

  const addFiles = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    const room = MAX - photos.length;
    if (room <= 0) {
      showError(`Максимум ${MAX} фото`);
      return;
    }
    try {
      const urls = await Promise.all(list.slice(0, room).map(readPhotoAsDataUrl));
      const next = [...photos, ...urls.filter(Boolean)].slice(0, MAX);
      setPhotos(next);
      await persist(next);
    } catch (e) {
      showError(e.message || 'Ошибка загрузки');
    }
  };

  const removeAt = async (idx) => {
    const next = photos.filter((_, i) => i !== idx);
    setPhotos(next);
    await persist(next);
  };

  const addUrl = async (raw) => {
    const url = raw.trim();
    if (!url) throw new Error('Введите ссылку');
    if (photos.length >= MAX) throw new Error(`Максимум ${MAX} фото`);
    const next = [...photos, url].slice(0, MAX);
    setPhotos(next);
    await persist(next);
    setUrlSheet(false);
  };

  const showCta = photos.length < MAX || dirty;

  return (
    <SubpageLayout stickyCta={showCta}>
      <PageHeader
        title="Фото"
        subtitle={photosSummary(photos.length)}
      />
      <List className="fm-page-list">
        <p className="fm-media-hint">Хотя бы одно фото, максимум {MAX}</p>
        <div className="fm-photo-grid">
          {Array.from({ length: MAX }).map((_, idx) => {
            const src = photos[idx];
            if (src) {
              return (
                <div key={`${idx}-${src.slice(0, 24)}`} className="fm-photo-tile">
                  <img src={src} alt="" />
                  <button
                    type="button"
                    className="fm-photo-remove"
                    disabled={busy}
                    onClick={() => removeAt(idx)}
                  >
                    ✕
                  </button>
                </div>
              );
            }
            return (
              <button
                key={idx}
                type="button"
                className="fm-photo-add"
                disabled={busy || idx !== photos.length}
                onClick={() => fileRef.current?.click()}
              >
                + Фото
              </button>
            );
          })}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
      </List>

      {showCta ? (
        <StickyPageCta>
          {photos.length < MAX ? (
            <Button
              mode="outline"
              size="l"
              stretched
              disabled={busy}
              onClick={() => setUrlSheet(true)}
            >
              Добавить по ссылке
            </Button>
          ) : null}
          {dirty ? (
            <Button
              mode="filled"
              size="l"
              stretched
              disabled={busy}
              onClick={() => persist(photos)}
            >
              Сохранить
            </Button>
          ) : null}
        </StickyPageCta>
      ) : null}

      <FieldSheet
        open={urlSheet}
        title="Ссылка на фото"
        value=""
        placeholder="https://..."
        onClose={() => setUrlSheet(false)}
        onSave={addUrl}
      />
    </SubpageLayout>
  );
}
