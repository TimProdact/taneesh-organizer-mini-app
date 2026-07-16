const BASE = 'https://timprodact.github.io/the4';

export const PRODUCT_MODELS = [
  { id: 'cream-tube', label: 'Тюбик', emoji: '🧴', url: `${BASE}/models/gallery/cream-tube.glb` },
  { id: 'cosmetic-mirror', label: 'Зеркало', emoji: '🪞', url: `${BASE}/models/gallery/cosmetic-mirror.glb` },
  { id: 'pixel-compact', label: 'Компакт', emoji: '💄', url: `${BASE}/models/gallery/pixel-compact.glb` },
  { id: 'velvet-wings', label: 'Крылья', emoji: '✨', url: `${BASE}/models/gallery/velvet-wings.glb` },
];

export function findModel(id) {
  return PRODUCT_MODELS.find((m) => m.id === id) || PRODUCT_MODELS[0];
}

export function mediaSummary(product = {}) {
  if (product.mediaType === 'images' && product.images?.[0]) {
    return 'Фото';
  }
  const model = findModel(product.id);
  return `3D · ${model.label.toLowerCase()}`;
}
