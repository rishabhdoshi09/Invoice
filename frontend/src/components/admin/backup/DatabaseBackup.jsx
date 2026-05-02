import { useRef, useState, useEffect } from 'react';
import {
    Box, Button, Card, CardContent, Typography, Alert,
    CircularProgress, Divider, List, ListItem, ListItemIcon,
    ListItemText, Dialog, DialogTitle, DialogContent,
    DialogContentText, DialogActions, LinearProgress, Chip,
    MenuItem, Select, FormControl, InputLabel, IconButton, Tooltip
} from '@mui/material';
import {
    CloudDownload, CloudUpload, CheckCircle, Info, Warning,
    UsbOutlined, RefreshOutlined, SaveAlt, Send
} from '@mui/icons-material';

export const DatabaseBackup = () => {
    const [dlLoading, setDlLoading] = useState(false);
    const [dlStatus, setDlStatus] = useState(null);

    const [restoreFile, setRestoreFile]       = useState(null);
    const [confirmOpen, setConfirmOpen]       = useState(false);
    const [restoreLoading, setRestoreLoading] = useState(false);
    const [restoreStatus, setRestoreStatus]   = useState(null);
    const fileInputRef = useRef();

    // ── USB state ──────────────────────────────────────────────────────────
    const [tgLoading, setTgLoading] = useState(false);
    const [tgStatus, setTgStatus]   = useState(null);

    const [drives, setDrives]         = useState([]);
    const [drivesLoading, setDrivesLoading] = useState(false);
    const [selectedDrive, setSelectedDrive] = useState('');
    const [usbLoading, setUsbLoading] = useState(false);
    const [usbStatus, setUsbStatus]   = useState(null);

    const loadDrives = async () => {
        setDrivesLoading(true);
        setUsbStatus(null);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/backup/usb-drives', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            setDrives(data.drives || []);
            if ((data.drives || []).length > 0) setSelectedDrive(data.drives[0].path);
            else setSelectedDrive('');
        } catch {
            setDrives([]);
        } finally {
            setDrivesLoading(false);
        }
    };

    useEffect(() => { loadDrives(); }, []);

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
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click(); a.remove();
            URL.revokeObjectURL(url);
            setDlStatus({ type: 'success', message: `Backup downloaded: ${filename}` });
        } catch (err) {
            setDlStatus({ type: 'error', message: err.message || 'Backup failed. Check server logs.' });
        } finally {
            setDlLoading(false);
        }
    };

    // ── Send to Telegram ───────────────────────────────────────────────────
    const handleSendTelegram = async () => {
        setTgLoading(true);
        setTgStatus(null);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/audit/telegram/backup', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || `Server error: ${res.status}`);
            setTgStatus({ type: 'success', message: 'Backup sent to Telegram successfully.' });
        } catch (err) {
            setTgStatus({ type: 'error', message: err.message || 'Failed to send to Telegram.' });
        } finally {
            setTgLoading(false);
        }
    };

    // ── USB Save ───────────────────────────────────────────────────────────
    const handleUsbSave = async () => {
        if (!selectedDrive) return;
        setUsbLoading(true);
        setUsbStatus(null);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch('/api/backup/save-to-usb', {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ drivePath: selectedDrive })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.message || `Server error: ${res.status}`);
            setUsbStatus({ type: 'success', message: `Saved to USB: ${data.filename}` });
        } catch (err) {
            setUsbStatus({ type: 'error', message: err.message || 'USB backup failed.' });
        } finally {
            setUsbLoading(false);
        }
    };

    // ── Restore ────────────────────────────────────────────────────────────
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setRestoreFile(file);
        setRestoreStatus(null);
        setConfirmOpen(true);
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
            if (!response.ok) throw new Error(data.message || `Server error: ${response.status}`);
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
                Download a full backup, save directly to a USB drive, or restore from a previous backup.
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
                        <code style={{ fontSize: 12 }}>gunzip -c backup.sql.gz | psql -U $DB_USER $DATABASE_NAME</code>
                    </Typography>
                </CardContent>
            </Card>

            <Divider sx={{ mb: 3 }} />

            {/* Download */}
            {dlStatus && (
                <Alert severity={dlStatus.type} sx={{ mb: 2 }} onClose={() => setDlStatus(null)}>
                    {dlStatus.message}
                </Alert>
            )}
            <Button
                variant="contained" size="large" fullWidth sx={{ mb: 2 }}
                startIcon={dlLoading ? <CircularProgress size={18} color="inherit" /> : <CloudDownload />}
                onClick={handleDownload} disabled={dlLoading}
            >
                {dlLoading ? 'Preparing backup…' : 'Download to Computer'}
            </Button>

            {/* Send to Telegram */}
            {tgStatus && (
                <Alert severity={tgStatus.type} sx={{ mb: 2 }} onClose={() => setTgStatus(null)}>
                    {tgStatus.message}
                </Alert>
            )}
            <Button
                variant="outlined" size="large" fullWidth sx={{ mb: 3 }}
                startIcon={tgLoading ? <CircularProgress size={18} color="inherit" /> : <Send />}
                onClick={handleSendTelegram} disabled={tgLoading}
            >
                {tgLoading ? 'Sending to Telegram…' : 'Send Backup to Telegram'}
            </Button>

            {/* USB Save */}
            <Card variant="outlined" sx={{ mb: 3, p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                    <UsbOutlined color="action" />
                    <Typography variant="subtitle2" fontWeight={600}>Save Directly to USB Drive</Typography>
                    <Tooltip title="Refresh drive list">
                        <IconButton size="small" onClick={loadDrives} disabled={drivesLoading}>
                            <RefreshOutlined fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Box>

                {usbStatus && (
                    <Alert severity={usbStatus.type} sx={{ mb: 1.5 }} onClose={() => setUsbStatus(null)}>
                        {usbStatus.message}
                    </Alert>
                )}

                {drives.length === 0 ? (
                    <Typography variant="body2" color="text.secondary">
                        {drivesLoading ? 'Scanning for USB drives…' : 'No USB drive detected. Connect a drive and click refresh.'}
                    </Typography>
                ) : (
                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                        <FormControl size="small" fullWidth>
                            <InputLabel>Select Drive</InputLabel>
                            <Select
                                value={selectedDrive}
                                label="Select Drive"
                                onChange={e => setSelectedDrive(e.target.value)}
                            >
                                {drives.map(d => (
                                    <MenuItem key={d.path} value={d.path}>
                                        {d.name} &nbsp;<Typography variant="caption" color="text.secondary">({d.path})</Typography>
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <Button
                            variant="contained" color="success"
                            startIcon={usbLoading ? <CircularProgress size={16} color="inherit" /> : <SaveAlt />}
                            onClick={handleUsbSave}
                            disabled={usbLoading || !selectedDrive}
                            sx={{ whiteSpace: 'nowrap', minWidth: 120 }}
                        >
                            {usbLoading ? 'Saving…' : 'Save to USB'}
                        </Button>
                    </Box>
                )}
            </Card>

            <Divider sx={{ mb: 3 }}>
                <Chip label="OR RESTORE" size="small" />
            </Divider>

            {/* Restore */}
            {restoreStatus && (
                <Alert severity={restoreStatus.type} sx={{ mb: 2 }} onClose={() => setRestoreStatus(null)}>
                    {restoreStatus.message}
                </Alert>
            )}
            {restoreLoading && (
                <Box sx={{ mb: 2 }}>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                        Restoring database… this may take a minute.
                    </Typography>
                    <LinearProgress />
                </Box>
            )}
            <input
                ref={fileInputRef} type="file"
                accept=".sql.gz,application/gzip"
                style={{ display: 'none' }} onChange={handleFileChange}
            />
            <Button
                variant="outlined" size="large" color="warning" fullWidth
                startIcon={<CloudUpload />}
                onClick={() => fileInputRef.current.click()}
                disabled={restoreLoading}
            >
                Restore from Backup File
            </Button>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'center' }}>
                Only .sql.gz files exported from this system are supported
            </Typography>

            {/* Confirm dialog */}
            <Dialog open={confirmOpen} onClose={() => { setConfirmOpen(false); setRestoreFile(null); }}>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Warning color="warning" /> Confirm Database Restore
                </DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        You are about to restore from:<br />
                        <strong>{restoreFile?.name}</strong>
                        <br /><br />
                        This will <strong>overwrite existing data</strong> in the database.
                        This action cannot be undone.
                    </DialogContentText>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => { setConfirmOpen(false); setRestoreFile(null); }}>Cancel</Button>
                    <Button onClick={handleRestoreConfirm} color="warning" variant="contained">Yes, Restore</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
