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
    ToggleButton,
    ToggleButtonGroup,
    Autocomplete,
    Alert
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
    Warning
} from '@mui/icons-material';
import { listPayments, createPayment } from '../../../services/tally';
import { listSuppliers } from '../../../services/supplier';
import { listCustomers } from '../../../services/customer';
import { listPurchases } from '../../../services/tally';
import axios from 'axios';
import moment from 'moment';

export const DailyPayments = () => {
    const [payments, setPayments] = useState([]);
    const [summary, setSummary] = useState(null);
    const [loading, setLoading] = useState(false);
    const [selectedDate, setSelectedDate] = useState(moment().format('YYYY-MM-DD'));
    const [openDialog, setOpenDialog] = useState(false);
    const [dialogMode, setDialogMode] = useState('simple'); // 'simple' or 'advanced'
    const [suppliers, setSuppliers] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [purchases, setPurchases] = useState([]);
    
    // Outstanding parties for autocomplete
    const [outstandingReceivables, setOutstandingReceivables] = useState([]);
    const [outstandingPayables, setOutstandingPayables] = useState([]);
    const [selectedPartyOutstanding, setSelectedPartyOutstanding] = useState(null);
    
    // Delete confirmation dialog state
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [paymentToDelete, setPaymentToDelete] = useState(null);
    const [deleting, setDeleting] = useState(false);
    
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

    const fetchDailySummary = useCallback(async () => {
        try {
            setLoading(true);
            const { data } = await axios.get('/api/payments/daily-summary', {
                params: { date: selectedDate }
            });
            if (data.status === 200) {
                setSummary(data.data);
                setPayments(data.data.payments || []);
            }
        } catch (error) {
            console.error('Error fetching daily summary:', error);
            // Fallback to regular list if summary endpoint fails
            try {
                const { rows } = await listPayments({ date: selectedDate });
                setPayments(rows);
            } catch (err) {
                console.error('Error in fallback:', err);
            }
        } finally {
            setLoading(false);
        }
    }, [selectedDate]);

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

    const fetchOutstandingData = async () => {
        try {
            // Fetch outstanding receivables (customers who owe money)
            const { data: receivables } = await axios.get('/api/reports/outstanding-receivables');
            if (receivables.status === 200) {
                setOutstandingReceivables(receivables.data || []);
            }
            
            // Fetch outstanding payables (money owed to suppliers)
            const { data: payables } = await axios.get('/api/reports/outstanding-payables');
            if (payables.status === 200) {
                setOutstandingPayables(payables.data || []);
            }
        } catch (error) {
            console.error('Error fetching outstanding data:', error);
        }
    };

    useEffect(() => {
        fetchDailySummary();
    }, [fetchDailySummary]);

    useEffect(() => {
        fetchSuppliers();
        fetchCustomers();
        fetchPurchases();
        fetchOutstandingData();
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
            amount: 0,
            referenceType: 'purchase',
            referenceId: '',
            referenceNumber: '',
            notes: ''
        });
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
    };

    const handleSimpleFormChange = (e) => {
        const { name, value } = e.target;
        setSimpleForm(prev => ({
            ...prev,
            [name]: value
        }));
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
            // Using the existing payment structure with a special "expense" party type
            const payload = {
                paymentDate: selectedDate,
                partyType: 'expense',
                partyName: `${expenseCategories.find(c => c.value === simpleForm.category)?.label || 'Expense'}: ${simpleForm.description}`,
                partyId: null,
                amount: parseFloat(simpleForm.amount),
                referenceType: 'advance',
                notes: `[${simpleForm.category.toUpperCase()}] ${simpleForm.description}`
            };
            
            await createPayment(payload);
            handleCloseDialog();
            fetchDailySummary();
        } catch (error) {
            console.error('Error recording expense:', error);
            alert('Error recording expense. Please try again.');
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
            const payload = { ...formData };
            // Remove empty referenceId to avoid validation errors
            if (!payload.referenceId || payload.referenceType === 'advance') {
                delete payload.referenceId;
                delete payload.referenceNumber;
            }
            // partyId is optional for direct name entry
            if (!payload.partyId) {
                payload.partyId = null;
            }
            
            await createPayment(payload);
            handleCloseDialog();
            fetchDailySummary();
        } catch (error) {
            console.error('Error creating payment:', error);
            alert('Error creating payment');
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
            setDeleting(true);
            await axios.delete(`/api/payments/${paymentToDelete.id}`);
            setDeleteDialogOpen(false);
            setPaymentToDelete(null);
            fetchDailySummary(); // Refresh the list
        } catch (error) {
            console.error('Error deleting payment:', error);
            alert('Error deleting payment. Please try again.');
        } finally {
            setDeleting(false);
        }
    };

    const isToday = selectedDate === moment().format('YYYY-MM-DD');

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
                    <Tooltip title="Refresh">
                        <IconButton onClick={fetchDailySummary}>
                            <Refresh />
                        </IconButton>
                    </Tooltip>
                    <Button variant="contained" onClick={() => handleOpenDialog('simple')} startIcon={<Add />}>
                        Quick Expense
                    </Button>
                    <Button variant="outlined" onClick={() => handleOpenDialog('advanced')}>
                        Supplier/Customer Payment
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
                    <Paper elevation={2} sx={{ p: 2, bgcolor: '#e3f2fd' }}>
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
                    <Paper elevation={2} sx={{ p: 2, bgcolor: '#e8f5e9' }}>
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
                    <Paper elevation={2} sx={{ p: 2, bgcolor: '#fff3e0' }}>
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
                    <Paper elevation={2} sx={{ p: 2, bgcolor: '#ffebee' }}>
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
                            <TextField
                                label="Payment Date"
                                name="paymentDate"
                                type="date"
                                value={formData.paymentDate}
                                onChange={handleChange}
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                            />
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
                            <TextField
                                label={`${formData.partyType === 'supplier' ? 'Supplier' : 'Customer'} Name *`}
                                name="partyName"
                                value={formData.partyName}
                                onChange={handleChange}
                                fullWidth
                                placeholder={`Type ${formData.partyType === 'supplier' ? 'supplier' : 'customer'} name`}
                            />
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
                    <Button onClick={handleCloseDialog}>Cancel</Button>
                    <Button onClick={handleSubmit} variant="contained" color="primary">
                        {dialogMode === 'simple' ? 'Record Expense' : 'Record Payment'}
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
                    <Button onClick={handleDeleteCancel} disabled={deleting}>
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleDeleteConfirm} 
                        color="error" 
                        variant="contained"
                        disabled={deleting}
                    >
                        {deleting ? 'Deleting...' : 'Delete Payment'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
