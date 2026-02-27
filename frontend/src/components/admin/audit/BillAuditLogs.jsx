import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Card, CardContent, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Paper, Chip, TextField, MenuItem, Select, FormControl,
    InputLabel, Grid, IconButton, Tooltip, Dialog, DialogTitle, DialogContent,
    DialogActions, Button, Alert, Tabs, Tab
} from '@mui/material';
import { Visibility, Warning, Delete, RemoveCircle, HighlightOff, Refresh, Scale, FitnessCenter } from '@mui/icons-material';
import axios from 'axios';
import moment from 'moment';

const EVENT_LABELS = {
    'ITEM_REMOVED': { label: 'Item Removed', color: 'warning', icon: <RemoveCircle fontSize="small" /> },
    'BILL_CLEARED': { label: 'Bill Cleared', color: 'error', icon: <HighlightOff fontSize="small" /> },
    'BILL_DELETED': { label: 'Bill Deleted', color: 'error', icon: <Delete fontSize="small" /> }
};

export const BillAuditLogs = () => {
    const [activeTab, setActiveTab] = useState(0);
    return (
        <Box data-testid="bill-audit-logs" sx={{ maxWidth: 1200, mx: 'auto' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 1 }}>
                <Box>
                    <Typography variant="h5" fontWeight={700}>Bill Audit Trail</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Track deletions, weight fetches, and suspicious activity
                    </Typography>
                </Box>
            </Box>
            <Tabs value={activeTab} onChange={(_, v) => setActiveTab(v)} sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
                <Tab label="Item Deletions" icon={<Delete fontSize="small" />} iconPosition="start" />
                <Tab label="Weight Fetches" icon={<FitnessCenter fontSize="small" />} iconPosition="start" />
            </Tabs>
            {activeTab === 0 && <DeletionLogs />}
            {activeTab === 1 && <WeightLogs />}
        </Box>
    );
};

const DeletionLogs = () => {
    const [logs, setLogs] = useState([]);
    const [summary, setSummary] = useState({});
    const [count, setCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        eventType: '',
        startDate: moment().format('YYYY-MM-DD'),
        endDate: moment().format('YYYY-MM-DD')
    });
    const [detailDialog, setDetailDialog] = useState({ open: false, log: null });

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const params = new URLSearchParams({ limit: '200' });
            if (filters.eventType) params.append('eventType', filters.eventType);
            if (filters.startDate) params.append('startDate', filters.startDate);
            if (filters.endDate) params.append('endDate', filters.endDate);

            const res = await axios.get(`/api/audit/tampering-logs?${params}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data?.data) {
                setLogs(res.data.data.rows || []);
                setSummary(res.data.data.summary || {});
                setCount(res.data.data.count || 0);
            }
        } catch (err) {
            console.error('Failed to fetch audit logs:', err);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    const formatCurrency = (val) => {
        const num = Number(val) || 0;
        return `₹${num.toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;
    };

    return (
        <Box data-testid="bill-audit-logs" sx={{ maxWidth: 1200, mx: 'auto' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
                <Box>
                    <Typography variant="h5" fontWeight={700}>Bill Audit Trail</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Track all item deletions, bill clears, and bill deletions
                    </Typography>
                </Box>
                <Tooltip title="Refresh">
                    <IconButton onClick={fetchLogs} data-testid="refresh-audit-logs">
                        <Refresh />
                    </IconButton>
                </Tooltip>
            </Box>

            {/* Summary Cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={3}>
                    <Card sx={{ bgcolor: '#fff3e0', borderLeft: '4px solid #ff9800' }}>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption" color="text.secondary">Today's Item Removals</Typography>
                            <Typography variant="h4" fontWeight={700} color="#e65100">
                                {summary.todayItemRemovals || 0}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Card sx={{ bgcolor: '#fce4ec', borderLeft: '4px solid #f44336' }}>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption" color="text.secondary">Today's Bill Clears</Typography>
                            <Typography variant="h4" fontWeight={700} color="#c62828">
                                {summary.todayBillClears || 0}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Card sx={{ bgcolor: '#ffebee', borderLeft: '4px solid #d32f2f' }}>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption" color="text.secondary">Today's Bill Deletes</Typography>
                            <Typography variant="h4" fontWeight={700} color="#b71c1c">
                                {summary.todayBillDeletes || 0}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Card sx={{ bgcolor: '#e3f2fd', borderLeft: '4px solid #1976d2' }}>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption" color="text.secondary">Today's Deleted Value</Typography>
                            <Typography variant="h4" fontWeight={700} color="#0d47a1">
                                {formatCurrency(summary.todayTotalValue)}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Filters */}
            <Card sx={{ mb: 2 }}>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} sm={3}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Event Type</InputLabel>
                                <Select
                                    value={filters.eventType}
                                    label="Event Type"
                                    onChange={(e) => setFilters(f => ({ ...f, eventType: e.target.value }))}
                                    data-testid="filter-event-type"
                                >
                                    <MenuItem value="">All</MenuItem>
                                    <MenuItem value="ITEM_REMOVED">Item Removed</MenuItem>
                                    <MenuItem value="BILL_CLEARED">Bill Cleared</MenuItem>
                                    <MenuItem value="BILL_DELETED">Bill Deleted</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                            <TextField
                                label="From"
                                type="date"
                                size="small"
                                fullWidth
                                value={filters.startDate}
                                onChange={(e) => setFilters(f => ({ ...f, startDate: e.target.value }))}
                                InputLabelProps={{ shrink: true }}
                                data-testid="filter-start-date"
                            />
                        </Grid>
                        <Grid item xs={6} sm={3}>
                            <TextField
                                label="To"
                                type="date"
                                size="small"
                                fullWidth
                                value={filters.endDate}
                                onChange={(e) => setFilters(f => ({ ...f, endDate: e.target.value }))}
                                InputLabelProps={{ shrink: true }}
                                data-testid="filter-end-date"
                            />
                        </Grid>
                        <Grid item xs={12} sm={3}>
                            <Typography variant="body2" color="text.secondary">
                                {count} record{count !== 1 ? 's' : ''} found
                            </Typography>
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>

            {/* Alert for suspicious activity */}
            {(summary.todayItemRemovals > 5 || summary.todayBillDeletes > 0) && (
                <Alert severity="warning" sx={{ mb: 2 }} icon={<Warning />} data-testid="suspicious-alert">
                    <strong>Suspicious activity detected!</strong> — {summary.todayItemRemovals} item removal{summary.todayItemRemovals !== 1 ? 's' : ''} and {summary.todayBillDeletes} bill deletion{summary.todayBillDeletes !== 1 ? 's' : ''} today. Total value: {formatCurrency(summary.todayTotalValue)}
                </Alert>
            )}

            {/* Logs Table */}
            <TableContainer component={Paper} sx={{ maxHeight: 600 }}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 700, bgcolor: '#f5f5f5' }}>Time</TableCell>
                            <TableCell sx={{ fontWeight: 700, bgcolor: '#f5f5f5' }}>Event</TableCell>
                            <TableCell sx={{ fontWeight: 700, bgcolor: '#f5f5f5' }}>Product</TableCell>
                            <TableCell sx={{ fontWeight: 700, bgcolor: '#f5f5f5' }} align="right">Qty</TableCell>
                            <TableCell sx={{ fontWeight: 700, bgcolor: '#f5f5f5' }} align="right">Price</TableCell>
                            <TableCell sx={{ fontWeight: 700, bgcolor: '#f5f5f5' }} align="right">Value</TableCell>
                            <TableCell sx={{ fontWeight: 700, bgcolor: '#f5f5f5' }}>Invoice Context</TableCell>
                            <TableCell sx={{ fontWeight: 700, bgcolor: '#f5f5f5' }}>By</TableCell>
                            <TableCell sx={{ fontWeight: 700, bgcolor: '#f5f5f5' }} align="center">Details</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4 }}>Loading...</TableCell></TableRow>
                        ) : logs.length === 0 ? (
                            <TableRow><TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.secondary' }}>No audit events found for this date range</TableCell></TableRow>
                        ) : (
                            logs.map((log) => {
                                const evt = EVENT_LABELS[log.eventType] || { label: log.eventType, color: 'default' };
                                return (
                                    <TableRow key={log.id} hover sx={{
                                        bgcolor: log.eventType === 'BILL_DELETED' ? '#ffebee' : 
                                                 log.eventType === 'BILL_CLEARED' ? '#fff8e1' : 'inherit'
                                    }}>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight={500}>
                                                {moment(log.createdAt).format('hh:mm:ss A')}
                                            </Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {moment(log.createdAt).format('DD/MM/YY')}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                icon={evt.icon}
                                                label={evt.label}
                                                color={evt.color}
                                                size="small"
                                                variant="outlined"
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight={600}>{log.productName}</Typography>
                                            {log.customerName && (
                                                <Typography variant="caption" color="text.secondary">
                                                    Customer: {log.customerName}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell align="right">{Number(log.quantity) || '-'}</TableCell>
                                        <TableCell align="right">{log.price ? formatCurrency(log.price) : '-'}</TableCell>
                                        <TableCell align="right">
                                            <Typography fontWeight={700} color="error.main">
                                                {formatCurrency(log.totalPrice)}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                                {log.invoiceContext || '-'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>{log.userName}</TableCell>
                                        <TableCell align="center">
                                            <Tooltip title="View bill snapshot">
                                                <IconButton
                                                    size="small"
                                                    onClick={() => setDetailDialog({ open: true, log })}
                                                    data-testid={`view-detail-${log.id}`}
                                                >
                                                    <Visibility fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Detail Dialog */}
            <Dialog open={detailDialog.open} onClose={() => setDetailDialog({ open: false, log: null })} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ fontWeight: 700 }}>
                    Audit Event Details
                </DialogTitle>
                <DialogContent dividers>
                    {detailDialog.log && (
                        <Box>
                            <Grid container spacing={1} sx={{ mb: 2 }}>
                                <Grid item xs={6}>
                                    <Typography variant="caption" color="text.secondary">Event</Typography>
                                    <Typography fontWeight={600}>{EVENT_LABELS[detailDialog.log.eventType]?.label}</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="caption" color="text.secondary">Time</Typography>
                                    <Typography fontWeight={600}>{moment(detailDialog.log.createdAt).format('DD/MM/YYYY hh:mm:ss A')}</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="caption" color="text.secondary">By</Typography>
                                    <Typography fontWeight={600}>{detailDialog.log.userName}</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="caption" color="text.secondary">Invoice Context</Typography>
                                    <Typography fontWeight={600} sx={{ fontFamily: 'monospace' }}>{detailDialog.log.invoiceContext || '-'}</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="caption" color="text.secondary">Deleted Product</Typography>
                                    <Typography fontWeight={600} color="error.main">{detailDialog.log.productName}</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="caption" color="text.secondary">Deleted Value</Typography>
                                    <Typography fontWeight={700} color="error.main">{formatCurrency(detailDialog.log.totalPrice)}</Typography>
                                </Grid>
                                {detailDialog.log.customerName && (
                                    <Grid item xs={12}>
                                        <Typography variant="caption" color="text.secondary">Customer on Bill</Typography>
                                        <Typography fontWeight={600}>{detailDialog.log.customerName}</Typography>
                                    </Grid>
                                )}
                            </Grid>

                            {detailDialog.log.billSnapshot && detailDialog.log.billSnapshot.length > 0 && (
                                <>
                                    <Typography variant="subtitle2" sx={{ mt: 2, mb: 1 }}>
                                        Remaining items on bill after deletion:
                                    </Typography>
                                    <TableContainer component={Paper} variant="outlined">
                                        <Table size="small">
                                            <TableHead>
                                                <TableRow>
                                                    <TableCell sx={{ fontWeight: 700 }}>Product</TableCell>
                                                    <TableCell align="right" sx={{ fontWeight: 700 }}>Qty</TableCell>
                                                    <TableCell align="right" sx={{ fontWeight: 700 }}>Total</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {detailDialog.log.billSnapshot.map((item, i) => (
                                                    <TableRow key={i}>
                                                        <TableCell>{item.name}</TableCell>
                                                        <TableCell align="right">{item.qty}</TableCell>
                                                        <TableCell align="right">{formatCurrency(item.total)}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                    <Typography variant="body2" sx={{ mt: 1, textAlign: 'right' }}>
                                        Bill total after deletion: <strong>{formatCurrency(detailDialog.log.billTotal)}</strong>
                                    </Typography>
                                </>
                            )}

                            {(!detailDialog.log.billSnapshot || detailDialog.log.billSnapshot.length === 0) && (
                                <Alert severity="error" sx={{ mt: 2 }}>
                                    Bill was completely empty after this deletion — all items were removed.
                                </Alert>
                            )}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDetailDialog({ open: false, log: null })}>Close</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

const WeightLogs = () => {
    const [logs, setLogs] = useState([]);
    const [summary, setSummary] = useState({});
    const [count, setCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({
        consumed: '',
        startDate: moment().format('YYYY-MM-DD'),
        endDate: moment().format('YYYY-MM-DD')
    });

    const fetchLogs = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const params = new URLSearchParams({ limit: '200' });
            if (filters.consumed !== '') params.append('consumed', filters.consumed);
            if (filters.startDate) params.append('startDate', filters.startDate);
            if (filters.endDate) params.append('endDate', filters.endDate);

            const res = await axios.get(`/api/audit/weight-logs?${params}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.data?.data) {
                setLogs(res.data.data.rows || []);
                setSummary(res.data.data.summary || {});
                setCount(res.data.data.count || 0);
            }
        } catch (err) {
            console.error('Failed to fetch weight logs:', err);
        } finally {
            setLoading(false);
        }
    }, [filters]);

    useEffect(() => { fetchLogs(); }, [fetchLogs]);

    return (
        <Box>
            {/* Summary Cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={3}>
                    <Card sx={{ bgcolor: '#e8f5e9', borderLeft: '4px solid #4caf50' }}>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption" color="text.secondary">Today's Weight Fetches</Typography>
                            <Typography variant="h4" fontWeight={700} color="#2e7d32">
                                {summary.todayTotalFetches || 0}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Card sx={{ bgcolor: '#e3f2fd', borderLeft: '4px solid #1976d2' }}>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption" color="text.secondary">Added to Bill</Typography>
                            <Typography variant="h4" fontWeight={700} color="#0d47a1">
                                {summary.todayConsumed || 0}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Card sx={{ bgcolor: (summary.todayUnmatched > 0) ? '#ffebee' : '#f5f5f5', borderLeft: `4px solid ${(summary.todayUnmatched > 0) ? '#f44336' : '#9e9e9e'}` }}>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption" color="text.secondary">NOT Added to Bill</Typography>
                            <Typography variant="h4" fontWeight={700} color={(summary.todayUnmatched > 0) ? '#c62828' : 'text.secondary'}>
                                {summary.todayUnmatched || 0}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Card sx={{ bgcolor: (summary.todayUnmatched > 0) ? '#fff3e0' : '#f5f5f5', borderLeft: `4px solid ${(summary.todayUnmatched > 0) ? '#ff9800' : '#9e9e9e'}` }}>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption" color="text.secondary">Unmatched Weight (kg)</Typography>
                            <Typography variant="h4" fontWeight={700} color={(summary.todayUnmatchedWeight > 0) ? '#e65100' : 'text.secondary'}>
                                {(summary.todayUnmatchedWeight || 0).toFixed(2)}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {summary.todayUnmatched > 0 && (
                <Alert severity="warning" sx={{ mb: 2 }} icon={<Warning />} data-testid="weight-alert">
                    <strong>{summary.todayUnmatched} weight reading{summary.todayUnmatched !== 1 ? 's' : ''} fetched but never added to a bill!</strong> — Total unmatched: {(summary.todayUnmatchedWeight || 0).toFixed(2)} kg
                </Alert>
            )}

            {/* Filters */}
            <Card sx={{ mb: 2 }}>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} sm={3}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Status</InputLabel>
                                <Select
                                    value={filters.consumed}
                                    label="Status"
                                    onChange={(e) => setFilters(f => ({ ...f, consumed: e.target.value }))}
                                >
                                    <MenuItem value="">All</MenuItem>
                                    <MenuItem value="false">Unmatched Only</MenuItem>
                                    <MenuItem value="true">Added to Bill</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                            <TextField label="From" type="date" size="small" fullWidth value={filters.startDate}
                                onChange={(e) => setFilters(f => ({ ...f, startDate: e.target.value }))} InputLabelProps={{ shrink: true }} />
                        </Grid>
                        <Grid item xs={6} sm={3}>
                            <TextField label="To" type="date" size="small" fullWidth value={filters.endDate}
                                onChange={(e) => setFilters(f => ({ ...f, endDate: e.target.value }))} InputLabelProps={{ shrink: true }} />
                        </Grid>
                        <Grid item xs={12} sm={3}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="body2" color="text.secondary">{count} record{count !== 1 ? 's' : ''}</Typography>
                                <IconButton size="small" onClick={fetchLogs}><Refresh fontSize="small" /></IconButton>
                            </Box>
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>

            {/* Table */}
            <TableContainer component={Paper} sx={{ maxHeight: 500 }}>
                <Table stickyHeader size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 700, bgcolor: '#f5f5f5' }}>Time</TableCell>
                            <TableCell sx={{ fontWeight: 700, bgcolor: '#f5f5f5' }} align="right">Weight (kg)</TableCell>
                            <TableCell sx={{ fontWeight: 700, bgcolor: '#f5f5f5' }}>Status</TableCell>
                            <TableCell sx={{ fontWeight: 700, bgcolor: '#f5f5f5' }}>Linked Invoice</TableCell>
                            <TableCell sx={{ fontWeight: 700, bgcolor: '#f5f5f5' }}>Fetched By</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading ? (
                            <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4 }}>Loading...</TableCell></TableRow>
                        ) : logs.length === 0 ? (
                            <TableRow><TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>No weight logs found</TableCell></TableRow>
                        ) : (
                            logs.map((log) => (
                                <TableRow key={log.id} hover sx={{ bgcolor: !log.consumed ? '#fff8e1' : 'inherit' }}>
                                    <TableCell>
                                        <Typography variant="body2" fontWeight={500}>{moment(log.createdAt).format('hh:mm:ss A')}</Typography>
                                        <Typography variant="caption" color="text.secondary">{moment(log.createdAt).format('DD/MM/YY')}</Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Typography fontWeight={700} fontSize="1.1rem">{Number(log.weight).toFixed(3)}</Typography>
                                    </TableCell>
                                    <TableCell>
                                        {log.consumed ? (
                                            <Chip label="Added to Bill" color="success" size="small" variant="outlined" />
                                        ) : (
                                            <Chip label="NOT in any Bill" color="error" size="small" variant="filled" />
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {log.orderNumber ? (
                                            <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>{log.orderNumber}</Typography>
                                        ) : (
                                            <Typography variant="body2" color="error.main" fontWeight={600}>--</Typography>
                                        )}
                                    </TableCell>
                                    <TableCell>{log.userName || '-'}</TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
};

export default BillAuditLogs;
