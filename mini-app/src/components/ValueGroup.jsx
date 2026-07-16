import { Section } from '@telegram-apps/telegram-ui';
import { HubSectionHead } from './HubSectionHead.jsx';

/** Settings block — Telegram UI `Section` */
export function ValueGroup({ children, className = '', header, footer }) {
  if (header) {
    return (
      <div className="fm-section-group">
        <HubSectionHead title={header} />
        <Section footer={footer} className={className || undefined}>
          {children}
        </Section>
      </div>
    );
  }

  return (
    <Section footer={footer} className={className || undefined}>
      {children}
    </Section>
  );
}
