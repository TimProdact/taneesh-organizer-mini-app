import { useEffect, useMemo, useState } from 'react';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { ProductPreview } from '../components/ProductPreview.jsx';
import { FieldSheet } from '../components/FieldSheet.jsx';
import { ValueGroup } from '../components/ValueGroup.jsx';
import { ValueRow } from '../components/ValueRow.jsx';
import { formatPrice } from '../utils.js';
import { mediaSummary } from '../config/productModels.js';
import { runActionSafe } from '../api.js';
import { SCREENS } from '../navigation/screens.js';

const FIELDS = {
  name: 'name',
  edition: 'edition',
  price: 'price',
};

function listProducts(snapshot) {
  if (snapshot.products?.length) return snapshot.products;
  if (snapshot.product?.id) return [snapshot.product];
  return [];
}

export function ProductPage({ snapshot, onSnapshotChange, push, productId, autoOpenField }) {
  const products = listProducts(snapshot);
  const product = useMemo(
    () => products.find((p) => p.id === productId) || products[0] || {},
    [products, productId],
  );

  const [sheet, setSheet] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (autoOpenField) setSheet(autoOpenField);
  }, [autoOpenField, product.id]);

  const saveProduct = async (patch) => {
    if (busy) return;
    setBusy(true);
    try {
      const next = await runActionSafe('update_product', { productId: product.id, product: patch });
      onSnapshotChange(next);
    } finally {
      setBusy(false);
    }
  };

  const openField = (field) => setSheet(field);
  const closeSheet = () => setSheet(null);

  const handleSave = async (raw) => {
    if (sheet === FIELDS.name) {
      const name = raw.trim();
      if (!name) throw new Error('Введите название');
      await saveProduct({ name });
    } else if (sheet === FIELDS.edition) {
      await saveProduct({ edition: raw.trim() });
    } else if (sheet === FIELDS.price) {
      const price = Number(String(raw).replace(/\s/g, ''));
      if (!Number.isFinite(price) || price <= 0) throw new Error('Введите корректную цену');
      await saveProduct({ price });
    }
  };

  return (
    <SubpageLayout>
      <PageHeader title="Товар" subtitle="Контент витрины" />
      <div className="fm-page-body">
        <div className="fm-product-hero">
          <ProductPreview product={product} size="lg" />
        </div>

        <ValueGroup>
          <ValueRow label="Название" value={product.name || '—'} onClick={() => openField(FIELDS.name)} />
          <ValueRow label="Подзаголовок" value={product.edition || '—'} onClick={() => openField(FIELDS.edition)} />
          <ValueRow label="Цена" value={product.price ? formatPrice(product.price) : '—'} onClick={() => openField(FIELDS.price)} />
          <ValueRow
            label="Картинка"
            value={mediaSummary(product)}
            onClick={() => push(SCREENS.PRODUCT_MEDIA, { productId: product.id })}
            last
          />
        </ValueGroup>
      </div>

      <FieldSheet open={sheet === FIELDS.name} title="Название" value={product.name} placeholder="SILK REPAIR" onClose={closeSheet} onSave={handleSave} />
      <FieldSheet open={sheet === FIELDS.edition} title="Подзаголовок" value={product.edition} placeholder="Face Cream · 1st Drop" onClose={closeSheet} onSave={handleSave} />
      <FieldSheet open={sheet === FIELDS.price} title="Цена" value={product.price ? String(product.price) : ''} type="number" inputMode="numeric" placeholder="320000" onClose={closeSheet} onSave={handleSave} />
    </SubpageLayout>
  );
}
