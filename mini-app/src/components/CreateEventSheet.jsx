import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, SegmentedControl } from '@telegram-apps/telegram-ui';
import { BottomSheet } from './BottomSheet.jsx';
import { DateTimePickerSheet, formatEventDateTime, partsToIso, toLocalParts } from './DateTimePickerSheet.jsx';
import { ValueGroup } from './ValueGroup.jsx';
import { ValueRow, SwitchRow } from './ValueRow.jsx';
import { haptic, runActionSafe, showError } from '../api.js';
import { EVENT_INTERESTS, emptyI18n, uid } from '../config/eventInterests.js';

const STEPS = 7;
const STEP_TITLES = [
  'Обложка',
  'Название и описание',
  'Когда',
  'Где',
  'Интересы',
  'Билеты',
  'Готово',
];

function defaultStartEnd() {
  const start = partsToIso({
    ...toLocalParts(new Date(Date.now() + 7 * 86_400_000).toISOString()),
    time: '20:00',
  });
  const end = new Date(new Date(start).getTime() + 3 * 3600_000).toISOString();
  return { start, end };
}

function readPhotoAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Не удалось прочитать фото'));
    reader.readAsDataURL(file);
  });
}

export function CreateEventSheet({ open, snapshot, onSnapshotChange, onClose }) {
  const fileRef = useRef(null);
  const verified = Boolean(snapshot?.profile?.verified || snapshot?.meta?.verified);

  const [step, setStep] = useState(1);
  const [picker, setPicker] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState('ru');
  const [photos, setPhotos] = useState([]);
  const [title, setTitle] = useState(emptyI18n());
  const [description, setDescription] = useState(emptyI18n());
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [locationName, setLocationName] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [interests, setInterests] = useState([]);
  const [isFree, setIsFree] = useState(true);
  const [freeEntryMode, setFreeEntryMode] = useState('approval');
  const [tickets, setTickets] = useState([]);

  useEffect(() => {
    if (!open) return;
    const { start, end } = defaultStartEnd();
    setStep(1);
    setPicker(null);
    setBusy(false);
    setLang('ru');
    setPhotos([]);
    setTitle(emptyI18n());
    setDescription(emptyI18n());
    setStartsAt(start);
    setEndsAt(end);
    setLocationName('');
    setLocationAddress('');
    setInterests([]);
    setIsFree(true);
    setFreeEntryMode('approval');
    setTickets([]);
  }, [open]);

  const canNext = useMemo(() => {
    if (step === 1) return photos.length >= 1;
    if (step === 2) return Boolean(title.ru.trim() && description.ru.trim());
    if (step === 3) return Boolean(startsAt && endsAt && new Date(endsAt) > new Date(startsAt));
    if (step === 4) return Boolean(locationName.trim() && locationAddress.trim());
    if (step === 5) return interests.length >= 1;
    if (step === 6) {
      if (isFree) return true;
      if (!tickets.length) return false;
      return tickets.every((t) => t.name.trim() && Number(t.price) > 0 && Number(t.capacity) > 0);
    }
    return true;
  }, [step, photos, title, description, startsAt, endsAt, locationName, locationAddress, interests, isFree, tickets]);

  const goNext = () => {
    if (!canNext) {
      showError('Заполните обязательные поля');
      return;
    }
    haptic('selection');
    setStep((s) => Math.min(STEPS, s + 1));
  };

  const goBack = () => {
    haptic('light');
    if (step <= 1) onClose?.();
    else setStep((s) => s - 1);
  };

  const autoTranslate = () => {
    const t = title.ru.trim();
    const d = description.ru.trim();
    if (!t && !d) {
      showError('Сначала заполните название и описание на RU');
      return;
    }
    setTitle((prev) => ({
      ru: prev.ru,
      uz: prev.uz.trim() || t,
      en: prev.en.trim() || t,
    }));
    setDescription((prev) => ({
      ru: prev.ru,
      uz: prev.uz.trim() || d,
      en: prev.en.trim() || d,
    }));
    haptic('success');
  };

  const addPhotos = async (files) => {
    const list = Array.from(files || []);
    if (!list.length) return;
    const room = 6 - photos.length;
    const slice = list.slice(0, room);
    try {
      const urls = await Promise.all(slice.map(readPhotoAsDataUrl));
      setPhotos((prev) => [...prev, ...urls.filter(Boolean)].slice(0, 6));
      haptic('success');
    } catch (e) {
      showError(e.message || 'Ошибка загрузки');
    }
  };

  const toggleInterest = (item) => {
    haptic('selection');
    setInterests((prev) =>
      prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item],
    );
  };

  const setPaid = () => {
    if (!verified) {
      showError('Верификация обязательна. Сначала подтвердите реквизиты в Финансах.');
      return;
    }
    setIsFree(false);
    if (!tickets.length) {
      setTickets([{ id: uid('t'), name: 'Standard', price: 100000, capacity: 100 }]);
    }
    haptic('selection');
  };

  const submit = async (status) => {
    if (busy || !canNext) return;
    // validate all steps briefly
    if (photos.length < 1 || !title.ru.trim() || !description.ru.trim()) {
      showError('Проверьте обложку, название и описание');
      return;
    }
    if (!startsAt || !endsAt || new Date(endsAt) <= new Date(startsAt)) {
      showError('Конец должен быть позже начала');
      return;
    }
    if (!locationName.trim() || !locationAddress.trim() || interests.length < 1) {
      showError('Заполните место и интересы');
      return;
    }
    if (!isFree) {
      if (!verified) {
        showError('Верификация обязательна для платных ивентов');
        return;
      }
      if (!tickets.length || tickets.some((t) => !t.name.trim() || t.price <= 0 || t.capacity <= 0)) {
        showError('Проверьте типы билетов');
        return;
      }
    }

    setBusy(true);
    try {
      const nextSnap = await runActionSafe('create_event', {
        name: title.ru.trim(),
        i18n: { title, description },
        photos,
        startsAt,
        endsAt,
        location: { name: locationName.trim(), address: locationAddress.trim() },
        interests,
        isFree,
        freeEntryMode: isFree ? freeEntryMode : undefined,
        tickets: isFree ? [] : tickets,
        status,
      });
      onSnapshotChange(nextSnap);
      haptic('success');
      onClose();
    } catch (e) {
      showError(e.message || 'Не удалось создать');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <BottomSheet
        open={open && !picker}
        title="Новое мероприятие"
        subtitle={`Шаг ${step}/${STEPS} · ${STEP_TITLES[step - 1]}`}
        className="fm-sheet-panel--wizard fm-sheet-panel--tall"
        onClose={onClose}
      >
        <div className="fm-wizard-sheet">
          {step === 1 ? (
            <>
              <p className="fm-media-hint">Добавьте хотя бы одно фото (до 6)</p>
              <div className="fm-photo-grid">
                {photos.map((src, idx) => (
                  <div key={idx} className="fm-photo-tile">
                    <img src={src} alt="" />
                    <button
                      type="button"
                      className="fm-photo-remove"
                      onClick={() => setPhotos((p) => p.filter((_, i) => i !== idx))}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {photos.length < 6 ? (
                  <button
                    type="button"
                    className="fm-photo-add"
                    onClick={() => fileRef.current?.click()}
                  >
                    + Фото
                  </button>
                ) : null}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  addPhotos(e.target.files);
                  e.target.value = '';
                }}
              />
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div className="fm-lang-row">
                <SegmentedControl>
                  {(['ru', 'uz', 'en']).map((code) => (
                    <SegmentedControl.Item
                      key={code}
                      selected={lang === code}
                      onClick={() => { setLang(code); haptic('selection'); }}
                    >
                      {code.toUpperCase()}
                    </SegmentedControl.Item>
                  ))}
                </SegmentedControl>
                <button type="button" className="fm-lang-auto" onClick={autoTranslate}>
                  Автоперевод
                </button>
              </div>
              <p className="fm-media-hint">Название ({lang.toUpperCase()})</p>
              <input
                className="fm-wizard-input"
                placeholder="Название события"
                value={title[lang]}
                onChange={(e) => setTitle((prev) => ({ ...prev, [lang]: e.target.value }))}
              />
              <p className="fm-media-hint" style={{ marginTop: 12 }}>Описание ({lang.toUpperCase()})</p>
              <textarea
                className="fm-wizard-input fm-wizard-input--area"
                placeholder="Расскажите о событии..."
                rows={5}
                value={description[lang]}
                onChange={(e) => setDescription((prev) => ({ ...prev, [lang]: e.target.value }))}
              />
            </>
          ) : null}

          {step === 3 ? (
            <ValueGroup>
              <ValueRow label="Начало" value={formatEventDateTime(startsAt)} onClick={() => setPicker('start')} />
              <ValueRow label="Конец" value={formatEventDateTime(endsAt)} onClick={() => setPicker('end')} last />
            </ValueGroup>
          ) : null}

          {step === 4 ? (
            <>
              <p className="fm-media-hint">Название места</p>
              <input
                className="fm-wizard-input"
                placeholder="Офис Taneesh, Magic City…"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
              />
              <p className="fm-media-hint" style={{ marginTop: 12 }}>Адрес или ссылка на карту</p>
              <input
                className="fm-wizard-input"
                placeholder="Адрес / Google Maps"
                value={locationAddress}
                onChange={(e) => setLocationAddress(e.target.value)}
              />
            </>
          ) : null}

          {step === 5 ? (
            <>
              <p className="fm-media-hint">Выберите хотя бы один интерес</p>
              <div className="fm-chip-wrap">
                {EVENT_INTERESTS.map((item) => {
                  const on = interests.includes(item);
                  return (
                    <button
                      key={item}
                      type="button"
                      className={`fm-chip${on ? ' fm-chip--on' : ''}`}
                      onClick={() => toggleInterest(item)}
                    >
                      {item}
                    </button>
                  );
                })}
              </div>
            </>
          ) : null}

          {step === 6 ? (
            <>
              <div className="fm-segment-wrap fm-segment-wrap--media">
                <SegmentedControl>
                  <SegmentedControl.Item
                    selected={isFree}
                    onClick={() => { setIsFree(true); haptic('selection'); }}
                  >
                    Бесплатно
                  </SegmentedControl.Item>
                  <SegmentedControl.Item selected={!isFree} onClick={setPaid}>
                    Платно
                  </SegmentedControl.Item>
                </SegmentedControl>
              </div>

              {isFree ? (
                <ValueGroup className="fm-value-group--spaced">
                  <SwitchRow
                    label="Модерация заявок"
                    checked={freeEntryMode === 'approval'}
                    onChange={(on) => setFreeEntryMode(on ? 'approval' : 'open')}
                    last
                  />
                </ValueGroup>
              ) : (
                <div className="fm-ticket-list">
                  {tickets.map((t, idx) => (
                    <div key={t.id} className="fm-ticket-card">
                      <input
                        className="fm-wizard-input"
                        placeholder="Название типа"
                        value={t.name}
                        onChange={(e) => {
                          const name = e.target.value;
                          setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, name } : x)));
                        }}
                      />
                      <div className="fm-ticket-row">
                        <input
                          className="fm-wizard-input"
                          type="number"
                          inputMode="numeric"
                          placeholder="Цена"
                          value={t.price}
                          onChange={(e) => {
                            const price = Number(e.target.value) || 0;
                            setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, price } : x)));
                          }}
                        />
                        <input
                          className="fm-wizard-input"
                          type="number"
                          inputMode="numeric"
                          placeholder="Кол-во"
                          value={t.capacity}
                          onChange={(e) => {
                            const capacity = Number(e.target.value) || 0;
                            setTickets((prev) => prev.map((x) => (x.id === t.id ? { ...x, capacity } : x)));
                          }}
                        />
                      </div>
                      {tickets.length > 1 ? (
                        <button
                          type="button"
                          className="fm-ticket-remove"
                          onClick={() => setTickets((prev) => prev.filter((x) => x.id !== t.id))}
                        >
                          Удалить тип {idx + 1}
                        </button>
                      ) : null}
                    </div>
                  ))}
                  <Button
                    mode="outline"
                    size="m"
                    stretched
                    onClick={() =>
                      setTickets((prev) => [
                        ...prev,
                        { id: uid('t'), name: '', price: 0, capacity: 50 },
                      ])
                    }
                  >
                    + Добавить тип билета
                  </Button>
                </div>
              )}
              {isFree ? (
                <p className="fm-empty-hint" style={{ marginTop: 10 }}>
                  {freeEntryMode === 'approval'
                    ? 'Заявки нужно будет одобрять вручную'
                    : 'Регистрация сразу даёт билет'}
                </p>
              ) : null}
            </>
          ) : null}

          {step === 7 ? (
            <div className="fm-review">
              {photos[0] ? <img src={photos[0]} alt="" className="fm-review-cover" /> : null}
              <h3 className="fm-review-title">{title.ru || 'Без названия'}</h3>
              <p className="fm-review-line">{formatEventDateTime(startsAt)} → {formatEventDateTime(endsAt)}</p>
              <p className="fm-review-line">{locationName} · {locationAddress}</p>
              <p className="fm-review-line">{interests.join(' · ')}</p>
              <p className="fm-review-line">
                {isFree
                  ? `Бесплатно · ${freeEntryMode === 'approval' ? 'с модерацией' : 'свободный вход'}`
                  : `Платно · ${tickets.length} тип(а) билетов`}
              </p>
            </div>
          ) : null}

          <div className="fm-wizard-sheet-cta fm-wizard-sheet-cta--separated">
            {step < STEPS ? (
              <div className="fm-wizard-nav">
                <Button mode="outline" size="l" stretched onClick={goBack}>
                  {step === 1 ? 'Закрыть' : '← Назад'}
                </Button>
                <Button mode="filled" size="l" stretched disabled={!canNext} onClick={goNext}>
                  Далее →
                </Button>
              </div>
            ) : (
              <div className="fm-wizard-nav fm-wizard-nav--final">
                <Button mode="outline" size="l" stretched onClick={goBack}>
                  ← Назад
                </Button>
                <div className="fm-wizard-nav-pair">
                  <Button mode="outline" size="l" stretched disabled={busy} onClick={() => submit('draft')}>
                    Черновик
                  </Button>
                  <Button mode="filled" size="l" stretched disabled={busy} onClick={() => submit('published')}>
                    Опубликовать
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </BottomSheet>

      <DateTimePickerSheet
        open={open && picker === 'start'}
        title="Начало"
        valueIso={startsAt}
        onClose={() => setPicker(null)}
        onSave={(iso) => {
          setStartsAt(iso);
          if (endsAt && new Date(endsAt) <= new Date(iso)) {
            setEndsAt(new Date(new Date(iso).getTime() + 3 * 3600_000).toISOString());
          }
          setPicker(null);
        }}
      />
      <DateTimePickerSheet
        open={open && picker === 'end'}
        title="Конец"
        valueIso={endsAt}
        onClose={() => setPicker(null)}
        onSave={(iso) => {
          setEndsAt(iso);
          setPicker(null);
        }}
      />
    </>
  );
}
