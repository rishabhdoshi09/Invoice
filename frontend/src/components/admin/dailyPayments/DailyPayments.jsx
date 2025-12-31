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
    ToggleButtonGroup
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
    Add
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
    const [suppliers, setSuppliers] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [purchases, setPurchases] = useState([]);
    const [formData, setFormData] = useState({
        paymentDate: moment().format('YYYY-MM-DD'),
        partyId: '',
        partyName: '',
        partyType: 'supplier',
        amount: 0,
        referenceType: 'purchase',
        referenceId: '',
        referenceNumber: '',
        notes: ''
    });

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

    useEffect(() => {
        fetchDailySummary();
    }, [fetchDailySummary]);

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

    const handleOpenDialog = () => {
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

    const handleSubmit = async () => {
        if (!formData.partyId || !formData.amount) {
            alert('Please fill required fields');
            return;
        }

        try {
            const payload = { ...formData };
            // Remove empty referenceId to avoid validation errors
            if (!payload.referenceId || payload.referenceType === 'advance') {
                delete payload.referenceId;
                delete payload.referenceNumber;
            }
            
            await createPayment(payload);
            handleCloseDialog();
            fetchDailySummary();
        } catch (error) {
            console.error('Error creating payment:', error);
            alert('Error creating payment');
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
                    <Button variant="contained" onClick={handleOpenDialog}>
                        Record Payment
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
                <Grid item xs={12} sm={6} md={3}>
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
                <Grid item xs={12} sm={6} md={3}>
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
                <Grid item xs={12} sm={6} md={3}>
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
                <Grid item xs={12} sm={6} md={3}>
                    <Paper elevation={2} sx={{ p: 2, bgcolor: '#f3e5f5' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TrendingUp color="secondary" />
                            <Box>
                                <Typography variant="body2" color="text.secondary">Net Cash Flow</Typography>
                                <Typography variant="h5" fontWeight="bold" 
                                    color={(summary?.summary?.customers?.amount || 0) - (summary?.summary?.suppliers?.amount || 0) >= 0 ? 'success.main' : 'error.main'}
                                >
                                    ₹{((summary?.summary?.customers?.amount || 0) - (summary?.summary?.suppliers?.amount || 0)).toLocaleString()}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    (Received - Paid)
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
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={8} align="center">Loading...</TableCell>
                                    </TableRow>
                                ) : payments.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} align="center">
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
                                                    color={payment.partyType === 'customer' ? 'success' : 'warning'}
                                                />
                                            </TableCell>
                                            <TableCell align="right">
                                                <Typography 
                                                    fontWeight="bold"
                                                    color={payment.partyType === 'customer' ? 'success.main' : 'warning.main'}
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
                <DialogTitle>Record Payment for {moment(selectedDate).format('MMMM D, YYYY')}</DialogTitle>
                <DialogContent>
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
                        <FormControl fullWidth>
                            <InputLabel>Select {formData.partyType === 'supplier' ? 'Supplier' : 'Customer'} *</InputLabel>
                            <Select
                                name="partyId"
                                value={formData.partyId}
                                onChange={handleChange}
                                label={`Select ${formData.partyType === 'supplier' ? 'Supplier' : 'Customer'} *`}
                            >
                                {formData.partyType === 'supplier' 
                                    ? suppliers.map((supplier) => (
                                        <MenuItem key={supplier.id} value={supplier.id}>
                                            {supplier.name}
                                        </MenuItem>
                                    ))
                                    : customers.map((customer) => (
                                        <MenuItem key={customer.id} value={customer.id}>
                                            {customer.name}
                                        </MenuItem>
                                    ))
                                }
                            </Select>
                        </FormControl>
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
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Cancel</Button>
                    <Button onClick={handleSubmit} variant="contained">
                        Record Payment
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
