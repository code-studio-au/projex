// @vitest-environment jsdom

import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import MoneyAmountEditor from '../src/components/finance/MoneyAmountEditor';
import { parseMoneyAmountDraft } from '../src/components/finance/moneyAmountDraft';
import {
  installComponentTestDom,
  renderComponent,
} from './helpers/renderComponent';

beforeAll(installComponentTestDom);
afterEach(cleanup);

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('parseMoneyAmountDraft', () => {
  it.each(['', '-', '.', '0.', '1.234'])(
    'rejects the intermediate value %j',
    (value) => {
      expect(parseMoneyAmountDraft(value)).toEqual({
        valid: false,
        message: 'Enter a complete amount with up to 2 decimal places.',
      });
    }
  );

  it('enforces minimum values without preventing valid negative transactions', () => {
    expect(parseMoneyAmountDraft('-1.25')).toEqual({
      valid: true,
      amountCents: -125,
    });
    expect(parseMoneyAmountDraft('-1.25', 0)).toEqual({
      valid: false,
      message: 'Amount cannot be less than 0.00.',
    });
  });
});

describe('MoneyAmountEditor', () => {
  it('keeps input local until an explicit save', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    renderComponent(
      <MoneyAmountEditor
        amountCents={1_000}
        inputLabel="Allocated budget"
        saveLabel="Save allocated budget"
        cancelLabel="Cancel allocated budget"
        onSave={onSave}
      />
    );

    const input = screen.getByRole('textbox', { name: 'Allocated budget' });
    fireEvent.change(input, { target: { value: '12.34' } });
    expect(onSave).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(1_234));
  });

  it('prevents overlapping writes while a slow save is pending', async () => {
    const save = deferred();
    const onSave = vi.fn(() => save.promise);
    const onSaved = vi.fn();
    renderComponent(
      <MoneyAmountEditor
        amountCents={1_000}
        inputLabel="Transaction amount"
        saveLabel="Save transaction amount"
        cancelLabel="Cancel transaction amount"
        alwaysShowActions
        onSave={onSave}
        onSaved={onSaved}
      />
    );

    const input = screen.getByRole('textbox', {
      name: 'Transaction amount',
    });
    fireEvent.change(input, { target: { value: '20.00' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save transaction amount' })
    );
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect((input as HTMLInputElement).disabled).toBe(true);
    expect(onSaved).not.toHaveBeenCalled();

    save.resolve();
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
  });

  it('retains the draft and editor after rejection so the save can be retried', async () => {
    const onSave = vi
      .fn()
      .mockRejectedValueOnce(new Error('Unable to reach the server'))
      .mockResolvedValueOnce(undefined);
    const onSaved = vi.fn();
    renderComponent(
      <MoneyAmountEditor
        amountCents={1_000}
        inputLabel="Project budget"
        saveLabel="Save project budget"
        cancelLabel="Cancel project budget"
        alwaysShowActions
        onSave={onSave}
        onSaved={onSaved}
      />
    );

    const input = screen.getByRole('textbox', { name: 'Project budget' });
    fireEvent.change(input, { target: { value: '30.00' } });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save project budget' })
    );

    expect((await screen.findByRole('alert')).textContent).toContain(
      'Unable to reach the server'
    );
    expect((input as HTMLInputElement).value).toBe('$30.00');
    expect((input as HTMLInputElement).disabled).toBe(false);
    expect(onSaved).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'Save project budget' })
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledTimes(2);
  });
});
