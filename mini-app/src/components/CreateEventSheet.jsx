import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, SegmentedControl } from '@telegram-apps/telegram-ui';
import { BottomSheet } from './BottomSheet.jsx';
import { DateTimePickerSheet, formatEventDateTime, partsToIso, toLocalParts } from './DateTimePickerSheet.jsx';
import { ValueGroup } from './ValueGroup.jsx';
import { ValueRow, SwitchRow } from './ValueRow.jsx';
import { haptic, runActionSafe, showError } from '../api.js';
import {
  EVENT_INTERESTS,
  emptyI18n,
  ticketDiscountLabel,
  uid,
} from '../config/eventInterests.js';

const STEPS = 7;

/** Main sheet titles — step prompts, not «Новое мероприятие» */
const STEP_HEADINGS = [
  'Добавьте фото',
  'Укажите данные',
  'Когда',
  'Где',
  'Выберите интересы',
  'Билеты',
  'Превью',
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

function blankTicket() {
  return { id: uid('t'), name: '', price: 0, originalPrice: 0, capacity: 100 };
}

function ticketsValid(list) {
  if (!list.length) return false;
  return list.every((t) => {
    if (!t.name.trim() || Number(t.price) <= 0 || Number(t.capacity) <= 0) return false;
    const orig = Number(t.originalPrice) || 0;
    if (orig > 0 && orig <= Number(t.price)) return false;
    return true;
  });
}

export function CreateEventSheet({ open, snapshot, event = null, onSnapshotChange, onClose }) {
  const fileRef = useRef(null);
  const carouselRef = useRef(null);
  const isEdit = Boolean(event?.id);
  const verified = Boolean(
    snapshot?.profile?.kycStatus === 'approved'
      || snapshot?.profile?.verified
      || snapshot?.meta?.verified,
  );

  const [step, setStep] = useState(1);
  const [picker, setPicker] = useState(null);
  const [busy, setBusy] = useState(false);
  const [lang, setLang] = useState('ru');
  const [photos, setPhotos] = useState([]);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [title, setTitle] = useState(emptyI18n());
  const [description, setDescription] = useState(emptyI18n());
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [locationName, setLocationName] = useState('');
  const [locationAddress, setLocationAddress] = useState('');
  const [interests, setInterests] = useState([]);
  const [interestQuery, setInterestQuery] = useState('');
  const [isFree, setIsFree] = useState(true);
  const [freeEntryMode, setFreeEntryMode] = useState('approval');
  const [tickets, setTickets] = useState([]);

  useEffect(() => {
    if (!open) return;
    if (isEdit && event) {
      setStep(1);
      setPicker(null);
      setBusy(false);
      setLang('ru');
      setPhotos([...(event.photos || [])].slice(0, 6));
      setPhotoIndex(0);
      setTitle({
        ru: event.i18n?.title?.ru || event.name || '',
        uz: event.i18n?.title?.uz || '',
        en: event.i18n?.title?.en || '',
      });
      setDescription({
        ru: event.i18n?.description?.ru || '',
        uz: event.i18n?.description?.uz || '',
        en: event.i18n?.description?.en || '',
      });
      setStartsAt(event.startsAt || defaultStartEnd().start);
      setEndsAt(event.endsAt || defaultStartEnd().end);
      setLocationName(event.location?.name || '');
      setLocationAddress(event.location?.address || '');
      setInterests([...(event.interests || [])]);
      setInterestQuery('');
      setIsFree(event.isFree !== false);
      setFreeEntryMode(event.freeEntryMode === 'open' ? 'open' : 'approval');
      setTickets(
        event.isFree === false && (event.tickets || []).length
          ? event.tickets.map((t) => ({
              id: t.id || uid('t'),
              name: t.name || '',
              price: t.price || 0,
              originalPrice: t.originalPrice || 0,
              capacity: t.capacity || 0,
            }))
          : [],
      );
      return;
    }
    const { start, end } = defaultStartEnd();
    setStep(1);
    setPicker(null);
    setBusy(false);
    setLang('ru');
    setPhotos([]);
    setPhotoIndex(0);
    setTitle(emptyI18n());
    setDescription(emptyI18n());
    setStartsAt(start);
    setEndsAt(end);
    setLocationName('');
    setLocationAddress('');
    setInterests([]);
    setInterestQuery('');
    setIsFree(true);
    setFreeEntryMode('approval');
    setTickets([]);
  }, [open, isEdit, event]);

  const canNext = useMemo(() => {
    if (step === 1) return photos.length >= 1;
    if (step === 2) return Boolean(title.ru.trim() && description.ru.trim());
    if (step === 3) return Boolean(startsAt && endsAt && new Date(endsAt) > new Date(startsAt));
    if (step === 4) return Boolean(locationName.trim() && locationAddress.trim());
    if (step === 5) return interests.length >= 1;
    if (step === 6) return isFree ? true : ticketsValid(tickets);
    return true;
  }, [step, photos, title, description, startsAt, endsAt, locationName, locationAddress, interests, isFree, tickets]);

  const filteredInterests = useMemo(() => {
    const q = interestQuery.trim().toLowerCase();
    if (!q) return EVENT_INTERESTS;
    return EVENT_INTERESTS.filter((item) => item.label.toLowerCase().includes(q));
  }, [interestQuery]);

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

  const jumpTo = (n) => {
    haptic('selection');
    setStep(n);
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

  const toggleInterest = (label) => {
    haptic('selection');
    setInterests((prev) =>
      prev.includes(label) ? prev.filter((x) => x !== label) : [...prev, label],
    );
  };

  const setPaid = () => {
    if (!verified) {
      showError('Верификация обязательна. Сначала подтвердите реквизиты в Финансах.');
      return;
    }
    setIsFree(false);
    if (!tickets.length) setTickets([blankTicket()]);
    haptic('selection');
  };

  const updateTicket = (id, patch) => {
    setTickets((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  };

  const removeTicket = (id) => {
    haptic('light');
    setTickets((prev) => {
      const next = prev.filter((x) => x.id !== id);
      return next.length ? next : [blankTicket()];
    });
  };

  const onCarouselScroll = () => {
    const el = carouselRef.current;
    if (!el || !photos.length) return;
    const w = el.clientWidth || 1;
    setPhotoIndex(Math.round(el.scrollLeft / w));
  };

  const submit = async (status) => {
    if (busy) return;
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
      if (!ticketsValid(tickets)) {
        showError('Проверьте типы билетов и скидку (старая цена > цена)');
        return;
      }
    }

    setBusy(true);
    try {
      const payloadTickets = isFree
        ? []
        : tickets.map((t) => {
            const price = Math.max(0, Number(t.price) || 0);
            const originalPrice = Math.max(0, Number(t.originalPrice) || 0);
            const label = ticketDiscountLabel(price, originalPrice);
            return {
              id: t.id,
              name: t.name.trim(),
              price,
              capacity: Math.max(0, Number(t.capacity) || 0),
              originalPrice: originalPrice > price ? originalPrice : undefined,
              discountLabel: label || undefined,
            };
          });

      const nextSnap = await runActionSafe(isEdit ? 'update_event' : 'create_event', {
        eventId: isEdit ? event.id : undefined,
        name: title.ru.trim(),
        i18n: { title, description },
        photos,
        startsAt,
        endsAt,
        location: { name: locationName.trim(), address: locationAddress.trim() },
        interests,
        isFree,
        freeEntryMode: isFree ? freeEntryMode : undefined,
        tickets: payloadTickets,
        status,
      });
      onSnapshotChange(nextSnap);
      onClose();
    } catch (e) {
      showError(e.message || 'Не удалось создать');
    } finally {
      setBusy(false);
    }
  };

  const entryLabel = isFree
    ? `Бесплатно · ${freeEntryMode === 'approval' ? 'с модерацией' : 'свободный вход'}`
    : `Платно · ${tickets.length} тип(а)`;

  return (
    <>
      <BottomSheet
        open={open && !picker}
        title={STEP_HEADINGS[step - 1]}
        counter={`${step}/${STEPS}`}
        className="fm-sheet-panel--wizard fm-sheet-panel--tall"
        onBack={goBack}
        onClose={onClose}
      >
        <div className="fm-wizard-sheet">
          {step === 1 ? (
            <>
              <p className="fm-media-hint">Хотя бы одно фото</p>
              <div className="fm-photo-grid">
                {Array.from({ length: 6 }).map((_, idx) => {
                  const src = photos[idx];
                  if (src) {
                    return (
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
                    );
                  }
                  return (
                    <button
                      key={idx}
                      type="button"
                      className="fm-photo-add"
                      disabled={idx !== photos.length}
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
              <Input
                header={`Название (${lang.toUpperCase()})`}
                placeholder="Название события"
                value={title[lang]}
                onChange={(e) => setTitle((prev) => ({ ...prev, [lang]: e.target.value }))}
              />
              <label className="fm-field-label">Описание ({lang.toUpperCase()})</label>
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
              <Input
                header="Название места"
                placeholder="Офис Taneesh, Magic City…"
                value={locationName}
                onChange={(e) => setLocationName(e.target.value)}
              />
              <Input
                header="Адрес или ссылка на карту"
                placeholder="Адрес / Google Maps"
                value={locationAddress}
                onChange={(e) => setLocationAddress(e.target.value)}
              />
            </>
          ) : null}

          {step === 5 ? (
            <>
              <Input
                header="Поиск"
                placeholder="Найти интерес"
                value={interestQuery}
                onChange={(e) => setInterestQuery(e.target.value)}
              />
              <p className="fm-media-hint">Выберите хотя бы один · {interests.length} выбрано</p>
              <div className="fm-chip-wrap">
                {filteredInterests.map((item) => {
                  const on = interests.includes(item.label);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`fm-chip${on ? ' fm-chip--on' : ''}`}
                      onClick={() => toggleInterest(item.label)}
                    >
                      <span aria-hidden>{item.emoji}</span> {item.label}
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
                <>
                  <ValueGroup className="fm-value-group--spaced">
                    <SwitchRow
                      label="Модерация заявок"
                      checked={freeEntryMode === 'approval'}
                      onChange={(on) => setFreeEntryMode(on ? 'approval' : 'open')}
                      last
                    />
                  </ValueGroup>
                  <p className="fm-empty-hint">
                    {freeEntryMode === 'approval'
                      ? 'Заявки нужно будет одобрять вручную'
                      : 'Регистрация сразу даёт билет'}
                  </p>
                </>
              ) : (
                <div className="fm-ticket-list">
                  {tickets.map((t, idx) => {
                    const disc = ticketDiscountLabel(t.price, t.originalPrice);
                    return (
                      <div key={t.id} className="fm-ticket-card">
                        <div className="fm-ticket-card-head">
                          <span className="fm-ticket-card-title">Тип {idx + 1}</span>
                          <button
                            type="button"
                            className="fm-ticket-remove"
                            onClick={() => removeTicket(t.id)}
                          >
                            Удалить
                          </button>
                        </div>
                        <Input
                          header="Название"
                          placeholder="Standard, VIP…"
                          value={t.name}
                          onChange={(e) => updateTicket(t.id, { name: e.target.value })}
                        />
                        <div className="fm-ticket-row">
                          <Input
                            header="Цена"
                            type="number"
                            inputMode="numeric"
                            placeholder="0"
                            value={t.price || ''}
                            onChange={(e) => updateTicket(t.id, { price: Number(e.target.value) || 0 })}
                          />
                          <Input
                            header="Старая цена"
                            type="number"
                            inputMode="numeric"
                            placeholder="Скидка"
                            value={t.originalPrice || ''}
                            onChange={(e) => updateTicket(t.id, { originalPrice: Number(e.target.value) || 0 })}
                          />
                        </div>
                        <Input
                          header="Количество"
                          type="number"
                          inputMode="numeric"
                          placeholder="100"
                          value={t.capacity || ''}
                          onChange={(e) => updateTicket(t.id, { capacity: Number(e.target.value) || 0 })}
                        />
                        {disc ? (
                          <p className="fm-ticket-discount-badge">Скидка {disc}</p>
                        ) : (
                          <p className="fm-empty-hint" style={{ margin: 0 }}>
                            Старая цена необязательна — если больше цены, покажем скидку
                          </p>
                        )}
                      </div>
                    );
                  })}
                  <Button
                    mode="outline"
                    size="l"
                    stretched
                    onClick={() => {
                      haptic('selection');
                      setTickets((prev) => [...prev, blankTicket()]);
                    }}
                  >
                    + Добавить тип билета
                  </Button>
                </div>
              )}
            </>
          ) : null}

          {step === 7 ? (
            <div className="fm-review">
              {photos.length ? (
                <div className="fm-review-carousel-wrap">
                  <div
                    ref={carouselRef}
                    className="fm-review-carousel"
                    onScroll={onCarouselScroll}
                  >
                    {photos.map((src, i) => (
                      <div key={i} className="fm-review-slide">
                        <img src={src} alt="" />
                      </div>
                    ))}
                  </div>
                  {photos.length > 1 ? (
                    <div className="fm-review-dots">
                      {photos.map((_, i) => (
                        <span
                          key={i}
                          className={`fm-review-dot${i === photoIndex ? ' fm-review-dot--on' : ''}`}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <h3 className="fm-review-title">{title.ru || 'Без названия'}</h3>
              {description.ru ? (
                <p className="fm-review-desc">{description.ru}</p>
              ) : null}

              <ValueGroup className="fm-value-group--spaced">
                <ValueRow label="Фото" value={`${photos.length} из 6`} onClick={() => jumpTo(1)} />
                <ValueRow label="Название" value={title.ru || '—'} onClick={() => jumpTo(2)} />
                <ValueRow
                  label="Начало"
                  value={formatEventDateTime(startsAt)}
                  onClick={() => jumpTo(3)}
                />
                <ValueRow
                  label="Конец"
                  value={formatEventDateTime(endsAt)}
                  onClick={() => jumpTo(3)}
                />
                <ValueRow
                  label="Место"
                  value={[locationName, locationAddress].filter(Boolean).join(' · ') || '—'}
                  onClick={() => jumpTo(4)}
                />
                <ValueRow
                  label="Интересы"
                  value={interests.join(', ') || '—'}
                  onClick={() => jumpTo(5)}
                />
                <ValueRow
                  label="Вход"
                  value={entryLabel}
                  onClick={() => jumpTo(6)}
                  last={isFree}
                />
                {!isFree
                  ? tickets.map((t, i) => (
                      <ValueRow
                        key={t.id}
                        label={t.name || `Билет ${i + 1}`}
                        value={`${Number(t.price).toLocaleString('ru-RU')} UZS · ${t.capacity} шт.${
                          ticketDiscountLabel(t.price, t.originalPrice)
                            ? ` · ${ticketDiscountLabel(t.price, t.originalPrice)}`
                            : ''
                        }`}
                        onClick={() => jumpTo(6)}
                        last={i === tickets.length - 1}
                      />
                    ))
                  : null}
              </ValueGroup>
            </div>
          ) : null}

          <div className="fm-wizard-sheet-cta fm-wizard-sheet-cta--separated">
            {step < STEPS ? (
              <Button mode="filled" size="l" stretched disabled={!canNext} onClick={goNext}>
                Далее →
              </Button>
            ) : (
              <div className="fm-wizard-nav-pair">
                <Button mode="outline" size="l" stretched disabled={busy} onClick={() => submit('draft')}>
                  Черновик
                </Button>
                <Button mode="filled" size="l" stretched disabled={busy} onClick={() => submit('published')}>
                  Опубликовать
                </Button>
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
