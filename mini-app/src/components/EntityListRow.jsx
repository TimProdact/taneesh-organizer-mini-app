import { Cell, Navigation } from '@telegram-apps/telegram-ui';
import { haptic } from '../api.js';

/** Entity list row — Telegram UI `Cell` */
export function EntityListRow({
  glyph,
  title,
  subtitle,
  onClick,
  last = false,
}) {
  void last;
  return (
    <Cell
      before={glyph ? <span className="fm-entity-glyph" aria-hidden>{glyph}</span> : undefined}
      subtitle={subtitle || undefined}
      after={<Navigation />}
      onClick={
        onClick
          ? () => {
              haptic('selection');
              onClick();
            }
          : undefined
      }
    >
      {title}
    </Cell>
  );
}
