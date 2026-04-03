import { useRef, useState } from 'react';
import {
    Box, Button, Card, CardContent, Typography, Alert,
    CircularProgress, Divider, List, ListItem, ListItemIcon,
    ListItemText, Dialog, DialogTitle, DialogContent,
    DialogContentText, DialogActions, LinearProgress, Chip
} from '@mui/material';
import {
    CloudDownload, CloudUpload, CheckCircle, Info, Warning
} from '@mui/icons-material';

export const DatabaseBackup = () => {
    const [dlLoading, setDlLoading] = useState(false);
    const [dlStatus, setDlStatus] = useState(null);

    const [restoreFile, setRestoreFile]     = useState(null);
    const [confirmOpen, setConfirmOpen]     = useState(false);
    const [restoreLoading, setRestoreLoading] = useState(false);
    const [restoreStatus, setRestoreStatus] = useState(null);
    const fileInputRef = useRef();

    // ── Download ───────────────────────────────────────────────────────────
    const handleDownload = async () => {
        setDlLoading(true);
        setDlStatus(null);
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/backup/download', {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.message || `Server error: ${response.status}`);
            }

            const disposition = response.headers.get('Content-Disposition') || '';
            const match = disposition.match(/filename="([^"]+)"/);
            const filename = match ? match[1] : 'database_backup.sql.gz';

            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);

            setDlStatus({ type: 'success', message: `Backup downloaded: ${filename}` });
        } catch (err) {
            setDlStatus({ type: 'error', message: err.message || 'Backup failed. Check server logs.' });
        } finally {
            setDlLoading(false);
        }
    };

    // ── Restore ────────────────────────────────────────────────────────────
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setRestoreFile(file);
        setRestoreStatus(null);
        setConfirmOpen(true);
        // Reset input so same file can be re-selected
        e.target.value = '';
    };

    const handleRestoreConfirm = async () => {
        setConfirmOpen(false);
        setRestoreLoading(true);
        setRestoreStatus(null);

        try {
            const token = localStorage.getItem('token');
            const form = new FormData();
            form.append('backup', restoreFile);

            const response = await fetch('/api/backup/restore', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` },
                body: form
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.message || `Server error: ${response.status}`);
            }
            setRestoreStatus({ type: 'success', message: 'Database restored successfully. Reload the page to see updated data.' });
        } catch (err) {
            setRestoreStatus({ type: 'error', message: err.message || 'Restore failed. Check server logs.' });
        } finally {
            setRestoreLoading(false);
            setRestoreFile(null);
        }
    };

    return (
        <Box sx={{ maxWidth: 600, mx: 'auto', mt: 4, px: 2 }}>
            <Typography variant="h5" fontWeight={700} gutterBottom>
                Database Backup &amp; Restore
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Download a full backup or restore from a previously downloaded <code>.sql.gz</code> file.
            </Typography>

            {/* What's included */}
            <Card variant="outlined" sx={{ mb: 3 }}>
                <CardContent>
                    <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                        What's included in a backup
                    </Typography>
                    <List dense disablePadding>
                        {[
                            'All orders, invoices and line items',
                            'Customers, suppliers and contacts',
                            'Payments and ledger entries',
                            'Products, stock and transactions',
                            'Users and audit logs',
                            'GST records and daily summaries',
                        ].map(item => (
                            <ListItem key={item} disableGutters sx={{ py: 0.25 }}>
                                <ListItemIcon sx={{ minWidth: 28 }}>
                                    <CheckCircle fontSize="small" color="success" />
                                </ListItemIcon>
                                <ListItemText primary={item} primaryTypographyProps={{ variant: 'body2' }} />
                            </ListItem>
                        ))}
                    </List>
                </CardContent>
            </Card>

            {/* Info */}
            <Card variant="outlined" sx={{ mb: 3, borderColor: 'info.200' }}>
                <CardContent sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', py: '12px !important' }}>
                    <Info fontSize="small" color="info" sx={{ mt: 0.25 }} />
                    <Typography variant="body2" color="text.secondary">
                        Backup format is <strong>.sql.gz</strong>. To restore manually via terminal:<br />
                        <code style={{ fontSize: 12 }}>
                            gunzip -c backup.sql.gz | psql -U $DB_USER $DATABASE_NAME
                        </code>
                    </Typography>
                </CardContent>
            </Card>

            <Divider sx={{ mb: 3 }} />

            {/* Download status */}
            {dlStatus && (
                <Alert severity={dlStatus.type} sx={{ mb: 2 }} onClose={() => setDlStatus(null)}>
                    {dlStatus.message}
                </Alert>
            )}

            {/* Download button */}
            <Button
                variant="contained"
                size="large"
                startIcon={dlLoading ? <CircularProgress size={18} color="inherit" /> : <CloudDownload />}
                onClick={handleDownload}
                disabled={dlLoading}
                fullWidth
                sx={{ mb: 2 }}
            >
                {dlLoading ? 'Preparing backup…' : 'Download Database Backup'}
            </Button>

            <Divider sx={{ mb: 3 }}>
                <Chip label="OR RESTORE" size="small" />
            </Divider>

            {/* Restore status */}
            {restoreStatus && (
                <Alert severity={restoreStatus.type} sx={{ mb: 2 }} onClose={() => setRestoreStatus(null)}>
                    {restoreStatus.message}
                </Alert>
            )}

            {/* Restore progress */}
            {restoreLoading && (
                <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                        Restoring database… this may take a minute.
                    </Typography>
                    <LinearProgress />
                </Box>
            )}

            {/* Restore button */}
            <input
                ref={fileInputRef}
                type="file"
                accept=".sql.gz,application/gzip"
                style={{ display: 'none' }}
                onChange={handleFileChange}
            />
            <Button
                variant="outlined"
                size="large"
                color="warning"
                startIcon={<CloudUpload />}
                onClick={() => fileInputRef.current.click()}
                disabled={restoreLoading}
                fullWidth
            >
                Restore from Backup File
            </Button>

            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
                Only .sql.gz files exported from this system are supported
            </Typography>

            {/* Confirm dialog */}
            <Dialog open={confirmOpen} onClose={() => { setConfirmOpen(false); setRestoreFile(null); }}>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Warning color="warning" />
                    Confirm Database Restore
                </DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        You are about to restore from:<br />
                        <strong>{restoreFile?.name}</strong>
                        <br /><br />
                        This will <strong>overwrite existing data</strong> in the database with the contents of the backup.
                        This action cannot be undone. Make sure you have a recent backup before proceeding.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => { setConfirmOpen(false); setRestoreFile(null); }}>
                        Cancel
                    </Button>
                    <Button onClick={handleRestoreConfirm} color="warning" variant="contained">
                        Yes, Restore
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
