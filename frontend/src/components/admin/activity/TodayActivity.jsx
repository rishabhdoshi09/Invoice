import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Typography, Card, CardContent, Chip, TextField, IconButton,
    CircularProgress, Alert, Tooltip, Paper, Divider
} from '@mui/material';
import {
    Refresh, Receipt, Payment, PersonAdd, Business, ShoppingBag,
    Delete, CallMade, CallReceived, DeleteForever, PersonRemove,
    RemoveShoppingCart, MoneyOff, WarningAmber
} from '@mui/icons-material';
import axios from 'axios';
import moment from 'moment';

const fmt = v => `₹${Math.abs(Number(v) || 0).toLocaleString('en-IN')}`;
const token = () => localStorage.getItem('token');

const TYPE_CONFIG = {
    ORDER:       { label: 'Invoice',          icon: <Receipt fontSize="small" />,     color: '#1565c0', bg: '#e3f2fd' },
    PAYMENT_IN:  { label: 'Payment In',       icon: <CallReceived fontSize="small" />, color: '#2e7d32', bg: '#e8f5e9' },
    PAYMENT_OUT: { label: 'Payment Out',      icon: <CallMade fontSize="small" />,    color: '#e65100', bg: '#fff3e0' },
    CUSTOMER:    { label: 'New Customer',     icon: <PersonAdd fontSize="small" />,   color: '#6a1b9a', bg: '#f3e5f5' },
    SUPPLIER:    { label: 'New Supplier',     icon: <Business fontSize="small" />,    color: '#00695c', bg: '#e0f2f1' },
    PURCHASE:    { label: 'Purchase',         icon: <ShoppingBag fontSize="small" />, color: '#4527a0', bg: '#ede7f6' },
    PAYMENT:     { label: 'Payment',          icon: <Payment fontSize="small" />,     color: '#558b2f', bg: '#f1f8e9' },
};

const SummaryCard = ({ label, value, color, bg, icon }) => (
    <Card sx={{ borderLeft: `4px solid ${color}`, bgcolor: bg, flex: 1, minWidth: 140 }}>
        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                <Box sx={{ color }}>{icon}</Box>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
            </Box>
            <Typography variant="h6" fontWeight={700} color={color}>{value}</Typography>
        </CardContent>
    </Card>
);

export const TodayActivity = () => {
    const [date, setDate] = useState(moment().format('YYYY-MM-DD'));
    const [feed, setFeed] = useState([]);
    const [summary, setSummary] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [filter, setFilter] = useState('ALL');

    const fetchActivity = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await axios.get(`/api/activity/today?date=${date}`, {
                headers: { Authorization: `Bearer ${token()}` }
            });
            setFeed(res.data?.data?.feed || []);
            setSummary(res.data?.data?.summary || {});
        } catch (err) {
            setError(err?.response?.data?.message || 'Failed to load activity.');
        } finally {
            setLoading(false);
        }
    }, [date]);

    useEffect(() => { fetchActivity(); }, [fetchActivity]);

    const FILTERS = [
        { key: 'ALL', label: 'All' },
        { key: 'CREATE', label: 'Created' },
        { key: 'DELETE', label: 'Deleted' },
        { key: 'ORDER', label: 'Invoices' },
        { key: 'PAYMENT_IN', label: 'Payments In' },
        { key: 'PAYMENT_OUT', label: 'Payments Out' },
        { key: 'PURCHASE', label: 'Purchases' },
        { key: 'CUSTOMER', label: 'Customers' },
        { key: 'SUPPLIER', label: 'Suppliers' },
    ];

    const filtered = feed.filter(e => {
        if (filter === 'ALL') return true;
        if (filter === 'CREATE') return e.action === 'CREATE';
        if (filter === 'DELETE') return e.action === 'DELETE';
        return e.entityType === filter;
    });

    const isToday = date === moment().format('YYYY-MM-DD');

    return (
        <Box sx={{ maxWidth: 900, mx: 'auto', px: 2, py: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3, flexWrap: 'wrap', gap: 1 }}>
                <Box>
                    <Typography variant="h5" fontWeight={700}>
                        {isToday ? "Today's Activity" : `Activity — ${moment(date).format('DD MMM YYYY')}`}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        All entries created and deleted — invoices, payments, customers, suppliers, purchases
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    <TextField
                        type="date" size="small" value={date}
                        onChange={e => setDate(e.target.value)}
                        InputLabelProps={{ shrink: true }}
                        sx={{ width: 155 }}
                    />
                    <Tooltip title="Refresh">
                        <IconButton onClick={fetchActivity}><Refresh /></IconButton>
                    </Tooltip>
                </Box>
            </Box>

            {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

            {/* Summary Strip */}
            <Box sx={{ display: 'flex', gap: 1.5, mb: 3, flexWrap: 'wrap' }}>
                <SummaryCard label="Credit Sales" value={fmt(summary.totalSales)} color="#1565c0" bg="#e3f2fd" icon={<Receipt fontSize="small" />} />
                <SummaryCard label="Payments In" value={fmt(summary.paymentsIn)} color="#2e7d32" bg="#e8f5e9" icon={<CallReceived fontSize="small" />} />
                <SummaryCard label="Payments Out" value={fmt(summary.paymentsOut)} color="#e65100" bg="#fff3e0" icon={<CallMade fontSize="small" />} />
                <SummaryCard label="Purchases" value={fmt(summary.totalPurchases)} color="#4527a0" bg="#ede7f6" icon={<ShoppingBag fontSize="small" />} />
                <SummaryCard label="New Customers" value={summary.newCustomers || 0} color="#6a1b9a" bg="#f3e5f5" icon={<PersonAdd fontSize="small" />} />
                <SummaryCard label="New Suppliers" value={summary.newSuppliers || 0} color="#00695c" bg="#e0f2f1" icon={<Business fontSize="small" />} />
                {summary.deletions > 0 && (
                    <SummaryCard label="Deletions" value={summary.deletions} color="#c62828" bg="#ffebee" icon={<Delete fontSize="small" />} />
                )}
            </Box>

            {/* Filter chips */}
            <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                {FILTERS.map(f => (
                    <Chip
                        key={f.key}
                        label={f.label}
                        size="small"
                        onClick={() => setFilter(f.key)}
                        color={filter === f.key ? 'primary' : 'default'}
                        variant={filter === f.key ? 'filled' : 'outlined'}
                        sx={{ cursor: 'pointer' }}
                    />
                ))}
            </Box>

            {/* Activity Feed */}
            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}><CircularProgress /></Box>
            ) : filtered.length === 0 ? (
                <Alert severity="info">No activity found{filter !== 'ALL' ? ` for filter: ${filter}` : ''}.</Alert>
            ) : (
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {filtered.map((entry) => {
                        const cfg = TYPE_CONFIG[entry.entityType] || TYPE_CONFIG['PAYMENT'];
                        const isDelete = entry.action === 'DELETE';

                        if (isDelete) {
                            const ENTITY_LABEL = {
                                ORDER: 'Invoice', PAYMENT: 'Payment',
                                CUSTOMER: 'Customer', SUPPLIER: 'Supplier', PURCHASE: 'Purchase'
                            };
                            const ENTITY_ICON = {
                                ORDER: <Receipt sx={{ fontSize: 18 }} />,
                                PAYMENT: entry.partyType === 'customer'
                                    ? <CallReceived sx={{ fontSize: 18 }} />
                                    : <CallMade sx={{ fontSize: 18 }} />,
                                CUSTOMER: <PersonRemove sx={{ fontSize: 18 }} />,
                                SUPPLIER: <Business sx={{ fontSize: 18 }} />,
                                PURCHASE: <RemoveShoppingCart sx={{ fontSize: 18 }} />
                            };
                            return (
                                <Paper key={entry.id} variant="outlined" sx={{
                                    border: '1.5px solid #ef9a9a',
                                    bgcolor: '#fff5f5',
                                    borderRadius: 2,
                                    overflow: 'hidden'
                                }}>
                                    {/* Red header bar */}
                                    <Box sx={{
                                        bgcolor: '#c62828', color: '#fff',
                                        px: 2, py: 0.75,
                                        display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'space-between'
                                    }}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <DeleteForever sx={{ fontSize: 16 }} />
                                            <Typography variant="caption" fontWeight={700} sx={{ letterSpacing: 0.5, textTransform: 'uppercase' }}>
                                                {ENTITY_LABEL[entry.entityType] || entry.entityType} Deleted
                                            </Typography>
                                        </Box>
                                        <Typography variant="caption" sx={{ opacity: 0.85, fontFamily: 'monospace' }}>
                                            {moment(entry.time).format('HH:mm')}
                                        </Typography>
                                    </Box>

                                    {/* Body */}
                                    <Box sx={{ px: 2, py: 1.5, display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                                        {/* Icon */}
                                        <Box sx={{
                                            width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                                            bgcolor: '#ffebee', color: '#c62828',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', mt: 0.25
                                        }}>
                                            {ENTITY_ICON[entry.entityType] || <Delete sx={{ fontSize: 18 }} />}
                                        </Box>

                                        {/* Details */}
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            {/* Title row */}
                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.25 }}>
                                                <Typography variant="body2" fontWeight={700} sx={{ color: '#b71c1c', textDecoration: 'line-through' }}>
                                                    {entry.title}
                                                </Typography>
                                                {entry.subtitle && (
                                                    <Typography variant="body2" color="text.secondary">
                                                        — {entry.subtitle}
                                                    </Typography>
                                                )}
                                            </Box>

                                            {/* Meta row */}
                                            <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                                                {entry.date && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        Date: {entry.date}
                                                    </Typography>
                                                )}
                                                {entry.extra && (
                                                    <Typography variant="caption" sx={{ color: '#c62828', fontWeight: 600 }}>
                                                        {entry.extra}
                                                    </Typography>
                                                )}
                                            </Box>

                                            {/* Deleted by row */}
                                            {entry.deletedBy && (
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.5 }}>
                                                    <WarningAmber sx={{ fontSize: 13, color: '#e65100' }} />
                                                    <Typography variant="caption" sx={{ color: '#e65100', fontWeight: 600 }}>
                                                        Deleted by {entry.deletedBy}
                                                        {entry.deletedByRole ? ` (${entry.deletedByRole})` : ''}
                                                    </Typography>
                                                </Box>
                                            )}
                                        </Box>

                                        {/* Amount */}
                                        {entry.amount > 0 && (
                                            <Box sx={{ textAlign: 'right', flexShrink: 0 }}>
                                                <Typography variant="body1" fontWeight={700} sx={{ color: '#b71c1c', fontFamily: 'monospace' }}>
                                                    {fmt(entry.amount)}
                                                </Typography>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, justifyContent: 'flex-end' }}>
                                                    <MoneyOff sx={{ fontSize: 12, color: '#c62828' }} />
                                                    <Typography variant="caption" sx={{ color: '#c62828' }}>voided</Typography>
                                                </Box>
                                            </Box>
                                        )}
                                    </Box>
                                </Paper>
                            );
                        }

                        // Normal CREATE entry
                        return (
                            <Paper key={entry.id} variant="outlined" sx={{
                                display: 'flex', alignItems: 'flex-start', gap: 2, px: 2, py: 1.5,
                                '&:hover': { bgcolor: '#fafafa' }
                            }}>
                                {/* Time */}
                                <Box sx={{ minWidth: 46, textAlign: 'right', mt: 0.4 }}>
                                    <Typography variant="caption" color="text.secondary" sx={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>
                                        {moment(entry.time).format('HH:mm')}
                                    </Typography>
                                </Box>

                                {/* Type badge */}
                                <Box sx={{
                                    width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                                    bgcolor: cfg.bg, color: cfg.color,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                }}>
                                    {cfg.icon}
                                </Box>

                                {/* Content */}
                                <Box sx={{ flex: 1, minWidth: 0 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                        <Typography variant="body2" fontWeight={600}>
                                            {entry.title}
                                        </Typography>
                                        <Chip
                                            label={cfg.label}
                                            size="small"
                                            sx={{ fontSize: '0.65rem', height: 18, bgcolor: cfg.bg, color: cfg.color, fontWeight: 600 }}
                                        />
                                    </Box>
                                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', mt: 0.3 }}>
                                        {entry.subtitle && (
                                            <Typography variant="caption" color="text.secondary">{entry.subtitle}</Typography>
                                        )}
                                        {entry.meta && (
                                            <Typography variant="caption" color="text.disabled">{entry.meta}</Typography>
                                        )}
                                    </Box>
                                </Box>

                                {/* Amount */}
                                {entry.amount > 0 && (
                                    <Typography variant="body2" fontWeight={700} sx={{
                                        fontFamily: 'monospace',
                                        color: entry.entityType === 'PAYMENT_IN' ? '#2e7d32' :
                                               entry.entityType === 'PAYMENT_OUT' ? '#e65100' : '#1a237e',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {fmt(entry.amount)}
                                    </Typography>
                                )}
                            </Paper>
                        );
                    })}
                </Box>
            )}

            {!loading && filtered.length > 0 && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1, textAlign: 'right' }}>
                    {filtered.length} entries
                </Typography>
            )}
        </Box>
    );
};

export default TodayActivity;
