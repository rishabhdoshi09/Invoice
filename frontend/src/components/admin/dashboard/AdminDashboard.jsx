import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Card, CardContent, Typography, Grid, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Paper, Chip, Button, Skeleton, Tooltip
} from '@mui/material';
import {
    Refresh, TrendingUp, TrendingDown, TrendingFlat, People, LocalShipping,
    Receipt, Payment, ShoppingCart, AccountBalance, ArrowForward,
    NorthEast, SouthWest
} from '@mui/icons-material';
import { useAuth } from '../../../context/AuthContext';
import axios from 'axios';
import moment from 'moment';

const inr = (v) => `₹${Math.abs(Number(v) || 0).toLocaleString('en-IN')}`;

// ── Stat tile ────────────────────────────────────────────────────────────────
const StatTile = ({ label, value, sub, icon, tone, delta, onClick }) => (
    <Card
        onClick={onClick}
        sx={{
            height: '100%',
            cursor: onClick ? 'pointer' : 'default',
            transition: 'transform 140ms ease, box-shadow 140ms ease',
            ...(onClick && {
                '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.12)',
                },
            }),
        }}
    >
        <CardContent sx={{ py: 2, '&:last-child': { pb: 2 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
                <Box sx={{ minWidth: 0 }}>
                    <Typography variant="caption" sx={{
                        color: 'text.secondary', textTransform: 'uppercase',
                        letterSpacing: '0.06em', fontSize: '0.66rem', fontWeight: 700,
                    }}>
                        {label}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'baseline', gap: 1, flexWrap: 'wrap' }}>
                        <Typography variant="h5" sx={{
                            fontWeight: 800, color: tone.main,
                            fontVariantNumeric: 'tabular-nums', lineHeight: 1.35,
                        }}>
                            {value}
                        </Typography>
                        {delta && (
                            <Tooltip title={delta.tooltip} arrow>
                                <Chip
                                    icon={delta.direction > 0 ? <TrendingUp sx={{ fontSize: '14px !important' }} />
                                        : delta.direction < 0 ? <TrendingDown sx={{ fontSize: '14px !important' }} />
                                        : <TrendingFlat sx={{ fontSize: '14px !important' }} />}
                                    label={delta.label}
                                    size="small"
                                    sx={{
                                        height: 20, fontSize: '0.66rem', fontWeight: 700,
                                        bgcolor: delta.direction > 0 ? '#DCFCE7' : delta.direction < 0 ? '#FEE2E2' : '#F1F5F9',
                                        color: delta.direction > 0 ? '#166534' : delta.direction < 0 ? '#991B1B' : '#475569',
                                        '& .MuiChip-icon': { color: 'inherit' },
                                    }}
                                />
                            </Tooltip>
                        )}
                    </Box>
                    <Typography variant="caption" color="text.secondary" noWrap>{sub}</Typography>
                </Box>
                <Box sx={{
                    width: 40, height: 40, borderRadius: 2, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    bgcolor: tone.bg, color: tone.main,
                }}>
                    {icon}
                </Box>
            </Box>
        </CardContent>
    </Card>
);

const TileSkeleton = () => (
    <Card sx={{ height: '100%' }}>
        <CardContent sx={{ py: 2 }}>
            <Skeleton width="45%" height={16} />
            <Skeleton width="70%" height={34} />
            <Skeleton width="55%" height={16} />
        </CardContent>
    </Card>
);

export const AdminDashboard = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [recentOrders, setRecentOrders] = useState([]);
    const [recentPayments, setRecentPayments] = useState([]);

    useEffect(() => {
        fetchDashboardData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const fetchDashboardData = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };

            // limit=300 so today's + yesterday's figures are computed from the
            // full day's bills, not just the last 10 orders.
            const [customersRes, suppliersRes, ordersRes, paymentsRes] = await Promise.all([
                axios.get('/api/customers/with-balance', { headers }),
                axios.get('/api/suppliers/with-balance', { headers }),
                axios.get('/api/orders?limit=300', { headers }),
                axios.get('/api/payments?limit=10', { headers })
            ]);

            const customers = customersRes.data.data?.rows || [];
            const suppliers = suppliersRes.data.data?.rows || [];
            const orders = ordersRes.data.data?.rows || [];
            const payments = paymentsRes.data.data?.rows || [];

            // Force Number() since PostgreSQL returns strings
            const totalReceivable = customers.reduce((sum, c) => sum + Math.max(0, Number(c.balance) || 0), 0);
            const totalPayable = suppliers.reduce((sum, s) => sum + Math.max(0, Number(s.balance) || 0), 0);

            const today = moment().format('DD-MM-YYYY');
            const yesterday = moment().subtract(1, 'day').format('DD-MM-YYYY');
            const todayOrders = orders.filter(o => o.orderDate === today);
            const yesterdayOrders = orders.filter(o => o.orderDate === yesterday);
            const todaySales = todayOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
            const yesterdaySales = yesterdayOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
            const todayPaidSales = todayOrders.filter(o => o.paymentStatus === 'paid').reduce((sum, o) => sum + (Number(o.total) || 0), 0);

            setStats({
                customersWithDue: customers.filter(c => c.balance > 0).length,
                suppliersWithDue: suppliers.filter(s => s.balance > 0).length,
                totalReceivable,
                totalPayable,
                todaySales,
                yesterdaySales,
                todayPaidSales,
                todayOrders: todayOrders.length,
                netPosition: totalReceivable - totalPayable
            });

            setRecentOrders(orders.slice(0, 6));
            setRecentPayments(payments.slice(0, 6));

        } catch (error) {
            console.error('Dashboard error:', error);
        } finally {
            setLoading(false);
        }
    };

    // Today vs yesterday delta for the sales tile
    const salesDelta = (() => {
        if (!stats) return null;
        const { todaySales, yesterdaySales } = stats;
        if (!yesterdaySales) return null;
        const pct = Math.round(((todaySales - yesterdaySales) / yesterdaySales) * 100);
        return {
            direction: pct > 0 ? 1 : pct < 0 ? -1 : 0,
            label: `${pct > 0 ? '+' : ''}${pct}%`,
            tooltip: `Yesterday: ${inr(yesterdaySales)}`,
        };
    })();

    const tones = {
        green:  { main: '#15803D', bg: '#DCFCE7' },
        orange: { main: '#C2410C', bg: '#FFEDD5' },
        blue:   { main: '#1565C0', bg: '#DBEAFE' },
        red:    { main: '#B91C1C', bg: '#FEE2E2' },
        slate:  { main: '#334155', bg: '#F1F5F9' },
    };

    return (
        <Box>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3, flexWrap: 'wrap', gap: 1 }}>
                <Box>
                    <Typography variant="h4">Dashboard</Typography>
                    <Typography variant="body2" color="text.secondary">
                        Welcome back, {user?.name || 'Admin'} · {moment().format('dddd, DD MMM YYYY')}
                    </Typography>
                </Box>
                <Button startIcon={<Refresh />} onClick={fetchDashboardData} variant="outlined" size="small">
                    Refresh
                </Button>
            </Box>

            {/* Stat tiles */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                {loading ? (
                    [0, 1, 2, 3].map(i => <Grid item xs={6} md={3} key={i}><TileSkeleton /></Grid>)
                ) : (
                    <>
                        <Grid item xs={6} md={3}>
                            <StatTile
                                label="Today's Sales"
                                value={inr(stats?.todaySales)}
                                sub={`${stats?.todayOrders || 0} bills · ${inr(stats?.todayPaidSales)} cash`}
                                icon={<ShoppingCart fontSize="small" />}
                                tone={tones.blue}
                                delta={salesDelta}
                                onClick={() => navigate('/orders')}
                            />
                        </Grid>
                        <Grid item xs={6} md={3}>
                            <StatTile
                                label="To Collect"
                                value={inr(stats?.totalReceivable)}
                                sub={`${stats?.customersWithDue || 0} customers owe you`}
                                icon={<People fontSize="small" />}
                                tone={tones.green}
                                onClick={() => navigate('/customers')}
                            />
                        </Grid>
                        <Grid item xs={6} md={3}>
                            <StatTile
                                label="To Pay"
                                value={inr(stats?.totalPayable)}
                                sub={`${stats?.suppliersWithDue || 0} suppliers to settle`}
                                icon={<LocalShipping fontSize="small" />}
                                tone={tones.orange}
                                onClick={() => navigate('/suppliers')}
                            />
                        </Grid>
                        <Grid item xs={6} md={3}>
                            <StatTile
                                label="Net Position"
                                value={inr(stats?.netPosition)}
                                sub={stats?.netPosition >= 0 ? 'In your favor' : 'You owe more than you collect'}
                                icon={<AccountBalance fontSize="small" />}
                                tone={stats?.netPosition >= 0 ? tones.green : tones.red}
                            />
                        </Grid>
                    </>
                )}
            </Grid>

            {/* Quick actions */}
            <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 2.5 }}>
                <Typography variant="caption" sx={{
                    color: 'text.secondary', textTransform: 'uppercase',
                    letterSpacing: '0.06em', fontSize: '0.66rem', fontWeight: 700, display: 'block', mb: 1.25,
                }}>
                    Quick Actions
                </Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button variant="contained" disableElevation startIcon={<ShoppingCart />} onClick={() => navigate('/orders/create')}>
                        New Sale
                    </Button>
                    <Button variant="outlined" startIcon={<Receipt />} onClick={() => navigate('/customers')}>
                        Receive Payment
                    </Button>
                    <Button variant="outlined" startIcon={<Payment />} onClick={() => navigate('/suppliers')}>
                        Make Payment
                    </Button>
                    <Button variant="outlined" startIcon={<LocalShipping />} onClick={() => navigate('/purchases')}>
                        Add Purchase
                    </Button>
                </Box>
            </Paper>

            {/* Recent activity */}
            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
                        <Box sx={{ px: 2, py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0' }}>
                            <Typography variant="subtitle1">Recent Sales</Typography>
                            <Button size="small" endIcon={<ArrowForward />} onClick={() => navigate('/orders')}>View All</Button>
                        </Box>
                        <TableContainer sx={{ maxHeight: 320 }}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Invoice</TableCell>
                                        <TableCell>Customer</TableCell>
                                        <TableCell align="right">Amount</TableCell>
                                        <TableCell>Status</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {loading ? (
                                        [0, 1, 2, 3].map(i => (
                                            <TableRow key={i}>
                                                {[0, 1, 2, 3].map(c => <TableCell key={c}><Skeleton height={18} /></TableCell>)}
                                            </TableRow>
                                        ))
                                    ) : recentOrders.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary', border: 0 }}>
                                                No sales yet — bills you create appear here.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        recentOrders.map((order) => (
                                            <TableRow key={order.id} hover sx={{ cursor: 'pointer' }} onClick={() => navigate('/orders')}>
                                                <TableCell sx={{ fontWeight: 600, fontSize: '0.78rem', fontFamily: 'monospace' }}>{order.orderNumber}</TableCell>
                                                <TableCell>{order.customerName || 'Walk-in'}</TableCell>
                                                <TableCell align="right" sx={{ fontWeight: 600 }}>{inr(order.total)}</TableCell>
                                                <TableCell>
                                                    <Chip
                                                        label={order.paymentStatus}
                                                        size="small"
                                                        color={order.paymentStatus === 'paid' ? 'success' : order.paymentStatus === 'partial' ? 'warning' : 'error'}
                                                        variant="outlined"
                                                        sx={{ height: 20, fontSize: '0.68rem', textTransform: 'capitalize' }}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Paper variant="outlined" sx={{ borderRadius: 2.5, overflow: 'hidden' }}>
                        <Box sx={{ px: 2, py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0' }}>
                            <Typography variant="subtitle1">Recent Payments</Typography>
                            <Button size="small" endIcon={<ArrowForward />} onClick={() => navigate('/payments')}>View All</Button>
                        </Box>
                        <TableContainer sx={{ maxHeight: 320 }}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Party</TableCell>
                                        <TableCell>Direction</TableCell>
                                        <TableCell align="right">Amount</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {loading ? (
                                        [0, 1, 2, 3].map(i => (
                                            <TableRow key={i}>
                                                {[0, 1, 2].map(c => <TableCell key={c}><Skeleton height={18} /></TableCell>)}
                                            </TableRow>
                                        ))
                                    ) : recentPayments.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={3} align="center" sx={{ py: 4, color: 'text.secondary', border: 0 }}>
                                                No payments yet — receipts and payouts appear here.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        recentPayments.map((payment) => {
                                            const isIn = payment.partyType === 'customer';
                                            return (
                                                <TableRow key={payment.id} hover>
                                                    <TableCell sx={{ fontWeight: 500 }}>{payment.partyName}</TableCell>
                                                    <TableCell>
                                                        <Chip
                                                            icon={isIn
                                                                ? <SouthWest sx={{ fontSize: '13px !important' }} />
                                                                : <NorthEast sx={{ fontSize: '13px !important' }} />}
                                                            label={isIn ? 'Received' : 'Paid Out'}
                                                            size="small"
                                                            sx={{
                                                                height: 20, fontSize: '0.68rem', fontWeight: 600,
                                                                bgcolor: isIn ? '#DCFCE7' : '#FEE2E2',
                                                                color: isIn ? '#166534' : '#991B1B',
                                                                '& .MuiChip-icon': { color: 'inherit' },
                                                            }}
                                                        />
                                                    </TableCell>
                                                    <TableCell align="right" sx={{ fontWeight: 600, color: isIn ? '#15803D' : '#B91C1C' }}>
                                                        {isIn ? '+' : '−'}{inr(payment.amount)}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
};

export default AdminDashboard;
