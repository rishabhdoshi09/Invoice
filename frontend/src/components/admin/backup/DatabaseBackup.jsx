import { useState } from 'react';
import {
    Box, Button, Card, CardContent, Typography, Alert,
    CircularProgress, Divider, List, ListItem, ListItemIcon, ListItemText
} from '@mui/material';
import { CloudDownload, CheckCircle, Info } from '@mui/icons-material';

export const DatabaseBackup = () => {
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState(null); // { type: 'success'|'error', message }

    const handleDownload = async () => {
        setLoading(true);
        setStatus(null);
        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/backup/download', {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.message || `Server error: ${response.status}`);
            }

            // Extract filename from Content-Disposition header
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

            setStatus({ type: 'success', message: `Backup downloaded: ${filename}` });
        } catch (err) {
            setStatus({ type: 'error', message: err.message || 'Backup failed. Check server logs.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box sx={{ maxWidth: 600, mx: 'auto', mt: 4, px: 2 }}>
            <Typography variant="h5" fontWeight={700} gutterBottom>
                Database Backup
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Download a full compressed backup of your database. Store it in a safe location.
            </Typography>

            <Card variant="outlined" sx={{ mb: 3 }}>
                <CardContent>
                    <Typography variant="subtitle1" fontWeight={600} gutterBottom>
                        What's included
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

            <Card variant="outlined" sx={{ mb: 3, bgcolor: 'info.50', borderColor: 'info.200' }}>
                <CardContent sx={{ display: 'flex', gap: 1.5, alignItems: 'flex-start', py: '12px !important' }}>
                    <Info fontSize="small" color="info" sx={{ mt: 0.25 }} />
                    <Typography variant="body2" color="text.secondary">
                        The backup is a <strong>.sql.gz</strong> compressed file. To restore it, run:<br />
                        <code style={{ fontSize: 12 }}>
                            gunzip -c backup.sql.gz | psql -U $DB_USER $DATABASE_NAME
                        </code>
                    </Typography>
                </CardContent>
            </Card>

            <Divider sx={{ mb: 3 }} />

            {status && (
                <Alert severity={status.type} sx={{ mb: 2 }} onClose={() => setStatus(null)}>
                    {status.message}
                </Alert>
            )}

            <Button
                variant="contained"
                size="large"
                startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <CloudDownload />}
                onClick={handleDownload}
                disabled={loading}
                fullWidth
            >
                {loading ? 'Preparing backup…' : 'Download Database Backup'}
            </Button>
        </Box>
    );
};
