import { useEffect, useState, useCallback } from 'react';
import { 
    Box, Card, CardContent, Table, TableBody, TableCell, TableContainer, 
    TableHead, TableRow, Typography, Tabs, Tab, Button, Dialog, DialogTitle,
    DialogContent, DialogActions, TextField, IconButton, Tooltip, Chip,
    Alert, CircularProgress
} from '@mui/material';
import { Add, Payment, Refresh, Edit } from '@mui/icons-material';
import { getOutstandingPayables, getOutstandingReceivables, createPayment } from '../../../services/tally';
import { updateCustomer } from '../../../services/customer';
import { updateSupplier } from '../../../services/supplier';
import moment from 'moment';

export const OutstandingReports = () => {
    const [tab, setTab] = useState(0);
    const [payables, setPayables] = useState([]);
    const [receivables, setReceivables] = useState([]);
    const [totalPayable, setTotalPayable] = useState(0);
    const [totalReceivable, setTotalReceivable] = useState(0);
    const [loading, setLoading] = useState(false);
    
    // Payment dialog state
    const [paymentDialog, setPaymentDialog] = useState({ open: false, type: null, party: null });
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentNotes, setPaymentNotes] = useState('');
    const [submitting, setSubmitting] = useState(false);
    
    // Balance adjustment dialog state
    const [adjustDialog, setAdjustDialog] = useState({ open: false, type: null, party: null });
    const [adjustAmount, setAdjustAmount] = useState('');
    const [adjustSubmitting, setAdjustSubmitting] = useState(false);

    const fetchReports = useCallback(async () => {
        try {
            setLoading(true);
            const [payablesRes, receivablesRes] = await Promise.all([
                getOutstandingPayables(),
                getOutstandingReceivables()
            ]);
            
            const payablesData = payablesRes.data;
            const receivablesData = receivablesRes.data;
            
            if (Array.isArray(payablesData)) {
                setPayables(payablesData);
                setTotalPayable(payablesRes.totalPayable || 0);
            } else {
                setPayables(payablesData?.suppliers || []);
                setTotalPayable(payablesData?.totalPayable || 0);
            }
            
            if (Array.isArray(receivablesData)) {
                setReceivables(receivablesData);
                setTotalReceivable(receivablesRes.totalReceivable || 0);
            } else {
                setReceivables(receivablesData?.customers || []);
                setTotalReceivable(receivablesData?.totalReceivable || 0);
            }
        } catch (error) {
            console.error('Error fetching reports:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchReports();
    }, [fetchReports]);

    // Open payment dialog
    const handleOpenPaymentDialog = (type, party) => {
        setPaymentDialog({ open: true, type, party });
        setPaymentAmount('');
        setPaymentNotes('');
    };

    // Close payment dialog
    const handleClosePaymentDialog = () => {
        setPaymentDialog({ open: false, type: null, party: null });
        setPaymentAmount('');
        setPaymentNotes('');
    };

    // Submit payment
    const handleSubmitPayment = async () => {
        const amount = parseFloat(paymentAmount);
        if (!amount || amount <= 0) {
            alert('Please enter a valid amount');
            return;
        }

        try {
            setSubmitting(true);
            const { type, party } = paymentDialog;
            
            const payload = {
                paymentDate: moment().format('YYYY-MM-DD'),
                partyType: type === 'receivable' ? 'customer' : 'supplier',
                partyName: type === 'receivable' 
                    ? (party.customerName || party.name)
                    : (party.supplierName || party.name),
                partyId: type === 'receivable' ? party.customerId : party.supplierId,
                amount: amount,
                referenceType: 'advance',
                notes: paymentNotes || `Payment recorded from Outstanding Reports`
            };

            await createPayment(payload);
            handleClosePaymentDialog();
            fetchReports(); // Refresh data
        } catch (error) {
            console.error('Error recording payment:', error);
            alert('Error recording payment. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    // Open balance adjustment dialog
    const handleOpenAdjustDialog = (type, party) => {
        setAdjustDialog({ open: true, type, party });
        setAdjustAmount(
            type === 'receivable' 
                ? (party.totalOutstanding || party.totalDue || party.currentBalance || 0).toString()
                : (party.totalOutstanding || party.currentBalance || 0).toString()
        );
    };

    // Close adjustment dialog
    const handleCloseAdjustDialog = () => {
        setAdjustDialog({ open: false, type: null, party: null });
        setAdjustAmount('');
    };

    // Submit balance adjustment
    const handleSubmitAdjustment = async () => {
        const amount = parseFloat(adjustAmount);
        if (isNaN(amount) || amount < 0) {
            alert('Please enter a valid amount (0 or more)');
            return;
        }

        try {
            setAdjustSubmitting(true);
            const { type, party } = adjustDialog;
            
            if (type === 'receivable') {
                // Update customer balance
                const customerId = party.customerId || party.id;
                if (customerId) {
                    await updateCustomer(customerId, { 
                        openingBalance: amount,
                        currentBalance: amount 
                    });
                }
            } else {
                // Update supplier balance
                const supplierId = party.supplierId || party.id;
                if (supplierId) {
                    await updateSupplier(supplierId, { 
                        openingBalance: amount,
                        currentBalance: amount 
                    });
                }
            }
            
            handleCloseAdjustDialog();
            fetchReports(); // Refresh data
        } catch (error) {
            console.error('Error adjusting balance:', error);
            alert('Error adjusting balance. Please try again.');
        } finally {
            setAdjustSubmitting(false);
        }
    };

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5">Outstanding Reports</Typography>
                <Tooltip title="Refresh Data">
                    <IconButton onClick={fetchReports} disabled={loading}>
                        <Refresh />
                    </IconButton>
                </Tooltip>
            </Box>

            <Tabs value={tab} onChange={(e, newValue) => setTab(newValue)} sx={{ mb: 3 }}>
                <Tab label={`Payables (₹${totalPayable.toLocaleString('en-IN')})`} />
                <Tab label={`Receivables (₹${totalReceivable.toLocaleString('en-IN')})`} />
            </Tabs>

            {/* Payables Tab */}
            {tab === 0 && (
                <Card>
                    <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Box>
                                <Typography variant="h6">Outstanding Payables</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Total Amount Due to Suppliers: ₹{totalPayable.toLocaleString('en-IN')}
                                </Typography>
                            </Box>
                        </Box>
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow sx={{ bgcolor: 'error.light' }}>
                                        <TableCell><strong>Supplier Name</strong></TableCell>
                                        <TableCell><strong>Mobile</strong></TableCell>
                                        <TableCell align="right"><strong>Outstanding Balance</strong></TableCell>
                                        <TableCell align="right"><strong>Pending Bills</strong></TableCell>
                                        <TableCell align="center"><strong>Actions</strong></TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={5} align="center">
                                                <CircularProgress size={24} />
                                            </TableCell>
                                        </TableRow>
                                    ) : payables.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} align="center">
                                                <Typography color="text.secondary">No outstanding payables</Typography>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        payables.map((supplier, index) => (
                                            <TableRow key={supplier.supplierId || index} hover>
                                                <TableCell>{supplier.supplierName || supplier.name}</TableCell>
                                                <TableCell>{supplier.supplierMobile || supplier.mobile || '-'}</TableCell>
                                                <TableCell align="right">
                                                    <Typography color="error.main" fontWeight="bold">
                                                        ₹{(supplier.totalOutstanding || supplier.currentBalance || 0).toLocaleString('en-IN')}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Chip 
                                                        label={supplier.billCount || supplier.bills?.length || 0} 
                                                        size="small" 
                                                        color="default"
                                                    />
                                                </TableCell>
                                                <TableCell align="center">
                                                    <Tooltip title="Make Payment">
                                                        <Button
                                                            size="small"
                                                            variant="contained"
                                                            color="error"
                                                            startIcon={<Payment />}
                                                            onClick={() => handleOpenPaymentDialog('payable', supplier)}
                                                            sx={{ mr: 1 }}
                                                        >
                                                            Pay
                                                        </Button>
                                                    </Tooltip>
                                                    <Tooltip title="Adjust Balance">
                                                        <IconButton
                                                            size="small"
                                                            color="primary"
                                                            onClick={() => handleOpenAdjustDialog('payable', supplier)}
                                                        >
                                                            <Edit fontSize="small" />
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
            )}

            {/* Receivables Tab */}
            {tab === 1 && (
                <Card>
                    <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Box>
                                <Typography variant="h6">Outstanding Receivables</Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Total Amount Due from Customers: ₹{totalReceivable.toLocaleString('en-IN')}
                                </Typography>
                            </Box>
                        </Box>
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow sx={{ bgcolor: 'success.light' }}>
                                        <TableCell><strong>Customer Name</strong></TableCell>
                                        <TableCell><strong>Mobile</strong></TableCell>
                                        <TableCell align="right"><strong>Total Due</strong></TableCell>
                                        <TableCell align="right"><strong>Pending Orders</strong></TableCell>
                                        <TableCell align="center"><strong>Actions</strong></TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={5} align="center">
                                                <CircularProgress size={24} />
                                            </TableCell>
                                        </TableRow>
                                    ) : receivables.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} align="center">
                                                <Typography color="text.secondary">No outstanding receivables</Typography>
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        receivables.map((customer, index) => (
                                            <TableRow key={index} hover>
                                                <TableCell>{customer.customerName || customer.name}</TableCell>
                                                <TableCell>{customer.customerMobile || customer.mobile || '-'}</TableCell>
                                                <TableCell align="right">
                                                    <Typography color="success.main" fontWeight="bold">
                                                        ₹{(customer.totalOutstanding || customer.totalDue || 0).toLocaleString('en-IN')}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell align="right">
                                                    <Chip 
                                                        label={customer.orderCount || customer.orders?.length || 0} 
                                                        size="small" 
                                                        color="default"
                                                    />
                                                </TableCell>
                                                <TableCell align="center">
                                                    <Tooltip title="Receive Payment">
                                                        <Button
                                                            size="small"
                                                            variant="contained"
                                                            color="success"
                                                            startIcon={<Payment />}
                                                            onClick={() => handleOpenPaymentDialog('receivable', customer)}
                                                            sx={{ mr: 1 }}
                                                        >
                                                            Receive
                                                        </Button>
                                                    </Tooltip>
                                                    <Tooltip title="Adjust Balance">
                                                        <IconButton
                                                            size="small"
                                                            color="primary"
                                                            onClick={() => handleOpenAdjustDialog('receivable', customer)}
                                                        >
                                                            <Edit fontSize="small" />
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
            )}

            {/* Payment Dialog */}
            <Dialog open={paymentDialog.open} onClose={handleClosePaymentDialog} maxWidth="sm" fullWidth>
                <DialogTitle>
                    {paymentDialog.type === 'receivable' ? 'Receive Payment' : 'Make Payment'}
                </DialogTitle>
                <DialogContent>
                    {paymentDialog.party && (
                        <Box sx={{ mb: 3, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                            <Typography variant="subtitle2">
                                {paymentDialog.type === 'receivable' ? 'Customer' : 'Supplier'}:
                            </Typography>
                            <Typography variant="h6">
                                {paymentDialog.type === 'receivable' 
                                    ? (paymentDialog.party.customerName || paymentDialog.party.name)
                                    : (paymentDialog.party.supplierName || paymentDialog.party.name)
                                }
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Outstanding: ₹{(
                                    paymentDialog.party.totalOutstanding || 
                                    paymentDialog.party.totalDue || 
                                    paymentDialog.party.currentBalance || 0
                                ).toLocaleString('en-IN')}
                            </Typography>
                        </Box>
                    )}
                    
                    <TextField
                        autoFocus
                        label="Amount (₹)"
                        type="number"
                        fullWidth
                        value={paymentAmount}
                        onChange={(e) => setPaymentAmount(e.target.value)}
                        sx={{ mb: 2 }}
                        InputProps={{ inputProps: { min: 0 } }}
                    />
                    
                    <TextField
                        label="Notes (optional)"
                        fullWidth
                        multiline
                        rows={2}
                        value={paymentNotes}
                        onChange={(e) => setPaymentNotes(e.target.value)}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleClosePaymentDialog} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleSubmitPayment} 
                        variant="contained" 
                        color={paymentDialog.type === 'receivable' ? 'success' : 'error'}
                        disabled={submitting || !paymentAmount}
                    >
                        {submitting ? <CircularProgress size={24} /> : 
                            paymentDialog.type === 'receivable' ? 'Receive Payment' : 'Make Payment'
                        }
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Balance Adjustment Dialog */}
            <Dialog open={adjustDialog.open} onClose={handleCloseAdjustDialog} maxWidth="sm" fullWidth>
                <DialogTitle>Adjust Balance</DialogTitle>
                <DialogContent>
                    {adjustDialog.party && (
                        <Box sx={{ mb: 3 }}>
                            <Alert severity="warning" sx={{ mb: 2 }}>
                                ⚠️ This will directly set the outstanding balance. Use only for corrections.
                            </Alert>
                            <Typography variant="subtitle2">
                                {adjustDialog.type === 'receivable' ? 'Customer' : 'Supplier'}:
                            </Typography>
                            <Typography variant="h6">
                                {adjustDialog.type === 'receivable' 
                                    ? (adjustDialog.party.customerName || adjustDialog.party.name)
                                    : (adjustDialog.party.supplierName || adjustDialog.party.name)
                                }
                            </Typography>
                        </Box>
                    )}
                    
                    <TextField
                        autoFocus
                        label="New Balance Amount (₹)"
                        type="number"
                        fullWidth
                        value={adjustAmount}
                        onChange={(e) => setAdjustAmount(e.target.value)}
                        helperText="Enter 0 to clear the balance"
                        InputProps={{ inputProps: { min: 0 } }}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseAdjustDialog} disabled={adjustSubmitting}>
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleSubmitAdjustment} 
                        variant="contained" 
                        color="primary"
                        disabled={adjustSubmitting}
                    >
                        {adjustSubmitting ? <CircularProgress size={24} /> : 'Update Balance'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
