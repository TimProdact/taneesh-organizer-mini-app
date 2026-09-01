import { Button, Input, SegmentedControl } from '@telegram-apps/telegram-ui';
import { SwitchRow, ValueRow } from './ValueRow.jsx';
import { ValueGroup } from './ValueGroup.jsx';
import { haptic } from '../api.js';
import { ticketDiscountLabel } from '../config/eventInterests.js';
import { AGE_OPTIONS, GENDER_OPTIONS } from '../config/ticketFields.js';
import { formatEventDateTime } from './DateTimePickerSheet.jsx';

function guestsMode(seatsPerTicket) {
  const n = Math.max(1, Math.floor(Number(seatsPerTicket) || 1));
  if (n === 1) return '1';
  if (n === 2) return '2';
  return 'custom';
}

export function TicketCardFields({
  ticket,
  index,
  ticketMode,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  onPickSalesStart,
  canRemove = true,
}) {
  const disc = ticketDiscountLabel(ticket.price, ticket.originalPrice);
  const sold = Number(ticket.sold) || 0;
  const minCapacity = Math.max(1, sold);
  const showPaySeg = ticketMode === 'paid';

  return (
    <div className="fm-ticket-card">
      <div className="fm-ticket-card-head">
        <span className="fm-ticket-card-title">Тип {index + 1}</span>
        <div className="fm-ticket-head-actions">
          {onMoveUp ? (
            <button type="button" className="fm-ticket-order" onClick={onMoveUp} aria-label="Выше">
              ↑
            </button>
          ) : null}
          {onMoveDown ? (
            <button type="button" className="fm-ticket-order" onClick={onMoveDown} aria-label="Ниже">
              ↓
            </button>
          ) : null}
          {canRemove ? (
            <button type="button" className="fm-ticket-remove" onClick={onRemove}>
              Удалить
            </button>
          ) : null}
        </div>
      </div>
      <Input
        header="Название"
        placeholder="Standard, VIP…"
        value={ticket.name}
        onChange={(e) => onChange({ name: e.target.value })}
      />
      <Input
        header="Описание"
        placeholder="Что входит в тариф"
        value={ticket.description || ''}
        onChange={(e) => onChange({ description: e.target.value })}
      />
      <div className="fm-ticket-row">
        <Input
          header="Цена"
          type="number"
          inputMode="numeric"
          placeholder="Сумма"
          value={ticket.price === 0 || ticket.price === '0' ? '' : (ticket.price ?? '')}
          onChange={(e) => {
            const raw = e.target.value;
            onChange({ price: raw === '' ? '' : Number(raw) });
          }}
        />
        <Input
          header="Старая цена"
          type="number"
          inputMode="numeric"
          placeholder="Необязательно"
          value={ticket.originalPrice === 0 || ticket.originalPrice === '0' ? '' : (ticket.originalPrice ?? '')}
          onChange={(e) => {
            const raw = e.target.value;
            onChange({ originalPrice: raw === '' ? '' : Number(raw) });
          }}
        />
      </div>
      <Input
        header={sold ? `Количество (≥ ${sold} продано)` : 'Количество'}
        type="number"
        inputMode="numeric"
        placeholder="100"
        value={ticket.capacity === 0 || ticket.capacity === '0' ? '' : (ticket.capacity ?? '')}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === '') {
            onChange({ capacity: '' });
            return;
          }
          onChange({ capacity: Math.max(minCapacity, Number(raw) || 0) });
        }}
      />

      {showPaySeg ? (
        <div className="fm-segment-wrap">
          <p className="fm-field-label">Оплата</p>
          <SegmentedControl>
            <SegmentedControl.Item
              selected={ticket.paymentMode !== 'at_door'}
              onClick={() => { onChange({ paymentMode: 'online' }); haptic('selection'); }}
            >
              Онлайн
            </SegmentedControl.Item>
            <SegmentedControl.Item
              selected={ticket.paymentMode === 'at_door'}
              onClick={() => { onChange({ paymentMode: 'at_door' }); haptic('selection'); }}
            >
              На входе
            </SegmentedControl.Item>
          </SegmentedControl>
        </div>
      ) : null}

      <div className="fm-segment-wrap">
        <p className="fm-field-label">Гости на билет</p>
        <SegmentedControl>
          <SegmentedControl.Item
            selected={guestsMode(ticket.seatsPerTicket) === '1'}
            onClick={() => onChange({ seatsPerTicket: 1 })}
          >
            Одиночный
          </SegmentedControl.Item>
          <SegmentedControl.Item
            selected={guestsMode(ticket.seatsPerTicket) === '2'}
            onClick={() => onChange({ seatsPerTicket: 2 })}
          >
            Парный
          </SegmentedControl.Item>
          <SegmentedControl.Item
            selected={guestsMode(ticket.seatsPerTicket) === 'custom'}
            onClick={() => {
              const current = Math.max(1, Math.floor(Number(ticket.seatsPerTicket) || 3));
              onChange({ seatsPerTicket: current >= 3 ? current : 3 });
            }}
          >
            Своё
          </SegmentedControl.Item>
        </SegmentedControl>
      </div>
      {guestsMode(ticket.seatsPerTicket) === 'custom' ? (
        <Input
          header="Количество гостей"
          type="number"
          inputMode="numeric"
          min={3}
          max={10}
          placeholder="3"
          value={ticket.seatsPerTicket || ''}
          onChange={(e) => onChange({ seatsPerTicket: Number(e.target.value) || 0 })}
        />
      ) : null}

      <div className="fm-segment-wrap">
        <p className="fm-field-label">Пол</p>
        <SegmentedControl>
          {GENDER_OPTIONS.map((g) => (
            <SegmentedControl.Item
              key={g.id}
              selected={(ticket.audienceGender || 'any') === g.id}
              onClick={() => { onChange({ audienceGender: g.id }); haptic('selection'); }}
            >
              {g.label}
            </SegmentedControl.Item>
          ))}
        </SegmentedControl>
      </div>

      <div className="fm-segment-wrap">
        <p className="fm-field-label">Возраст</p>
        <SegmentedControl>
          {AGE_OPTIONS.map((g) => (
            <SegmentedControl.Item
              key={g.id || 'any'}
              selected={String(ticket.minAge ?? '') === g.id}
              onClick={() => { onChange({ minAge: g.id }); haptic('selection'); }}
            >
              {g.label}
            </SegmentedControl.Item>
          ))}
        </SegmentedControl>
      </div>

      <ValueGroup>
        <ValueRow
          label="Старт продаж"
          value={ticket.salesStartDatetime ? formatEventDateTime(ticket.salesStartDatetime) : 'Уже открыто'}
          onClick={onPickSalesStart}
        />
        {ticket.salesStartDatetime ? (
          <Button
            mode="outline"
            size="s"
            stretched
            onClick={() => onChange({ salesStartDatetime: '' })}
          >
            С начала ивента
          </Button>
        ) : null}
      </ValueGroup>

      <ValueGroup>
        <SwitchRow
          label="Показать на витрине"
          checked={ticket.hidden !== true}
          onChange={(on) => onChange({ hidden: !on })}
          last
        />
      </ValueGroup>

      {disc ? (
        <p className="fm-ticket-discount-badge">Скидка {disc}</p>
      ) : (
        <p className="fm-empty-hint" style={{ margin: 0 }}>
          Старая цена необязательна — если больше цены, покажем скидку
        </p>
      )}
    </div>
  );
}
