import React, { useEffect, useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, Typography, Alert
} from '@mui/material';

export const MAX_NOTES = 500;

/**
 * Edit the notes of a ledger entry (payment, receipt or purchase).
 *
 *   <EditNotesDialog
 *     open={...}
 *     entry={{ label: 'Payment PAY-ED3BD99E', notes: 'suhas' }}
 *     onClose={...}
 *     onSave={async (notes) => { ... }}   // '' clears; throw to show the server's message here
 *   />
 *
 * Enter saves; Shift+Enter starts a new line.
 */
export const EditNotesDialog = ({ open, entry, onClose, onSave }) => {
    const [value, setValue] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const original = (entry && entry.notes) || '';

    useEffect(() => {
        if (open) { setValue(original); setError(''); setSaving(false); }
    }, [open, original]);

    const text = value.trim();
    const tooLong = text.length > MAX_NOTES;
    const canSave = !saving && !tooLong && text !== original.trim();

    const handleSave = async () => {
        if (!canSave) return;
        setSaving(true);
        setError('');
        try {
            await onSave(text);
        } catch (e) {
            setError(e?.response?.data?.message || e?.message || 'Could not save the notes.');
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth data-testid="edit-notes-dialog">
            <DialogTitle sx={{ pb: 1 }}>Edit notes</DialogTitle>
            <DialogContent>
                <Typography variant="body2" sx={{ mb: 2, fontWeight: 600 }}>{entry?.label}</Typography>
                <TextField
                    label="Notes"
                    fullWidth
                    autoFocus
                    multiline
                    minRows={2}
                    maxRows={5}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave(); }
                    }}
                    inputProps={{ 'data-testid': 'edit-notes-input' }}
                    error={tooLong}
                    helperText={tooLong
                        ? `Notes can be at most ${MAX_NOTES} characters.`
                        : `${text.length}/${MAX_NOTES} · Enter to save, Shift+Enter for a new line`}
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>
                    Notes are shown in the ledger; changing them doesn't affect any amount.
                    Leave the box empty to remove them. The change is kept in the audit log.
                </Typography>
                {error && <Alert severity="error" sx={{ mt: 2 }} data-testid="edit-notes-error">{error}</Alert>}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={saving}>Cancel</Button>
                <Button variant="contained" onClick={handleSave} disabled={!canSave} data-testid="edit-notes-save">
                    {saving ? 'Saving…' : 'Save'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default EditNotesDialog;
