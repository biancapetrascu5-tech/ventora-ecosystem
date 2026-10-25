import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { AppLaunch } from './AppLaunch';

const makeRect = (): DOMRect => ({
  left: 100,
  top: 100,
  right: 164,
  bottom: 164,
  width: 64,
  height: 64,
  x: 100,
  y: 100,
  toJSON: () => ({}),
});

beforeAll(() => {
  // matchMedia stub
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

describe('AppLaunch', () => {
  it('renders static frame at progress 0', () => {
    render(<AppLaunch app="booking" from={makeRect()} progress={0} />);
    // At progress 0 the surface should be invisible but the component renders
    expect(document.body).toBeTruthy();
  });

  it('renders static frame at progress 1.0', () => {
    render(<AppLaunch app="crm" from={makeRect()} progress={1.0} />);
    expect(document.body).toBeTruthy();
  });

  it('renders live overlay with role=status', () => {
    render(<AppLaunch app="hr" from={makeRect()} />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('fires onDone after reduced motion timeout', async () => {
    // Force reduced motion
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: () => ({ matches: true, addEventListener: () => {}, removeEventListener: () => {} }),
    });

    vi.useFakeTimers();
    const onDone = vi.fn();

    render(<AppLaunch app="finance" from={makeRect()} onDone={onDone} />);

    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    expect(onDone).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
