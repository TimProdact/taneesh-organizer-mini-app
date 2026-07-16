import { Cell, Navigation } from '@telegram-apps/telegram-ui';
import { haptic } from '../api.js';
import { previewLine } from './ValueRow.jsx';

/** Entity list row — title + one-line subtitle (ellipsis), never wraps */
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
      className="fm-entity-row"
      before={glyph ? <span className="fm-entity-glyph" aria-hidden>{glyph}</span> : undefined}
      subtitle={subtitle ? previewLine(subtitle, '') : undefined}
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
      {previewLine(title, '—')}
    </Cell>
  );
}
