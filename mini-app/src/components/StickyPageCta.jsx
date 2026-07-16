import { FixedLayout } from '@telegram-apps/telegram-ui';

/**
 * Page-level primary action — glued to the bottom; content scrolls behind it.
 * Use only for the main CTA of the whole page (not sheet / row / banner actions).
 */
export function StickyPageCta({ children, className = '' }) {
  return (
    <FixedLayout
      vertical="bottom"
      className={`fm-sticky-cta${className ? ` ${className}` : ''}`}
    >
      <div className="fm-sticky-cta-inner">{children}</div>
    </FixedLayout>
  );
}
