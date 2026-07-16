import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, SegmentedControl } from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { PRODUCT_MODELS, findModel } from '../config/productModels.js';
import { haptic, runActionSafe } from '../api.js';

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function listProducts(snapshot) {
  if (snapshot.products?.length) return snapshot.products;
  if (snapshot.product?.id) return [snapshot.product];
  return [];
}

export function ProductMediaPage({ snapshot, onSnapshotChange, onDone, productId }) {
  const product = useMemo(() => {
    const list = listProducts(snapshot);
    return list.find((p) => p.id === productId) || list[0] || {};
  }, [snapshot, productId]);

  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState(product.mediaType === 'images' ? 'images' : '3d');
  const [selectedModelId, setSelectedModelId] = useState(() => {
    const modelId = PRODUCT_MODELS.some((m) => m.id === product.id) ? product.id : PRODUCT_MODELS[0].id;
    return product.mediaType === '3d' ? modelId : modelId;
  });
  const [photoPreview, setPhotoPreview] = useState(
    product.mediaType === 'images' ? product.images?.[0] || null : null,
  );

  useEffect(() => {
    const modelId = PRODUCT_MODELS.some((m) => m.id === product.id) ? product.id : PRODUCT_MODELS[0].id;
    setMode(product.mediaType === 'images' ? 'images' : '3d');
    setSelectedModelId(product.mediaType === '3d' ? modelId : modelId);
    setPhotoPreview(product.mediaType === 'images' ? product.images?.[0] || null : null);
  }, [product.id, product.mediaType, product.images]);

  const save = async (patch) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await runActionSafe('update_product', { productId: product.id, product: patch });
      onSnapshotChange(next);
      haptic('success');
      onDone?.();
    } finally {
      setBusy(false);
    }
  };

  const apply3d = () => {
    const model = findModel(selectedModelId);
    save({
      id: model.id,
      mediaType: '3d',
      modelUrl: model.url,
    });
  };

  const pickPhoto = async (file) => {
    if (!file) return;
    const dataUrl = await readImageFile(file);
    setPhotoPreview(dataUrl);
    await save({ mediaType: 'images', images: [dataUrl] });
  };

  return (
    <SubpageLayout>
      <PageHeader title="Картинка" subtitle="3D или фото" />
      <div className="fm-page-body">
        <div className="fm-segment-wrap fm-segment-wrap--media">
          <SegmentedControl>
            <SegmentedControl.Item
              selected={mode === '3d'}
              onClick={() => { setMode('3d'); haptic('selection'); }}
            >
              3D
            </SegmentedControl.Item>
            <SegmentedControl.Item
              selected={mode === 'images'}
              onClick={() => { setMode('images'); haptic('selection'); }}
            >
              Изображение
            </SegmentedControl.Item>
          </SegmentedControl>
        </div>

        {mode === '3d' ? (
          <div className="fm-media-mode">
            <p className="fm-media-hint">Выберите 3D-модель для витрины</p>
            <div className="fm-inset-card fm-media-card">
              <div className="fm-media-grid">
                {PRODUCT_MODELS.map((model) => (
                  <button
                    key={model.id}
                    type="button"
                    className={`fm-media-tile${selectedModelId === model.id ? ' fm-media-tile--active' : ''}`}
                    disabled={busy}
                    onClick={() => { setSelectedModelId(model.id); haptic('selection'); }}
                  >
                    <span className="fm-media-tile-emoji" aria-hidden>{model.emoji}</span>
                    <span className="fm-media-tile-label">{model.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="fm-page-cta fm-page-cta--separated">
              <Button mode="filled" size="l" stretched disabled={busy || !selectedModelId} onClick={apply3d}>
                Применить 3D-модель
              </Button>
            </div>
          </div>
        ) : (
          <div className="fm-media-mode">
            <p className="fm-media-hint">Загрузите фото товара из галереи</p>
            <div className="fm-inset-card fm-media-card">
              {photoPreview ? (
                <div className="fm-media-photo-preview fm-media-photo-preview--card">
                  <img src={photoPreview} alt="Фото товара" />
                </div>
              ) : (
                <div className="fm-media-photo-empty">Фото ещё не выбрано</div>
              )}
            </div>

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="fm-media-file"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                pickPhoto(file);
              }}
            />

            <div className="fm-page-cta fm-page-cta--separated">
              <Button
                mode="filled"
                size="l"
                stretched
                disabled={busy}
                onClick={() => fileRef.current?.click()}
              >
                {photoPreview ? 'Заменить изображение' : 'Загрузить изображение'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </SubpageLayout>
  );
}
