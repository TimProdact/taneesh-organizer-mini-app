import { Button } from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { ProductListRow } from '../components/ProductListRow.jsx';
import { haptic, runActionSafe } from '../api.js';
import { SCREENS } from '../navigation/screens.js';

function listProducts(snapshot) {
  if (snapshot.products?.length) return snapshot.products;
  if (snapshot.product?.id) return [snapshot.product];
  return [];
}

export function CatalogPage({ snapshot, onSnapshotChange, push }) {
  const products = listProducts(snapshot);

  const addProduct = async () => {
    haptic('selection');
    const next = await runActionSafe('create_product', {
      product: {
        name: '',
        edition: '',
        price: 320000,
        mediaType: '3d',
        id: 'cream-tube',
      },
    });
    onSnapshotChange(next);
    const list = listProducts(next);
    const created = list[list.length - 1];
    if (!created?.id) return;
    push(SCREENS.PRODUCT, { productId: created.id, autoOpenField: 'name' });
  };

  return (
    <SubpageLayout>
      <PageHeader title="Товары" subtitle={`${products.length} в каталоге`} />
      <div className="fm-page-body">
        {products.length > 0 ? (
          <div className="fm-inset-card fm-entity-list">
            {products.map((product, index) => (
              <ProductListRow
                key={product.id}
                product={product}
                last={index === products.length - 1}
                onClick={() => push(SCREENS.PRODUCT, { productId: product.id })}
              />
            ))}
          </div>
        ) : (
          <p className="fm-empty-hint">Добавь первый товар — название, цена и картинка по одному полю</p>
        )}

        <div className="fm-page-cta fm-page-cta--separated">
          <Button mode="filled" size="l" stretched onClick={addProduct}>
            + Добавить товар
          </Button>
        </div>
      </div>
    </SubpageLayout>
  );
}
