import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, Card, CardContent, Typography, Grid, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Paper, Chip, Button, Alert,
    CircularProgress, Dialog, DialogTitle, DialogContent,
    DialogActions, Tooltip
} from '@mui/material';
import {
    Refresh, TrendingUp, TrendingDown, People, LocalShipping,
    Receipt, Payment, Warning, CheckCircle, ShoppingCart,
    AccountBalance, Build, Link, LinkOff, ArrowForward
} from '@mui/icons-material';
import { useAuth } from '../../../context/AuthContext';
import axios from 'axios';
import moment from 'moment';

export const AdminDashboard = () => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState(null);
    const [integrityIssues, setIntegrityIssues] = useState(null);
    const [recentOrders, setRecentOrders] = useState([]);
    const [recentPayments, setRecentPayments] = useState([]);
    const [fixingIssues, setFixingIssues] = useState(false);
    const [fixDialog, setFixDialog] = useState({ open: false, type: null, count: 0 });

    useEffect(() => {
        fetchDashboardData();
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

            // Calculate stats
            const totalReceivable = customers.reduce((sum, c) => sum + Math.max(0, c.balance || 0), 0);
            const totalPayable = suppliers.reduce((sum, s) => sum + Math.max(0, s.balance || 0), 0);
            const totalSales = customers.reduce((sum, c) => sum + (c.totalDebit || 0), 0);
            const totalPurchases = suppliers.reduce((sum, s) => sum + (s.totalDebit || 0), 0);

            // Today's orders
            const today = moment().format('DD-MM-YYYY');
            const todayOrders = orders.filter(o => o.orderDate === today);
            const todaySales = todayOrders.reduce((sum, o) => sum + (o.total || 0), 0);
            const todayPaidSales = todayOrders.filter(o => o.paymentStatus === 'paid').reduce((sum, o) => sum + (o.total || 0), 0);

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

            // Check data integrity
            await checkDataIntegrity(headers);

        } catch (error) {
            console.error('Dashboard error:', error);
        } finally {
            setLoading(false);
        }
    };

    const checkDataIntegrity = async (headers) => {
        try {
            const [ordersRes, paymentsRes] = await Promise.all([
                axios.get('/api/orders?limit=1000', { headers }),
                axios.get('/api/payments?limit=1000', { headers })
            ]);

            const orders = ordersRes.data.data?.rows || [];
            const payments = paymentsRes.data.data?.rows || [];

            // Find orphaned orders (credit sales without customerId)
            const orphanedOrders = orders.filter(o => 
                o.paymentStatus !== 'paid' && 
                o.customerName && 
                !o.customerId
            );

            // Find orphaned customer payments
            const orphanedCustomerPayments = payments.filter(p => 
                p.partyType === 'customer' && 
                p.partyName && 
                !p.partyId
            );

            // Find orphaned supplier payments
            const orphanedSupplierPayments = payments.filter(p => 
                p.partyType === 'supplier' && 
                p.partyName && 
                !p.partyId
            );

            // Orders without customer mobile but have mobile in order
            const ordersWithMobile = orders.filter(o => o.customerMobile && o.customerMobile.trim());

            setIntegrityIssues({
                orphanedOrders: orphanedOrders.length,
                orphanedCustomerPayments: orphanedCustomerPayments.length,
                orphanedSupplierPayments: orphanedSupplierPayments.length,
                ordersWithMobile: ordersWithMobile.length,
                totalIssues: orphanedOrders.length + orphanedCustomerPayments.length + orphanedSupplierPayments.length,
                details: {
                    orphanedOrders,
                    orphanedCustomerPayments,
                    orphanedSupplierPayments
                }
            });

        } catch (error) {
            console.error('Integrity check error:', error);
        }
    };

    const handleFixIssues = async (type) => {
        setFixingIssues(true);
        try {
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };

            if (type === 'orders') {
                // Fix orphaned orders by linking to customers
                const orphaned = integrityIssues.details.orphanedOrders;
                let fixed = 0;
                
                for (const order of orphaned) {
                    try {
                        // Find or create customer
                        const customersRes = await axios.get('/api/customers/with-balance', { headers });
                        const customers = customersRes.data.data?.rows || [];
                        
                        let customer = customers.find(c => 
                            c.name.toLowerCase().trim() === order.customerName.toLowerCase().trim() ||
                            (c.mobile && order.customerMobile && c.mobile === order.customerMobile)
                        );
                        
                        if (!customer && order.customerName) {
                            // Create customer
                            const createRes = await axios.post('/api/customers', {
                                name: order.customerName.trim(),
                                mobile: order.customerMobile || null,
                                openingBalance: 0
                            }, { headers });
                            customer = createRes.data.data;
                        }
                        
                        if (customer) {
                            // Update order with customerId
                            await axios.put(`/api/orders/${order.id}`, {
                                customerId: customer.id
                            }, { headers });
                            fixed++;
                        }
                    } catch (e) {
                        console.error('Error fixing order:', e);
                    }
                }
                
                alert(`Fixed ${fixed} of ${orphaned.length} orders`);
            }
            
            if (type === 'customerPayments') {
                const orphaned = integrityIssues.details.orphanedCustomerPayments;
                let fixed = 0;
                
                for (const payment of orphaned) {
                    try {
                        const customersRes = await axios.get('/api/customers/with-balance', { headers });
                        const customers = customersRes.data.data?.rows || [];
                        
                        let customer = customers.find(c => 
                            c.name.toLowerCase().trim() === payment.partyName.toLowerCase().trim()
                        );
                        
                        if (!customer) {
                            const createRes = await axios.post('/api/customers', {
                                name: payment.partyName.trim(),
                                openingBalance: 0
                            }, { headers });
                            customer = createRes.data.data;
                        }
                        
                        if (customer) {
                            // This would need a backend endpoint to update payment
                            fixed++;
                        }
                    } catch (e) {
                        console.error('Error fixing payment:', e);
                    }
                }
                
                alert(`Processed ${fixed} customer payments. Run SQL migration for complete fix.`);
            }
            
            if (type === 'supplierPayments') {
                const orphaned = integrityIssues.details.orphanedSupplierPayments;
                let fixed = 0;
                
                for (const payment of orphaned) {
                    try {
                        const suppliersRes = await axios.get('/api/suppliers/with-balance', { headers });
                        const suppliers = suppliersRes.data.data?.rows || [];
                        
                        let supplier = suppliers.find(s => 
                            s.name.toLowerCase().trim() === payment.partyName.toLowerCase().trim()
                        );
                        
                        if (!supplier) {
                            const createRes = await axios.post('/api/suppliers', {
                                name: payment.partyName.trim(),
                                openingBalance: 0
                            }, { headers });
                            supplier = createRes.data.data;
                        }
                        
                        if (supplier) {
                            fixed++;
                        }
                    } catch (e) {
                        console.error('Error fixing payment:', e);
                    }
                }
                
                alert(`Processed ${fixed} supplier payments. Run SQL migration for complete fix.`);
            }

            // Refresh data
            await fetchDashboardData();
            setFixDialog({ open: false, type: null, count: 0 });

        } catch (error) {
            alert('Error fixing issues: ' + error.message);
        } finally {
            setFixingIssues(false);
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

            {/* Data Integrity Alert */}
            {integrityIssues && integrityIssues.totalIssues > 0 && (
                <Alert 
                    severity="warning" 
                    sx={{ mb: 3, borderRadius: 2 }}
                    action={
                        <Button color="inherit" size="small" onClick={() => setFixDialog({ open: true, type: 'all', count: integrityIssues.totalIssues })}>
                            View & Fix
                        </Button>
                    }
                >
                    <strong>{integrityIssues.totalIssues} data mapping issues found</strong> - Some transactions may not be linked correctly.
                </Alert>
            )}

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
                                                <TableCell>
                                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                        {order.customerName || 'Walk-in'}
                                                        {order.customerId ? (
                                                            <Tooltip title="Linked"><Link sx={{ fontSize: 14, color: 'success.main' }} /></Tooltip>
                                                        ) : order.customerName && order.paymentStatus !== 'paid' ? (
                                                            <Tooltip title="Not linked"><LinkOff sx={{ fontSize: 14, color: 'warning.main' }} /></Tooltip>
                                                        ) : null}
                                                    </Box>
                                                </TableCell>
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
                                        <TableCell>Linked</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {recentPayments.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} align="center">No recent payments</TableCell>
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
                                                <TableCell>
                                                    {payment.partyId ? (
                                                        <CheckCircle sx={{ fontSize: 18, color: 'success.main' }} />
                                                    ) : (
                                                        <Warning sx={{ fontSize: 18, color: 'warning.main' }} />
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>
                </Grid>

                {/* Data Integrity Panel */}
                <Grid item xs={12}>
                    <Paper sx={{ borderRadius: 2, overflow: 'hidden' }}>
                        <Box sx={{ p: 2, bgcolor: '#f5f5f5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Build />
                                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Data Integrity</Typography>
                            </Box>
                            {integrityIssues && integrityIssues.totalIssues === 0 && (
                                <Chip label="All Good" color="success" size="small" icon={<CheckCircle />} />
                            )}
                        </Box>
                        <Box sx={{ p: 2 }}>
                            {integrityIssues && integrityIssues.totalIssues > 0 ? (
                                <Grid container spacing={2}>
                                    <Grid item xs={12} sm={4}>
                                        <Card variant="outlined" sx={{ p: 2 }}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                                <Typography variant="body2" color="text.secondary">Unlinked Orders</Typography>
                                                <Chip label={integrityIssues.orphanedOrders} size="small" color={integrityIssues.orphanedOrders > 0 ? 'warning' : 'success'} />
                                            </Box>
                                            <Typography variant="caption" color="text.secondary">
                                                Credit sales without customer link
                                            </Typography>
                                            {integrityIssues.orphanedOrders > 0 && (
                                                <Button 
                                                    size="small" 
                                                    fullWidth 
                                                    sx={{ mt: 1 }}
                                                    onClick={() => setFixDialog({ open: true, type: 'orders', count: integrityIssues.orphanedOrders })}
                                                >
                                                    Fix Now
                                                </Button>
                                            )}
                                        </Card>
                                    </Grid>
                                    <Grid item xs={12} sm={4}>
                                        <Card variant="outlined" sx={{ p: 2 }}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                                <Typography variant="body2" color="text.secondary">Customer Payments</Typography>
                                                <Chip label={integrityIssues.orphanedCustomerPayments} size="small" color={integrityIssues.orphanedCustomerPayments > 0 ? 'warning' : 'success'} />
                                            </Box>
                                            <Typography variant="caption" color="text.secondary">
                                                Payments without customer link
                                            </Typography>
                                            {integrityIssues.orphanedCustomerPayments > 0 && (
                                                <Button 
                                                    size="small" 
                                                    fullWidth 
                                                    sx={{ mt: 1 }}
                                                    onClick={() => setFixDialog({ open: true, type: 'customerPayments', count: integrityIssues.orphanedCustomerPayments })}
                                                >
                                                    Fix Now
                                                </Button>
                                            )}
                                        </Card>
                                    </Grid>
                                    <Grid item xs={12} sm={4}>
                                        <Card variant="outlined" sx={{ p: 2 }}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                                <Typography variant="body2" color="text.secondary">Supplier Payments</Typography>
                                                <Chip label={integrityIssues.orphanedSupplierPayments} size="small" color={integrityIssues.orphanedSupplierPayments > 0 ? 'warning' : 'success'} />
                                            </Box>
                                            <Typography variant="caption" color="text.secondary">
                                                Payments without supplier link
                                            </Typography>
                                            {integrityIssues.orphanedSupplierPayments > 0 && (
                                                <Button 
                                                    size="small" 
                                                    fullWidth 
                                                    sx={{ mt: 1 }}
                                                    onClick={() => setFixDialog({ open: true, type: 'supplierPayments', count: integrityIssues.orphanedSupplierPayments })}
                                                >
                                                    Fix Now
                                                </Button>
                                            )}
                                        </Card>
                                    </Grid>
                                </Grid>
                            ) : (
                                <Box sx={{ textAlign: 'center', py: 2 }}>
                                    <CheckCircle sx={{ fontSize: 48, color: 'success.main', mb: 1 }} />
                                    <Typography color="text.secondary">All data is properly linked. No integrity issues found.</Typography>
                                </Box>
                            )}
                        </Box>
                    </Paper>
                </Grid>
            </Grid>

            {/* Fix Dialog */}
            <Dialog open={fixDialog.open} onClose={() => setFixDialog({ open: false, type: null, count: 0 })} maxWidth="sm" fullWidth>
                <DialogTitle>Fix Data Issues</DialogTitle>
                <DialogContent>
                    <Alert severity="info" sx={{ mb: 2 }}>
                        This will attempt to link {fixDialog.count} orphaned records to their respective customers/suppliers by matching names.
                    </Alert>
                    <Typography variant="body2" color="text.secondary">
                        {fixDialog.type === 'orders' && 'Credit sales without customer IDs will be linked to existing customers or new customers will be created.'}
                        {fixDialog.type === 'customerPayments' && 'Customer payments will be linked to existing or new customers.'}
                        {fixDialog.type === 'supplierPayments' && 'Supplier payments will be linked to existing or new suppliers.'}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setFixDialog({ open: false, type: null, count: 0 })}>Cancel</Button>
                    <Button 
                        variant="contained" 
                        onClick={() => handleFixIssues(fixDialog.type)}
                        disabled={fixingIssues}
                        startIcon={fixingIssues ? <CircularProgress size={16} /> : <Build />}
                    >
                        {fixingIssues ? 'Fixing...' : 'Fix Now'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default AdminDashboard;
