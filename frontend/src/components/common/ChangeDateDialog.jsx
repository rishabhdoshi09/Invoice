import React, { useEffect, useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, TextField, Typography, Alert
} from '@mui/material';
import moment from 'moment';

/**
 * Change the date of a ledger entry (payment, receipt or purchase).
 *
 *   <ChangeDateDialog
 *     open={...}
 *     entry={{ label: 'Payment PAY-ED3BD99E', date: '04/09/2026' }}  // date as shown in the ledger
 *     onClose={...}
 *     onSave={async (isoDate) => { ... }}   // throw to show the server's message here
 *   />
 *
 * The server moves the entry together with its accounting entries and keeps
 * an audit record; this dialog only collects the new date.
 */
// Indian financial year (1 April – 31 March), e.g. '2026-09-04' -> 'FY 2026-27'.
const financialYear = (iso) => {
    const m = moment(iso, 'YYYY-MM-DD', true);
    if (!m.isValid()) return null;
    const start = m.month() >= 3 ? m.year() : m.year() - 1;
    return `FY ${start}-${String((start + 1) % 100).padStart(2, '0')}`;
};

export const ChangeDateDialog = ({ open, entry, onClose, onSave }) => {
    const [value, setValue] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const today = moment().format('YYYY-MM-DD');
    const shown = entry && entry.date ? moment(entry.date, 'DD/MM/YYYY', true) : null;
    const originalIso = shown && shown.isValid() ? shown.format('YYYY-MM-DD') : '';

    useEffect(() => {
        if (open) { setValue(originalIso); setError(''); setSaving(false); }
    }, [open, originalIso]);

    const invalid = !value || value > today;
    const canSave = !saving && !invalid && value !== originalIso;
    const fromFy = financialYear(originalIso);
    const toFy = financialYear(value);
    const crossesYear = Boolean(fromFy && toFy && fromFy !== toFy);

    const handleSave = async () => {
        if (!canSave) return;
        setSaving(true);
        setError('');
        try {
            await onSave(value);
        } catch (e) {
            setError(e?.response?.data?.message || e?.message || 'Could not change the date.');
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth data-testid="change-date-dialog">
            <DialogTitle sx={{ pb: 1 }}>Change date</DialogTitle>
            <DialogContent>
                <Typography variant="body2" sx={{ mb: 2, fontWeight: 600 }}>{entry?.label}</Typography>
                <TextField
                    type="date"
                    label="New date"
                    fullWidth
                    autoFocus
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                    inputProps={{ max: today, 'data-testid': 'change-date-input' }}
                    InputLabelProps={{ shrink: true }}
                    error={Boolean(value) && value > today}
                    helperText={value && value > today ? 'The date cannot be in the future.' : ' '}
                />
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                    Moves this entry, and its accounting entries, to the new date. The amount does not change.
                    The change is kept in the audit log.
                </Typography>
                {crossesYear && !invalid && (
                    <Alert severity="warning" sx={{ mt: 2 }} data-testid="change-date-fy-warning">
                        This moves the entry from {fromFy} to {toFy}. Figures already given to your accountant
                        for either year will change.
                    </Alert>
                )}
                {error && <Alert severity="error" sx={{ mt: 2 }} data-testid="change-date-error">{error}</Alert>}
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose} disabled={saving}>Cancel</Button>
                <Button variant="contained" onClick={handleSave} disabled={!canSave} data-testid="change-date-save">
                    {saving ? 'Saving…' : 'Save'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default ChangeDateDialog;
