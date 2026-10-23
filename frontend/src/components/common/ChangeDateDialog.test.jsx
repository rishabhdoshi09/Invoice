/**
 * The dialog decides what date is sent to the server, so pin its behaviour:
 * it starts on the entry's current date, only saves a real change, refuses
 * future dates, sends YYYY-MM-DD, and shows the server's refusal in place.
 *
 * Run: CI=true npx react-scripts test --watchAll=false --testPathPattern=ChangeDateDialog
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ChangeDateDialog } from './ChangeDateDialog';

const entry = { label: 'Payment PAY-ED3BD99E', date: '04/09/2026' };

function setup(onSave = jest.fn().mockResolvedValue()) {
    render(<ChangeDateDialog open entry={entry} onClose={jest.fn()} onSave={onSave} />);
    return {
        onSave,
        input: screen.getByTestId('change-date-input'),
        save: screen.getByTestId('change-date-save'),
    };
}

test("starts on the entry's current date, and Save is off until it changes", () => {
    const { input, save } = setup();
    expect(screen.getByText('Payment PAY-ED3BD99E')).toBeInTheDocument();
    expect(input).toHaveValue('2026-09-04');
    expect(save).toBeDisabled();
});

test('sends the new date as YYYY-MM-DD', async () => {
    const { input, save, onSave } = setup();
    fireEvent.change(input, { target: { value: '2026-09-11' } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('2026-09-11'));
});

test('Enter saves too', async () => {
    const { input, onSave } = setup();
    fireEvent.change(input, { target: { value: '2026-09-02' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('2026-09-02'));
});

test('refuses a future date', () => {
    const { input, save, onSave } = setup();
    fireEvent.change(input, { target: { value: '2099-01-01' } });
    expect(screen.getByText('The date cannot be in the future.')).toBeInTheDocument();
    expect(save).toBeDisabled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).not.toHaveBeenCalled();
});

test('warns, without blocking, when the move crosses a financial year (1 April)', () => {
    const { input, save } = setup();
    fireEvent.change(input, { target: { value: '2026-04-02' } });
    expect(screen.queryByTestId('change-date-fy-warning')).not.toBeInTheDocument();
    fireEvent.change(input, { target: { value: '2026-03-31' } });
    expect(screen.getByTestId('change-date-fy-warning')).toHaveTextContent('from FY 2026-27 to FY 2025-26');
    expect(save).toBeEnabled();
});

test("shows the server's refusal and stays open so the date can be fixed", async () => {
    const refusal = { response: { data: { message: "This date is before ramu vatii's opening balance date (05/09/2026)." } } };
    const { input, save } = setup(jest.fn().mockRejectedValue(refusal));
    fireEvent.change(input, { target: { value: '2026-09-01' } });
    fireEvent.click(save);
    expect(await screen.findByTestId('change-date-error')).toHaveTextContent('opening balance date (05/09/2026)');
    expect(save).toBeEnabled(); // can try another date
});
