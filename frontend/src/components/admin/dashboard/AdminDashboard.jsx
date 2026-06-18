import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Card, CardContent, Typography, Grid, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Paper, Chip, Button,
    CircularProgress
} from '@mui/material';
import {
    Refresh, TrendingUp, TrendingDown, People, LocalShipping,
    Receipt, Payment, ShoppingCart, AccountBalance, ArrowForward
} from '@mui/icons-material';
import { useAuth } from '../../../context/AuthContext';
import axios from 'axios';
import moment from 'moment';

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

            const [customersRes, suppliersRes, ordersRes, paymentsRes] = await Promise.all([
                axios.get('/api/customers/with-balance', { headers }),
                axios.get('/api/suppliers/with-balance', { headers }),
                axios.get('/api/orders?limit=10', { headers }),
                axios.get('/api/payments?limit=10', { headers })
            ]);

            const customers = customersRes.data.data?.rows || [];
            const suppliers = suppliersRes.data.data?.rows || [];
            const orders = ordersRes.data.data?.rows || [];
            const payments = paymentsRes.data.data?.rows || [];

            // Calculate stats — force Number() since PostgreSQL returns strings
            const totalReceivable = customers.reduce((sum, c) => sum + Math.max(0, Number(c.balance) || 0), 0);
            const totalPayable = suppliers.reduce((sum, s) => sum + Math.max(0, Number(s.balance) || 0), 0);
            const totalSales = customers.reduce((sum, c) => sum + (Number(c.totalDebit) || 0), 0);
            const totalPurchases = suppliers.reduce((sum, s) => sum + (Number(s.totalDebit) || 0), 0);

            // Today's orders
            const today = moment().format('DD-MM-YYYY');
            const todayOrders = orders.filter(o => o.orderDate === today);
            const todaySales = todayOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
            const todayPaidSales = todayOrders.filter(o => o.paymentStatus === 'paid').reduce((sum, o) => sum + (Number(o.total) || 0), 0);

            setStats({
                customers: customers.length,
                suppliers: suppliers.length,
                customersWithDue: customers.filter(c => c.balance > 0).length,
                suppliersWithDue: suppliers.filter(s => s.balance > 0).length,
                totalReceivable,
                totalPayable,
                totalSales,
                totalPurchases,
                todaySales,
                todayPaidSales,
                todayOrders: todayOrders.length,
                netPosition: totalReceivable - totalPayable
            });

            setRecentOrders(orders.slice(0, 5));
            setRecentPayments(payments.slice(0, 5));

        } catch (error) {
            console.error('Dashboard error:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ p: 2, bgcolor: '#f8f9fa', minHeight: '100vh' }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 700, color: '#1a1a2e' }}>
                        Dashboard
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Welcome back, {user?.name || 'Admin'} • {moment().format('dddd, DD MMM YYYY')}
                    </Typography>
                </Box>
                <Button startIcon={<Refresh />} onClick={fetchDashboardData} variant="outlined">
                    Refresh
                </Button>
            </Box>

            {/* Quick Stats Row */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={3}>
                    <Card sx={{ bgcolor: '#e8f5e9', borderRadius: 2, cursor: 'pointer' }} onClick={() => navigate('/customers')}>
                        <CardContent sx={{ py: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Receivable</Typography>
                                    <Typography variant="h5" sx={{ fontWeight: 700, color: '#2e7d32' }}>
                                        ₹{(stats?.totalReceivable || 0).toLocaleString('en-IN')}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {stats?.customersWithDue || 0} customers
                                    </Typography>
                                </Box>
                                <TrendingUp sx={{ color: '#2e7d32', opacity: 0.5 }} />
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Card sx={{ bgcolor: '#fff3e0', borderRadius: 2, cursor: 'pointer' }} onClick={() => navigate('/suppliers')}>
                        <CardContent sx={{ py: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Payable</Typography>
                                    <Typography variant="h5" sx={{ fontWeight: 700, color: '#e65100' }}>
                                        ₹{(stats?.totalPayable || 0).toLocaleString('en-IN')}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {stats?.suppliersWithDue || 0} suppliers
                                    </Typography>
                                </Box>
                                <TrendingDown sx={{ color: '#e65100', opacity: 0.5 }} />
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Card sx={{ bgcolor: '#e3f2fd', borderRadius: 2, cursor: 'pointer' }} onClick={() => navigate('/orders')}>
                        <CardContent sx={{ py: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Today's Sales</Typography>
                                    <Typography variant="h5" sx={{ fontWeight: 700, color: '#1565c0' }}>
                                        ₹{(stats?.todaySales || 0).toLocaleString('en-IN')}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {stats?.todayOrders || 0} orders • ₹{(stats?.todayPaidSales || 0).toLocaleString('en-IN')} cash
                                    </Typography>
                                </Box>
                                <ShoppingCart sx={{ color: '#1565c0', opacity: 0.5 }} />
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Card sx={{ bgcolor: stats?.netPosition >= 0 ? '#e8f5e9' : '#ffebee', borderRadius: 2 }}>
                        <CardContent sx={{ py: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">Net Position</Typography>
                                    <Typography variant="h5" sx={{ fontWeight: 700, color: stats?.netPosition >= 0 ? '#2e7d32' : '#c62828' }}>
                                        ₹{Math.abs(stats?.netPosition || 0).toLocaleString('en-IN')}
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        {stats?.netPosition >= 0 ? 'In your favor' : 'You owe more'}
                                    </Typography>
                                </Box>
                                <AccountBalance sx={{ color: stats?.netPosition >= 0 ? '#2e7d32' : '#c62828', opacity: 0.5 }} />
                            </Box>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Quick Actions */}
            <Paper sx={{ p: 2, mb: 3, borderRadius: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 2, fontWeight: 600 }}>Quick Actions</Typography>
                <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                    <Button variant="contained" color="primary" startIcon={<ShoppingCart />} onClick={() => navigate('/orders/create')}>
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
                    <Button variant="outlined" startIcon={<People />} onClick={() => navigate('/customers')}>
                        Customers
                    </Button>
                    <Button variant="outlined" startIcon={<LocalShipping />} onClick={() => navigate('/suppliers')}>
                        Suppliers
                    </Button>
                </Box>
            </Paper>

            {/* Main Content Grid */}
            <Grid container spacing={3}>
                {/* Recent Orders */}
                <Grid item xs={12} md={6}>
                    <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
                        <Box sx={{ p: 2, bgcolor: '#f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Recent Sales</Typography>
                            <Button size="small" endIcon={<ArrowForward />} onClick={() => navigate('/orders')}>View All</Button>
                        </Box>
                        <TableContainer sx={{ maxHeight: 300 }}>
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
                                    {recentOrders.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} align="center">No recent orders</TableCell>
                                        </TableRow>
                                    ) : (
                                        recentOrders.map((order) => (
                                            <TableRow key={order.id} hover>
                                                <TableCell sx={{ fontWeight: 500 }}>{order.orderNumber}</TableCell>
                                                <TableCell>{order.customerName || 'Walk-in'}</TableCell>
                                                <TableCell align="right">₹{(order.total || 0).toLocaleString('en-IN')}</TableCell>
                                                <TableCell>
                                                    <Chip 
                                                        label={order.paymentStatus} 
                                                        size="small" 
                                                        color={order.paymentStatus === 'paid' ? 'success' : 'warning'}
                                                        sx={{ height: 20, fontSize: '0.7rem' }}
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

                {/* Recent Payments */}
                <Grid item xs={12} md={6}>
                    <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
                        <Box sx={{ p: 2, bgcolor: '#f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Recent Payments</Typography>
                            <Button size="small" endIcon={<ArrowForward />} onClick={() => navigate('/payments')}>View All</Button>
                        </Box>
                        <TableContainer sx={{ maxHeight: 300 }}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Party</TableCell>
                                        <TableCell>Type</TableCell>
                                        <TableCell align="right">Amount</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {recentPayments.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={3} align="center">No recent payments</TableCell>
                                        </TableRow>
                                    ) : (
                                        recentPayments.map((payment) => (
                                            <TableRow key={payment.id} hover>
                                                <TableCell sx={{ fontWeight: 500 }}>{payment.partyName}</TableCell>
                                                <TableCell>
                                                    <Chip
                                                        label={payment.partyType}
                                                        size="small"
                                                        color={payment.partyType === 'customer' ? 'success' : payment.partyType === 'supplier' ? 'warning' : 'default'}
                                                        sx={{ height: 20, fontSize: '0.7rem' }}
                                                    />
                                                </TableCell>
                                                <TableCell align="right">₹{(payment.amount || 0).toLocaleString('en-IN')}</TableCell>
                                            </TableRow>
                                        ))
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
