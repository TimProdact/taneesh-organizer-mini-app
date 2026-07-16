import { List, Section, Cell } from '@telegram-apps/telegram-ui';
import { PageHeader, SubpageLayout } from '../components/PageLayout.jsx';
import { InsetSection } from '../components/InsetSection.jsx';
import { copyText, haptic } from '../api.js';
import { vitrinaUrl } from '../utils.js';

export function SettingsPage() {
  const tg = window.Telegram?.WebApp;
  const url = vitrinaUrl();

  return (
    <SubpageLayout>
      <PageHeader title="Настройки" subtitle="THE4 Admin" />
      <InsetSection>
        <List>
          <Section header="ССЫЛКИ">
            <Cell
              onClick={() => {
                haptic('selection');
                if (tg?.openLink) tg.openLink(url);
                else window.open(url, '_blank');
              }}
              subtitle="Витрина"
            >
              timprodact.github.io/the4
            </Cell>
            <Cell
              onClick={() => copyText(url)}
              subtitle="Скопировать"
            >
              Поделиться ссылкой
            </Cell>
            <Cell
              onClick={() => {
                haptic('selection');
                if (tg?.openTelegramLink) tg.openTelegramLink('https://t.me/mundesign');
              }}
              subtitle="Продавец"
            >
              @mundesign
            </Cell>
          </Section>
          <Section header="LEGAL">
            <Cell
              onClick={() => tg?.openLink?.(`${url}legal/offer/`)}
              subtitle="Оферта"
            >
              Документы
            </Cell>
          </Section>
        </List>
      </InsetSection>
    </SubpageLayout>
  );
}
