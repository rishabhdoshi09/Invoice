import { useState, useEffect, useCallback } from 'react';
import { Box, Paper, Typography, IconButton, Collapse, Chip, Tooltip, CircularProgress } from '@mui/material';
import { 
    ExpandMore, ExpandLess, TrendingUp, TrendingDown, 
    ShoppingCart, People, LocalShipping, Refresh
} from '@mui/icons-material';
import axios from 'axios';

export const FloatingStatsWidget = () => {
    const [expanded, setExpanded] = useState(false);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(null);

    const fetchStats = useCallback(async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            if (!token) return;
            
            const headers = { Authorization: `Bearer ${token}` };
            
            const [ordersRes, customersRes, suppliersRes] = await Promise.all([
                axios.get('/api/orders?limit=100', { headers }).catch(() => ({ data: { data: { rows: [] } } })),
                axios.get('/api/customers/with-balance', { headers }).catch(() => ({ data: { data: { rows: [] } } })),
                axios.get('/api/suppliers/with-balance', { headers }).catch(() => ({ data: { data: { rows: [] } } }))
            ]);

            const orders = ordersRes.data?.data?.rows || [];
            const customers = customersRes.data?.data?.rows || [];
            const suppliers = suppliersRes.data?.data?.rows || [];

            // Calculate today's stats
            const today = new Date().toLocaleDateString('en-GB').split('/').join('-');
            const todayOrders = orders.filter(o => o.orderDate === today);
            const todaySales = todayOrders.reduce((sum, o) => sum + (o.total || 0), 0);
            const todayPaid = todayOrders.filter(o => o.paymentStatus === 'paid').reduce((sum, o) => sum + (o.total || 0), 0);

            // Calculate receivables/payables
            const totalReceivable = customers.reduce((sum, c) => sum + Math.max(0, c.balance || 0), 0);
            const totalPayable = suppliers.reduce((sum, s) => sum + Math.max(0, s.balance || 0), 0);

            // Compare with yesterday (simple mock for now)
            const yesterdayOrders = orders.filter(o => {
                const orderDate = new Date(o.orderDate?.split('-').reverse().join('-'));
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                return orderDate.toDateString() === yesterday.toDateString();
            });
            const yesterdaySales = yesterdayOrders.reduce((sum, o) => sum + (o.total || 0), 0);

            const salesTrend = todaySales > yesterdaySales ? 'up' : todaySales < yesterdaySales ? 'down' : 'same';

            setStats({
                todaySales,
                todayPaid,
                todayOrders: todayOrders.length,
                totalReceivable,
                totalPayable,
                netPosition: totalReceivable - totalPayable,
                customersWithDue: customers.filter(c => c.balance > 0).length,
                suppliersWithDue: suppliers.filter(s => s.balance > 0).length,
                salesTrend,
                salesChange: todaySales - yesterdaySales
            });
            setLastUpdated(new Date());
        } catch (error) {
            console.error('Error fetching quick stats:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();
        // Refresh every 2 minutes
        const interval = setInterval(fetchStats, 120000);
        return () => clearInterval(interval);
    }, [fetchStats]);

    const formatCurrency = (amount) => `₹${(amount || 0).toLocaleString('en-IN')}`;

    if (!stats && !loading) return null;

    return (
        <Paper
            sx={{
                position: 'fixed',
                bottom: 20,
                right: 20,
                zIndex: 1200,
                borderRadius: 3,
                overflow: 'hidden',
                boxShadow: 4,
                minWidth: expanded ? 280 : 'auto',
                transition: 'all 0.3s ease'
            }}
            data-testid="floating-stats-widget"
        >
            {/* Header - Always visible */}
            <Box
                sx={{
                    p: 1.5,
                    bgcolor: 'primary.main',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    cursor: 'pointer'
                }}
                onClick={() => setExpanded(!expanded)}
            >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <ShoppingCart fontSize="small" />
                    <Typography variant="subtitle2" fontWeight="bold">
                        Quick Stats
                    </Typography>
                    {loading && <CircularProgress size={14} color="inherit" />}
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {!expanded && stats && (
                        <Chip
                            label={formatCurrency(stats.todaySales)}
                            size="small"
                            sx={{ 
                                bgcolor: 'rgba(255,255,255,0.2)', 
                                color: 'white',
                                fontWeight: 'bold',
                                height: 22
                            }}
                        />
                    )}
                    <IconButton size="small" sx={{ color: 'white', p: 0.25 }}>
                        {expanded ? <ExpandMore /> : <ExpandLess />}
                    </IconButton>
                </Box>
            </Box>

            {/* Expanded Content */}
            <Collapse in={expanded}>
                <Box sx={{ p: 2 }}>
                    {stats ? (
                        <>
                            {/* Today's Sales */}
                            <Box sx={{ mb: 2 }}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <Typography variant="caption" color="text.secondary">Today's Sales</Typography>
                                    {stats.salesTrend !== 'same' && (
                                        <Chip
                                            icon={stats.salesTrend === 'up' ? <TrendingUp sx={{ fontSize: '14px !important' }} /> : <TrendingDown sx={{ fontSize: '14px !important' }} />}
                                            label={`${stats.salesTrend === 'up' ? '+' : ''}${formatCurrency(stats.salesChange)}`}
                                            size="small"
                                            color={stats.salesTrend === 'up' ? 'success' : 'warning'}
                                            sx={{ height: 20, fontSize: '0.65rem' }}
                                        />
                                    )}
                                </Box>
                                <Typography variant="h5" fontWeight="bold" color="primary.main">
                                    {formatCurrency(stats.todaySales)}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {stats.todayOrders} orders • {formatCurrency(stats.todayPaid)} cash
                                </Typography>
                            </Box>

                            {/* Quick Stats Grid */}
                            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1.5, mb: 2 }}>
                                <Box sx={{ p: 1, bgcolor: '#e8f5e9', borderRadius: 1 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <People sx={{ fontSize: 14, color: 'success.main' }} />
                                        <Typography variant="caption" color="text.secondary">Receivable</Typography>
                                    </Box>
                                    <Typography variant="body2" fontWeight="bold" color="success.main">
                                        {formatCurrency(stats.totalReceivable)}
                                    </Typography>
                                </Box>
                                <Box sx={{ p: 1, bgcolor: '#fff3e0', borderRadius: 1 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <LocalShipping sx={{ fontSize: 14, color: 'warning.main' }} />
                                        <Typography variant="caption" color="text.secondary">Payable</Typography>
                                    </Box>
                                    <Typography variant="body2" fontWeight="bold" color="warning.main">
                                        {formatCurrency(stats.totalPayable)}
                                    </Typography>
                                </Box>
                            </Box>

                            {/* Net Position */}
                            <Box sx={{ 
                                p: 1, 
                                bgcolor: stats.netPosition >= 0 ? '#e8f5e9' : '#ffebee', 
                                borderRadius: 1,
                                textAlign: 'center'
                            }}>
                                <Typography variant="caption" color="text.secondary">Net Position</Typography>
                                <Typography 
                                    variant="body1" 
                                    fontWeight="bold" 
                                    color={stats.netPosition >= 0 ? 'success.main' : 'error.main'}
                                >
                                    {formatCurrency(Math.abs(stats.netPosition))}
                                    <Typography variant="caption" sx={{ ml: 0.5 }}>
                                        {stats.netPosition >= 0 ? '(Positive)' : '(Negative)'}
                                    </Typography>
                                </Typography>
                            </Box>

                            {/* Refresh Button */}
                            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Typography variant="caption" color="text.secondary">
                                    {lastUpdated && `Updated ${lastUpdated.toLocaleTimeString()}`}
                                </Typography>
                                <Tooltip title="Refresh stats">
                                    <IconButton size="small" onClick={fetchStats} disabled={loading}>
                                        <Refresh fontSize="small" />
                                    </IconButton>
                                </Tooltip>
                            </Box>
                        </>
                    ) : (
                        <Box sx={{ textAlign: 'center', py: 2 }}>
                            <CircularProgress size={24} />
                        </Box>
                    )}
                </Box>
            </Collapse>
        </Paper>
    );
};

export default FloatingStatsWidget;
