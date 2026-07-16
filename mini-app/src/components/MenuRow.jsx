import { Cell, Navigation, Section } from '@telegram-apps/telegram-ui';
import { haptic } from '../api.js';
import { HubSectionHead } from './HubSectionHead.jsx';

export function MenuGroup({ children, header, footer }) {
  if (header) {
    return (
      <div className="fm-section-group">
        <HubSectionHead title={header} />
        <Section footer={footer}>
          {children}
        </Section>
      </div>
    );
  }

  return (
    <Section footer={footer}>
      {children}
    </Section>
  );
}

export function MenuRow({
  label,
  value,
  badge,
  tone = '#007aff',
  glyph,
  onClick,
  last = false,
}) {
  void last;
  return (
    <Cell
      className="fm-tgui-cell"
      before={
        glyph ? (
          <span className="fm-hub-cell-icon" style={{ backgroundColor: tone }} aria-hidden>
            {glyph}
          </span>
        ) : undefined
      }
      after={(
        <Navigation>
          {badge != null && badge > 0 ? badge : value}
        </Navigation>
      )}
      onClick={() => {
        haptic('selection');
        onClick?.();
      }}
    >
      {label}
    </Cell>
  );
}
