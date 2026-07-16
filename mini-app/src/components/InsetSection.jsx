import { Section } from '@telegram-apps/telegram-ui';

/** @deprecated Prefer ValueGroup / Section with `header` (СВОДКА style). */
export function InsetSection({ title, children, className = '' }) {
  return (
    <Section header={title || undefined} className={className || undefined}>
      {children}
    </Section>
  );
}
