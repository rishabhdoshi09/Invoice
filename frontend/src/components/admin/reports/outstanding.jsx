import { useEffect, useState, useCallback } from 'react';
import { 
    Box, Card, CardContent, Table, TableBody, TableCell, TableContainer, 
    TableHead, TableRow, Typography, Tabs, Tab, Button, Dialog, DialogTitle,
    DialogContent, DialogActions, TextField, IconButton, Tooltip, Chip,
    Alert, CircularProgress, Paper, Divider, Grid, FormControl, InputLabel,
    Select, MenuItem, Autocomplete
} from '@mui/material';
import { 
    Add, Payment, Refresh, Edit, Receipt, AccountBalance, 
    TrendingUp, TrendingDown, History, Person, LocalShipping,
    Delete
} from '@mui/icons-material';
import { listCustomers, updateCustomer } from '../../../services/customer';
import { listSuppliers, updateSupplier } from '../../../services/supplier';
import { createPayment, listPayments, getOutstandingReceivables, getOutstandingPayables } from '../../../services/tally';
import moment from 'moment';
import axios from 'axios';

export const OutstandingReports = () => {
    const [tab, setTab] = useState(0);
    const [receivables, setReceivables] = useState([]);
    const [payables, setPayables] = useState([]);
    const [selectedParty, setSelectedParty] = useState(null);
    const [partyTransactions, setPartyTransactions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [transactionsLoading, setTransactionsLoading] = useState(false);
    
    // Dialog states
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogType, setDialogType] = useState(''); // 'receive_payment', 'pay_supplier'
    const [submitting, setSubmitting] = useState(false);
    
    // Form data
    const [formData, setFormData] = useState({
        amount: '',
        description: '',
        billNumber: '',
        date: moment().format('YYYY-MM-DD')
    });

    // Totals
    const [totalReceivable, setTotalReceivable] = useState(0);
    const [totalPayable, setTotalPayable] = useState(0);

    // Fetch outstanding receivables (from orders)
    const fetchReceivables = useCallback(async () => {
        try {
            const response = await getOutstandingReceivables();
            const data = response.data || [];
            setReceivables(data);
            setTotalReceivable(response.totalReceivable || data.reduce((sum, c) => sum + (c.totalOutstanding || 0), 0));
        } catch (error) {
            console.error('Error fetching receivables:', error);
            setReceivables([]);
        }
    }, []);

    // Fetch outstanding payables (from purchase bills)
    const fetchPayables = useCallback(async () => {
        try {
            const response = await getOutstandingPayables();
            const data = response.data || [];
            setPayables(data);
            setTotalPayable(response.totalPayable || data.reduce((sum, s) => sum + (s.totalOutstanding || 0), 0));
        } catch (error) {
            console.error('Error fetching payables:', error);
            setPayables([]);
        }
    }, []);

    // Fetch all data
    const fetchAll = useCallback(async () => {
        setLoading(true);
        await Promise.all([fetchReceivables(), fetchPayables()]);
        setLoading(false);
    }, [fetchReceivables, fetchPayables]);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    // Fetch transactions/orders for selected party
    const fetchPartyTransactions = async (party, type) => {
        setTransactionsLoading(true);
        try {
            const transactions = [];
            
            if (type === 'customer') {
                // For customers, show their unpaid orders
                const orders = party.orders || [];
                orders.forEach(order => {
                    transactions.push({
                        id: order.id,
                        date: moment(order.orderDate).format('DD/MM/YYYY'),
                        description: `Bill: ${order.orderNumber}`,
                        type: 'bill',
                        orderNumber: order.orderNumber,
                        debit: order.total || 0,
                        credit: order.paidAmount || 0,
                        due: order.dueAmount || (order.total - (order.paidAmount || 0)),
                        status: order.paymentStatus
                    });
                });
            } else {
                // For suppliers, show their unpaid bills
                const bills = party.bills || [];
                bills.forEach(bill => {
                    transactions.push({
                        id: bill.id,
                        date: moment(bill.billDate).format('DD/MM/YYYY'),
                        description: `Bill: ${bill.billNumber}`,
                        type: 'bill',
                        billNumber: bill.billNumber,
                        credit: bill.total || 0,
                        debit: bill.paidAmount || 0,
                        due: bill.dueAmount || (bill.total - (bill.paidAmount || 0)),
                        status: bill.paymentStatus
                    });
                });
            }
            
            setPartyTransactions(transactions);
        } catch (error) {
            console.error('Error fetching transactions:', error);
            setPartyTransactions([]);
        } finally {
            setTransactionsLoading(false);
        }
    };

    // Select a party to view ledger
    const handleSelectParty = (party, type) => {
        setSelectedParty({ ...party, partyType: type });
        fetchPartyTransactions(party, type);
    };

    // Open dialog for different actions
    const openDialog = (type) => {
        setDialogType(type);
        setFormData({
            amount: '',
            description: '',
            billNumber: '',
            date: moment().format('YYYY-MM-DD')
        });
        setDialogOpen(true);
    };

    // Handle form submission
    const handleSubmit = async () => {
        const amount = parseFloat(formData.amount);
        if (!amount || amount <= 0) {
            alert('Please enter a valid amount');
            return;
        }

        setSubmitting(true);
        try {
            if (dialogType === 'receive_payment') {
                // Receive payment from customer
                await createPayment({
                    paymentDate: formData.date,
                    partyType: 'customer',
                    partyName: selectedParty.customerName || selectedParty.name,
                    amount: amount,
                    referenceType: 'advance',
                    notes: formData.description || 'Payment received'
                });
                
            } else if (dialogType === 'pay_supplier') {
                // Pay supplier
                await createPayment({
                    paymentDate: formData.date,
                    partyType: 'supplier',
                    partyName: selectedParty.supplierName || selectedParty.name,
                    partyId: selectedParty.supplierId,
                    amount: amount,
                    referenceType: 'advance',
                    notes: formData.description || 'Payment made'
                });
            }

            setDialogOpen(false);
            setSelectedParty(null);
            await fetchAll();
        } catch (error) {
            console.error('Error:', error);
            alert('Error processing transaction. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const getDialogTitle = () => {
        switch(dialogType) {
            case 'receive_payment': return 'Receive Payment from Customer';
            case 'pay_supplier': return 'Pay Supplier';
            default: return 'Transaction';
        }
    };

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AccountBalance /> Outstanding Reports
                </Typography>
                <Tooltip title="Refresh Data">
                    <IconButton onClick={fetchAll} disabled={loading}>
                        <Refresh />
                    </IconButton>
                </Tooltip>
            </Box>

            {/* Summary Cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6}>
                    <Paper sx={{ p: 2, bgcolor: '#e8f5e9', border: '2px solid #4caf50' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TrendingUp sx={{ color: '#2e7d32', fontSize: 40 }} />
                            <Box>
                                <Typography variant="body2" color="text.secondary">Total Receivables (from Orders)</Typography>
                                <Typography variant="h4" color="success.main" fontWeight="bold">
                                    ₹{totalReceivable.toLocaleString('en-IN')}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    From {receivables.length} customer(s) with unpaid orders
                                </Typography>
                            </Box>
                        </Box>
                    </Paper>
                </Grid>
                <Grid item xs={12} sm={6}>
                    <Paper sx={{ p: 2, bgcolor: '#ffebee', border: '2px solid #ef5350' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <TrendingDown sx={{ color: '#c62828', fontSize: 40 }} />
                            <Box>
                                <Typography variant="body2" color="text.secondary">Total Payables (from Purchase Bills)</Typography>
                                <Typography variant="h4" color="error.main" fontWeight="bold">
                                    ₹{totalPayable.toLocaleString('en-IN')}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    To {payables.length} supplier(s) with unpaid bills
                                </Typography>
                            </Box>
                        </Box>
                    </Paper>
                </Grid>
            </Grid>

            {/* Tabs */}
            <Tabs value={tab} onChange={(e, v) => { setTab(v); setSelectedParty(null); }} sx={{ mb: 2 }}>
                <Tab icon={<Person />} label={`Receivables (${receivables.length})`} />
                <Tab icon={<LocalShipping />} label={`Payables (${payables.length})`} />
            </Tabs>

            <Grid container spacing={2}>
                {/* Party List */}
                <Grid item xs={12} md={selectedParty ? 5 : 12}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" sx={{ mb: 2 }}>
                                {tab === 0 ? 'Customers with Outstanding' : 'Suppliers with Outstanding'}
                            </Typography>
                            
                            {loading ? (
                                <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                                    <CircularProgress />
                                </Box>
                            ) : (
                                <TableContainer sx={{ maxHeight: 500 }}>
                                    <Table size="small" stickyHeader>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell><strong>Name</strong></TableCell>
                                                <TableCell align="right"><strong>Outstanding</strong></TableCell>
                                                <TableCell align="right"><strong>Bills</strong></TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {tab === 0 ? (
                                                receivables.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={3} align="center">
                                                            <Typography color="text.secondary">No outstanding receivables</Typography>
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    receivables.map((customer, idx) => (
                                                        <TableRow 
                                                            key={idx} 
                                                            hover 
                                                            onClick={() => handleSelectParty(customer, 'customer')}
                                                            selected={selectedParty?.customerName === customer.customerName}
                                                            sx={{ cursor: 'pointer' }}
                                                        >
                                                            <TableCell>
                                                                <Typography variant="body2" fontWeight={selectedParty?.customerName === customer.customerName ? 'bold' : 'normal'}>
                                                                    {customer.customerName || customer.name}
                                                                </Typography>
                                                                {customer.customerMobile && (
                                                                    <Typography variant="caption" color="text.secondary">
                                                                        {customer.customerMobile}
                                                                    </Typography>
                                                                )}
                                                            </TableCell>
                                                            <TableCell align="right">
                                                                <Typography color="success.main" fontWeight="bold">
                                                                    ₹{(customer.totalOutstanding || 0).toLocaleString('en-IN')}
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell align="right">
                                                                <Chip label={customer.orderCount || customer.orders?.length || 0} size="small" />
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                )
                                            ) : (
                                                payables.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={3} align="center">
                                                            <Typography color="text.secondary">No outstanding payables</Typography>
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    payables.map((supplier, idx) => (
                                                        <TableRow 
                                                            key={idx} 
                                                            hover 
                                                            onClick={() => handleSelectParty(supplier, 'supplier')}
                                                            selected={selectedParty?.supplierId === supplier.supplierId}
                                                            sx={{ cursor: 'pointer' }}
                                                        >
                                                            <TableCell>
                                                                <Typography variant="body2" fontWeight={selectedParty?.supplierId === supplier.supplierId ? 'bold' : 'normal'}>
                                                                    {supplier.supplierName || supplier.name}
                                                                </Typography>
                                                                {supplier.supplierMobile && (
                                                                    <Typography variant="caption" color="text.secondary">
                                                                        {supplier.supplierMobile}
                                                                    </Typography>
                                                                )}
                                                            </TableCell>
                                                            <TableCell align="right">
                                                                <Typography color="error.main" fontWeight="bold">
                                                                    ₹{(supplier.totalOutstanding || 0).toLocaleString('en-IN')}
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell align="right">
                                                                <Chip label={supplier.billCount || supplier.bills?.length || 0} size="small" />
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                )
                                            )}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                        </CardContent>
                    </Card>
                </Grid>

                {/* Detail View */}
                {selectedParty && (
                    <Grid item xs={12} md={7}>
                        <Card>
                            <CardContent>
                                {/* Party Header */}
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                    <Box>
                                        <Typography variant="h6">
                                            {selectedParty.customerName || selectedParty.supplierName || selectedParty.name}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {selectedParty.customerMobile || selectedParty.supplierMobile}
                                        </Typography>
                                    </Box>
                                    <Box>
                                        <Chip 
                                            label={`Outstanding: ₹${(selectedParty.totalOutstanding || 0).toLocaleString('en-IN')}`}
                                            color={selectedParty.partyType === 'customer' ? 'success' : 'error'}
                                            sx={{ fontWeight: 'bold', fontSize: '1rem' }}
                                        />
                                    </Box>
                                </Box>

                                {/* Action Buttons */}
                                <Box sx={{ display: 'flex', gap: 1, mb: 2 }}>
                                    {selectedParty.partyType === 'customer' ? (
                                        <Button 
                                            variant="contained" 
                                            color="success"
                                            startIcon={<Payment />}
                                            onClick={() => openDialog('receive_payment')}
                                        >
                                            Receive Payment
                                        </Button>
                                    ) : (
                                        <Button 
                                            variant="contained" 
                                            color="error"
                                            startIcon={<Payment />}
                                            onClick={() => openDialog('pay_supplier')}
                                        >
                                            Pay Supplier
                                        </Button>
                                    )}
                                </Box>

                                <Divider sx={{ mb: 2 }} />

                                {/* Outstanding Bills/Orders */}
                                <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <Receipt /> {selectedParty.partyType === 'customer' ? 'Unpaid Orders' : 'Unpaid Bills'}
                                </Typography>

                                {transactionsLoading ? (
                                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                                        <CircularProgress />
                                    </Box>
                                ) : (
                                    <TableContainer sx={{ maxHeight: 350 }}>
                                        <Table size="small" stickyHeader>
                                            <TableHead>
                                                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                                    <TableCell><strong>Date</strong></TableCell>
                                                    <TableCell><strong>{selectedParty.partyType === 'customer' ? 'Order #' : 'Bill #'}</strong></TableCell>
                                                    <TableCell align="right"><strong>Total</strong></TableCell>
                                                    <TableCell align="right"><strong>Paid</strong></TableCell>
                                                    <TableCell align="right"><strong>Due</strong></TableCell>
                                                    <TableCell align="center"><strong>Status</strong></TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {partyTransactions.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={6} align="center">
                                                            <Typography color="text.secondary">No outstanding items</Typography>
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    partyTransactions.map((txn, idx) => (
                                                        <TableRow key={txn.id || idx} hover>
                                                            <TableCell>{txn.date}</TableCell>
                                                            <TableCell>
                                                                <Typography variant="body2" color="primary" fontWeight="bold">
                                                                    {txn.orderNumber || txn.billNumber}
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell align="right">
                                                                ₹{(selectedParty.partyType === 'customer' ? txn.debit : txn.credit || 0).toLocaleString('en-IN')}
                                                            </TableCell>
                                                            <TableCell align="right">
                                                                ₹{(selectedParty.partyType === 'customer' ? txn.credit : txn.debit || 0).toLocaleString('en-IN')}
                                                            </TableCell>
                                                            <TableCell align="right">
                                                                <Typography color="error.main" fontWeight="bold">
                                                                    ₹{(txn.due || 0).toLocaleString('en-IN')}
                                                                </Typography>
                                                            </TableCell>
                                                            <TableCell align="center">
                                                                <Chip 
                                                                    label={txn.status || 'unpaid'} 
                                                                    size="small"
                                                                    color={txn.status === 'partial' ? 'warning' : 'error'}
                                                                />
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                )}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                )}

                                {/* Total */}
                                <Box sx={{ mt: 2, p: 2, bgcolor: selectedParty.partyType === 'customer' ? '#e8f5e9' : '#ffebee', borderRadius: 1 }}>
                                    <Typography variant="subtitle1" fontWeight="bold">
                                        Total Outstanding: ₹{(selectedParty.totalOutstanding || 0).toLocaleString('en-IN')}
                                        {selectedParty.partyType === 'customer' ? ' (Receivable)' : ' (Payable)'}
                                    </Typography>
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>
                )}
            </Grid>

            {/* Payment Dialog */}
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{getDialogTitle()}</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                        {selectedParty && (
                            <Alert severity="info">
                                {selectedParty.partyType === 'customer' ? 'Customer' : 'Supplier'}: <strong>{selectedParty.customerName || selectedParty.supplierName || selectedParty.name}</strong>
                                <br />
                                Outstanding: ₹{(selectedParty.totalOutstanding || 0).toLocaleString('en-IN')}
                            </Alert>
                        )}
                        
                        <TextField
                            label="Date"
                            type="date"
                            value={formData.date}
                            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                        />
                        
                        <TextField
                            label="Amount (₹)"
                            type="number"
                            value={formData.amount}
                            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                            fullWidth
                            autoFocus
                            InputProps={{ inputProps: { min: 0 } }}
                        />
                        
                        <TextField
                            label="Description / Narration"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            fullWidth
                            multiline
                            rows={2}
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDialogOpen(false)} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button 
                        onClick={handleSubmit} 
                        variant="contained" 
                        color={dialogType === 'receive_payment' ? 'success' : 'error'}
                        disabled={submitting || !formData.amount}
                    >
                        {submitting ? <CircularProgress size={24} /> : 'Save'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

