import React, { useEffect, useState, useCallback } from 'react';
import { 
    Box, 
    Button, 
    Card, 
    CardContent, 
    Table, 
    TableBody, 
    TableCell, 
    TableContainer, 
    TableHead, 
    TableRow, 
    Dialog, 
    DialogTitle, 
    DialogContent, 
    DialogContentText,
    DialogActions, 
    Typography, 
    TextField, 
    Select, 
    MenuItem, 
    FormControl, 
    InputLabel, 
    Chip,
    Grid,
    Paper,
    IconButton,
    Tooltip,
    Divider,
    Autocomplete,
    Alert,
    CircularProgress
} from '@mui/material';
import { 
    CalendarToday, 
    ArrowBack, 
    ArrowForward, 
    Refresh,
    AccountBalance,
    People,
    LocalShipping,
    TrendingUp,
    Add,
    Delete,
    Warning,
    Visibility,
    Receipt,
    ExpandMore,
    ExpandLess
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { listSuppliers } from '../../../services/supplier';
import { listCustomers } from '../../../services/customer';
import { listPurchases } from '../../../services/tally';
import { 
    useGetDailySummaryQuery, 
    useGetOutstandingReceivablesQuery, 
    useGetOutstandingPayablesQuery,
    useCreatePaymentMutation,
    useDeletePaymentMutation
} from '../../../store/api';
import moment from 'moment';

export const DailyPayments = () => {
    const navigate = useNavigate();
    const [selectedDate, setSelectedDate] = useState(moment().format('YYYY-MM-DD'));
    const [openDialog, setOpenDialog] = useState(false);
    
    // RTK Query hooks - automatic cache invalidation!
    const { 
        data: summaryData, 
        isLoading: loadingSummary,
        isFetching: fetchingSummary,
        refetch: refetchSummary 
    } = useGetDailySummaryQuery(selectedDate, {
        refetchOnFocus: true,
        refetchOnReconnect: true,
    });
    
    const { 
        data: outstandingReceivables = [], 
        isLoading: loadingReceivables,
        refetch: refetchReceivables 
    } = useGetOutstandingReceivablesQuery(undefined, {
        refetchOnFocus: true,
        refetchOnReconnect: true,
    });
    
    const { 
        data: outstandingPayables = [], 
        isLoading: loadingPayables,
        refetch: refetchPayables 
    } = useGetOutstandingPayablesQuery(undefined, {
        refetchOnFocus: true,
        refetchOnReconnect: true,
    });
    
    const [createPaymentMutation, { isLoading: isSubmitting }] = useCreatePaymentMutation();
    const [deletePaymentMutation, { isLoading: deletingPayment }] = useDeletePaymentMutation();
    
    // Extract data from RTK Query
    const summary = summaryData || null;
    const payments = summaryData?.payments || [];
    const loading = loadingSummary || loadingReceivables || loadingPayables;
    
    // Expanded rows for viewing bills
    const [expandedCustomers, setExpandedCustomers] = useState({});
    
    // Bill preview dialog
    const [billPreviewDialog, setBillPreviewDialog] = useState({ open: false, order: null });
    const [dialogMode, setDialogMode] = useState('simple'); // 'simple' or 'advanced'
    const [suppliers, setSuppliers] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [purchases, setPurchases] = useState([]);
    
    // Outstanding parties for autocomplete - now from RTK Query
    const [selectedPartyOutstanding, setSelectedPartyOutstanding] = useState(null);
    
    // Delete confirmation dialog state
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [paymentToDelete, setPaymentToDelete] = useState(null);
    
    // Details dialog for summary cards
    const [detailsDialog, setDetailsDialog] = useState({ open: false, type: '', title: '' });
    
    // Simple form for quick expense recording
    const [simpleForm, setSimpleForm] = useState({
        amount: '',
        description: '',
        category: 'misc'
    });
    
    // Advanced form for supplier/customer payments
    const [formData, setFormData] = useState({
        paymentDate: moment().format('YYYY-MM-DD'),
        partyId: '',
        partyName: '',
        partyType: 'supplier',
        amount: '',
        referenceType: 'advance',
        referenceId: '',
        referenceNumber: '',
        notes: ''
    });

    // Expense categories for simple mode
    const expenseCategories = [
        { value: 'laborer', label: 'Laborer' },
        { value: 'transport', label: 'Transport' },
        { value: 'misc', label: 'Miscellaneous' },
        { value: 'fuel', label: 'Fuel' },
        { value: 'maintenance', label: 'Maintenance' },
        { value: 'other', label: 'Other' }
    ];

    // Fetch suppliers, customers, purchases (non-RTK Query data)
    const fetchSuppliers = async () => {
        try {
            const { rows } = await listSuppliers({});
            setSuppliers(rows);
        } catch (error) {
            console.error('Error fetching suppliers:', error);
        }
    };

    const fetchCustomers = async () => {
        try {
            const { rows } = await listCustomers({});
            setCustomers(rows);
        } catch (error) {
            console.error('Error fetching customers:', error);
        }
    };

    const fetchPurchases = async () => {
        try {
            const { rows } = await listPurchases({});
            setPurchases(rows);
        } catch (error) {
            console.error('Error fetching purchases:', error);
        }
    };

    // Combined refresh function using RTK Query refetch
    const handleRefreshAll = useCallback(() => {
        refetchSummary();
        refetchReceivables();
        refetchPayables();
    }, [refetchSummary, refetchReceivables, refetchPayables]);

    // Fetch non-RTK Query data on mount
    useEffect(() => {
        fetchSuppliers();
        fetchCustomers();
        fetchPurchases();
    }, []);

    const handleDateChange = (newDate) => {
        setSelectedDate(newDate);
    };

    const goToPreviousDay = () => {
        setSelectedDate(moment(selectedDate).subtract(1, 'day').format('YYYY-MM-DD'));
    };

    const goToNextDay = () => {
        const nextDay = moment(selectedDate).add(1, 'day');
        if (nextDay.isSameOrBefore(moment(), 'day')) {
            setSelectedDate(nextDay.format('YYYY-MM-DD'));
        }
    };

    const goToToday = () => {
        setSelectedDate(moment().format('YYYY-MM-DD'));
    };

    const handleOpenDialog = (mode = 'simple') => {
        setDialogMode(mode);
        setSimpleForm({
            amount: '',
            description: '',
            category: 'misc'
        });
        setFormData({
            paymentDate: selectedDate,
            partyId: '',
            partyName: '',
            partyType: 'supplier',
            amount: '',
            referenceType: 'advance',
            referenceId: '',
            referenceNumber: '',
            notes: ''
        });
        setSelectedPartyOutstanding(null);
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setSelectedPartyOutstanding(null);
    };

    const handleSimpleFormChange = (e) => {
        const { name, value } = e.target;
        setSimpleForm(prev => ({
            ...prev,
            [name]: value
        }));
    };

    // Get party suggestions based on party type
    const getPartySuggestions = () => {
        if (formData.partyType === 'supplier') {
            // Combine suppliers with outstanding payables
            const supplierNames = (suppliers || []).map(s => ({ name: s.name, outstanding: 0, type: 'supplier' }));
            const payableList = Array.isArray(outstandingPayables) ? outstandingPayables : [];
            const payableNames = payableList.map(p => ({ 
                name: p.supplierName || p.name, 
                outstanding: p.totalOutstanding || p.outstanding || 0,
                type: 'payable'
            }));
            // Merge and dedupe
            const merged = [...payableNames];
            supplierNames.forEach(s => {
                if (!merged.find(m => m.name?.toLowerCase() === s.name?.toLowerCase())) {
                    merged.push(s);
                }
            });
            return merged.filter(m => m.name);
        } else {
            // Combine customers with outstanding receivables
            const customerNames = (customers || []).map(c => ({ name: c.customerName || c.name, outstanding: 0, type: 'customer' }));
            const receivableList = Array.isArray(outstandingReceivables) ? outstandingReceivables : [];
            const receivableNames = receivableList.map(r => ({ 
                name: r.customerName || r.name, 
                outstanding: r.totalOutstanding || r.outstanding || 0,
                type: 'receivable'
            }));
            // Merge and dedupe
            const merged = [...receivableNames];
            customerNames.forEach(c => {
                if (!merged.find(m => m.name?.toLowerCase() === c.name?.toLowerCase())) {
                    merged.push(c);
                }
            });
            return merged.filter(m => m.name);
        }
    };

    const handlePartySelect = (event, value) => {
        if (value) {
            if (typeof value === 'string') {
                // User typed a new name
                setFormData(prev => ({ ...prev, partyName: value, partyId: null }));
                setSelectedPartyOutstanding(null);
            } else {
                // User selected from dropdown
                setFormData(prev => ({ ...prev, partyName: value.name, partyId: null }));
                setSelectedPartyOutstanding(value.outstanding > 0 ? value.outstanding : null);
            }
        } else {
            setFormData(prev => ({ ...prev, partyName: '', partyId: null }));
            setSelectedPartyOutstanding(null);
        }
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));

        if (name === 'partyType') {
            setFormData(prev => ({
                ...prev,
                partyType: value,
                partyId: '',
                partyName: '',
                referenceId: '',
                referenceNumber: '',
                referenceType: value === 'supplier' ? 'purchase' : 'order'
            }));
        }

        if (name === 'partyId') {
            if (formData.partyType === 'supplier') {
                const supplier = suppliers.find(s => s.id === value);
                if (supplier) {
                    setFormData(prev => ({
                        ...prev,
                        partyId: value,
                        partyName: supplier.name
                    }));
                }
            } else {
                const customer = customers.find(c => c.id === value);
                if (customer) {
                    setFormData(prev => ({
                        ...prev,
                        partyId: value,
                        partyName: customer.name
                    }));
                }
            }
        }

        if (name === 'referenceId') {
            const purchase = purchases.find(p => p.id === value);
            if (purchase) {
                setFormData(prev => ({
                    ...prev,
                    referenceId: value,
                    referenceNumber: purchase.billNumber
                }));
            }
        }
    };

    const handleSimpleSubmit = async () => {
        if (!simpleForm.amount || parseFloat(simpleForm.amount) <= 0) {
            alert('Please enter a valid amount');
            return;
        }
        if (!simpleForm.description.trim()) {
            alert('Please enter a description');
            return;
        }

        try {
            // For simple expenses, we'll create an expense record
            const payload = {
                paymentDate: selectedDate,
                partyType: 'expense',
                partyName: `${expenseCategories.find(c => c.value === simpleForm.category)?.label || 'Expense'}: ${simpleForm.description}`,
                partyId: null,
                amount: parseFloat(simpleForm.amount),
                referenceType: 'advance',
                notes: `[${simpleForm.category.toUpperCase()}] ${simpleForm.description}`
            };
            
            // Use RTK Query mutation - cache invalidation is automatic!
            await createPaymentMutation(payload).unwrap();
            
            // Show success and close
            alert(`✅ Expense of ₹${parseFloat(simpleForm.amount).toLocaleString('en-IN')} recorded successfully!`);
            handleCloseDialog();
            // No manual refetch needed - RTK Query handles it!
        } catch (error) {
            console.error('Error recording expense:', error);
            alert('❌ Error recording expense. Please try again.');
        }
    };

    const handleSubmit = async () => {
        if (dialogMode === 'simple') {
            return handleSimpleSubmit();
        }
        
        if (!formData.partyName || !formData.amount) {
            alert('Please fill required fields (Party Name and Amount)');
            return;
        }

        try {
            const payload = { 
                ...formData,
                paymentDate: selectedDate 
            };
            // Remove empty referenceId to avoid validation errors
            if (!payload.referenceId || payload.referenceType === 'advance') {
                delete payload.referenceId;
                delete payload.referenceNumber;
            }
            // partyId is optional for direct name entry
            if (!payload.partyId) {
                payload.partyId = null;
            }
            
            // Use RTK Query mutation - cache invalidation is automatic!
            await createPaymentMutation(payload).unwrap();
            
            // Show success and close
            alert(`✅ Payment of ₹${parseFloat(formData.amount).toLocaleString('en-IN')} to ${formData.partyName} recorded!`);
            handleCloseDialog();
            // No manual refetch needed - RTK Query handles it!
        } catch (error) {
            console.error('Error creating payment:', error);
            alert('❌ Error creating payment. Please try again.');
        }
    };

    // Delete payment handlers
    const handleDeleteClick = (payment) => {
        setPaymentToDelete(payment);
        setDeleteDialogOpen(true);
    };

    const handleDeleteCancel = () => {
        setDeleteDialogOpen(false);
        setPaymentToDelete(null);
    };

    const handleDeleteConfirm = async () => {
        if (!paymentToDelete) return;
        
        try {
            // Use RTK Query mutation - cache invalidation is automatic!
            await deletePaymentMutation(paymentToDelete.id).unwrap();
            setDeleteDialogOpen(false);
            setPaymentToDelete(null);
            // No manual refetch needed - RTK Query handles it!
        } catch (error) {
            console.error('Error deleting payment:', error);
            alert('Error deleting payment. Please try again.');
        }
    };

    const isToday = selectedDate === moment().format('YYYY-MM-DD');

    // Filter payments by type for details dialog
    const getFilteredPayments = (type) => {
        if (!payments || payments.length === 0) return [];
        
        switch (type) {
            case 'all':
                return payments;
            case 'customers':
                return payments.filter(p => p.partyType === 'customer');
            case 'suppliers':
                return payments.filter(p => p.partyType === 'supplier');
            case 'expenses':
                return payments.filter(p => p.partyType === 'expense');
            default:
                return payments;
        }
    };

    // Open details dialog
    const handleOpenDetails = (type, title) => {
        setDetailsDialog({ open: true, type, title });
    };

    // Close details dialog
    const handleCloseDetails = () => {
        setDetailsDialog({ open: false, type: '', title: '' });
    };

    return (
        <Box sx={{ p: 3 }}>
            {/* Header with date navigation */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <CalendarToday /> Daily Payments
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Tooltip title="Previous Day">
                        <IconButton onClick={goToPreviousDay}>
                            <ArrowBack />
                        </IconButton>
                    </Tooltip>
                    <TextField
                        type="date"
                        value={selectedDate}
                        onChange={(e) => handleDateChange(e.target.value)}
                        size="small"
                        InputProps={{
                            inputProps: { max: moment().format('YYYY-MM-DD') }
                        }}
                    />
                    <Tooltip title="Next Day">
                        <IconButton 
                            onClick={goToNextDay}
                            disabled={isToday}
                        >
                            <ArrowForward />
                        </IconButton>
                    </Tooltip>
                    {!isToday && (
                        <Button 
                            variant="outlined" 
                            size="small" 
                            onClick={goToToday}
                            sx={{ ml: 1 }}
                        >
                            Today
                        </Button>
                    )}
                    <Tooltip title="Refresh All Data">
                        <IconButton onClick={handleRefreshAll} disabled={fetchingSummary}>
                            <Refresh />
                        </IconButton>
                    </Tooltip>
                    <Button variant="contained" onClick={() => handleOpenDialog('simple')} startIcon={<Add />}>
                        Quick Expense
                    </Button>
                    <Button 
                        variant="contained" 
                        color="warning"
                        onClick={() => {
                            setFormData({
                                paymentDate: selectedDate,
                                partyId: '',
                                partyName: '',
                                partyType: 'supplier',
                                amount: '',
                                referenceType: 'advance',
                                referenceId: '',
                                referenceNumber: '',
                                notes: ''
                            });
                            setSelectedPartyOutstanding(null);
                            setDialogMode('advanced');
                            setOpenDialog(true);
                        }}
                        startIcon={<LocalShipping />}
                    >
                        Supplier Advance
                    </Button>
                    <Button variant="outlined" onClick={() => handleOpenDialog('advanced')}>
                        Other Payment
                    </Button>
                </Box>
            </Box>

            {/* Date Display */}
            <Typography variant="subtitle1" sx={{ mb: 3, color: 'text.secondary' }}>
                Showing payments for: <strong>{moment(selectedDate).format('dddd, MMMM D, YYYY')}</strong>
                {isToday && <Chip label="Today" size="small" color="primary" sx={{ ml: 1 }} />}
            </Typography>

            {/* Summary Cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6} md={2.4}>
                    <Paper 
                        elevation={2} 
                        sx={{ p: 2, bgcolor: '#e3f2fd', cursor: 'pointer', '&:hover': { bgcolor: '#bbdefb', transform: 'translateY(-2px)' }, transition: 'all 0.2s' }}
                        onClick={() => handleOpenDetails('all', 'All Payments')}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <AccountBalance color="primary" />
                            <Box>
                                <Typography variant="body2" color="text.secondary">Total Payments</Typography>
                                <Typography variant="h5" fontWeight="bold">
                                    ₹{summary?.totalAmount?.toLocaleString() || 0}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {summary?.totalCount || 0} transactions
                                </Typography>
                            </Box>
                        </Box>
                    </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={2.4}>
                    <Paper 
                        elevation={2} 
                        sx={{ p: 2, bgcolor: '#e8f5e9', cursor: 'pointer', '&:hover': { bgcolor: '#c8e6c9', transform: 'translateY(-2px)' }, transition: 'all 0.2s' }}
                        onClick={() => handleOpenDetails('customers', 'Payments From Customers')}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <People color="success" />
                            <Box>
                                <Typography variant="body2" color="text.secondary">From Customers</Typography>
                                <Typography variant="h5" fontWeight="bold">
                                    ₹{summary?.summary?.customers?.amount?.toLocaleString() || 0}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {summary?.summary?.customers?.count || 0} receipts
                                </Typography>
                            </Box>
                        </Box>
                    </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={2.4}>
                    <Paper 
                        elevation={2} 
                        sx={{ p: 2, bgcolor: '#fff3e0', cursor: 'pointer', '&:hover': { bgcolor: '#ffe0b2', transform: 'translateY(-2px)' }, transition: 'all 0.2s' }}
                        onClick={() => handleOpenDetails('suppliers', 'Payments To Suppliers')}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <LocalShipping color="warning" />
                            <Box>
                                <Typography variant="body2" color="text.secondary">To Suppliers</Typography>
                                <Typography variant="h5" fontWeight="bold">
                                    ₹{summary?.summary?.suppliers?.amount?.toLocaleString() || 0}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {summary?.summary?.suppliers?.count || 0} payments
                                </Typography>
                            </Box>
                        </Box>
                    </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={2.4}>
                    <Paper 
                        elevation={2} 
                        sx={{ p: 2, bgcolor: '#ffebee', cursor: 'pointer', '&:hover': { bgcolor: '#ffcdd2', transform: 'translateY(-2px)' }, transition: 'all 0.2s' }}
                        onClick={() => handleOpenDetails('expenses', 'Expenses')}
                    >
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <AccountBalance sx={{ color: '#d32f2f' }} />
                            <Box>
                                <Typography variant="body2" color="text.secondary">Expenses</Typography>
                                <Typography variant="h5" fontWeight="bold" color="error.main">
                                    ₹{summary?.summary?.expenses?.amount?.toLocaleString() || 0}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {summary?.summary?.expenses?.count || 0} expenses
                                </Typography>
                            </Box>
                        </Box>
                    </Paper>
                </Grid>
                <Grid item xs={12} sm={6} md={2.4}>
                    <Paper elevation={2} sx={{ p: 2, bgcolor: '#f3e5f5' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TrendingUp color="secondary" />
                            <Box>
                                <Typography variant="body2" color="text.secondary">Net Cash Flow</Typography>
                                <Typography variant="h5" fontWeight="bold" 
                                    color={(summary?.summary?.customers?.amount || 0) - (summary?.summary?.suppliers?.amount || 0) - (summary?.summary?.expenses?.amount || 0) >= 0 ? 'success.main' : 'error.main'}
                                >
                                    ₹{((summary?.summary?.customers?.amount || 0) - (summary?.summary?.suppliers?.amount || 0) - (summary?.summary?.expenses?.amount || 0)).toLocaleString()}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    (In - Out - Expenses)
                                </Typography>
                            </Box>
                        </Box>
                    </Paper>
                </Grid>
            </Grid>

            {/* Outstanding Receivables Section */}
            {Array.isArray(outstandingReceivables) && outstandingReceivables.length > 0 && (
                <Box sx={{ mt: 3, mb: 3 }}>
                    <Paper elevation={2} sx={{ p: 2, bgcolor: '#e8f5e9', border: '1px solid #4caf50' }}>
                        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <People sx={{ color: '#2e7d32' }} />
                            Outstanding Receivables - Customers Owe You
                        </Typography>
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#c8e6c9' }}>
                                        <TableCell width={40}></TableCell>
                                        <TableCell><strong>Customer Name</strong></TableCell>
                                        <TableCell align="right"><strong>Amount Due</strong></TableCell>
                                        <TableCell align="right"><strong>Orders</strong></TableCell>
                                        <TableCell align="center"><strong>Action</strong></TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {outstandingReceivables.slice(0, 10).map((item, idx) => (
                                        <React.Fragment key={idx}>
                                            <TableRow hover>
                                                <TableCell>
                                                    {item.orders && item.orders.length > 0 && (
                                                        <IconButton
                                                            size="small"
                                                            onClick={() => setExpandedCustomers(prev => ({
                                                                ...prev,
                                                                [idx]: !prev[idx]
                                                            }))}
                                                        >
                                                            {expandedCustomers[idx] ? <ExpandLess /> : <ExpandMore />}
                                                        </IconButton>
                                                    )}
                                                </TableCell>
                                                <TableCell>{item.customerName || item.name}</TableCell>
                                                <TableCell align="right">
                                                    <Typography color="success.main" fontWeight="bold">
                                                        ₹{(item.totalOutstanding || item.outstanding || 0).toLocaleString('en-IN')}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Chip 
                                                        label={`${item.orderCount || item.count || 0} bills`}
                                                        size="small"
                                                        color="primary"
                                                        variant="outlined"
                                                        onClick={() => setExpandedCustomers(prev => ({
                                                            ...prev,
                                                            [idx]: !prev[idx]
                                                        }))}
                                                        sx={{ cursor: 'pointer' }}
                                                    />
                                                </TableCell>
                                                <TableCell align="center">
                                                    <Button
                                                        size="small"
                                                        variant="contained"
                                                        color="success"
                                                        startIcon={<Add />}
                                                        onClick={() => {
                                                            setFormData({
                                                                paymentDate: selectedDate,
                                                                partyId: null,
                                                                partyName: item.customerName || item.name,
                                                                partyType: 'customer',
                                                                amount: '',
                                                                referenceType: 'advance',
                                                                referenceId: '',
                                                                referenceNumber: '',
                                                                notes: ''
                                                            });
                                                            setSelectedPartyOutstanding(item.totalOutstanding || item.outstanding || 0);
                                                            setDialogMode('advanced');
                                                            setOpenDialog(true);
                                                        }}
                                                    >
                                                        Receive ₹
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                            {/* Expanded Bills Row */}
                                            {expandedCustomers[idx] && item.orders && item.orders.length > 0 && (
                                                <TableRow>
                                                    <TableCell colSpan={5} sx={{ py: 0, bgcolor: '#f1f8e9' }}>
                                                        <Box sx={{ p: 2 }}>
                                                            <Typography variant="subtitle2" sx={{ mb: 1, fontWeight: 'bold' }}>
                                                                📋 Unpaid Bills for {item.customerName || item.name}
                                                            </Typography>
                                                            <Table size="small">
                                                                <TableHead>
                                                                    <TableRow sx={{ bgcolor: '#dcedc8' }}>
                                                                        <TableCell><strong>Bill No</strong></TableCell>
                                                                        <TableCell><strong>Date</strong></TableCell>
                                                                        <TableCell align="right"><strong>Total</strong></TableCell>
                                                                        <TableCell align="right"><strong>Paid</strong></TableCell>
                                                                        <TableCell align="right"><strong>Due</strong></TableCell>
                                                                        <TableCell align="center"><strong>Status</strong></TableCell>
                                                                        <TableCell align="center"><strong>View</strong></TableCell>
                                                                    </TableRow>
                                                                </TableHead>
                                                                <TableBody>
                                                                    {item.orders.map((order, orderIdx) => (
                                                                        <TableRow key={orderIdx} hover>
                                                                            <TableCell>
                                                                                <Typography variant="body2" fontWeight="bold" color="primary">
                                                                                    {order.orderNumber}
                                                                                </Typography>
                                                                            </TableCell>
                                                                            <TableCell>
                                                                                {moment(order.orderDate).format('DD/MM/YYYY')}
                                                                            </TableCell>
                                                                            <TableCell align="right">
                                                                                ₹{(order.total || 0).toLocaleString('en-IN')}
                                                                            </TableCell>
                                                                            <TableCell align="right">
                                                                                ₹{(order.paidAmount || 0).toLocaleString('en-IN')}
                                                                            </TableCell>
                                                                            <TableCell align="right">
                                                                                <Typography color="error.main" fontWeight="bold">
                                                                                    ₹{(order.dueAmount || 0).toLocaleString('en-IN')}
                                                                                </Typography>
                                                                            </TableCell>
                                                                            <TableCell align="center">
                                                                                <Chip 
                                                                                    label={order.paymentStatus}
                                                                                    size="small"
                                                                                    color={order.paymentStatus === 'partial' ? 'warning' : 'error'}
                                                                                />
                                                                            </TableCell>
                                                                            <TableCell align="center">
                                                                                <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                                                                    <Tooltip title="View Bill">
                                                                                        <IconButton 
                                                                                            size="small" 
                                                                                            color="primary"
                                                                                            onClick={() => navigate(`/orders/edit/${order.id}`)}
                                                                                        >
                                                                                            <Visibility fontSize="small" />
                                                                                        </IconButton>
                                                                                    </Tooltip>
                                                                                    <Tooltip title="Quick Preview">
                                                                                        <IconButton 
                                                                                            size="small" 
                                                                                            color="secondary"
                                                                                            onClick={() => setBillPreviewDialog({ open: true, order: order })}
                                                                                        >
                                                                                            <Receipt fontSize="small" />
                                                                                        </IconButton>
                                                                                    </Tooltip>
                                                                                </Box>
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        </Box>
                                                    </TableCell>
                                                </TableRow>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        {outstandingReceivables.length > 10 && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                Showing top 10 of {outstandingReceivables.length} customers
                            </Typography>
                        )}
                    </Paper>
                </Box>
            )}

            {/* Outstanding Payables Section */}
            {Array.isArray(outstandingPayables) && outstandingPayables.length > 0 && (
                <Box sx={{ mb: 3 }}>
                    <Paper elevation={2} sx={{ p: 2, bgcolor: '#ffebee', border: '1px solid #ef5350' }}>
                        <Typography variant="h6" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <LocalShipping sx={{ color: '#c62828' }} />
                            Outstanding Payables - You Owe Suppliers
                        </Typography>
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#ffcdd2' }}>
                                        <TableCell><strong>Supplier Name</strong></TableCell>
                                        <TableCell align="right"><strong>Amount Due</strong></TableCell>
                                        <TableCell align="right"><strong>Bills</strong></TableCell>
                                        <TableCell align="center"><strong>Action</strong></TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {outstandingPayables.slice(0, 10).map((item, idx) => (
                                        <TableRow key={idx} hover>
                                            <TableCell>{item.supplierName || item.name}</TableCell>
                                            <TableCell align="right">
                                                <Typography color="error.main" fontWeight="bold">
                                                    ₹{(item.totalOutstanding || item.outstanding || 0).toLocaleString('en-IN')}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">{item.billCount || item.count || '-'}</TableCell>
                                            <TableCell align="center">
                                                <Button
                                                    size="small"
                                                    variant="contained"
                                                    color="error"
                                                    startIcon={<Add />}
                                                    onClick={() => {
                                                        setFormData({
                                                            paymentDate: selectedDate,
                                                            partyId: null,
                                                            partyName: item.supplierName || item.name,
                                                            partyType: 'supplier',
                                                            amount: '',
                                                            referenceType: 'advance',
                                                            referenceId: '',
                                                            referenceNumber: '',
                                                            notes: ''
                                                        });
                                                        setSelectedPartyOutstanding(item.totalOutstanding || item.outstanding || 0);
                                                        setDialogMode('advanced');
                                                        setOpenDialog(true);
                                                    }}
                                                >
                                                    Pay ₹
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                        {outstandingPayables.length > 10 && (
                            <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
                                Showing top 10 of {outstandingPayables.length} suppliers
                            </Typography>
                        )}
                    </Paper>
                </Box>
            )}

            {/* Breakdown by Reference Type */}
            {summary?.byReferenceType && (
                <Box sx={{ mb: 3 }}>
                    <Typography variant="subtitle2" gutterBottom>Breakdown by Type:</Typography>
                    <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                        <Chip 
                            label={`Orders: ₹${summary.byReferenceType.orders?.amount?.toLocaleString() || 0} (${summary.byReferenceType.orders?.count || 0})`}
                            variant="outlined"
                            color="primary"
                        />
                        <Chip 
                            label={`Purchases: ₹${summary.byReferenceType.purchases?.amount?.toLocaleString() || 0} (${summary.byReferenceType.purchases?.count || 0})`}
                            variant="outlined"
                            color="secondary"
                        />
                        <Chip 
                            label={`Advances: ₹${summary.byReferenceType.advances?.amount?.toLocaleString() || 0} (${summary.byReferenceType.advances?.count || 0})`}
                            variant="outlined"
                            color="default"
                        />
                    </Box>
                </Box>
            )}

            <Divider sx={{ mb: 3 }} />

            {/* Payments Table */}
            <Card>
                <CardContent>
                    <Typography variant="h6" gutterBottom>
                        Payment Transactions
                    </Typography>
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Payment No</TableCell>
                                    <TableCell>Time</TableCell>
                                    <TableCell>Party Name</TableCell>
                                    <TableCell>Type</TableCell>
                                    <TableCell align="right">Amount</TableCell>
                                    <TableCell>Reference Type</TableCell>
                                    <TableCell>Reference</TableCell>
                                    <TableCell>Notes</TableCell>
                                    <TableCell align="center">Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={9} align="center">Loading...</TableCell>
                                    </TableRow>
                                ) : payments.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={9} align="center">
                                            No payments recorded for {moment(selectedDate).format('MMMM D, YYYY')}
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    payments.map((payment) => (
                                        <TableRow key={payment.id}>
                                            <TableCell>{payment.paymentNumber}</TableCell>
                                            <TableCell>{moment(payment.createdAt).format('HH:mm')}</TableCell>
                                            <TableCell>{payment.partyName}</TableCell>
                                            <TableCell>
                                                <Chip 
                                                    label={payment.partyType} 
                                                    size="small" 
                                                    color={payment.partyType === 'customer' ? 'success' : payment.partyType === 'expense' ? 'error' : 'warning'}
                                                />
                                            </TableCell>
                                            <TableCell align="right">
                                                <Typography 
                                                    fontWeight="bold"
                                                    color={payment.partyType === 'customer' ? 'success.main' : 'error.main'}
                                                >
                                                    {payment.partyType === 'customer' ? '+' : '-'}₹{payment.amount?.toLocaleString()}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip 
                                                    label={payment.referenceType} 
                                                    size="small" 
                                                    variant="outlined"
                                                />
                                            </TableCell>
                                            <TableCell>{payment.referenceNumber || '-'}</TableCell>
                                            <TableCell>{payment.notes || '-'}</TableCell>
                                            <TableCell align="center">
                                                <Tooltip title="Delete Payment">
                                                    <IconButton 
                                                        color="error" 
                                                        size="small"
                                                        onClick={() => handleDeleteClick(payment)}
                                                    >
                                                        <Delete />
                                                    </IconButton>
                                                </Tooltip>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </CardContent>
            </Card>

            {/* Create Payment Dialog */}
            <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle>
                    {dialogMode === 'simple' 
                        ? `Quick Expense - ${moment(selectedDate).format('MMMM D, YYYY')}`
                        : `Record Payment - ${moment(selectedDate).format('MMMM D, YYYY')}`
                    }
                </DialogTitle>
                <DialogContent>
                    {dialogMode === 'simple' ? (
                        /* Simple Expense Form */
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, mt: 2 }}>
                            <TextField
                                label="Amount (₹) *"
                                name="amount"
                                type="number"
                                value={simpleForm.amount}
                                onChange={handleSimpleFormChange}
                                fullWidth
                                autoFocus
                                InputProps={{ 
                                    inputProps: { min: 0 },
                                    sx: { fontSize: '1.5rem' }
                                }}
                                placeholder="Enter amount"
                            />
                            <FormControl fullWidth>
                                <InputLabel>Category</InputLabel>
                                <Select
                                    name="category"
                                    value={simpleForm.category}
                                    onChange={handleSimpleFormChange}
                                    label="Category"
                                >
                                    {expenseCategories.map((cat) => (
                                        <MenuItem key={cat.value} value={cat.value}>
                                            {cat.label}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                            <TextField
                                label="Description *"
                                name="description"
                                value={simpleForm.description}
                                onChange={handleSimpleFormChange}
                                fullWidth
                                multiline
                                rows={2}
                                placeholder="e.g., Paid to Ram for loading, Transport to warehouse, etc."
                            />
                        </Box>
                    ) : (
                        /* Advanced Payment Form */
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                            <FormControl fullWidth>
                                <InputLabel>Party Type</InputLabel>
                                <Select
                                    name="partyType"
                                    value={formData.partyType}
                                    onChange={handleChange}
                                    label="Party Type"
                                >
                                    <MenuItem value="supplier">Supplier (Payment Out)</MenuItem>
                                    <MenuItem value="customer">Customer (Receipt In)</MenuItem>
                                </Select>
                            </FormControl>
                            
                            <Autocomplete
                                freeSolo
                                options={getPartySuggestions()}
                                getOptionLabel={(option) => {
                                    if (typeof option === 'string') return option;
                                    return option.name || '';
                                }}
                                renderOption={(props, option) => (
                                    <li {...props}>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                            <span>{option.name}</span>
                                            {option.outstanding > 0 && (
                                                <Chip 
                                                    size="small" 
                                                    color={formData.partyType === 'supplier' ? 'error' : 'success'}
                                                    label={`Due: ₹${option.outstanding.toLocaleString('en-IN')}`}
                                                />
                                            )}
                                        </Box>
                                    </li>
                                )}
                                value={formData.partyName}
                                onChange={handlePartySelect}
                                onInputChange={(event, newValue) => {
                                    if (event?.type === 'change') {
                                        setFormData(prev => ({ ...prev, partyName: newValue }));
                                    }
                                }}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        label={`${formData.partyType === 'supplier' ? 'Supplier' : 'Customer'} Name *`}
                                        placeholder="Type or select name"
                                        helperText={selectedPartyOutstanding ? `Outstanding: ₹${selectedPartyOutstanding.toLocaleString('en-IN')}` : ''}
                                    />
                                )}
                            />
                            
                            {selectedPartyOutstanding && (
                                <Alert severity="info" icon={<Warning />}>
                                    {formData.partyType === 'supplier' 
                                        ? `You owe ₹${selectedPartyOutstanding.toLocaleString('en-IN')} to this supplier`
                                        : `This customer owes ₹${selectedPartyOutstanding.toLocaleString('en-IN')}`
                                    }
                                </Alert>
                            )}
                            
                            <TextField
                                label="Amount *"
                                name="amount"
                                type="number"
                                value={formData.amount}
                                onChange={handleChange}
                                fullWidth
                                InputProps={{ inputProps: { min: 0 } }}
                            />
                            <FormControl fullWidth>
                                <InputLabel>Reference Type</InputLabel>
                                <Select
                                    name="referenceType"
                                    value={formData.referenceType}
                                    onChange={handleChange}
                                    label="Reference Type"
                                >
                                    {formData.partyType === 'supplier' && <MenuItem value="purchase">Purchase</MenuItem>}
                                    {formData.partyType === 'customer' && <MenuItem value="order">Order</MenuItem>}
                                    <MenuItem value="advance">Advance</MenuItem>
                                </Select>
                            </FormControl>
                            {formData.referenceType === 'purchase' && formData.partyType === 'supplier' && (
                                <FormControl fullWidth>
                                    <InputLabel>Purchase Bill</InputLabel>
                                    <Select
                                        name="referenceId"
                                        value={formData.referenceId}
                                        onChange={handleChange}
                                        label="Purchase Bill"
                                    >
                                        {purchases.filter(p => p.supplierId === formData.partyId).map((purchase) => (
                                            <MenuItem key={purchase.id} value={purchase.id}>
                                                {purchase.billNumber} - ₹{purchase.dueAmount} due
                                            </MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            )}
                            <TextField
                                label="Notes"
                                name="notes"
                                value={formData.notes}
                                onChange={handleChange}
                                fullWidth
                                multiline
                                rows={2}
                            />
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog} disabled={isSubmitting}>Cancel</Button>
                    <Button 
                        onClick={handleSubmit} 
                        variant="contained" 
                        color="primary"
                        disabled={isSubmitting}
                        startIcon={isSubmitting ? <CircularProgress size={20} color="inherit" /> : null}
                    >
                        {isSubmitting ? 'Saving...' : (dialogMode === 'simple' ? 'Record Expense' : 'Record Payment')}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={deleteDialogOpen}
                onClose={handleDeleteCancel}
                maxWidth="sm"
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
                    <Warning /> Delete Payment
                </DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to delete this payment?
                    </DialogContentText>
                    {paymentToDelete && (
                        <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                            <Typography variant="body2"><strong>Payment No:</strong> {paymentToDelete.paymentNumber}</Typography>
                            <Typography variant="body2"><strong>Party:</strong> {paymentToDelete.partyName}</Typography>
                            <Typography variant="body2"><strong>Amount:</strong> ₹{paymentToDelete.amount?.toLocaleString()}</Typography>
                            <Typography variant="body2"><strong>Type:</strong> {paymentToDelete.partyType}</Typography>
                            {paymentToDelete.notes && (
                                <Typography variant="body2"><strong>Notes:</strong> {paymentToDelete.notes}</Typography>
                            )}
                        </Box>
                    )}
                    <Typography variant="body2" color="error" sx={{ mt: 2 }}>
                        ⚠️ This action cannot be undone. If this payment was linked to an order or purchase, the payment status will be reversed.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleDeleteCancel} disabled={deletingPayment}>
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleDeleteConfirm} 
                        color="error" 
                        variant="contained"
                        disabled={deletingPayment}
                    >
                        {deletingPayment ? 'Deleting...' : 'Delete Payment'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Bill Preview Dialog */}
            <Dialog
                open={billPreviewDialog.open}
                onClose={() => setBillPreviewDialog({ open: false, order: null })}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Receipt color="primary" />
                        Bill Preview
                    </Box>
                    <Chip 
                        label={billPreviewDialog.order?.paymentStatus || 'unpaid'}
                        color={billPreviewDialog.order?.paymentStatus === 'partial' ? 'warning' : 'error'}
                        size="small"
                    />
                </DialogTitle>
                <DialogContent>
                    {billPreviewDialog.order && (
                        <Box>
                            <Paper sx={{ p: 2, bgcolor: '#f5f5f5', mb: 2 }}>
                                <Grid container spacing={2}>
                                    <Grid item xs={6}>
                                        <Typography variant="caption" color="text.secondary">Bill Number</Typography>
                                        <Typography variant="h6" color="primary" fontWeight="bold">
                                            {billPreviewDialog.order.orderNumber}
                                        </Typography>
                                    </Grid>
                                    <Grid item xs={6}>
                                        <Typography variant="caption" color="text.secondary">Date</Typography>
                                        <Typography variant="h6">
                                            {moment(billPreviewDialog.order.orderDate).format('DD/MM/YYYY')}
                                        </Typography>
                                    </Grid>
                                </Grid>
                            </Paper>
                            
                            <Divider sx={{ my: 2 }} />
                            
                            <Grid container spacing={2}>
                                <Grid item xs={4}>
                                    <Paper sx={{ p: 2, textAlign: 'center', bgcolor: '#e3f2fd' }}>
                                        <Typography variant="caption" color="text.secondary">Total Amount</Typography>
                                        <Typography variant="h5" color="primary" fontWeight="bold">
                                            ₹{(billPreviewDialog.order.total || 0).toLocaleString('en-IN')}
                                        </Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={4}>
                                    <Paper sx={{ p: 2, textAlign: 'center', bgcolor: '#e8f5e9' }}>
                                        <Typography variant="caption" color="text.secondary">Paid</Typography>
                                        <Typography variant="h5" color="success.main" fontWeight="bold">
                                            ₹{(billPreviewDialog.order.paidAmount || 0).toLocaleString('en-IN')}
                                        </Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={4}>
                                    <Paper sx={{ p: 2, textAlign: 'center', bgcolor: '#ffebee' }}>
                                        <Typography variant="caption" color="text.secondary">Due</Typography>
                                        <Typography variant="h5" color="error.main" fontWeight="bold">
                                            ₹{(billPreviewDialog.order.dueAmount || 0).toLocaleString('en-IN')}
                                        </Typography>
                                    </Paper>
                                </Grid>
                            </Grid>
                            
                            <Alert severity="info" sx={{ mt: 2 }}>
                                Click "View Full Bill" to see complete bill details including items, customer info, and print option.
                            </Alert>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setBillPreviewDialog({ open: false, order: null })}>
                        Close
                    </Button>
                    <Button 
                        variant="contained" 
                        color="primary"
                        startIcon={<Visibility />}
                        onClick={() => {
                            navigate(`/orders/edit/${billPreviewDialog.order?.id}`);
                            setBillPreviewDialog({ open: false, order: null });
                        }}
                    >
                        View Full Bill
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Details Dialog for Summary Cards */}
            <Dialog 
                open={detailsDialog.open} 
                onClose={handleCloseDetails}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle sx={{ 
                    bgcolor: detailsDialog.type === 'customers' ? '#e8f5e9' : 
                             detailsDialog.type === 'suppliers' ? '#fff3e0' : 
                             detailsDialog.type === 'expenses' ? '#ffebee' : '#e3f2fd',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1
                }}>
                    {detailsDialog.type === 'customers' && <People color="success" />}
                    {detailsDialog.type === 'suppliers' && <LocalShipping color="warning" />}
                    {detailsDialog.type === 'expenses' && <Receipt sx={{ color: '#d32f2f' }} />}
                    {detailsDialog.type === 'all' && <AccountBalance color="primary" />}
                    {detailsDialog.title} - {moment(selectedDate).format('DD/MM/YYYY')}
                </DialogTitle>
                <DialogContent>
                    {getFilteredPayments(detailsDialog.type).length === 0 ? (
                        <Alert severity="info" sx={{ mt: 2 }}>
                            No {detailsDialog.type === 'all' ? 'payments' : detailsDialog.type} recorded for this date.
                        </Alert>
                    ) : (
                        <TableContainer sx={{ mt: 2 }}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                        <TableCell><strong>Time</strong></TableCell>
                                        <TableCell><strong>Party Name</strong></TableCell>
                                        <TableCell><strong>Type</strong></TableCell>
                                        <TableCell align="right"><strong>Amount</strong></TableCell>
                                        <TableCell><strong>Reference</strong></TableCell>
                                        <TableCell><strong>Notes</strong></TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {getFilteredPayments(detailsDialog.type).map((payment) => (
                                        <TableRow key={payment.id} hover>
                                            <TableCell>
                                                {moment(payment.createdAt).format('hh:mm A')}
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight="bold">
                                                    {payment.partyName || '-'}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip 
                                                    label={payment.partyType} 
                                                    size="small"
                                                    color={payment.partyType === 'customer' ? 'success' : 
                                                           payment.partyType === 'supplier' ? 'warning' : 'error'}
                                                />
                                            </TableCell>
                                            <TableCell align="right">
                                                <Typography 
                                                    fontWeight="bold"
                                                    color={payment.partyType === 'customer' ? 'success.main' : 
                                                           payment.partyType === 'supplier' ? 'warning.main' : 'error.main'}
                                                >
                                                    {payment.partyType === 'customer' ? '+' : '-'}₹{payment.amount?.toLocaleString('en-IN')}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                {payment.referenceType && (
                                                    <Typography variant="caption">
                                                        {payment.referenceType}
                                                        {payment.referenceNumber && ` - ${payment.referenceNumber}`}
                                                    </Typography>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                    {payment.notes || '-'}
                                                </Typography>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {/* Total Row */}
                                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                        <TableCell colSpan={3}>
                                            <Typography fontWeight="bold">Total</Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Typography fontWeight="bold" color="primary">
                                                ₹{getFilteredPayments(detailsDialog.type).reduce((sum, p) => sum + (p.amount || 0), 0).toLocaleString('en-IN')}
                                            </Typography>
                                        </TableCell>
                                        <TableCell colSpan={2}>
                                            <Typography variant="body2" color="text.secondary">
                                                {getFilteredPayments(detailsDialog.type).length} entries
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDetails}>Close</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
