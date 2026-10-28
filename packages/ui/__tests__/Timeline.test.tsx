import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Timeline } from '../src/Timeline/Timeline';

/* P-2 (S71): jsdom nu are layout, deci geometria e simulată — derularea 800px într-o fereastră de
   360px, coloana etapelor 148px (telefon), eticheta „Azi” 30px. */
const SCROLL_W = 800;
const CLIENT_W = 360;
const LABEL_W = 148;
const TODAY_W = 30;

const saved: Record<string, PropertyDescriptor | undefined> = {};
const proto = HTMLElement.prototype as unknown as Record<string, unknown>;

function mock(name: string, desc: PropertyDescriptor) {
  saved[name] = Object.getOwnPropertyDescriptor(HTMLElement.prototype, name);
  Object.defineProperty(HTMLElement.prototype, name, { configurable: true, ...desc });
}

beforeAll(() => {
  mock('scrollWidth', { get: () => SCROLL_W });
  mock('clientWidth', { get: () => CLIENT_W });
  mock('offsetWidth', {
    get(this: HTMLElement) {
      if (this.textContent === 'Azi' && this.tagName === 'SPAN') return TODAY_W;
      const role = this.getAttribute('role');
      return role === 'columnheader' || role === 'rowheader' ? LABEL_W : 0;
    },
  });
  mock('scrollLeft', {
    get(this: HTMLElement & { _sl?: number }) {
      return this._sl ?? 0;
    },
    set(this: HTMLElement & { _sl?: number }, v: number) {
      this._sl = v;
    },
  });
});

afterAll(() => {
  for (const [name, desc] of Object.entries(saved)) {
    if (desc) Object.defineProperty(HTMLElement.prototype, name, desc);
    else delete proto[name];
  }
});

const PERIODS = ['Ian', 'Feb', 'Mar', 'Apr', 'Mai', 'Iun'].map((label) => ({ label }));
const ROWS = [{ id: 'a', label: 'Etapa A', start: 0, end: 2, status: 'done' as const }];

function renderAt(today: number) {
  const { container } = render(
    <Timeline label="Etapă" periods={PERIODS} rows={ROWS} today={today} todayLabel="Azi" />,
  );
  const scroller = container.querySelector('[role="table"]')!.firstElementChild as HTMLElement;
  return { scroller, label: screen.getByText('Azi') };
}

describe('Timeline — P-2 (azi la o treime)', () => {
  it('se deschide derulat cu ziua de azi la o treime din lățimea vizibilă', () => {
    const { scroller, label } = renderAt(4);
    // x = 148 + 4/6 · 652 = 582,67; scrollLeft = x − 148 − (360 − 148)/3 = 364
    expect(Math.round(scroller.scrollLeft)).toBe(364);
    // eticheta e centrată pe linie: −30/2
    expect(label.style.transform).toBe('translateX(-15px)');
  });

  it('mută eticheta spre interior când nu încape centrată', () => {
    const { scroller, label } = renderAt(5.9);
    expect(scroller.scrollLeft).toBe(SCROLL_W - CLIENT_W);
    // marginea dreaptă vizibilă: 440 + 360 − 30 − 4 = 766; x = 789,13 → −23
    expect(label.style.transform).toBe('translateX(-23px)');
  });
});
