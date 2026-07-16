import { useEffect, useMemo, useState } from 'react';
import { Button } from '@telegram-apps/telegram-ui';
import { BottomSheet } from './BottomSheet.jsx';
import { ProductListRow } from './ProductListRow.jsx';
import { haptic, runActionSafe } from '../api.js';

const STEPS = 3;

function toDateValue(iso) {
  const d = iso ? new Date(iso) : new Date(Date.now() + 7 * 86_400_000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeValue(iso) {
  const d = iso ? new Date(iso) : new Date();
  d.setHours(20, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function mergeDateTime(datePart, timePart) {
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh, mm] = timePart.split(':').map(Number);
  const base = new Date();
  base.setFullYear(y, m - 1, d);
  base.setHours(hh, mm, 0, 0);
  return base.toISOString();
}

function listProducts(snapshot) {
  if (snapshot.products?.length) return snapshot.products;
  if (snapshot.product?.id) return [snapshot.product];
  return [];
}

export function LaunchDropSheet({ open, snapshot, onSnapshotChange, onClose, onGoCatalog }) {
  const products = listProducts(snapshot);
  const [step, setStep] = useState(1);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [stock, setStock] = useState(100);
  const [busy, setBusy] = useState(false);

  const selectedProduct = useMemo(
    () => products.find((p) => p.id === selectedProductId) || null,
    [products, selectedProductId],
  );

  useEffect(() => {
    if (!open) return;
    const list = listProducts(snapshot);
    setStep(1);
    setSelectedProductId(list[0]?.id || '');
    setDate(toDateValue(snapshot.startsAt));
    setTime(toTimeValue(snapshot.startsAt));
    setStock(100);
    setBusy(false);
  }, [open, snapshot]);

  const next = () => {
    haptic('selection');
    setStep((s) => Math.min(STEPS, s + 1));
  };

  const launch = async () => {
    if (busy || !selectedProductId) return;
    setBusy(true);
    try {
      const nextSnap = await runActionSafe('launch_drop', {
        productId: selectedProductId,
        startsAt: mergeDateTime(date, time),
        stock,
        totalStock: stock,
      });
      onSnapshotChange(nextSnap);
      haptic('success');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      title="Новый дроп"
      subtitle={`Шаг ${step}/${STEPS}`}
      className="fm-sheet-panel--wizard"
      onClose={onClose}
    >
      {!products.length ? (
        <div className="fm-wizard-sheet">
          <p className="fm-empty-hint fm-empty-hint--sheet">Сначала добавь товар в каталог</p>
          <Button
            mode="filled"
            size="l"
            stretched
            onClick={() => {
              onClose();
              onGoCatalog?.();
            }}
          >
            Перейти в Товары
          </Button>
        </div>
      ) : null}

      {products.length > 0 && step === 1 ? (
        <div className="fm-wizard-sheet">
          <p className="fm-media-hint">Выберите товар из каталога — его продаём в этом дропе</p>
          <p className="fm-wizard-meta">{products.length} {products.length === 1 ? 'товар' : products.length < 5 ? 'товара' : 'товаров'} в каталоге</p>
          <div className="fm-inset-card fm-entity-list">
              {products.map((product, index) => {
                const selected = selectedProductId === product.id;
                return (
                  <ProductListRow
                    key={product.id}
                    product={product}
                    selected={selected}
                    pickMode
                    last={index === products.length - 1}
                    onClick={() => setSelectedProductId(product.id)}
                  />
                );
              })}
            </div>
          <div className="fm-wizard-sheet-cta fm-wizard-sheet-cta--separated">
            <Button mode="filled" size="l" stretched disabled={!selectedProductId} onClick={next}>
              Далее →
            </Button>
          </div>
        </div>
      ) : null}

      {products.length > 0 && step === 2 ? (
        <div className="fm-wizard-sheet">
          {selectedProduct ? (
            <div className="fm-wizard-picked">
              <span className="fm-wizard-picked-label">Товар</span>
              <span className="fm-wizard-picked-value">{selectedProduct.name || 'Без названия'}</span>
            </div>
          ) : null}
          <p className="fm-media-hint">Когда старт?</p>
          <div className="fm-wizard-datetime">
            <input type="date" className="fm-wizard-input" value={date} onChange={(e) => setDate(e.target.value)} />
            <input type="time" className="fm-wizard-input" value={time} onChange={(e) => setTime(e.target.value)} />
          </div>
          <div className="fm-wizard-sheet-cta fm-wizard-sheet-cta--separated">
            <Button mode="filled" size="l" stretched onClick={next}>
              Далее →
            </Button>
          </div>
        </div>
      ) : null}

      {products.length > 0 && step === 3 ? (
        <div className="fm-wizard-sheet">
          {selectedProduct ? (
            <div className="fm-wizard-picked">
              <span className="fm-wizard-picked-label">Товар</span>
              <span className="fm-wizard-picked-value">{selectedProduct.name || 'Без названия'}</span>
            </div>
          ) : null}
          <p className="fm-media-hint">Сколько в продаже?</p>
          <div className="fm-wizard-stock">
            <span className="fm-wizard-stock-label">{stock} штук</span>
            <div className="fm-stepper fm-stepper--wizard">
              <button type="button" className="fm-stepper-btn" disabled={stock <= 1} onClick={() => setStock((s) => Math.max(1, s - 10))}>−</button>
              <button type="button" className="fm-stepper-btn" onClick={() => setStock((s) => s + 10)}>+</button>
            </div>
          </div>
          <div className="fm-wizard-sheet-cta fm-wizard-sheet-cta--separated">
            <Button mode="filled" size="l" stretched disabled={busy} onClick={launch}>
              Запустить дроп
            </Button>
          </div>
        </div>
      ) : null}
    </BottomSheet>
  );
}
