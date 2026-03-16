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
    ToggleButtonGroup,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Chip,
    IconButton,
    Collapse
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
    History,
    ExpandMore,
    ExpandLess,
    Visibility
} from '@mui/icons-material';
import { 
    ResponsiveContainer, 
    BarChart, 
    Bar, 
    XAxis, 
    YAxis, 
    CartesianGrid, 
    Tooltip, 
    Cell,
    PieChart,
    Pie
} from 'recharts';
import { useAuth } from '../../../context/AuthContext';
import { 
    useGetSummaryByDateQuery,
    useGetRealTimeSummaryQuery,
    useSetOpeningBalanceMutation 
} from '../../../store/api';
import moment from 'moment';

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
    // Card expansion state for inline detail view
    const [expandedCard, setExpandedCard] = useState(null); // 'cashSales' | 'creditSales' | 'customerReceipts' | 'supplierPayments' | 'expenses' | null

    // RTK Query hooks - automatic caching and refetch!
    // SINGLE SOURCE OF TRUTH: Real-time summary - calculated directly from orders
    // This is the only data source we need for accurate cash drawer calculations
    const {
        data: realTimeSummary,  // Already transformed by RTK Query (response.data)
        isLoading: loadingRealTime,
        isFetching: fetchingRealTime,
        refetch: refetchRealTime
    } = useGetRealTimeSummaryQuery(selectedDate, {
        refetchOnFocus: true,
        refetchOnReconnect: true,
    });
    
    // Summary for opening balance (only need this for reading/setting opening balance)
    const { 
        data: cachedSummaryData,  // Already transformed by RTK Query
        refetch: refetchCachedSummary
    } = useGetSummaryByDateQuery(selectedDate, {
        refetchOnFocus: true,
    });
    
    const [setOpeningBalance, { isLoading: savingOpeningBalance }] = useSetOpeningBalanceMutation();

    const loading = loadingRealTime;

    const handleRefreshAll = () => {
        refetchRealTime();
        refetchCachedSummary();
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

    // Calculate cash flow values - use realTimeSummary for accurate numbers
    // Real-time summary calculates directly from orders table
    // Opening balance from cached summary (this is stored in dailySummary table)
    const openingBalance = Number(cachedSummaryData?.openingBalance) || 0;
    
    // Use realTimeSummary for accurate sales breakdown
    // RTK Query already transformed response, so access fields directly
    const cashSales = Number(realTimeSummary?.cashSales) || 0;  // Only CASH mode orders
    const creditSales = Number(realTimeSummary?.creditSales) || 0;  // Outstanding dues
    const totalBusinessDone = Number(realTimeSummary?.totalBusinessDone) || 0;
    const paidOrdersCount = Number(realTimeSummary?.paidOrdersCount) || 0;
    const totalOrdersCount = Number(realTimeSummary?.totalOrders) || 0;
    const cashOrdersCount = Number(realTimeSummary?.cashOrdersCount) || 0;
    const creditOrdersCount = Number(realTimeSummary?.creditOrdersCount) || 0;
    
    // Total sales = Cash Sales + Credit Sales (all orders)
    const totalSales = totalBusinessDone;
    // Receivables = Credit Sales (unpaid amounts)
    const totalReceivables = creditSales;
    
    // Use real-time data for all payment info to ensure consistency
    // These receipts are ONLY for past dues (not today's order payments)
    const customerPayments = Number(realTimeSummary?.customerReceipts) || 0;
    const customerReceiptsCount = Number(realTimeSummary?.customerReceiptsCount) || 0;
    const supplierPayments = Number(realTimeSummary?.supplierPayments) || 0;
    const supplierPaymentsCount = Number(realTimeSummary?.supplierPaymentsCount) || 0;
    const expenses = Number(realTimeSummary?.expenses) || 0;
    
    // Expected cash = Opening + Cash Sales (CASH mode orders ONLY) + Customer Receipts - Supplier Payments - Expenses
    // Cash Sales = SUM(total) from orders WHERE paymentMode='CASH' (set at creation, never changes)
    // Customer Receipts = all customer payments excluding synthetic PAY-TOGGLE records
    const expectedCash = openingBalance + cashSales + customerPayments - supplierPayments - expenses;
    const netCashFlow = cashSales + customerPayments - supplierPayments - expenses;

    // Prepare chart data
    const cashInflowData = [
        { name: 'Opening Balance', value: openingBalance, color: '#9c27b0' },
        { name: 'Cash Sales', value: cashSales, color: '#2196f3' },
        { name: 'Customer Receipts', value: customerPayments, color: '#4caf50' },
    ].filter(item => item.value > 0);

    const barChartData = [
        { name: 'Opening', amount: openingBalance, fill: '#9c27b0' },
        { name: 'Cash Sales', amount: cashSales, fill: '#2196f3' },
        { name: 'Credit Sales', amount: creditSales, fill: '#ff5722' },
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
                    {fetchingRealTime && <CircularProgress size={20} />}
                    <Button
                        startIcon={<Refresh />}
                        onClick={handleRefreshAll}
                        variant="outlined"
                        disabled={fetchingRealTime}
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
                        <Box 
                            data-testid="cash-sales-card"
                            onClick={() => setExpandedCard(prev => prev === 'cashSales' ? null : 'cashSales')}
                            sx={{ 
                                textAlign: 'center', p: 2, bgcolor: expandedCard === 'cashSales' ? '#bbdefb' : '#e3f2fd', 
                                borderRadius: 2, cursor: 'pointer', 
                                border: expandedCard === 'cashSales' ? '2px solid #1976d2' : '2px solid transparent',
                                '&:hover': { bgcolor: '#bbdefb', transform: 'translateY(-2px)' }, 
                                transition: 'all 0.2s' 
                            }}
                        >
                            <ShoppingCart sx={{ fontSize: 40, color: '#1976d2' }} />
                            <Typography variant="body2" color="text.secondary">Cash Sales</Typography>
                            <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#1976d2' }}>
                                ₹{cashSales.toLocaleString('en-IN')}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {cashOrdersCount} cash orders
                            </Typography>
                            {creditSales > 0 && (
                                <Typography variant="caption" sx={{ display: 'block', color: '#ff5722', fontWeight: 'bold', cursor: 'pointer' }}
                                    onClick={(e) => { e.stopPropagation(); setExpandedCard(prev => prev === 'creditSales' ? null : 'creditSales'); }}>
                                    Credit: ₹{creditSales.toLocaleString('en-IN')} (not in drawer)
                                </Typography>
                            )}
                            <Visibility sx={{ fontSize: 14, color: '#999', mt: 0.5 }} />
                        </Box>
                    </Grid>
                    
                    {/* Plus Sign */}
                    <Grid item xs={12} md={0.5} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography variant="h4" color="text.secondary">+</Typography>
                    </Grid>
                    
                    {/* Customer Receipts */}
                    <Grid item xs={12} md={2}>
                        <Box 
                            data-testid="customer-receipts-card"
                            onClick={() => setExpandedCard(prev => prev === 'customerReceipts' ? null : 'customerReceipts')}
                            sx={{ 
                                textAlign: 'center', p: 2, bgcolor: expandedCard === 'customerReceipts' ? '#c8e6c9' : '#e8f5e9', 
                                borderRadius: 2, cursor: 'pointer',
                                border: expandedCard === 'customerReceipts' ? '2px solid #4caf50' : '2px solid transparent',
                                '&:hover': { bgcolor: '#c8e6c9', transform: 'translateY(-2px)' }, 
                                transition: 'all 0.2s' 
                            }}
                        >
                            <People sx={{ fontSize: 40, color: '#2e7d32' }} />
                            <Typography variant="body2" color="text.secondary">Customer Receipts</Typography>
                            <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#2e7d32' }}>
                                +₹{customerPayments.toLocaleString('en-IN')}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {customerReceiptsCount} receipts
                            </Typography>
                            <br/><Visibility sx={{ fontSize: 14, color: '#999', mt: 0.5 }} />
                        </Box>
                    </Grid>
                    
                    {/* Minus Sign */}
                    <Grid item xs={12} md={0.5} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography variant="h4" color="text.secondary">−</Typography>
                    </Grid>
                    
                    {/* Supplier Payments */}
                    <Grid item xs={12} md={2}>
                        <Box 
                            data-testid="supplier-payments-card"
                            onClick={() => setExpandedCard(prev => prev === 'supplierPayments' ? null : 'supplierPayments')}
                            sx={{ 
                                textAlign: 'center', p: 2, bgcolor: expandedCard === 'supplierPayments' ? '#ffe0b2' : '#fff3e0', 
                                borderRadius: 2, cursor: 'pointer',
                                border: expandedCard === 'supplierPayments' ? '2px solid #ff9800' : '2px solid transparent',
                                '&:hover': { bgcolor: '#ffe0b2', transform: 'translateY(-2px)' }, 
                                transition: 'all 0.2s' 
                            }}
                        >
                            <LocalShipping sx={{ fontSize: 40, color: '#e65100' }} />
                            <Typography variant="body2" color="text.secondary">Supplier Payments</Typography>
                            <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#e65100' }}>
                                −₹{supplierPayments.toLocaleString('en-IN')}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {supplierPaymentsCount} payments
                            </Typography>
                            <br/><Visibility sx={{ fontSize: 14, color: '#999', mt: 0.5 }} />
                        </Box>
                    </Grid>
                    
                    {/* Minus Sign */}
                    <Grid item xs={12} md={0.5} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography variant="h4" color="text.secondary">−</Typography>
                    </Grid>
                    
                    {/* Expenses */}
                    <Grid item xs={12} md={2}>
                        <Box 
                            data-testid="expenses-card"
                            onClick={() => setExpandedCard(prev => prev === 'expenses' ? null : 'expenses')}
                            sx={{ 
                                textAlign: 'center', p: 2, bgcolor: expandedCard === 'expenses' ? '#ffcdd2' : '#ffebee', 
                                borderRadius: 2, cursor: 'pointer',
                                border: expandedCard === 'expenses' ? '2px solid #f44336' : '2px solid transparent',
                                '&:hover': { bgcolor: '#ffcdd2', transform: 'translateY(-2px)' }, 
                                transition: 'all 0.2s' 
                            }}
                        >
                            <Receipt sx={{ fontSize: 40, color: '#c62828' }} />
                            <Typography variant="body2" color="text.secondary">Expenses</Typography>
                            <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#c62828' }}>
                                −₹{expenses.toLocaleString('en-IN')}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                {Number(realTimeSummary?.expensesCount) || 0} expenses
                            </Typography>
                            <br/><Visibility sx={{ fontSize: 14, color: '#999', mt: 0.5 }} />
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

            {/* Inline Expanded Details — shows records when a card is clicked */}
            <Collapse in={!!expandedCard} timeout={300}>
                {expandedCard && (
                <Paper 
                    elevation={3}
                    data-testid="day-start-expanded-details"
                    sx={{ 
                        mb: 3, 
                        border: expandedCard === 'cashSales' || expandedCard === 'creditSales' ? '2px solid #1976d2' : 
                               expandedCard === 'customerReceipts' ? '2px solid #4caf50' : 
                               expandedCard === 'supplierPayments' ? '2px solid #ff9800' : '2px solid #f44336',
                        borderRadius: 2, overflow: 'hidden'
                    }}
                >
                    <Box sx={{ 
                        p: 2, 
                        bgcolor: expandedCard === 'cashSales' || expandedCard === 'creditSales' ? '#e3f2fd' : 
                                 expandedCard === 'customerReceipts' ? '#e8f5e9' : 
                                 expandedCard === 'supplierPayments' ? '#fff3e0' : '#ffebee',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center' 
                    }}>
                        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {(expandedCard === 'cashSales' || expandedCard === 'creditSales') && <ShoppingCart color="primary" />}
                            {expandedCard === 'customerReceipts' && <People color="success" />}
                            {expandedCard === 'supplierPayments' && <LocalShipping color="warning" />}
                            {expandedCard === 'expenses' && <Receipt sx={{ color: '#d32f2f' }} />}
                            {expandedCard === 'cashSales' ? `Cash Sales — ${cashOrdersCount} Orders` : 
                             expandedCard === 'creditSales' ? `Credit Sales — ${creditOrdersCount} Orders` :
                             expandedCard === 'customerReceipts' ? `Customer Receipts — ${customerReceiptsCount} Receipts` : 
                             expandedCard === 'supplierPayments' ? `Supplier Payments — ${supplierPaymentsCount} Payments` : 
                             `Expenses — ${Number(realTimeSummary?.expensesCount) || 0} Records`}
                        </Typography>
                        <IconButton onClick={() => setExpandedCard(null)} size="small"><ExpandLess /></IconButton>
                    </Box>

                    {/* CASH SALES - Order records */}
                    {expandedCard === 'cashSales' && (
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                        <TableCell sx={{ fontWeight: 'bold' }}>#</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Invoice #</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Time</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Customer</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Mode</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Amount</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {(realTimeSummary?.cashOrderRecords || []).map((order, idx) => (
                                        <TableRow key={order.id} hover sx={{ '&:nth-of-type(odd)': { bgcolor: 'rgba(0,0,0,0.02)' } }}>
                                            <TableCell>{idx + 1}</TableCell>
                                            <TableCell><Typography variant="body2" fontWeight="bold" sx={{ fontFamily: 'monospace' }}>{order.orderNumber}</Typography></TableCell>
                                            <TableCell>{moment(order.createdAt).format('hh:mm A')}</TableCell>
                                            <TableCell><Typography fontWeight="bold">{order.customerName || 'Walk-in'}</Typography></TableCell>
                                            <TableCell><Chip label="CASH" size="small" color="primary" /></TableCell>
                                            <TableCell align="right"><Typography fontWeight="bold" color="primary">₹{Number(order.total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Typography></TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow sx={{ bgcolor: '#bbdefb' }}>
                                        <TableCell colSpan={5}><Typography fontWeight="bold">Total ({(realTimeSummary?.cashOrderRecords || []).length} orders)</Typography></TableCell>
                                        <TableCell align="right"><Typography fontWeight="bold" variant="h6" color="primary">₹{cashSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Typography></TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}

                    {/* CREDIT SALES - Credit order records */}
                    {expandedCard === 'creditSales' && (
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                        <TableCell sx={{ fontWeight: 'bold' }}>#</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Invoice #</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Time</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Customer</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Total</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Due</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {(realTimeSummary?.creditOrderRecords || []).map((order, idx) => (
                                        <TableRow key={order.id} hover sx={{ '&:nth-of-type(odd)': { bgcolor: 'rgba(0,0,0,0.02)' } }}>
                                            <TableCell>{idx + 1}</TableCell>
                                            <TableCell><Typography variant="body2" fontWeight="bold" sx={{ fontFamily: 'monospace' }}>{order.orderNumber}</Typography></TableCell>
                                            <TableCell>{moment(order.createdAt).format('hh:mm A')}</TableCell>
                                            <TableCell><Typography fontWeight="bold">{order.customerName || 'Walk-in'}</Typography></TableCell>
                                            <TableCell><Chip label={order.paymentStatus} size="small" color={order.paymentStatus === 'paid' ? 'success' : order.paymentStatus === 'partial' ? 'warning' : 'error'} /></TableCell>
                                            <TableCell align="right">₹{Number(order.total).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</TableCell>
                                            <TableCell align="right"><Typography fontWeight="bold" color="error.main">₹{Number(order.dueAmount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Typography></TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow sx={{ bgcolor: '#ffcdd2' }}>
                                        <TableCell colSpan={6}><Typography fontWeight="bold">Total Credit ({(realTimeSummary?.creditOrderRecords || []).length} orders)</Typography></TableCell>
                                        <TableCell align="right"><Typography fontWeight="bold" variant="h6" color="error.main">₹{creditSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Typography></TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}

                    {/* CUSTOMER RECEIPTS - Payment records */}
                    {expandedCard === 'customerReceipts' && (
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                        <TableCell sx={{ fontWeight: 'bold' }}>#</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Receipt #</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Time</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Customer</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Amount</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Reference</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Notes</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {(realTimeSummary?.customerReceiptRecords || []).map((p, idx) => (
                                        <TableRow key={p.id} hover sx={{ '&:nth-of-type(odd)': { bgcolor: 'rgba(0,0,0,0.02)' } }}>
                                            <TableCell>{idx + 1}</TableCell>
                                            <TableCell><Typography variant="body2" fontWeight="bold" sx={{ fontFamily: 'monospace' }}>{p.paymentNumber}</Typography></TableCell>
                                            <TableCell>{moment(p.createdAt).format('hh:mm A')}</TableCell>
                                            <TableCell><Typography fontWeight="bold">{p.partyName}</Typography></TableCell>
                                            <TableCell align="right"><Typography fontWeight="bold" color="success.main">+₹{Number(p.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Typography></TableCell>
                                            <TableCell><Chip label={p.referenceType || '-'} size="small" variant="outlined" /></TableCell>
                                            <TableCell><Typography variant="body2" color="text.secondary">{p.notes || '-'}</Typography></TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow sx={{ bgcolor: '#c8e6c9' }}>
                                        <TableCell colSpan={4}><Typography fontWeight="bold">Total ({(realTimeSummary?.customerReceiptRecords || []).length} receipts)</Typography></TableCell>
                                        <TableCell align="right"><Typography fontWeight="bold" variant="h6" color="success.main">₹{customerPayments.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Typography></TableCell>
                                        <TableCell colSpan={2}></TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}

                    {/* SUPPLIER PAYMENTS */}
                    {expandedCard === 'supplierPayments' && (
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                        <TableCell sx={{ fontWeight: 'bold' }}>#</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Payment #</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Time</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Supplier</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Amount</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Reference</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Notes</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {(realTimeSummary?.supplierPaymentRecords || []).map((p, idx) => (
                                        <TableRow key={p.id} hover sx={{ '&:nth-of-type(odd)': { bgcolor: 'rgba(0,0,0,0.02)' } }}>
                                            <TableCell>{idx + 1}</TableCell>
                                            <TableCell><Typography variant="body2" fontWeight="bold" sx={{ fontFamily: 'monospace' }}>{p.paymentNumber}</Typography></TableCell>
                                            <TableCell>{moment(p.createdAt).format('hh:mm A')}</TableCell>
                                            <TableCell><Typography fontWeight="bold">{p.partyName}</Typography></TableCell>
                                            <TableCell align="right"><Typography fontWeight="bold" color="warning.main">-₹{Number(p.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Typography></TableCell>
                                            <TableCell><Chip label={p.referenceType || '-'} size="small" variant="outlined" /></TableCell>
                                            <TableCell><Typography variant="body2" color="text.secondary">{p.notes || '-'}</Typography></TableCell>
                                        </TableRow>
                                    ))}
                                    {(realTimeSummary?.supplierPaymentRecords || []).length === 0 && (
                                        <TableRow><TableCell colSpan={7}><Alert severity="info">No supplier payments for this date</Alert></TableCell></TableRow>
                                    )}
                                    {(realTimeSummary?.supplierPaymentRecords || []).length > 0 && (
                                        <TableRow sx={{ bgcolor: '#ffe0b2' }}>
                                            <TableCell colSpan={4}><Typography fontWeight="bold">Total ({(realTimeSummary?.supplierPaymentRecords || []).length} payments)</Typography></TableCell>
                                            <TableCell align="right"><Typography fontWeight="bold" variant="h6" color="warning.main">₹{supplierPayments.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Typography></TableCell>
                                            <TableCell colSpan={2}></TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}

                    {/* EXPENSES */}
                    {expandedCard === 'expenses' && (
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                        <TableCell sx={{ fontWeight: 'bold' }}>#</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Payment #</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Time</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Description</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Amount</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Notes</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {(realTimeSummary?.expenseRecords || []).map((p, idx) => (
                                        <TableRow key={p.id} hover sx={{ '&:nth-of-type(odd)': { bgcolor: 'rgba(0,0,0,0.02)' } }}>
                                            <TableCell>{idx + 1}</TableCell>
                                            <TableCell><Typography variant="body2" fontWeight="bold" sx={{ fontFamily: 'monospace' }}>{p.paymentNumber}</Typography></TableCell>
                                            <TableCell>{moment(p.createdAt).format('hh:mm A')}</TableCell>
                                            <TableCell><Typography fontWeight="bold">{p.partyName}</Typography></TableCell>
                                            <TableCell align="right"><Typography fontWeight="bold" color="error.main">-₹{Number(p.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Typography></TableCell>
                                            <TableCell><Typography variant="body2" color="text.secondary">{p.notes || '-'}</Typography></TableCell>
                                        </TableRow>
                                    ))}
                                    {(realTimeSummary?.expenseRecords || []).length === 0 && (
                                        <TableRow><TableCell colSpan={6}><Alert severity="info">No expenses for this date</Alert></TableCell></TableRow>
                                    )}
                                    {(realTimeSummary?.expenseRecords || []).length > 0 && (
                                        <TableRow sx={{ bgcolor: '#ffcdd2' }}>
                                            <TableCell colSpan={4}><Typography fontWeight="bold">Total ({(realTimeSummary?.expenseRecords || []).length} expenses)</Typography></TableCell>
                                            <TableCell align="right"><Typography fontWeight="bold" variant="h6" color="error.main">₹{expenses.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Typography></TableCell>
                                            <TableCell></TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </Paper>
                )}
            </Collapse>

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
                            
                            {cachedSummaryData?.openingBalanceSetAt && (
                                <Alert severity="info" sx={{ mb: 2 }}>
                                    Current: ₹{openingBalance.toLocaleString('en-IN')} - Set by <strong>{cachedSummaryData?.openingBalanceSetBy}</strong> at {moment(cachedSummaryData?.openingBalanceSetAt).format('hh:mm A')}
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
                                    <Typography variant="h5">{totalOrdersCount}</Typography>
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
                                    <Typography variant="h5">{totalOrdersCount}</Typography>
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
