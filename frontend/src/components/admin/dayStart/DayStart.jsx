import React, { useState, useEffect } from 'react';
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
    ExpandLess,
    Visibility,
    PictureAsPdf,
    Warning,
    EventBusy
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
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';

pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts;

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

    // Overdue customers (dues > 20 days)
    const [overdueCustomers, setOverdueCustomers] = useState([]);
    const [overdueLoading, setOverdueLoading] = useState(false);

    useEffect(() => {
        const fetchOverdue = async () => {
            setOverdueLoading(true);
            try {
                const token = localStorage.getItem('token');
                const res = await fetch('/api/customers/overdue?days=20', {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const json = await res.json();
                setOverdueCustomers(json.data || []);
            } catch (e) {
                console.error('Failed to fetch overdue customers', e);
            } finally {
                setOverdueLoading(false);
            }
        };
        fetchOverdue();
    }, []);

    // RTK Query hooks - automatic caching and refetch!
    // SINGLE SOURCE OF TRUTH: Real-time summary - calculated directly from orders
    // This is the only data source we need for accurate cash drawer calculations
    const {
        data: realTimeSummary,  // Already transformed by RTK Query (response.data)
        isLoading: loadingRealTime,
        isFetching: fetchingRealTime,
        isError: realTimeError,
        refetch: refetchRealTime
    } = useGetRealTimeSummaryQuery(selectedDate, { refetchOnMountOrArgChange: true });

    const {
        data: cachedSummaryData,
        refetch: refetchCachedSummary
    } = useGetSummaryByDateQuery(selectedDate);
    
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
    const loansCashIn = Number(realTimeSummary?.loansCashIn) || 0;
    const loansCashOut = Number(realTimeSummary?.loansCashOut) || 0;

    // Expected cash = Opening + Cash Sales + Customer Receipts + Loans In - Supplier Payments - Expenses - Loans Out
    const expectedCash = openingBalance + cashSales + customerPayments + loansCashIn - supplierPayments - expenses - loansCashOut;
    const netCashFlow = cashSales + customerPayments + loansCashIn - supplierPayments - expenses - loansCashOut;

    // Prepare chart data
    const cashInflowData = [
        { name: 'Opening Balance', value: openingBalance, color: '#9c27b0' },
        { name: 'Cash Sales', value: cashSales, color: '#2196f3' },
        { name: 'Customer Receipts', value: customerPayments, color: '#4caf50' },
        { name: 'Loan Repayments In', value: loansCashIn, color: '#00acc1' },
    ].filter(item => item.value > 0);

    const barChartData = [
        { name: 'Opening', amount: openingBalance, fill: '#9c27b0' },
        { name: 'Cash Sales', amount: cashSales, fill: '#2196f3' },
        { name: 'Credit Sales', amount: creditSales, fill: '#ff5722' },
        { name: 'Received', amount: customerPayments, fill: '#4caf50' },
        { name: 'Loans In', amount: loansCashIn, fill: '#00acc1' },
        { name: 'Loans Out', amount: -loansCashOut, fill: '#0077b6' },
        { name: 'Paid Out', amount: -supplierPayments, fill: '#ff9800' },
        { name: 'Expenses', amount: -expenses, fill: '#f44336' },
        { name: 'Expected', amount: expectedCash, fill: '#00bcd4' },
    ];

    const downloadDayClosePDF = () => {
        const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
        const dateLabel = moment(selectedDate).format('DD MMM YYYY (dddd)');
        const generatedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

        // Top customers from cashOrderRecords
        const cashRecords = realTimeSummary?.cashOrderRecords || [];
        const topCustomers = Object.values(
            cashRecords.reduce((acc, o) => {
                const name = o.customerName || 'Walk-in';
                if (!acc[name]) acc[name] = { name, total: 0, orders: 0 };
                acc[name].total += Number(o.total) || 0;
                acc[name].orders += 1;
                return acc;
            }, {})
        ).sort((a, b) => b.total - a.total).slice(0, 5);

        const summaryTable = {
            table: {
                widths: ['*', 100],
                body: [
                    [{ text: 'Description', style: 'th' }, { text: 'Amount (₹)', style: 'th', alignment: 'right' }],
                    [{ text: 'Opening Balance', color: '#555' }, { text: fmt(openingBalance), alignment: 'right', color: '#9c27b0', bold: true }],
                    [{ text: '+ Cash Sales', color: '#1565C0' }, { text: fmt(cashSales), alignment: 'right', color: '#1565C0', bold: true }],
                    [{ text: '+ Customer Receipts (dues collected)', color: '#2E7D32' }, { text: fmt(customerPayments), alignment: 'right', color: '#2E7D32', bold: true }],
                    [{ text: '− Supplier Payments', color: '#E65100' }, { text: `(${fmt(supplierPayments)})`, alignment: 'right', color: '#E65100' }],
                    [{ text: '− Expenses', color: '#C62828' }, { text: `(${fmt(expenses)})`, alignment: 'right', color: '#C62828' }],
                    [{ text: 'Expected Cash in Drawer', bold: true, fontSize: 11 }, { text: fmt(expectedCash), alignment: 'right', bold: true, fontSize: 12, color: expectedCash >= 0 ? '#2E7D32' : '#C62828' }],
                ]
            },
            layout: {
                hLineColor: (i) => i === 0 || i === 1 || i === 7 ? '#1565C0' : '#ddd',
                vLineColor: () => '#eee',
                fillColor: (i) => i === 0 ? '#E3F2FD' : i === 6 ? '#E8F5E9' : i % 2 === 0 ? '#FAFAFA' : null,
            }
        };

        const salesTable = {
            table: {
                widths: ['*', 80, 80, 80],
                body: [
                    [
                        { text: 'Sales Type', style: 'th' },
                        { text: 'Orders', style: 'th', alignment: 'right' },
                        { text: 'Amount (₹)', style: 'th', alignment: 'right' },
                        { text: 'Status', style: 'th', alignment: 'center' }
                    ],
                    [
                        { text: 'Cash Sales (CASH mode, paid)' },
                        { text: String(cashOrdersCount), alignment: 'right' },
                        { text: fmt(cashSales), alignment: 'right', color: '#1565C0', bold: true },
                        { text: 'In Drawer', alignment: 'center', color: '#2E7D32', italics: true }
                    ],
                    [
                        { text: 'Credit / Outstanding Sales' },
                        { text: String(creditOrdersCount), alignment: 'right' },
                        { text: fmt(creditSales), alignment: 'right', color: '#C62828', bold: true },
                        { text: 'Pending', alignment: 'center', color: '#C62828', italics: true }
                    ],
                    [
                        { text: 'Total Business Done', bold: true },
                        { text: String(totalOrdersCount), alignment: 'right', bold: true },
                        { text: fmt(totalBusinessDone), alignment: 'right', bold: true },
                        { text: '', alignment: 'center' }
                    ],
                ]
            },
            layout: {
                hLineColor: (i) => i === 0 || i === 1 ? '#1565C0' : '#ddd',
                vLineColor: () => '#eee',
                fillColor: (i) => i === 0 ? '#E3F2FD' : i === 4 ? '#F1F8E9' : null,
            }
        };

        const topCustRows = topCustomers.length > 0
            ? topCustomers.map((c, i) => [
                { text: `${i + 1}. ${c.name}` },
                { text: String(c.orders), alignment: 'right' },
                { text: fmt(c.total), alignment: 'right', bold: true, color: '#1565C0' }
              ])
            : [[{ text: 'No cash orders today', colSpan: 3, italics: true, color: '#999' }, {}, {}]];

        const topCustTable = {
            table: {
                widths: ['*', 60, 90],
                body: [
                    [{ text: 'Customer', style: 'th' }, { text: 'Orders', style: 'th', alignment: 'right' }, { text: 'Cash Amount (₹)', style: 'th', alignment: 'right' }],
                    ...topCustRows
                ]
            },
            layout: {
                hLineColor: (i) => i === 0 || i === 1 ? '#1565C0' : '#ddd',
                vLineColor: () => '#eee',
                fillColor: (i) => i === 0 ? '#E3F2FD' : i % 2 === 0 ? '#FAFAFA' : null,
            }
        };

        const docDef = {
            pageSize: 'A4',
            pageMargins: [30, 40, 30, 40],
            content: [
                { text: 'RISHABH STEEL CENTRE', style: 'companyName' },
                { text: 'Specialist in: Wholesale in Utensils and All Items', style: 'companySubtitle' },
                { text: 'A-22, Sujata Shopping Centre, Navghar Road, Bhayandar (E), Dist. Thane - 401 105', style: 'companyAddress' },
                { text: 'Mobile: 9322674294 | 9137248501 | 9987798562', style: 'companyAddress' },
                { canvas: [{ type: 'line', x1: 0, y1: 4, x2: 535, y2: 4, lineWidth: 1 }] },
                { text: 'DAY CLOSE REPORT', style: 'reportTitle', margin: [0, 10, 0, 2] },
                { text: dateLabel, style: 'dateLabel', margin: [0, 0, 0, 12] },

                { text: 'Cash Drawer Summary', style: 'sectionTitle' },
                summaryTable,

                { text: 'Sales Breakdown', style: 'sectionTitle', margin: [0, 14, 0, 4] },
                salesTable,

                { text: `Top ${topCustomers.length || 0} Cash Customers Today`, style: 'sectionTitle', margin: [0, 14, 0, 4] },
                topCustTable,

                { text: `Generated: ${generatedAt}`, fontSize: 8, color: '#aaa', margin: [0, 12, 0, 0], alignment: 'right' }
            ],
            styles: {
                companyName:     { fontSize: 16, bold: true, alignment: 'center', color: '#1565C0' },
                companySubtitle: { fontSize: 9, alignment: 'center', color: '#555', margin: [0, 2, 0, 2] },
                companyAddress:  { fontSize: 8, alignment: 'center', color: '#777' },
                reportTitle:     { fontSize: 14, bold: true, alignment: 'center', color: '#1565C0' },
                dateLabel:       { fontSize: 11, alignment: 'center', color: '#555' },
                sectionTitle:    { fontSize: 11, bold: true, color: '#1565C0', margin: [0, 4, 0, 4] },
                th:              { bold: true, fontSize: 9, color: '#1565C0' },
            },
            defaultStyle: { fontSize: 9, font: 'Roboto' }
        };

        pdfMake.createPdf(docDef).download(`day_close_${selectedDate}.pdf`);
    };

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ p: 2 }}>
            {realTimeError && (
                <Alert severity="error" sx={{ mb: 2 }} action={
                    <Button size="small" onClick={handleRefreshAll}>Retry</Button>
                }>
                    Failed to load today's data from server. Check if the backend is running and try Refresh.
                </Alert>
            )}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AccountBalance color="primary" />
                    Day Start - Cash Management
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    {fetchingRealTime && <CircularProgress size={20} />}
                    <Button
                        startIcon={<PictureAsPdf />}
                        onClick={downloadDayClosePDF}
                        variant="contained"
                        color="error"
                        disabled={!realTimeSummary}
                        title="Download Day Close Report PDF"
                    >
                        Day Close PDF
                    </Button>
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
                            <Visibility sx={{ fontSize: 14, color: '#999', mt: 0.5 }} />
                        </Box>
                    </Grid>

                    {/* Divider - Credit Sales is shown separately below, it is NOT counted in Expected Cash */}
                    {creditSales > 0 && (
                        <Grid item xs={12} md={0.5} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Typography variant="h5" color="text.disabled">|</Typography>
                        </Grid>
                    )}

                    {/* Credit Sales - kept fully separate from Cash Sales. This money is NOT in the drawer. */}
                    {creditSales > 0 && (
                        <Grid item xs={12} md={2}>
                            <Box
                                data-testid="credit-sales-card"
                                onClick={() => setExpandedCard(prev => prev === 'creditSales' ? null : 'creditSales')}
                                sx={{
                                    textAlign: 'center', p: 2, bgcolor: expandedCard === 'creditSales' ? '#ffccbc' : '#fbe9e7',
                                    borderRadius: 2, cursor: 'pointer',
                                    border: expandedCard === 'creditSales' ? '2px solid #ff5722' : '2px dashed #ff5722',
                                    '&:hover': { bgcolor: '#ffccbc', transform: 'translateY(-2px)' },
                                    transition: 'all 0.2s'
                                }}
                            >
                                <ShoppingCart sx={{ fontSize: 40, color: '#ff5722' }} />
                                <Typography variant="body2" color="text.secondary">Credit Sales</Typography>
                                <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#ff5722' }}>
                                    ₹{creditSales.toLocaleString('en-IN')}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {creditOrdersCount} credit orders
                                </Typography>
                                <Typography variant="caption" sx={{ display: 'block', color: '#ff5722', fontWeight: 'bold' }}>
                                    (not in drawer)
                                </Typography>
                                <Visibility sx={{ fontSize: 14, color: '#999', mt: 0.5 }} />
                            </Box>
                        </Grid>
                    )}

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

                    {/* Loan query error indicator */}
                    {realTimeSummary?.loanQueryError && (
                        <Grid item xs={12}>
                            <Alert severity="error" sx={{ py: 0.5 }}>
                                Loan cash flow unavailable: {realTimeSummary.loanQueryError}
                            </Alert>
                        </Grid>
                    )}

                    {/* Loan Cash Flow — always render so missing data is visible */}
                    <>
                        <Grid item xs={12} md={0.5} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Typography variant="h4" color="text.secondary">+</Typography>
                        </Grid>
                        <Grid item xs={12} md={2}>
                            <Box
                                onClick={() => loansCashIn > 0 && setExpandedCard(prev => prev === 'loansIn' ? null : 'loansIn')}
                                sx={{ textAlign: 'center', p: 2, bgcolor: expandedCard === 'loansIn' ? '#b2ebf2' : '#e0f7fa', borderRadius: 2, cursor: loansCashIn > 0 ? 'pointer' : 'default', border: expandedCard === 'loansIn' ? '2px solid #00acc1' : '2px solid transparent', '&:hover': loansCashIn > 0 ? { bgcolor: '#b2ebf2' } : {}, transition: 'all 0.2s' }}
                            >
                                <Typography variant="body2" color="text.secondary">Loan Repayments In</Typography>
                                <Typography variant="h5" sx={{ fontWeight: 'bold', color: loansCashIn > 0 ? '#00838f' : 'text.disabled' }}>
                                    +₹{loansCashIn.toLocaleString('en-IN')}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {(realTimeSummary?.loanCashInRecords || []).length} entries
                                </Typography>
                                {loansCashIn > 0 && <><br/><Visibility sx={{ fontSize: 14, color: '#999', mt: 0.5 }} /></>}
                            </Box>
                        </Grid>
                        <Grid item xs={12} md={0.5} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Typography variant="h4" color="text.secondary">−</Typography>
                        </Grid>
                        <Grid item xs={12} md={2}>
                            <Box
                                onClick={() => loansCashOut > 0 && setExpandedCard(prev => prev === 'loansOut' ? null : 'loansOut')}
                                sx={{ textAlign: 'center', p: 2, bgcolor: expandedCard === 'loansOut' ? '#bbdefb' : '#e3f2fd', borderRadius: 2, cursor: loansCashOut > 0 ? 'pointer' : 'default', border: expandedCard === 'loansOut' ? '2px solid #0077b6' : '2px solid transparent', '&:hover': loansCashOut > 0 ? { bgcolor: '#bbdefb' } : {}, transition: 'all 0.2s' }}
                            >
                                <Typography variant="body2" color="text.secondary">Loans Given Out</Typography>
                                <Typography variant="h5" sx={{ fontWeight: 'bold', color: loansCashOut > 0 ? '#01579b' : 'text.disabled' }}>
                                    −₹{loansCashOut.toLocaleString('en-IN')}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {(realTimeSummary?.loanCashOutRecords || []).length} entries
                                </Typography>
                                {loansCashOut > 0 && <><br/><Visibility sx={{ fontSize: 14, color: '#999', mt: 0.5 }} /></>}
                            </Box>
                        </Grid>
                    </>
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

            {/* Backdated invoices warning — only shown for today */}
            {isToday && (realTimeSummary?.backdatedOrdersCreatedToday?.length > 0) && (() => {
                const bdOrders = realTimeSummary.backdatedOrdersCreatedToday;
                const bdTotal = bdOrders.reduce((s, o) => s + (Number(o.total) || 0), 0);
                const bdCash  = bdOrders
                    .filter(o => o.paymentMode === 'CASH')
                    .reduce((s, o) => s + (Number(o.paidAmount) || 0), 0);
                const fmt = n => `₹${Number(n || 0).toLocaleString('en-IN')}`;
                return (
                    <Paper sx={{ mb: 3, border: '2px solid #f57c00', borderRadius: 2, overflow: 'hidden' }}>
                        <Box sx={{ bgcolor: '#e65100', color: '#fff', px: 2, py: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <EventBusy sx={{ fontSize: 20 }} />
                            <Typography variant="subtitle2" fontWeight={700} sx={{ letterSpacing: 0.3 }}>
                                {bdOrders.length} Backdated Invoice{bdOrders.length > 1 ? 's' : ''} Created Today — NOT in Today's Cash Drawer
                            </Typography>
                        </Box>
                        <Box sx={{ px: 2, py: 1.5 }}>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                                These invoices were physically created today but carry a past date. Cash collected for them is counted in their respective invoice dates, <strong>not today</strong>.
                            </Typography>
                            <Box sx={{ display: 'flex', gap: 2, mb: 1.5, flexWrap: 'wrap' }}>
                                <Chip label={`Total value: ${fmt(bdTotal)}`} size="small" sx={{ bgcolor: '#fff3e0', color: '#e65100', fontWeight: 700 }} />
                                {bdCash > 0 && (
                                    <Chip label={`Cash collected: ${fmt(bdCash)}`} size="small" sx={{ bgcolor: '#ffebee', color: '#c62828', fontWeight: 700 }} icon={<Warning sx={{ fontSize: '14px !important', color: '#c62828 !important' }} />} />
                                )}
                            </Box>
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow sx={{ '& th': { bgcolor: '#fff8e1', fontWeight: 700, fontSize: '0.78rem', py: 0.75 } }}>
                                            <TableCell>Invoice #</TableCell>
                                            <TableCell>Customer</TableCell>
                                            <TableCell>Invoice Date</TableCell>
                                            <TableCell>Mode</TableCell>
                                            <TableCell align="right">Total</TableCell>
                                            <TableCell>Status</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {bdOrders.map(o => (
                                            <TableRow key={o.id} hover>
                                                <TableCell><Typography variant="body2" fontWeight={700} sx={{ fontFamily: 'monospace' }}>{o.orderNumber}</Typography></TableCell>
                                                <TableCell>{o.customerName || 'Walk-in'}</TableCell>
                                                <TableCell>
                                                    <Chip label={o.orderDate} size="small" color="warning" variant="outlined" sx={{ fontSize: '0.72rem', height: 20 }} />
                                                </TableCell>
                                                <TableCell>
                                                    <Chip label={o.paymentMode || 'CREDIT'} size="small" color={o.paymentMode === 'CASH' ? 'primary' : 'default'} sx={{ fontSize: '0.72rem', height: 20 }} />
                                                </TableCell>
                                                <TableCell align="right"><Typography fontWeight={700}>{fmt(o.total)}</Typography></TableCell>
                                                <TableCell>
                                                    <Chip label={o.paymentStatus} size="small" color={o.paymentStatus === 'paid' ? 'success' : o.paymentStatus === 'partial' ? 'warning' : 'error'} sx={{ fontSize: '0.72rem', height: 20 }} />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Box>
                    </Paper>
                );
            })()}

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
                            {expandedCard === 'loansIn' && <AccountBalance sx={{ color: '#00838f' }} />}
                            {expandedCard === 'loansOut' && <AccountBalance sx={{ color: '#01579b' }} />}
                            {expandedCard === 'cashSales' ? `Cash Sales — ${cashOrdersCount} Orders` :
                             expandedCard === 'creditSales' ? `Credit Sales — ${creditOrdersCount} Orders` :
                             expandedCard === 'customerReceipts' ? `Customer Receipts — ${customerReceiptsCount} Receipts` :
                             expandedCard === 'supplierPayments' ? `Supplier Payments — ${supplierPaymentsCount} Payments` :
                             expandedCard === 'loansIn' ? `Loan Repayments In — ${(realTimeSummary?.loanCashInRecords || []).length} Entries` :
                             expandedCard === 'loansOut' ? `Loans Given Out — ${(realTimeSummary?.loanCashOutRecords || []).length} Entries` :
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
                    {/* LOANS IN */}
                    {expandedCard === 'loansIn' && (
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                        <TableCell sx={{ fontWeight: 'bold' }}>#</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Loan #</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Party</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Type</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Notes</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Amount</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {(realTimeSummary?.loanCashInRecords || []).map((r, idx) => (
                                        <TableRow key={r.id} hover sx={{ '&:nth-of-type(odd)': { bgcolor: 'rgba(0,0,0,0.02)' } }}>
                                            <TableCell>{idx + 1}</TableCell>
                                            <TableCell><Typography variant="body2" fontWeight="bold" sx={{ fontFamily: 'monospace' }}>{r.loanNumber || '-'}</Typography></TableCell>
                                            <TableCell><Typography fontWeight="bold">{r.partyName}</Typography></TableCell>
                                            <TableCell><Chip label={r.isRepayment ? 'Repayment' : 'New Loan'} size="small" color="info" sx={{ fontSize: '0.7rem', height: 20 }} /></TableCell>
                                            <TableCell><Typography variant="body2" color="text.secondary">{r.notes || '-'}</Typography></TableCell>
                                            <TableCell align="right"><Typography fontWeight="bold" sx={{ color: '#00838f' }}>+₹{Number(r.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Typography></TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow sx={{ bgcolor: '#b2ebf2' }}>
                                        <TableCell colSpan={5}><Typography fontWeight="bold">Total</Typography></TableCell>
                                        <TableCell align="right"><Typography fontWeight="bold" variant="h6" sx={{ color: '#00838f' }}>₹{loansCashIn.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Typography></TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}

                    {/* LOANS OUT */}
                    {expandedCard === 'loansOut' && (
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                        <TableCell sx={{ fontWeight: 'bold' }}>#</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Loan #</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Party</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Type</TableCell>
                                        <TableCell sx={{ fontWeight: 'bold' }}>Notes</TableCell>
                                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Amount</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {(realTimeSummary?.loanCashOutRecords || []).map((r, idx) => (
                                        <TableRow key={r.id} hover sx={{ '&:nth-of-type(odd)': { bgcolor: 'rgba(0,0,0,0.02)' } }}>
                                            <TableCell>{idx + 1}</TableCell>
                                            <TableCell><Typography variant="body2" fontWeight="bold" sx={{ fontFamily: 'monospace' }}>{r.loanNumber || '-'}</Typography></TableCell>
                                            <TableCell><Typography fontWeight="bold">{r.partyName}</Typography></TableCell>
                                            <TableCell><Chip label={r.isRepayment ? 'Repayment' : 'New Loan'} size="small" color="warning" sx={{ fontSize: '0.7rem', height: 20 }} /></TableCell>
                                            <TableCell><Typography variant="body2" color="text.secondary">{r.notes || '-'}</Typography></TableCell>
                                            <TableCell align="right"><Typography fontWeight="bold" sx={{ color: '#01579b' }}>−₹{Number(r.amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Typography></TableCell>
                                        </TableRow>
                                    ))}
                                    <TableRow sx={{ bgcolor: '#bbdefb' }}>
                                        <TableCell colSpan={5}><Typography fontWeight="bold">Total</Typography></TableCell>
                                        <TableCell align="right"><Typography fontWeight="bold" variant="h6" sx={{ color: '#01579b' }}>₹{loansCashOut.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</Typography></TableCell>
                                    </TableRow>
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

            {/* Overdue Customers Section */}
            {(overdueLoading || overdueCustomers.length > 0) && (
                <Paper sx={{ mt: 3, border: '2px solid #e53935', borderRadius: 2, overflow: 'hidden' }}>
                    <Box sx={{ bgcolor: '#ffebee', px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Warning sx={{ color: '#e53935' }} />
                        <Typography variant="h6" sx={{ color: '#c62828', fontWeight: 700 }}>
                            Overdue Customers — Due &gt; 20 Days
                        </Typography>
                        <Chip label={`${overdueCustomers.length} customers`} color="error" size="small" sx={{ ml: 1 }} />
                    </Box>
                    {overdueLoading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                            <CircularProgress size={24} />
                        </Box>
                    ) : (
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ '& th': { bgcolor: '#fce4ec', fontWeight: 700, fontSize: '0.82rem' } }}>
                                        <TableCell>#</TableCell>
                                        <TableCell>Customer</TableCell>
                                        <TableCell>Mobile</TableCell>
                                        <TableCell align="right">Outstanding</TableCell>
                                        <TableCell align="right">Unpaid Bills</TableCell>
                                        <TableCell align="right">Days Overdue</TableCell>
                                        <TableCell>Oldest Due Date</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {overdueCustomers.map((c, idx) => (
                                        <TableRow key={c.id} hover sx={{ bgcolor: Number(c.days_overdue) > 45 ? '#fff3e0' : '#fff' }}>
                                            <TableCell>{idx + 1}</TableCell>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight={700}>{c.name}</Typography>
                                            </TableCell>
                                            <TableCell>{c.mobile || '-'}</TableCell>
                                            <TableCell align="right">
                                                <Typography fontWeight={700} color="error.main">
                                                    ₹{Number(c.total_outstanding).toLocaleString('en-IN')}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Chip label={c.unpaid_invoices} size="small" color="error" variant="outlined" />
                                            </TableCell>
                                            <TableCell align="right">
                                                <Chip
                                                    label={`${c.days_overdue} days`}
                                                    size="small"
                                                    color={Number(c.days_overdue) > 45 ? 'error' : 'warning'}
                                                    sx={{ fontWeight: 700 }}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                {c.oldest_due_date ? moment(c.oldest_due_date).format('DD MMM YYYY') : '-'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </Paper>
            )}

            {/* Info Section */}
            <Box sx={{ mt: 3 }}>
                <Alert severity="info">
                    <Typography variant="body2">
                        <strong>Formula:</strong> Expected Cash = Opening Balance + Cash Sales + Customer Receipts + Loan Repayments In − Supplier Payments − Expenses − Loans Given Out
                    </Typography>
                </Alert>
            </Box>
        </Box>
    );
};

export default DayStart;
