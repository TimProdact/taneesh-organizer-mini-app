import { findModel } from '../config/productModels.js';

export function ProductPreview({ product = {}, size = 'md', list = false }) {
  const isPhoto = product.mediaType === 'images' && product.images?.[0];
  const model = findModel(product.id);

  return (
    <div className={`fm-product-preview fm-product-preview--${size}${list ? ' fm-product-preview--list' : ''}`}>
      {isPhoto ? (
        <img src={product.images[0]} alt="" className="fm-product-preview-img" />
      ) : (
        <div className="fm-product-preview-3d" aria-hidden>
          <span className="fm-product-preview-emoji">{model.emoji}</span>
          <span className="fm-product-preview-badge">3D</span>
        </div>
      )}
    </div>
  );
}
