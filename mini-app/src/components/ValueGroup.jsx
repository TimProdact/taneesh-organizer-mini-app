import { Section } from '@telegram-apps/telegram-ui';

/** Settings block — Telegram UI `Section` */
export function ValueGroup({ children, className = '', header, footer }) {
  return (
    <Section header={header} footer={footer} className={className || undefined}>
      {children}
    </Section>
  );
}
