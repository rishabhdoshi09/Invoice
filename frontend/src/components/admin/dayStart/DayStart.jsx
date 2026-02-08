import React, { useState } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Grid,
    TextField,
    Button,
    Alert,
    CircularProgress,
    Paper,
    Divider,
    ToggleButton,
    ToggleButtonGroup
} from '@mui/material';
import { 
    AccountBalance, 
    Refresh, 
    TrendingUp, 
    TrendingDown,
    People,
    LocalShipping,
    ShoppingCart,
    Receipt,
    Today,
    History
} from '@mui/icons-material';
import { useAuth } from '../../../context/AuthContext';
import { 
    useGetTodaySummaryQuery, 
    useGetDailySummaryQuery,
    useGetSummaryByDateQuery,
    useSetOpeningBalanceMutation 
} from '../../../store/api';
import moment from 'moment';
import {
    PieChart,
    Pie,
    Cell,
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';

export const DayStart = () => {
    const { user } = useAuth();
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    
    // Date selection state - default to today
    const [selectedDate, setSelectedDate] = useState(moment().format('YYYY-MM-DD'));
    const isToday = selectedDate === moment().format('YYYY-MM-DD');
    const isYesterday = selectedDate === moment().subtract(1, 'days').format('YYYY-MM-DD');
    
    // Opening balance state
    const [openingBalanceInput, setOpeningBalanceInput] = useState('');

    // RTK Query hooks - automatic caching and refetch!
    // For today, use the dedicated today endpoint
    const { 
        data: todaySummaryData, 
        isLoading: loadingTodaySummary,
        isFetching: fetchingTodaySummary,
        refetch: refetchTodaySummary 
    } = useGetTodaySummaryQuery(undefined, {
        skip: !isToday, // Only fetch if viewing today
        refetchOnFocus: true,
        refetchOnReconnect: true,
    });
    
    // For historical dates, use the date-specific endpoint
    const { 
        data: historicalSummary, 
        isLoading: loadingHistoricalSummary,
        isFetching: fetchingHistoricalSummary,
        refetch: refetchHistoricalSummary 
    } = useGetSummaryByDateQuery(selectedDate, {
        skip: isToday, // Only fetch if viewing a past date
        refetchOnFocus: true,
        refetchOnReconnect: true,
    });
    
    // Use the appropriate data based on selected date
    const summaryData = isToday ? todaySummaryData : historicalSummary;
    const loadingSummary = isToday ? loadingTodaySummary : loadingHistoricalSummary;
    const fetchingSummary = isToday ? fetchingTodaySummary : fetchingHistoricalSummary;
    
    // Payment summary for selected date
    const { 
        data: paymentSummary,
        isLoading: loadingPayments,
        refetch: refetchPayments
    } = useGetDailySummaryQuery(selectedDate, {
        refetchOnFocus: true,
        refetchOnReconnect: true,
    });
    
    const [setOpeningBalance, { isLoading: savingOpeningBalance }] = useSetOpeningBalanceMutation();

    const loading = loadingSummary || loadingPayments;

    const handleRefreshAll = () => {
        if (isToday) {
            refetchTodaySummary();
        } else {
            refetchHistoricalSummary();
        }
        refetchPayments();
    };

    const handleSetOpeningBalance = async () => {
        const amount = parseFloat(openingBalanceInput);
        if (isNaN(amount) || amount < 0) {
            setError('Please enter a valid amount (0 or greater)');
            return;
        }
        
        setError('');
        setSuccess('');
        
        try {
            await setOpeningBalance(amount).unwrap();
            setOpeningBalanceInput('');
            setSuccess('Opening balance set successfully!');
            // No manual refetch needed - RTK Query handles it!
        } catch (err) {
            setError('Failed to set opening balance: ' + (err.data?.message || err.message || err));
        }
    };

    // Calculate cash flow values - using summaryData which switches between today and historical
    const openingBalance = summaryData?.openingBalance || 0;
    const totalSales = summaryData?.totalSales || 0;
    const totalReceivables = summaryData?.totalReceivables || 0; // Credit sales - not in drawer
    const cashSales = totalSales - totalReceivables; // Only cash sales go in drawer
    const customerPayments = paymentSummary?.summary?.customers?.amount || 0;
    const supplierPayments = paymentSummary?.summary?.suppliers?.amount || 0;
    const expenses = paymentSummary?.summary?.expenses?.amount || 0;
    
    // Expected cash = Opening + Cash Sales (not credit) + Customer Receipts - Supplier Payments - Expenses
    const expectedCash = openingBalance + cashSales + customerPayments - supplierPayments - expenses;
    const netCashFlow = customerPayments - supplierPayments - expenses;

    // Prepare chart data
    const cashInflowData = [
        { name: 'Opening Balance', value: openingBalance, color: '#9c27b0' },
        { name: 'Cash Sales', value: cashSales, color: '#2196f3' },
        { name: 'Customer Receipts', value: customerPayments, color: '#4caf50' },
    ].filter(item => item.value > 0);

    const barChartData = [
        { name: 'Opening', amount: openingBalance, fill: '#9c27b0' },
        { name: 'Cash Sales', amount: cashSales, fill: '#2196f3' },
        { name: 'Credit Sales', amount: totalReceivables, fill: '#ff5722' },
        { name: 'Received', amount: customerPayments, fill: '#4caf50' },
        { name: 'Paid Out', amount: -supplierPayments, fill: '#ff9800' },
        { name: 'Expenses', amount: -expenses, fill: '#f44336' },
        { name: 'Expected', amount: expectedCash, fill: '#00bcd4' },
    ];

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AccountBalance color="primary" />
                    Day Start - Cash Management
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {fetchingSummary && <CircularProgress size={20} />}
                    <Button
                        startIcon={<Refresh />}
                        onClick={handleRefreshAll}
                        variant="outlined"
                        disabled={fetchingSummary}
                    >
                        Refresh
                    </Button>
                </Box>
            </Box>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}

            {success && (
                <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
                    {success}
                </Alert>
            )}

            {/* Date Selector - Today / Yesterday / Custom */}
            <Box sx={{ mb: 3, display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <ToggleButtonGroup
                    value={isToday ? 'today' : isYesterday ? 'yesterday' : 'custom'}
                    exclusive
                    onChange={(e, newValue) => {
                        if (newValue === 'today') {
                            setSelectedDate(moment().format('YYYY-MM-DD'));
                        } else if (newValue === 'yesterday') {
                            setSelectedDate(moment().subtract(1, 'days').format('YYYY-MM-DD'));
                        }
                        // For custom, user uses the date picker
                    }}
                    size="small"
                >
                    <ToggleButton value="today" sx={{ px: 2 }}>
                        <Today sx={{ mr: 1 }} /> Today
                    </ToggleButton>
                    <ToggleButton value="yesterday" sx={{ px: 2 }}>
                        <History sx={{ mr: 1 }} /> Yesterday
                    </ToggleButton>
                </ToggleButtonGroup>
                
                <TextField
                    type="date"
                    size="small"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                    inputProps={{ max: moment().format('YYYY-MM-DD') }}
                    sx={{ width: 180 }}
                />
                
                {!isToday && (
                    <Alert severity="info" sx={{ py: 0.5 }}>
                        Viewing historical data - Read only
                    </Alert>
                )}
            </Box>

            {/* Date Display */}
            <Typography variant="h6" color="text.secondary" sx={{ mb: 3 }}>
                {moment(selectedDate).format('dddd, MMMM D, YYYY')}
                {isToday && ' (Today)'}
                {isYesterday && ' (Yesterday)'}
            </Typography>

            {/* Main Cash Summary Section */}
            <Paper sx={{ p: 3, mb: 3, bgcolor: '#e3f2fd', border: '2px solid #1565c0' }}>
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold', color: '#1565c0', mb: 3 }}>
                    💰 Expected Cash in Drawer
                </Typography>
                
                <Grid container spacing={3}>
                    {/* Opening Balance */}
                    <Grid item xs={12} md={2}>
                        <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#f3e5f5', borderRadius: 2 }}>
                            <AccountBalance sx={{ fontSize: 40, color: '#9c27b0' }} />
                            <Typography variant="body2" color="text.secondary">Opening Balance</Typography>
                            <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#9c27b0' }}>
                                ₹{openingBalance.toLocaleString('en-IN')}
                            </Typography>
                        </Box>
                    </Grid>
                    
                    {/* Plus Sign */}
                    <Grid item xs={12} md={0.5} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography variant="h4" color="text.secondary">+</Typography>
                    </Grid>
                    
                    {/* Sales - now showing Cash Sales only */}
                    <Grid item xs={12} md={2}>
                        <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#e3f2fd', borderRadius: 2 }}>
                            <ShoppingCart sx={{ fontSize: 40, color: '#1976d2' }} />
                            <Typography variant="body2" color="text.secondary">Cash Sales</Typography>
                            <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#1976d2' }}>
                                ₹{cashSales.toLocaleString('en-IN')}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                Total: ₹{totalSales.toLocaleString('en-IN')} ({todaySummary?.totalOrders || 0} orders)
                            </Typography>
                            {totalReceivables > 0 && (
                                <Typography variant="caption" sx={{ display: 'block', color: '#ff5722', fontWeight: 'bold' }}>
                                    Credit: ₹{totalReceivables.toLocaleString('en-IN')} (not in drawer)
                                </Typography>
                            )}
                        </Box>
                    </Grid>
                    
                    {/* Plus Sign */}
                    <Grid item xs={12} md={0.5} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography variant="h4" color="text.secondary">+</Typography>
                    </Grid>
                    
                    {/* Customer Receipts */}
                    <Grid item xs={12} md={2}>
                        <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#e8f5e9', borderRadius: 2 }}>
                            <People sx={{ fontSize: 40, color: '#2e7d32' }} />
                            <Typography variant="body2" color="text.secondary">Customer Receipts</Typography>
                            <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#2e7d32' }}>
                                +₹{customerPayments.toLocaleString('en-IN')}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {paymentSummary?.summary?.customers?.count || 0} receipts
                            </Typography>
                        </Box>
                    </Grid>
                    
                    {/* Minus Sign */}
                    <Grid item xs={12} md={0.5} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography variant="h4" color="text.secondary">−</Typography>
                    </Grid>
                    
                    {/* Supplier Payments */}
                    <Grid item xs={12} md={2}>
                        <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#fff3e0', borderRadius: 2 }}>
                            <LocalShipping sx={{ fontSize: 40, color: '#e65100' }} />
                            <Typography variant="body2" color="text.secondary">Supplier Payments</Typography>
                            <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#e65100' }}>
                                −₹{supplierPayments.toLocaleString('en-IN')}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {paymentSummary?.summary?.suppliers?.count || 0} payments
                            </Typography>
                        </Box>
                    </Grid>
                    
                    {/* Minus Sign */}
                    <Grid item xs={12} md={0.5} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography variant="h4" color="text.secondary">−</Typography>
                    </Grid>
                    
                    {/* Expenses */}
                    <Grid item xs={12} md={2}>
                        <Box sx={{ textAlign: 'center', p: 2, bgcolor: '#ffebee', borderRadius: 2 }}>
                            <Receipt sx={{ fontSize: 40, color: '#c62828' }} />
                            <Typography variant="body2" color="text.secondary">Expenses</Typography>
                            <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#c62828' }}>
                                −₹{expenses.toLocaleString('en-IN')}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {paymentSummary?.summary?.expenses?.count || 0} expenses
                            </Typography>
                        </Box>
                    </Grid>
                </Grid>
                
                {/* Result Line */}
                <Divider sx={{ my: 3 }} />
                
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} md={6}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Typography variant="h6">=</Typography>
                            <Box sx={{ bgcolor: '#fff', p: 2, borderRadius: 2, border: '3px solid #1565c0', flexGrow: 1 }}>
                                <Typography variant="body2" color="text.secondary">Expected Cash in Drawer</Typography>
                                <Typography variant="h3" sx={{ fontWeight: 'bold', color: expectedCash >= 0 ? '#1565c0' : '#c62828' }}>
                                    ₹{expectedCash.toLocaleString('en-IN')}
                                </Typography>
                            </Box>
                        </Box>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <Box sx={{ 
                            bgcolor: netCashFlow >= 0 ? '#e8f5e9' : '#ffebee', 
                            p: 2, 
                            borderRadius: 2,
                            border: `2px solid ${netCashFlow >= 0 ? '#4caf50' : '#f44336'}`
                        }}>
                            <Typography variant="body2" color="text.secondary">
                                Net Cash Flow Today (Receipts - Payments - Expenses)
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {netCashFlow >= 0 ? (
                                    <TrendingUp sx={{ color: '#4caf50', fontSize: 30 }} />
                                ) : (
                                    <TrendingDown sx={{ color: '#f44336', fontSize: 30 }} />
                                )}
                                <Typography variant="h4" sx={{ fontWeight: 'bold', color: netCashFlow >= 0 ? '#2e7d32' : '#c62828' }}>
                                    {netCashFlow >= 0 ? '+' : ''}₹{netCashFlow.toLocaleString('en-IN')}
                                </Typography>
                            </Box>
                        </Box>
                    </Grid>
                </Grid>
            </Paper>

            {/* Charts Section */}
            <Grid container spacing={3} sx={{ mb: 3 }}>
                {/* Cash Flow Bar Chart */}
                <Grid item xs={12} md={8}>
                    <Paper sx={{ p: 2 }}>
                        <Typography variant="h6" gutterBottom>Cash Flow Breakdown</Typography>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={barChartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="name" />
                                <YAxis tickFormatter={(value) => `₹${Math.abs(value).toLocaleString()}`} />
                                <Tooltip 
                                    formatter={(value) => [`₹${Math.abs(value).toLocaleString('en-IN')}`, value < 0 ? 'Outflow' : 'Inflow']}
                                />
                                <Bar dataKey="amount" fill="#8884d8">
                                    {barChartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.fill} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </Paper>
                </Grid>

                {/* Pie Charts */}
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 2, height: '100%' }}>
                        <Typography variant="h6" gutterBottom>Cash Sources</Typography>
                        {cashInflowData.length > 0 ? (
                            <ResponsiveContainer width="100%" height={250}>
                                <PieChart>
                                    <Pie
                                        data={cashInflowData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={40}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                        label={({ name, value }) => `${name}: ₹${value.toLocaleString()}`}
                                        labelLine={false}
                                    >
                                        {cashInflowData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value) => `₹${value.toLocaleString('en-IN')}`} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 250 }}>
                                <Typography color="text.secondary">No cash inflows yet</Typography>
                            </Box>
                        )}
                    </Paper>
                </Grid>
            </Grid>

            {/* Set Opening Balance Card - Only show for today */}
            {isToday && (
            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <AccountBalance color="primary" />
                                Set Today's Opening Balance
                            </Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                Enter the cash amount in the drawer at the start of the day.
                            </Typography>
                            
                            {summaryData?.openingBalanceSetAt && (
                                <Alert severity="info" sx={{ mb: 2 }}>
                                    Current: ₹{openingBalance.toLocaleString('en-IN')} - Set by <strong>{summaryData?.openingBalanceSetBy}</strong> at {moment(summaryData?.openingBalanceSetAt).format('hh:mm A')}
                                </Alert>
                            )}
                            
                            <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                                <TextField
                                    label="Opening Balance Amount"
                                    type="number"
                                    value={openingBalanceInput}
                                    onChange={(e) => setOpeningBalanceInput(e.target.value)}
                                    placeholder="Enter amount"
                                    InputProps={{ 
                                        startAdornment: <Typography sx={{ mr: 1 }}>₹</Typography> 
                                    }}
                                    disabled={savingOpeningBalance}
                                    fullWidth
                                    inputProps={{ min: 0, step: 0.01 }}
                                    data-testid="opening-balance-input"
                                />
                                <Button
                                    variant="contained"
                                    onClick={handleSetOpeningBalance}
                                    disabled={savingOpeningBalance || !openingBalanceInput}
                                    sx={{ minWidth: 100, height: 56 }}
                                    data-testid="set-opening-balance-btn"
                                >
                                    {savingOpeningBalance ? <CircularProgress size={24} /> : 'SET'}
                                </Button>
                            </Box>
                            
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
                                This will be recorded with your username ({user?.username}) and timestamp.
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>

                {/* Quick Summary */}
                <Grid item xs={12} md={6}>
                    <Card sx={{ height: '100%' }}>
                        <CardContent>
                            <Typography variant="h6" gutterBottom>Today's Summary</Typography>
                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <Typography variant="body2" color="text.secondary">Orders Created</Typography>
                                    <Typography variant="h5">{summaryData?.totalOrders || 0}</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="body2" color="text.secondary">Total Sales</Typography>
                                    <Typography variant="h5" color="primary">₹{totalSales.toLocaleString('en-IN')}</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="body2" color="text.secondary">Payments Received</Typography>
                                    <Typography variant="h5" color="success.main">₹{customerPayments.toLocaleString('en-IN')}</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="body2" color="text.secondary">Payments Made</Typography>
                                    <Typography variant="h5" color="error.main">₹{(supplierPayments + expenses).toLocaleString('en-IN')}</Typography>
                                </Grid>
                            </Grid>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
            )}
            
            {/* Historical Data Summary - Show for past dates */}
            {!isToday && (
            <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid item xs={12}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <History color="primary" />
                                {moment(selectedDate).format('dddd, MMMM D, YYYY')} - Summary
                            </Typography>
                            <Grid container spacing={2}>
                                <Grid item xs={6} md={3}>
                                    <Typography variant="body2" color="text.secondary">Orders Created</Typography>
                                    <Typography variant="h5">{summaryData?.totalOrders || 0}</Typography>
                                </Grid>
                                <Grid item xs={6} md={3}>
                                    <Typography variant="body2" color="text.secondary">Total Sales</Typography>
                                    <Typography variant="h5" color="primary">₹{totalSales.toLocaleString('en-IN')}</Typography>
                                </Grid>
                                <Grid item xs={6} md={3}>
                                    <Typography variant="body2" color="text.secondary">Cash Sales</Typography>
                                    <Typography variant="h5" color="success.main">₹{cashSales.toLocaleString('en-IN')}</Typography>
                                </Grid>
                                <Grid item xs={6} md={3}>
                                    <Typography variant="body2" color="text.secondary">Credit Sales</Typography>
                                    <Typography variant="h5" color="warning.main">₹{totalReceivables.toLocaleString('en-IN')}</Typography>
                                </Grid>
                            </Grid>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
            )}

            {/* Info Section */}
            <Box sx={{ mt: 3 }}>
                <Alert severity="info">
                    <Typography variant="body2">
                        <strong>Formula:</strong> Expected Cash = Opening Balance + Sales + Customer Receipts − Supplier Payments − Expenses
                    </Typography>
                </Alert>
            </Box>
        </Box>
    );
};

export default DayStart;
