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
import { createPayment, listPayments } from '../../../services/tally';
import moment from 'moment';
import axios from 'axios';

export const OutstandingReports = () => {
    const [tab, setTab] = useState(0);
    const [customers, setCustomers] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [selectedParty, setSelectedParty] = useState(null);
    const [partyTransactions, setPartyTransactions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [transactionsLoading, setTransactionsLoading] = useState(false);
    
    // Dialog states
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogType, setDialogType] = useState(''); // 'add_bill', 'receive_payment', 'pay_supplier', 'add_supplier_bill'
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

    // Fetch customers
    const fetchCustomers = useCallback(async () => {
        try {
            const { rows } = await listCustomers({});
            setCustomers(rows || []);
            const total = (rows || []).reduce((sum, c) => sum + (c.currentBalance || 0), 0);
            setTotalReceivable(total);
        } catch (error) {
            console.error('Error fetching customers:', error);
        }
    }, []);

    // Fetch suppliers
    const fetchSuppliers = useCallback(async () => {
        try {
            const { rows } = await listSuppliers({});
            setSuppliers(rows || []);
            const total = (rows || []).reduce((sum, s) => sum + (s.currentBalance || 0), 0);
            setTotalPayable(total);
        } catch (error) {
            console.error('Error fetching suppliers:', error);
        }
    }, []);

    // Fetch all data
    const fetchAll = useCallback(async () => {
        setLoading(true);
        await Promise.all([fetchCustomers(), fetchSuppliers()]);
        setLoading(false);
    }, [fetchCustomers, fetchSuppliers]);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    // Fetch transactions for selected party
    const fetchPartyTransactions = async (party, type) => {
        setTransactionsLoading(true);
        try {
            const token = localStorage.getItem('token');
            const partyName = party.name;
            const partyType = type === 'customer' ? 'customer' : 'supplier';
            
            // Get payments for this party
            const response = await axios.get(
                `${process.env.REACT_APP_BACKEND_URL}/api/payments`,
                {
                    params: { partyName, partyType, limit: 100 },
                    headers: { Authorization: `Bearer ${token}` }
                }
            );
            
            const payments = response.data?.data?.rows || response.data?.rows || [];
            
            // Create transaction list with opening balance
            const transactions = [];
            
            // Add opening balance as first entry
            if (party.openingBalance > 0) {
                transactions.push({
                    id: 'opening',
                    date: 'Opening',
                    description: 'Opening Balance',
                    type: 'opening',
                    debit: type === 'customer' ? party.openingBalance : 0,
                    credit: type === 'supplier' ? party.openingBalance : 0,
                });
            }
            
            // Add payments
            payments.forEach(p => {
                transactions.push({
                    id: p.id,
                    date: moment(p.paymentDate || p.createdAt).format('DD/MM/YYYY'),
                    description: p.notes || `${p.referenceType} - ${p.paymentNumber}`,
                    type: 'payment',
                    paymentNumber: p.paymentNumber,
                    // For customer: payment received = credit (reduces receivable)
                    // For supplier: payment made = debit (reduces payable)
                    debit: type === 'supplier' ? p.amount : 0,
                    credit: type === 'customer' ? p.amount : 0,
                });
            });
            
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
        setSelectedParty({ ...party, type });
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
            const token = localStorage.getItem('token');
            
            if (dialogType === 'add_bill') {
                // Add customer bill = increase receivable
                const newBalance = (selectedParty.currentBalance || 0) + amount;
                await updateCustomer(selectedParty.id, { 
                    currentBalance: newBalance 
                });
                
                // Record as a transaction
                await axios.post(
                    `${process.env.REACT_APP_BACKEND_URL}/api/payments`,
                    {
                        paymentDate: formData.date,
                        partyType: 'customer',
                        partyName: selectedParty.name,
                        partyId: selectedParty.id,
                        amount: -amount, // Negative to indicate bill/debit
                        referenceType: 'bill',
                        notes: formData.description || `Bill: ${formData.billNumber || 'N/A'}`
                    },
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                
            } else if (dialogType === 'receive_payment') {
                // Receive payment from customer = decrease receivable
                await createPayment({
                    paymentDate: formData.date,
                    partyType: 'customer',
                    partyName: selectedParty.name,
                    partyId: selectedParty.id,
                    amount: amount,
                    referenceType: 'advance',
                    notes: formData.description || 'Payment received'
                });
                
            } else if (dialogType === 'add_supplier_bill') {
                // Add supplier bill = increase payable
                const newBalance = (selectedParty.currentBalance || 0) + amount;
                await updateSupplier(selectedParty.id, { 
                    currentBalance: newBalance 
                });
                
                // Record as a transaction
                await axios.post(
                    `${process.env.REACT_APP_BACKEND_URL}/api/payments`,
                    {
                        paymentDate: formData.date,
                        partyType: 'supplier',
                        partyName: selectedParty.name,
                        partyId: selectedParty.id,
                        amount: -amount, // Negative to indicate bill/credit
                        referenceType: 'bill',
                        notes: formData.description || `Bill: ${formData.billNumber || 'N/A'}`
                    },
                    { headers: { Authorization: `Bearer ${token}` } }
                );
                
            } else if (dialogType === 'pay_supplier') {
                // Pay supplier = decrease payable
                await createPayment({
                    paymentDate: formData.date,
                    partyType: 'supplier',
                    partyName: selectedParty.name,
                    partyId: selectedParty.id,
                    amount: amount,
                    referenceType: 'advance',
                    notes: formData.description || 'Payment made'
                });
            }

            setDialogOpen(false);
            await fetchAll();
            if (selectedParty) {
                const updatedParty = selectedParty.type === 'customer' 
                    ? customers.find(c => c.id === selectedParty.id)
                    : suppliers.find(s => s.id === selectedParty.id);
                if (updatedParty) {
                    fetchPartyTransactions(updatedParty, selectedParty.type);
                }
            }
        } catch (error) {
            console.error('Error:', error);
            alert('Error processing transaction. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    // Calculate running balance
    const calculateRunningBalance = (transactions, type) => {
        let balance = 0;
        return transactions.map(t => {
            if (type === 'customer') {
                balance += (t.debit || 0) - (t.credit || 0);
            } else {
                balance += (t.credit || 0) - (t.debit || 0);
            }
            return { ...t, balance };
        });
    };

    const getDialogTitle = () => {
        switch(dialogType) {
            case 'add_bill': return 'Add Customer Bill (Receivable)';
            case 'receive_payment': return 'Receive Payment from Customer';
            case 'add_supplier_bill': return 'Add Supplier Bill (Payable)';
            case 'pay_supplier': return 'Pay Supplier';
            default: return 'Transaction';
        }
    };

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AccountBalance /> Ledger & Transactions
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
                                <Typography variant="body2" color="text.secondary">Total Receivables</Typography>
                                <Typography variant="h4" color="success.main" fontWeight="bold">
                                    ₹{totalReceivable.toLocaleString('en-IN')}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    From {customers.filter(c => (c.currentBalance || 0) > 0).length} customers
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
                                <Typography variant="body2" color="text.secondary">Total Payables</Typography>
                                <Typography variant="h4" color="error.main" fontWeight="bold">
                                    ₹{totalPayable.toLocaleString('en-IN')}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    To {suppliers.filter(s => (s.currentBalance || 0) > 0).length} suppliers
                                </Typography>
                            </Box>
                        </Box>
                    </Paper>
                </Grid>
            </Grid>

            {/* Tabs */}
            <Tabs value={tab} onChange={(e, v) => { setTab(v); setSelectedParty(null); }} sx={{ mb: 2 }}>
                <Tab icon={<Person />} label="Customers (Receivables)" />
                <Tab icon={<LocalShipping />} label="Suppliers (Payables)" />
            </Tabs>

            <Grid container spacing={2}>
                {/* Party List */}
                <Grid item xs={12} md={selectedParty ? 4 : 12}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" sx={{ mb: 2 }}>
                                {tab === 0 ? 'Customer List' : 'Supplier List'}
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
                                                <TableCell align="right"><strong>Balance</strong></TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {tab === 0 ? (
                                                customers.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={2} align="center">No customers</TableCell>
                                                    </TableRow>
                                                ) : (
                                                    customers.map(customer => (
                                                        <TableRow 
                                                            key={customer.id} 
                                                            hover 
                                                            onClick={() => handleSelectParty(customer, 'customer')}
                                                            selected={selectedParty?.id === customer.id}
                                                            sx={{ cursor: 'pointer' }}
                                                        >
                                                            <TableCell>
                                                                <Typography variant="body2" fontWeight={selectedParty?.id === customer.id ? 'bold' : 'normal'}>
                                                                    {customer.name}
                                                                </Typography>
                                                                {customer.mobile && (
                                                                    <Typography variant="caption" color="text.secondary">
                                                                        {customer.mobile}
                                                                    </Typography>
                                                                )}
                                                            </TableCell>
                                                            <TableCell align="right">
                                                                <Typography 
                                                                    color={(customer.currentBalance || 0) > 0 ? 'success.main' : 'text.secondary'}
                                                                    fontWeight="bold"
                                                                >
                                                                    ₹{(customer.currentBalance || 0).toLocaleString('en-IN')}
                                                                </Typography>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                )
                                            ) : (
                                                suppliers.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={2} align="center">No suppliers</TableCell>
                                                    </TableRow>
                                                ) : (
                                                    suppliers.map(supplier => (
                                                        <TableRow 
                                                            key={supplier.id} 
                                                            hover 
                                                            onClick={() => handleSelectParty(supplier, 'supplier')}
                                                            selected={selectedParty?.id === supplier.id}
                                                            sx={{ cursor: 'pointer' }}
                                                        >
                                                            <TableCell>
                                                                <Typography variant="body2" fontWeight={selectedParty?.id === supplier.id ? 'bold' : 'normal'}>
                                                                    {supplier.name}
                                                                </Typography>
                                                                {supplier.mobile && (
                                                                    <Typography variant="caption" color="text.secondary">
                                                                        {supplier.mobile}
                                                                    </Typography>
                                                                )}
                                                            </TableCell>
                                                            <TableCell align="right">
                                                                <Typography 
                                                                    color={(supplier.currentBalance || 0) > 0 ? 'error.main' : 'text.secondary'}
                                                                    fontWeight="bold"
                                                                >
                                                                    ₹{(supplier.currentBalance || 0).toLocaleString('en-IN')}
                                                                </Typography>
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

                {/* Ledger View */}
                {selectedParty && (
                    <Grid item xs={12} md={8}>
                        <Card>
                            <CardContent>
                                {/* Party Header */}
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                    <Box>
                                        <Typography variant="h6">
                                            {selectedParty.name}
                                        </Typography>
                                        <Typography variant="body2" color="text.secondary">
                                            {selectedParty.mobile} {selectedParty.email && `• ${selectedParty.email}`}
                                        </Typography>
                                    </Box>
                                    <Box>
                                        <Chip 
                                            label={`Balance: ₹${(selectedParty.currentBalance || 0).toLocaleString('en-IN')}`}
                                            color={selectedParty.type === 'customer' ? 'success' : 'error'}
                                            sx={{ fontWeight: 'bold', fontSize: '1rem' }}
                                        />
                                    </Box>
                                </Box>

                                {/* Action Buttons */}
                                <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                                    {selectedParty.type === 'customer' ? (
                                        <>
                                            <Button 
                                                variant="contained" 
                                                color="primary"
                                                startIcon={<Receipt />}
                                                onClick={() => openDialog('add_bill')}
                                            >
                                                Add Bill (Dr)
                                            </Button>
                                            <Button 
                                                variant="contained" 
                                                color="success"
                                                startIcon={<Payment />}
                                                onClick={() => openDialog('receive_payment')}
                                            >
                                                Receive Payment (Cr)
                                            </Button>
                                        </>
                                    ) : (
                                        <>
                                            <Button 
                                                variant="contained" 
                                                color="primary"
                                                startIcon={<Receipt />}
                                                onClick={() => openDialog('add_supplier_bill')}
                                            >
                                                Add Bill (Cr)
                                            </Button>
                                            <Button 
                                                variant="contained" 
                                                color="error"
                                                startIcon={<Payment />}
                                                onClick={() => openDialog('pay_supplier')}
                                            >
                                                Pay Supplier (Dr)
                                            </Button>
                                        </>
                                    )}
                                </Box>

                                <Divider sx={{ mb: 2 }} />

                                {/* Transaction History */}
                                <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <History /> Transaction History
                                </Typography>

                                {transactionsLoading ? (
                                    <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                                        <CircularProgress />
                                    </Box>
                                ) : (
                                    <TableContainer sx={{ maxHeight: 400 }}>
                                        <Table size="small" stickyHeader>
                                            <TableHead>
                                                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                                    <TableCell><strong>Date</strong></TableCell>
                                                    <TableCell><strong>Particulars</strong></TableCell>
                                                    <TableCell align="right" sx={{ color: 'error.main' }}><strong>Debit (Dr)</strong></TableCell>
                                                    <TableCell align="right" sx={{ color: 'success.main' }}><strong>Credit (Cr)</strong></TableCell>
                                                    <TableCell align="right"><strong>Balance</strong></TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {partyTransactions.length === 0 ? (
                                                    <TableRow>
                                                        <TableCell colSpan={5} align="center">
                                                            <Typography color="text.secondary">No transactions yet</Typography>
                                                        </TableCell>
                                                    </TableRow>
                                                ) : (
                                                    calculateRunningBalance(partyTransactions, selectedParty.type).map((txn, idx) => (
                                                        <TableRow key={txn.id || idx} hover>
                                                            <TableCell>
                                                                <Typography variant="body2">{txn.date}</Typography>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Typography variant="body2">{txn.description}</Typography>
                                                                {txn.paymentNumber && (
                                                                    <Typography variant="caption" color="text.secondary">
                                                                        {txn.paymentNumber}
                                                                    </Typography>
                                                                )}
                                                            </TableCell>
                                                            <TableCell align="right">
                                                                {txn.debit > 0 && (
                                                                    <Typography color="error.main">
                                                                        ₹{txn.debit.toLocaleString('en-IN')}
                                                                    </Typography>
                                                                )}
                                                            </TableCell>
                                                            <TableCell align="right">
                                                                {txn.credit > 0 && (
                                                                    <Typography color="success.main">
                                                                        ₹{txn.credit.toLocaleString('en-IN')}
                                                                    </Typography>
                                                                )}
                                                            </TableCell>
                                                            <TableCell align="right">
                                                                <Typography fontWeight="bold">
                                                                    ₹{Math.abs(txn.balance).toLocaleString('en-IN')}
                                                                    {txn.balance !== 0 && (
                                                                        <Typography component="span" variant="caption" sx={{ ml: 0.5 }}>
                                                                            {selectedParty.type === 'customer' 
                                                                                ? (txn.balance > 0 ? 'Dr' : 'Cr')
                                                                                : (txn.balance > 0 ? 'Cr' : 'Dr')
                                                                            }
                                                                        </Typography>
                                                                    )}
                                                                </Typography>
                                                            </TableCell>
                                                        </TableRow>
                                                    ))
                                                )}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                )}

                                {/* Closing Balance */}
                                <Box sx={{ mt: 2, p: 2, bgcolor: selectedParty.type === 'customer' ? '#e8f5e9' : '#ffebee', borderRadius: 1 }}>
                                    <Typography variant="subtitle1" fontWeight="bold">
                                        Closing Balance: ₹{(selectedParty.currentBalance || 0).toLocaleString('en-IN')}
                                        {selectedParty.type === 'customer' ? ' (Receivable)' : ' (Payable)'}
                                    </Typography>
                                </Box>
                            </CardContent>
                        </Card>
                    </Grid>
                )}
            </Grid>

            {/* Transaction Dialog */}
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>{getDialogTitle()}</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                        {selectedParty && (
                            <Alert severity="info">
                                {selectedParty.type === 'customer' ? 'Customer' : 'Supplier'}: <strong>{selectedParty.name}</strong>
                                <br />
                                Current Balance: ₹{(selectedParty.currentBalance || 0).toLocaleString('en-IN')}
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
                        
                        {(dialogType === 'add_bill' || dialogType === 'add_supplier_bill') && (
                            <TextField
                                label="Bill Number (optional)"
                                value={formData.billNumber}
                                onChange={(e) => setFormData({ ...formData, billNumber: e.target.value })}
                                fullWidth
                            />
                        )}
                        
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
                        color={dialogType.includes('pay') || dialogType.includes('receive') ? 'success' : 'primary'}
                        disabled={submitting || !formData.amount}
                    >
                        {submitting ? <CircularProgress size={24} /> : 'Save'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
