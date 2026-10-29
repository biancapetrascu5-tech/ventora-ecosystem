import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { Drawer, DrawerTrigger } from '../src/Drawer/Drawer';
import { Button } from '../src/Button/Button';

describe('Drawer', () => {
  it('renders trigger', () => {
    render(
      <DrawerTrigger>
        <Button>Setări</Button>
        <Drawer title="Setări avansate">Conținut drawer</Drawer>
      </DrawerTrigger>,
    );
    expect(screen.getByRole('button', { name: 'Setări' })).toBeDefined();
  });

  it('opens drawer on click', async () => {
    const user = userEvent.setup();
    render(
      <DrawerTrigger>
        <Button>Setări</Button>
        <Drawer title="Setări avansate">Conținut</Drawer>
      </DrawerTrigger>,
    );
    await user.click(screen.getByRole('button', { name: 'Setări' }));
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Setări avansate')).toBeDefined();
  });

  it('closes on Esc', async () => {
    const user = userEvent.setup();
    render(
      <DrawerTrigger>
        <Button>Setări</Button>
        <Drawer title="Setări avansate">Conținut</Drawer>
      </DrawerTrigger>,
    );
    await user.click(screen.getByRole('button', { name: 'Setări' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('has no axe violations when closed', async () => {
    const { container } = render(
      <DrawerTrigger>
        <Button>Setări</Button>
        <Drawer title="Setări avansate">Conținut</Drawer>
      </DrawerTrigger>,
    );
    const results = await axe.run(container);
    expect(results.violations).toHaveLength(0);
  });
});
