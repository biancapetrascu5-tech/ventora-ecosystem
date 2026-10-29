import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Agenda } from '../src/Agenda/Agenda';
import { Kanban } from '../src/Kanban/Kanban';
import { Schedule } from '../src/Schedule/Schedule';
import { SlotPicker } from '../src/SlotPicker/SlotPicker';

const STATUS = {
  done: 'Încheiată',
  now: 'În desfășurare',
  confirmed: 'Confirmată',
  unconfirmed: 'Neconfirmată',
  noshow: 'Nu a venit',
  cancelled: 'Anulată',
  blocked: 'Blocat',
};

describe('Agenda', () => {
  const items = [
    { id: 1, start: '09:00', end: '09:45', title: 'Ana', status: 'done' as const },
    { id: 2, start: '11:00', end: '12:00', title: 'Andrei', staff: 'Ioana', subtitle: 'Vopsit' },
    { id: 3, start: '12:30', end: '13:15', title: 'Cristina', status: 'unconfirmed' as const },
  ];

  it('evenimentul în curs devine „now”, cu progres; linia „acum” stă înaintea următorului', () => {
    render(<Agenda items={items} now="11:20" statusLabels={STATUS} nowLabel="Acum" />);
    expect(screen.getByText('În desfășurare')).toBeDefined();
    expect(screen.getByRole('progressbar', { name: 'Acum' }).getAttribute('aria-valuenow')).toBe(
      '33',
    );
    const lis = screen.getAllByRole('listitem');
    expect(lis[2]!.getAttribute('aria-label')).toBe('Acum');
    expect(within(lis[3]!).getByText('Cristina')).toBeDefined();
  });

  it('showStaff: false scoate angajatul din rândul secundar', () => {
    render(<Agenda items={items} showStaff={false} statusLabels={STATUS} />);
    expect(screen.getByText('Vopsit')).toBeDefined();
    expect(screen.queryByText('Vopsit · Ioana')).toBeNull();
  });
});

describe('Kanban', () => {
  const labels = {
    moveTo: (c: string) => `Mută în „${c}”`,
    moreActionsFor: (n: string) => `Acțiuni pentru ${n}`,
    rowActions: 'Acțiuni',
  };
  it('coloane cu număr, coloană goală, meniul „Mută în…”', async () => {
    const onMove = vi.fn();
    render(
      <Kanban
        labels={labels}
        columns={[
          { id: 'a', label: 'De făcut' },
          { id: 'b', label: 'Blocate', empty: 'Nicio sarcină blocată.' },
        ]}
        cards={[{ id: 'x', col: 'a', title: 'Texte' }]}
        onMove={onMove}
      />,
    );
    expect(screen.getByText('Nicio sarcină blocată.')).toBeDefined();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Acțiuni pentru Texte' }));
    await user.click(screen.getByRole('menuitem', { name: 'Mută în „Blocate”' }));
    expect(onMove).toHaveBeenCalledWith('x', 'b');
  });
});

describe('Schedule', () => {
  it('suprapunerile stau pe benzi; eticheta „acum”; aria cu starea', () => {
    render(
      <Schedule
        columns={[{ id: 'a', label: 'Ioana' }]}
        events={[
          { id: '1', col: 'a', start: '11:00', end: '11:45', title: 'Sorina', status: 'confirmed' },
          { id: '2', col: 'a', start: '11:15', end: '12:15', title: 'Alina', status: 'noshow' },
        ]}
        from={9}
        to={14}
        now="11:20"
        onEventClick={() => {}}
        statusLabels={STATUS}
      />,
    );
    const a = screen.getByRole('button', { name: 'Sorina, 11:00–11:45, Confirmată' });
    const b = screen.getByRole('button', { name: 'Alina, 11:15–12:15, Nu a venit' });
    expect(a.style.width).toBe('calc(50% - 4px)');
    expect(b.style.left).toBe('calc(50% + 2px)');
    expect(screen.getByText('11:20')).toBeDefined();
  });
});

describe('SlotPicker', () => {
  it('ora aleasă e bifată; cele ocupate sunt dezactivate', async () => {
    const onChange = vi.fn();
    render(
      <SlotPicker
        label="Ora"
        value="09:00"
        onChange={onChange}
        slots={[
          { time: '09:00', available: true },
          { time: '09:15', available: false },
          { time: '09:30', available: true },
        ]}
      />,
    );
    expect(screen.getByRole('radio', { name: '09:00' }).getAttribute('aria-checked')).toBe('true');
    expect((screen.getByRole('radio', { name: '09:15' }) as HTMLButtonElement).disabled).toBe(true);
    await userEvent.setup().click(screen.getByRole('radio', { name: '09:30' }));
    expect(onChange).toHaveBeenCalledWith('09:30');
  });
});
