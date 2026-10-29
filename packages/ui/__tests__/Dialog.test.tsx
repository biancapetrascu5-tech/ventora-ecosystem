import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { Dialog, DialogTrigger } from '../src/Dialog/Dialog';
import { Button } from '../src/Button/Button';

describe('Dialog', () => {
  it('renders trigger button', () => {
    render(
      <DialogTrigger>
        <Button>Deschide</Button>
        <Dialog title="Test Dialog">Conținut dialog</Dialog>
      </DialogTrigger>,
    );
    expect(screen.getByRole('button', { name: 'Deschide' })).toBeDefined();
  });

  it('opens dialog on trigger click', async () => {
    const user = userEvent.setup();
    render(
      <DialogTrigger>
        <Button>Deschide</Button>
        <Dialog title="Confirmare">Ești sigur?</Dialog>
      </DialogTrigger>,
    );
    await user.click(screen.getByRole('button', { name: 'Deschide' }));
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByText('Confirmare')).toBeDefined();
  });

  it('closes dialog on Esc', async () => {
    const user = userEvent.setup();
    render(
      <DialogTrigger>
        <Button>Deschide</Button>
        <Dialog title="Test">Conținut</Dialog>
      </DialogTrigger>,
    );
    await user.click(screen.getByRole('button', { name: 'Deschide' }));
    expect(screen.getByRole('dialog')).toBeDefined();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('has no axe violations when closed', async () => {
    const { container } = render(
      <DialogTrigger>
        <Button>Deschide</Button>
        <Dialog title="Test">Conținut</Dialog>
      </DialogTrigger>,
    );
    const results = await axe.run(container);
    expect(results.violations).toHaveLength(0);
  });
});
