/**
 * Run: CI=true npx react-scripts test --watchAll=false --testPathPattern=EditNotesDialog
 */
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EditNotesDialog } from './EditNotesDialog';

function setup(notes = 'suhas', onSave = jest.fn().mockResolvedValue()) {
    render(<EditNotesDialog open entry={{ label: 'Payment PAY-ED3BD99E', notes }} onClose={jest.fn()} onSave={onSave} />);
    return { onSave, input: screen.getByTestId('edit-notes-input'), save: screen.getByTestId('edit-notes-save') };
}

test('starts on the current notes, and Save is off until they change', () => {
    const { input, save } = setup();
    expect(screen.getByText('Payment PAY-ED3BD99E')).toBeInTheDocument();
    expect(input).toHaveValue('suhas');
    expect(save).toBeDisabled();
    fireEvent.change(input, { target: { value: '  suhas ' } }); // only spaces differ
    expect(save).toBeDisabled();
});

test('saves the trimmed text', async () => {
    const { input, save, onSave } = setup();
    fireEvent.change(input, { target: { value: '  paid via suhas  ' } });
    fireEvent.click(save);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('paid via suhas'));
});

test('Enter saves; Shift+Enter does not', async () => {
    const { input, onSave } = setup();
    fireEvent.change(input, { target: { value: 'cheque 4471' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith('cheque 4471'));
});

test('emptying the box removes the notes', async () => {
    const { input, save, onSave } = setup();
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(save);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(''));
});

test('refuses more than 500 characters', () => {
    const { input, save, onSave } = setup('');
    fireEvent.change(input, { target: { value: 'x'.repeat(501) } });
    expect(screen.getByText('Notes can be at most 500 characters.')).toBeInTheDocument();
    expect(save).toBeDisabled();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSave).not.toHaveBeenCalled();
});

test("shows the server's refusal and stays open", async () => {
    const refusal = { response: { data: { message: 'This payment has been deleted.' } } };
    const { input, save } = setup('suhas', jest.fn().mockRejectedValue(refusal));
    fireEvent.change(input, { target: { value: 'pathak' } });
    fireEvent.click(save);
    expect(await screen.findByTestId('edit-notes-error')).toHaveTextContent('This payment has been deleted.');
    expect(save).toBeEnabled();
});
