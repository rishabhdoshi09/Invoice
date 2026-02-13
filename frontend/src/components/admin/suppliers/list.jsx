import { useEffect, useState, useMemo } from 'react';
import { 
    Box, Button, Card, CardContent, Table, TableBody, TableCell, TableContainer, 
    TableHead, TableRow, TextField, Dialog, DialogTitle, DialogContent, DialogActions, 
    Typography, IconButton, Chip, Tooltip, Grid, Paper, Tabs, Tab, Alert,
    FormControl, InputLabel, Select, MenuItem, CircularProgress, Autocomplete,
    InputAdornment, Divider, TablePagination, ButtonGroup, Collapse
} from '@mui/material';
import { 
    Delete, Edit, Visibility, Refresh, Add, Payment, Receipt, LocalShipping, Close,
    Search, Download, TrendingDown, AccountBalance, AttachMoney, ShoppingBag,
    KeyboardArrowDown, KeyboardArrowUp
} from '@mui/icons-material';
import { listSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../../../services/supplier';
import axios from 'axios';
import moment from 'moment';

export const ListSuppliers = () => {
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState(null);
    const [detailsDialog, setDetailsDialog] = useState({ open: false, supplier: null, tab: 0 });
    const [paymentDialog, setPaymentDialog] = useState({ open: false, supplier: null });
    const [submitting, setSubmitting] = useState(false);
    
    // Search and Filter states
    const [searchTerm, setSearchTerm] = useState('');
    const [balanceFilter, setBalanceFilter] = useState('all');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    
    // Add Purchase Dialog state
    const [purchaseDialog, setPurchaseDialog] = useState({ open: false, supplier: null });
    const [purchaseItems, setPurchaseItems] = useState([]);
    const [itemName, setItemName] = useState('');
    const [itemQuantity, setItemQuantity] = useState('');
    const [itemPrice, setItemPrice] = useState('');
    const [purchaseTaxPercent, setPurchaseTaxPercent] = useState(0);
    const [purchaseBillNumber, setPurchaseBillNumber] = useState('');
    const [purchaseBillDate, setPurchaseBillDate] = useState(moment().format('YYYY-MM-DD'));
    const [purchaseSubmitting, setPurchaseSubmitting] = useState(false);
    
    // Expanded rows for viewing purchase items
    const [expandedPurchase, setExpandedPurchase] = useState(null);
    
    const [formData, setFormData] = useState({
        name: '',
        mobile: '',
        email: '',
        address: '',
        gstin: '',
        openingBalance: 0
    });

    const [paymentForm, setPaymentForm] = useState({
        amount: '',
        referenceType: 'advance',
        notes: '',
        paymentDate: moment().format('YYYY-MM-DD')
    });

    // Filtered suppliers based on search and filter
    const filteredSuppliers = useMemo(() => {
        let result = suppliers;
        
        if (searchTerm) {
            const search = searchTerm.toLowerCase();
            result = result.filter(s => 
                s.name?.toLowerCase().includes(search) ||
                s.mobile?.toLowerCase().includes(search) ||
                s.gstin?.toLowerCase().includes(search)
            );
        }
        
        if (balanceFilter === 'with-balance') {
            result = result.filter(s => (s.balance || 0) > 0);
        } else if (balanceFilter === 'no-balance') {
            result = result.filter(s => (s.balance || 0) <= 0);
        }
        
        return result;
    }, [suppliers, searchTerm, balanceFilter]);

    // Paginated suppliers
    const paginatedSuppliers = useMemo(() => {
        const start = page * rowsPerPage;
        return filteredSuppliers.slice(start, start + rowsPerPage);
    }, [filteredSuppliers, page, rowsPerPage]);

    // Summary calculations
    const summary = useMemo(() => ({
        totalSuppliers: suppliers.length,
        withBalance: suppliers.filter(s => (s.balance || 0) > 0).length,
        totalPayable: suppliers.reduce((sum, s) => sum + (s.balance || 0), 0),
        totalPurchases: suppliers.reduce((sum, s) => sum + (s.totalDebit || 0), 0),
        totalPaid: suppliers.reduce((sum, s) => sum + (s.totalCredit || 0), 0)
    }), [suppliers]);

    const fetchSuppliers = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const { data } = await axios.get('/api/suppliers/with-balance', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSuppliers(data.data?.rows || []);
        } catch (error) {
            console.error('Error fetching suppliers:', error);
            try {
                const { rows } = await listSuppliers({});
                setSuppliers(rows);
            } catch (fallbackError) {
                console.error('Fallback error:', fallbackError);
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchSupplierDetails = async (supplierId) => {
        try {
            const token = localStorage.getItem('token');
            const { data } = await axios.get(`/api/suppliers/${supplierId}/transactions`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setDetailsDialog({ open: true, supplier: data.data, tab: 0 });
        } catch (error) {
            console.error('Error fetching supplier details:', error);
            alert('Error fetching supplier details');
        }
    };

    // Delete purchase bill
    const handleDeletePurchaseBill = async (purchaseId) => {
        if (!window.confirm('Are you sure you want to delete this purchase bill? This action cannot be undone.')) {
            return;
        }
        
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`/api/purchases/${purchaseId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            alert('Purchase bill deleted successfully!');
            
            // Refresh supplier details
            if (detailsDialog.supplier?.id) {
                fetchSupplierDetails(detailsDialog.supplier.id);
            }
            fetchSuppliers();
        } catch (error) {
            console.error('Error deleting purchase bill:', error);
            alert('Error deleting purchase bill: ' + (error.response?.data?.message || error.message));
        }
    };

    // Export to CSV
    const handleExportCSV = () => {
        const headers = ['Name', 'Mobile', 'GSTIN', 'Opening Balance', 'Total Purchases', 'Total Paid', 'Balance'];
        const rows = filteredSuppliers.map(s => [
            s.name || '',
            s.mobile || '',
            s.gstin || '',
            (s.openingBalance || 0).toFixed(2),
            (s.totalDebit || 0).toFixed(2),
            (s.totalCredit || 0).toFixed(2),
            (s.balance || 0).toFixed(2)
        ]);
        
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `suppliers_${moment().format('YYYY-MM-DD')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Open Add Purchase dialog
    const handleOpenPurchaseDialog = (supplier) => {
        setPurchaseDialog({ open: true, supplier });
        setPurchaseItems([]);
        setItemName('');
        setItemQuantity('');
        setItemPrice('');
        setPurchaseTaxPercent(0);
        setPurchaseBillNumber('');
        setPurchaseBillDate(moment().format('YYYY-MM-DD'));
    };

    // Add item to purchase
    const handleAddPurchaseItem = () => {
        if (!itemName || !itemQuantity || !itemPrice) {
            alert('Please enter item name, quantity and price');
            return;
        }
        
        const qty = parseFloat(itemQuantity) || 0;
        const price = parseFloat(itemPrice) || 0;
        const totalPrice = qty * price;
        
        const newItem = {
            id: Date.now(),
            name: itemName,
            quantity: qty,
            price: price,
            totalPrice: totalPrice
        };
        
        setPurchaseItems([...purchaseItems, newItem]);
        setItemName('');
        setItemQuantity('');
        setItemPrice('');
    };

    // Remove item from purchase
    const handleRemovePurchaseItem = (itemId) => {
        setPurchaseItems(purchaseItems.filter(item => item.id !== itemId));
    };

    // Calculate purchase totals
    const purchaseSubTotal = purchaseItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const purchaseTax = Math.round(purchaseSubTotal * (purchaseTaxPercent / 100));
    const purchaseTotal = purchaseSubTotal + purchaseTax;

    // Submit purchase bill
    const handleSubmitPurchase = async () => {
        if (purchaseItems.length === 0) {
            alert('Please add at least one item to the purchase');
            return;
        }
        
        setPurchaseSubmitting(true);
        
        try {
            const token = localStorage.getItem('token');
            
            const purchaseData = {
                supplierId: purchaseDialog.supplier?.id,
                billNumber: purchaseBillNumber,
                billDate: moment(purchaseBillDate).format('DD-MM-YYYY'),
                paymentStatus: 'unpaid',
                paidAmount: 0,
                subTotal: purchaseSubTotal,
                tax: purchaseTax,
                taxPercent: purchaseTaxPercent,
                total: purchaseTotal,
                purchaseItems: purchaseItems.map(item => ({
                    name: item.name,
                    quantity: item.quantity,
                    price: item.price,
                    totalPrice: item.totalPrice
                }))
            };
            
            const { data } = await axios.post('/api/purchases', purchaseData, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            alert(`Purchase bill created successfully! Bill: ${purchaseBillNumber || 'Auto-generated'}`);
            setPurchaseDialog({ open: false, supplier: null });
            setPurchaseItems([]);
            fetchSuppliers();
            
        } catch (error) {
            console.error('Error creating purchase:', error);
            alert('Error creating purchase: ' + (error.response?.data?.message || error.message));
        } finally {
            setPurchaseSubmitting(false);
        }
    };

    useEffect(() => {
        fetchSuppliers();
    }, []);

    const handleOpenDialog = (supplier = null) => {
        if (supplier) {
            setEditingSupplier(supplier);
            setFormData({
                name: supplier.name,
                mobile: supplier.mobile || '',
                email: supplier.email || '',
                address: supplier.address || '',
                gstin: supplier.gstin || '',
                openingBalance: supplier.openingBalance || 0
            });
        } else {
            setEditingSupplier(null);
            setFormData({ name: '', mobile: '', email: '', address: '', gstin: '', openingBalance: 0 });
        }
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setEditingSupplier(null);
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async () => {
        try {
            if (editingSupplier) {
                await updateSupplier(editingSupplier.id, formData);
            } else {
                await createSupplier(formData);
            }
            handleCloseDialog();
            fetchSuppliers();
        } catch (error) {
            console.error('Error saving supplier:', error);
            alert('Error saving supplier');
        }
    };

    const handleDelete = async (supplierId) => {
        if (window.confirm('Are you sure you want to delete this supplier?')) {
            try {
                await deleteSupplier(supplierId);
                fetchSuppliers();
            } catch (error) {
                const errorMessage = error.response?.data?.message || 'Error deleting supplier.';
                alert(errorMessage);
            }
        }
    };

    const openPaymentDialog = (supplier) => {
        setPaymentForm({
            amount: '',
            referenceType: 'advance',
            notes: '',
            paymentDate: moment().format('YYYY-MM-DD')
        });
        setPaymentDialog({ open: true, supplier });
    };

    const handlePaymentSubmit = async () => {
        if (!paymentForm.amount || parseFloat(paymentForm.amount) <= 0) {
            alert('Please enter a valid amount');
            return;
        }

        setSubmitting(true);
        try {
            const token = localStorage.getItem('token');
            const payload = {
                paymentDate: paymentForm.paymentDate,
                partyType: 'supplier',
                partyName: paymentDialog.supplier.name,
                partyId: paymentDialog.supplier.id,
                amount: parseFloat(paymentForm.amount),
                referenceType: paymentForm.referenceType,
                notes: paymentForm.notes
            };

            await axios.post('/api/payments', payload, {
                headers: { Authorization: `Bearer ${token}` }
            });

            alert(`Payment of ₹${parseFloat(paymentForm.amount).toLocaleString('en-IN')} to ${paymentDialog.supplier.name} recorded!`);
            setPaymentDialog({ open: false, supplier: null });
            fetchSuppliers();
            
            if (detailsDialog.open && detailsDialog.supplier?.id === paymentDialog.supplier.id) {
                fetchSupplierDetails(paymentDialog.supplier.id);
            }
        } catch (error) {
            console.error('Error recording payment:', error);
            alert('Error recording payment. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center', gap: 1, fontWeight: 600 }}>
                    <LocalShipping color="primary" /> Supplier Ledger
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="outlined" startIcon={<Download />} onClick={handleExportCSV} size="small">
                        Export
                    </Button>
                    <IconButton onClick={fetchSuppliers} disabled={loading}>
                        <Refresh />
                    </IconButton>
                    <Button variant="contained" onClick={() => handleOpenDialog()} startIcon={<Add />}>
                        Add Supplier
                    </Button>
                </Box>
            </Box>

            {/* Summary Cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={2.4}>
                    <Paper sx={{ p: 2, bgcolor: '#e3f2fd', borderLeft: '4px solid #1976d2' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <LocalShipping fontSize="small" color="primary" />
                            <Typography variant="caption" color="text.secondary">Total Suppliers</Typography>
                        </Box>
                        <Typography variant="h4" color="primary" fontWeight="bold">{summary.totalSuppliers}</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={6} sm={2.4}>
                    <Paper sx={{ p: 2, bgcolor: '#fff3e0', borderLeft: '4px solid #ff9800' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <AccountBalance fontSize="small" sx={{ color: '#ff9800' }} />
                            <Typography variant="caption" color="text.secondary">With Balance</Typography>
                        </Box>
                        <Typography variant="h4" sx={{ color: '#ff9800', fontWeight: 'bold' }}>{summary.withBalance}</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={6} sm={2.4}>
                    <Paper sx={{ p: 2, bgcolor: '#ffebee', borderLeft: '4px solid #f44336' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <TrendingDown fontSize="small" color="error" />
                            <Typography variant="caption" color="text.secondary">Total Purchases</Typography>
                        </Box>
                        <Typography variant="h5" color="error" fontWeight="bold">
                            ₹{summary.totalPurchases.toLocaleString('en-IN')}
                        </Typography>
                    </Paper>
                </Grid>
                <Grid item xs={6} sm={2.4}>
                    <Paper sx={{ p: 2, bgcolor: '#e8f5e9', borderLeft: '4px solid #4caf50' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <AttachMoney fontSize="small" color="success" />
                            <Typography variant="caption" color="text.secondary">Total Paid</Typography>
                        </Box>
                        <Typography variant="h5" color="success.main" fontWeight="bold">
                            ₹{summary.totalPaid.toLocaleString('en-IN')}
                        </Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} sm={2.4}>
                    <Paper sx={{ p: 2, bgcolor: '#fce4ec', borderLeft: '4px solid #e91e63' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Receipt fontSize="small" sx={{ color: '#e91e63' }} />
                            <Typography variant="caption" color="text.secondary">Total Payable</Typography>
                        </Box>
                        <Typography variant="h5" sx={{ color: '#e91e63', fontWeight: 'bold' }}>
                            ₹{summary.totalPayable.toLocaleString('en-IN')}
                        </Typography>
                    </Paper>
                </Grid>
            </Grid>

            {/* Search and Filter */}
            <Card sx={{ mb: 2 }}>
                <CardContent sx={{ py: 2 }}>
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                size="small"
                                placeholder="Search by name, mobile or GSTIN..."
                                value={searchTerm}
                                onChange={(e) => { setSearchTerm(e.target.value); setPage(0); }}
                                InputProps={{
                                    startAdornment: <InputAdornment position="start"><Search /></InputAdornment>
                                }}
                            />
                        </Grid>
                        <Grid item xs={6} sm={3}>
                            <FormControl fullWidth size="small">
                                <InputLabel>Balance Filter</InputLabel>
                                <Select
                                    value={balanceFilter}
                                    label="Balance Filter"
                                    onChange={(e) => { setBalanceFilter(e.target.value); setPage(0); }}
                                >
                                    <MenuItem value="all">All Suppliers</MenuItem>
                                    <MenuItem value="with-balance">With Outstanding</MenuItem>
                                    <MenuItem value="no-balance">No Outstanding</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                            <Typography variant="body2" color="text.secondary">
                                Showing {filteredSuppliers.length} of {suppliers.length} suppliers
                            </Typography>
                        </Grid>
                    </Grid>
                </CardContent>
            </Card>

            {/* Table */}
            <Card>
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                <TableCell><strong>Supplier</strong></TableCell>
                                <TableCell><strong>Contact</strong></TableCell>
                                <TableCell align="right"><strong>Opening</strong></TableCell>
                                <TableCell align="right"><strong>Purchases</strong></TableCell>
                                <TableCell align="right"><strong>Paid</strong></TableCell>
                                <TableCell align="right"><strong>Balance</strong></TableCell>
                                <TableCell align="center" sx={{ width: 280 }}><strong>Actions</strong></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                                        <CircularProgress size={32} />
                                    </TableCell>
                                </TableRow>
                            ) : paginatedSuppliers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                                        <Typography color="text.secondary">
                                            {searchTerm || balanceFilter !== 'all' ? 'No suppliers match your filter' : 'No suppliers found'}
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                paginatedSuppliers.map((supplier) => (
                                    <TableRow key={supplier.id} hover sx={{ '&:hover': { bgcolor: '#f8f9fa' } }}>
                                        <TableCell>
                                            <Typography fontWeight="600">{supplier.name}</Typography>
                                            {supplier.gstin && (
                                                <Typography variant="caption" color="text.secondary">
                                                    GSTIN: {supplier.gstin}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>{supplier.mobile || '-'}</TableCell>
                                        <TableCell align="right">
                                            ₹{(supplier.openingBalance || 0).toLocaleString('en-IN')}
                                        </TableCell>
                                        <TableCell align="right" sx={{ color: 'error.main', fontWeight: 500 }}>
                                            ₹{(supplier.totalDebit || 0).toLocaleString('en-IN')}
                                        </TableCell>
                                        <TableCell align="right" sx={{ color: 'success.main', fontWeight: 500 }}>
                                            ₹{(supplier.totalCredit || 0).toLocaleString('en-IN')}
                                        </TableCell>
                                        <TableCell align="right">
                                            <Chip 
                                                label={`₹${(supplier.balance || 0).toLocaleString('en-IN')}`}
                                                color={(supplier.balance || 0) > 0 ? 'error' : 'success'}
                                                size="small"
                                                sx={{ fontWeight: 'bold', minWidth: 80 }}
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center', flexWrap: 'wrap' }}>
                                                <Button 
                                                    size="small" 
                                                    variant="outlined" 
                                                    color="primary" 
                                                    startIcon={<ShoppingBag />}
                                                    onClick={() => handleOpenPurchaseDialog(supplier)}
                                                    sx={{ fontSize: '0.7rem', py: 0.3, minWidth: 'auto' }}
                                                >
                                                    Bill
                                                </Button>
                                                <Button 
                                                    size="small" 
                                                    variant="outlined" 
                                                    color="success" 
                                                    startIcon={<Payment />}
                                                    onClick={() => openPaymentDialog(supplier)}
                                                    sx={{ fontSize: '0.7rem', py: 0.3, minWidth: 'auto' }}
                                                >
                                                    Pay
                                                </Button>
                                                <Button 
                                                    size="small" 
                                                    variant="contained" 
                                                    color="info" 
                                                    startIcon={<Visibility />}
                                                    onClick={() => fetchSupplierDetails(supplier.id)}
                                                    sx={{ fontSize: '0.7rem', py: 0.3, minWidth: 'auto' }}
                                                >
                                                    View
                                                </Button>
                                                <IconButton size="small" onClick={() => handleOpenDialog(supplier)}>
                                                    <Edit fontSize="small" />
                                                </IconButton>
                                                <IconButton size="small" onClick={() => handleDelete(supplier.id)}>
                                                    <Delete fontSize="small" color="error" />
                                                </IconButton>
                                            </Box>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
                <TablePagination
                    component="div"
                    count={filteredSuppliers.length}
                    page={page}
                    onPageChange={(e, newPage) => setPage(newPage)}
                    rowsPerPage={rowsPerPage}
                    onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
                    rowsPerPageOptions={[5, 10, 25, 50]}
                />
            </Card>

            {/* Add/Edit Supplier Dialog */}
            <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ bgcolor: '#f5f5f5' }}>
                    {editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
                </DialogTitle>
                <DialogContent>
                    <TextField label="Name *" name="name" value={formData.name} onChange={handleChange} fullWidth margin="normal" autoFocus />
                    <Grid container spacing={2}>
                        <Grid item xs={6}>
                            <TextField label="Mobile" name="mobile" value={formData.mobile} onChange={handleChange} fullWidth margin="normal" />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField label="Email" name="email" value={formData.email} onChange={handleChange} fullWidth margin="normal" />
                        </Grid>
                    </Grid>
                    <TextField label="Address" name="address" value={formData.address} onChange={handleChange} fullWidth margin="normal" multiline rows={2} />
                    <Grid container spacing={2}>
                        <Grid item xs={6}>
                            <TextField label="GSTIN" name="gstin" value={formData.gstin} onChange={handleChange} fullWidth margin="normal" />
                        </Grid>
                        <Grid item xs={6}>
                            <TextField label="Opening Balance" name="openingBalance" type="number" value={formData.openingBalance} onChange={handleChange} fullWidth margin="normal" />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={handleCloseDialog}>Cancel</Button>
                    <Button onClick={handleSubmit} variant="contained" disabled={!formData.name}>
                        {editingSupplier ? 'Update' : 'Create'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Payment Dialog */}
            <Dialog open={paymentDialog.open} onClose={() => setPaymentDialog({ open: false, supplier: null })} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ bgcolor: '#e8f5e9' }}>
                    Make Payment to {paymentDialog.supplier?.name}
                </DialogTitle>
                <DialogContent>
                    <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
                        Current Balance: <strong>₹{(paymentDialog.supplier?.balance || 0).toLocaleString('en-IN')}</strong>
                    </Alert>
                    
                    <TextField
                        label="Payment Date"
                        type="date"
                        value={paymentForm.paymentDate}
                        onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                        fullWidth
                        margin="normal"
                        InputLabelProps={{ shrink: true }}
                    />
                    
                    <TextField
                        label="Amount *"
                        type="number"
                        value={paymentForm.amount}
                        onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                        fullWidth
                        margin="normal"
                        autoFocus
                        InputProps={{
                            startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                            inputProps: { min: 0, step: 0.01 }
                        }}
                    />
                    
                    <FormControl fullWidth margin="normal">
                        <InputLabel>Payment Type</InputLabel>
                        <Select
                            value={paymentForm.referenceType}
                            label="Payment Type"
                            onChange={(e) => setPaymentForm({ ...paymentForm, referenceType: e.target.value })}
                        >
                            <MenuItem value="advance">Advance Payment</MenuItem>
                            <MenuItem value="purchase">Against Purchase Bill</MenuItem>
                            <MenuItem value="adjustment">Adjustment</MenuItem>
                        </Select>
                    </FormControl>
                    
                    <TextField
                        label="Notes"
                        value={paymentForm.notes}
                        onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                        fullWidth
                        margin="normal"
                        multiline
                        rows={2}
                        placeholder="Optional notes"
                    />
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setPaymentDialog({ open: false, supplier: null })} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button 
                        onClick={handlePaymentSubmit} 
                        variant="contained" 
                        color="success"
                        disabled={submitting || !paymentForm.amount}
                        startIcon={submitting ? <CircularProgress size={20} /> : <Payment />}
                    >
                        {submitting ? 'Recording...' : 'Record Payment'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Supplier Ledger Details Dialog */}
            <Dialog 
                open={detailsDialog.open} 
                onClose={() => setDetailsDialog({ open: false, supplier: null, tab: 0 })}
                maxWidth="lg"
                fullWidth
            >
                <DialogTitle sx={{ bgcolor: '#fff3e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Receipt sx={{ color: '#ff9800' }} /> 
                        <Box>
                            <Typography variant="h6">{detailsDialog.supplier?.name}</Typography>
                            <Typography variant="caption" color="text.secondary">
                                {detailsDialog.supplier?.mobile}
                            </Typography>
                        </Box>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button 
                            variant="outlined" 
                            size="small"
                            startIcon={<ShoppingBag />}
                            onClick={() => {
                                setDetailsDialog({ ...detailsDialog, open: false });
                                handleOpenPurchaseDialog(detailsDialog.supplier);
                            }}
                        >
                            Add Purchase
                        </Button>
                        <Button 
                            variant="contained" 
                            color="success" 
                            size="small"
                            startIcon={<Payment />}
                            onClick={() => {
                                setDetailsDialog({ ...detailsDialog, open: false });
                                openPaymentDialog(detailsDialog.supplier);
                            }}
                        >
                            Make Payment
                        </Button>
                    </Box>
                </DialogTitle>
                <DialogContent>
                    {detailsDialog.supplier && (
                        <Box sx={{ mt: 2 }}>
                            {/* Summary Cards */}
                            <Grid container spacing={2} sx={{ mb: 3 }}>
                                <Grid item xs={6} sm={3}>
                                    <Paper sx={{ p: 2, bgcolor: '#f5f5f5', textAlign: 'center' }}>
                                        <Typography variant="caption" color="text.secondary">Opening Balance</Typography>
                                        <Typography variant="h6">₹{(detailsDialog.supplier.openingBalance || 0).toLocaleString('en-IN')}</Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <Paper sx={{ p: 2, bgcolor: '#ffebee', textAlign: 'center' }}>
                                        <Typography variant="caption" color="text.secondary">Total Purchases</Typography>
                                        <Typography variant="h6" color="error">₹{(detailsDialog.supplier.totalDebit || 0).toLocaleString('en-IN')}</Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <Paper sx={{ p: 2, bgcolor: '#e8f5e9', textAlign: 'center' }}>
                                        <Typography variant="caption" color="text.secondary">Total Paid</Typography>
                                        <Typography variant="h6" color="success.main">₹{(detailsDialog.supplier.totalCredit || 0).toLocaleString('en-IN')}</Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <Paper sx={{ p: 2, bgcolor: (detailsDialog.supplier.balance || 0) > 0 ? '#ffebee' : '#e8f5e9', textAlign: 'center' }}>
                                        <Typography variant="caption" color="text.secondary">Balance Due</Typography>
                                        <Typography variant="h6" fontWeight="bold" color={(detailsDialog.supplier.balance || 0) > 0 ? 'error' : 'success.main'}>
                                            ₹{(detailsDialog.supplier.balance || 0).toLocaleString('en-IN')}
                                        </Typography>
                                    </Paper>
                                </Grid>
                            </Grid>

                            <Tabs value={detailsDialog.tab} onChange={(e, v) => setDetailsDialog({ ...detailsDialog, tab: v })} sx={{ mb: 2 }}>
                                <Tab label={`Purchase Bills (${detailsDialog.supplier.purchases?.length || 0})`} />
                                <Tab label={`Payments (${detailsDialog.supplier.payments?.length || 0})`} />
                            </Tabs>

                            {detailsDialog.tab === 0 && (
                                detailsDialog.supplier.purchases?.length > 0 ? (
                                    <TableContainer sx={{ maxHeight: 350 }}>
                                        <Table size="small" stickyHeader>
                                            <TableHead>
                                                <TableRow sx={{ bgcolor: '#ffebee' }}>
                                                    <TableCell><strong>Bill No</strong></TableCell>
                                                    <TableCell><strong>Date</strong></TableCell>
                                                    <TableCell align="right"><strong>Total</strong></TableCell>
                                                    <TableCell align="right"><strong>Paid</strong></TableCell>
                                                    <TableCell align="right"><strong>Due</strong></TableCell>
                                                    <TableCell><strong>Status</strong></TableCell>
                                                    <TableCell align="center"><strong>Action</strong></TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {detailsDialog.supplier.purchases.map((purchase) => (
                                                    <TableRow key={purchase.id} hover>
                                                        <TableCell sx={{ fontWeight: 500 }}>{purchase.billNumber || '-'}</TableCell>
                                                        <TableCell>
                                                            {purchase.billDate ? 
                                                                moment(purchase.billDate, ['DD-MM-YYYY', 'YYYY-MM-DD']).format('DD/MM/YYYY') 
                                                                : '-'}
                                                        </TableCell>
                                                        <TableCell align="right" sx={{ color: 'error.main', fontWeight: 500 }}>
                                                            ₹{(purchase.total || 0).toLocaleString('en-IN')}
                                                        </TableCell>
                                                        <TableCell align="right">₹{(purchase.paidAmount || 0).toLocaleString('en-IN')}</TableCell>
                                                        <TableCell align="right">₹{(purchase.dueAmount || 0).toLocaleString('en-IN')}</TableCell>
                                                        <TableCell>
                                                            <Chip label={purchase.paymentStatus} size="small" color={purchase.paymentStatus === 'paid' ? 'success' : 'warning'} />
                                                        </TableCell>
                                                        <TableCell align="center">
                                                            <Tooltip title="Delete Purchase Bill">
                                                                <IconButton 
                                                                    size="small" 
                                                                    color="error"
                                                                    onClick={() => handleDeletePurchaseBill(purchase.id)}
                                                                >
                                                                    <Delete fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                ) : (
                                    <Alert severity="info" sx={{ mt: 2 }}>
                                        No purchase bills found. Click "Add Purchase" button above to create one.
                                    </Alert>
                                )
                            )}

                            {detailsDialog.tab === 1 && (
                                detailsDialog.supplier.payments?.length > 0 ? (
                                    <TableContainer sx={{ maxHeight: 350 }}>
                                        <Table size="small" stickyHeader>
                                            <TableHead>
                                                <TableRow sx={{ bgcolor: '#e8f5e9' }}>
                                                    <TableCell><strong>Payment #</strong></TableCell>
                                                    <TableCell><strong>Date</strong></TableCell>
                                                    <TableCell align="right"><strong>Amount</strong></TableCell>
                                                    <TableCell><strong>Type</strong></TableCell>
                                                    <TableCell><strong>Notes</strong></TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {detailsDialog.supplier.payments.map((payment) => (
                                                    <TableRow key={payment.id} hover>
                                                        <TableCell>{payment.paymentNumber}</TableCell>
                                                        <TableCell>
                                                            {payment.paymentDate ? 
                                                                moment(payment.paymentDate, ['DD-MM-YYYY', 'YYYY-MM-DD']).format('DD/MM/YYYY') 
                                                                : '-'}
                                                        </TableCell>
                                                        <TableCell align="right" sx={{ color: 'success.main', fontWeight: 'bold' }}>
                                                            ₹{(payment.amount || 0).toLocaleString('en-IN')}
                                                        </TableCell>
                                                        <TableCell><Chip label={payment.referenceType} size="small" variant="outlined" /></TableCell>
                                                        <TableCell>{payment.notes || '-'}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                ) : (
                                    <Alert severity="info">No payments found. Click "Make Payment" to add one.</Alert>
                                )
                            )}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDetailsDialog({ open: false, supplier: null, tab: 0 })}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* Add Purchase Dialog */}
            <Dialog open={purchaseDialog.open} onClose={() => !purchaseSubmitting && setPurchaseDialog({ open: false, supplier: null })} maxWidth="md" fullWidth>
                <DialogTitle sx={{ bgcolor: '#fff3e0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                        <Typography variant="h6">
                            <ShoppingBag sx={{ mr: 1, verticalAlign: 'middle' }} />
                            Purchase Bill - {purchaseDialog.supplier?.name}
                        </Typography>
                        {purchaseDialog.supplier?.mobile && (
                            <Typography variant="caption" color="text.secondary">{purchaseDialog.supplier.mobile}</Typography>
                        )}
                    </Box>
                    <IconButton onClick={() => !purchaseSubmitting && setPurchaseDialog({ open: false, supplier: null })}><Close /></IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    {/* Bill Info */}
                    <Grid container spacing={2} sx={{ mb: 3 }}>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                size="small"
                                label="Bill Number"
                                value={purchaseBillNumber}
                                onChange={(e) => setPurchaseBillNumber(e.target.value)}
                                placeholder="Optional"
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                size="small"
                                label="Bill Date"
                                type="date"
                                value={purchaseBillDate}
                                onChange={(e) => setPurchaseBillDate(e.target.value)}
                                InputLabelProps={{ shrink: true }}
                            />
                        </Grid>
                    </Grid>

                    <Divider sx={{ mb: 2 }} />

                    {/* Add Items */}
                    <Grid container spacing={2} sx={{ mb: 2 }}>
                        <Grid item xs={12} md={4}>
                            <TextField size="small" fullWidth label="Item Name *" value={itemName} onChange={(e) => setItemName(e.target.value)} />
                        </Grid>
                        <Grid item xs={6} md={2}>
                            <TextField size="small" fullWidth label="Qty *" type="number" value={itemQuantity} onChange={(e) => setItemQuantity(e.target.value)} inputProps={{ step: '0.01', min: '0' }} />
                        </Grid>
                        <Grid item xs={6} md={2}>
                            <TextField size="small" fullWidth label="Price *" type="number" value={itemPrice} onChange={(e) => setItemPrice(e.target.value)} inputProps={{ step: '0.01', min: '0' }} />
                        </Grid>
                        <Grid item xs={6} md={2}>
                            <Typography variant="body2" color="text.secondary">Total</Typography>
                            <Typography variant="h6" color="primary">₹{((parseFloat(itemQuantity) || 0) * (parseFloat(itemPrice) || 0)).toLocaleString('en-IN')}</Typography>
                        </Grid>
                        <Grid item xs={6} md={2}>
                            <Button variant="contained" onClick={handleAddPurchaseItem} disabled={!itemName || !itemQuantity || !itemPrice} fullWidth sx={{ height: '100%' }} startIcon={<Add />}>Add</Button>
                        </Grid>
                    </Grid>

                    {purchaseItems.length > 0 ? (
                        <TableContainer component={Paper} sx={{ mb: 2 }}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                        <TableCell><strong>Item</strong></TableCell>
                                        <TableCell align="right"><strong>Qty</strong></TableCell>
                                        <TableCell align="right"><strong>Price</strong></TableCell>
                                        <TableCell align="right"><strong>Total</strong></TableCell>
                                        <TableCell align="center"></TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {purchaseItems.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell>{item.name}</TableCell>
                                            <TableCell align="right">{item.quantity}</TableCell>
                                            <TableCell align="right">₹{item.price.toLocaleString('en-IN')}</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>₹{item.totalPrice.toLocaleString('en-IN')}</TableCell>
                                            <TableCell align="center">
                                                <IconButton size="small" color="error" onClick={() => handleRemovePurchaseItem(item.id)}><Delete fontSize="small" /></IconButton>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    ) : (
                        <Alert severity="info" sx={{ mb: 2 }}>Enter item details and click Add to add items</Alert>
                    )}

                    <Grid container justifyContent="flex-end">
                        <Grid item xs={12} md={4}>
                            <Paper sx={{ p: 2, bgcolor: '#f9f9f9' }}>
                                <Grid container spacing={1}>
                                    <Grid item xs={6}><Typography>Sub Total:</Typography></Grid>
                                    <Grid item xs={6}><Typography align="right">₹{purchaseSubTotal.toLocaleString('en-IN')}</Typography></Grid>
                                    <Grid item xs={6}>
                                        <TextField size="small" label="Tax %" type="number" value={purchaseTaxPercent} onChange={(e) => setPurchaseTaxPercent(parseFloat(e.target.value) || 0)} sx={{ width: 80 }} />
                                    </Grid>
                                    <Grid item xs={6}><Typography align="right">₹{purchaseTax.toLocaleString('en-IN')}</Typography></Grid>
                                    <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>
                                    <Grid item xs={6}><Typography variant="h6" fontWeight="bold">Total:</Typography></Grid>
                                    <Grid item xs={6}><Typography variant="h6" fontWeight="bold" align="right" color="error">₹{purchaseTotal.toLocaleString('en-IN')}</Typography></Grid>
                                </Grid>
                            </Paper>
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setPurchaseDialog({ open: false, supplier: null })} disabled={purchaseSubmitting}>Cancel</Button>
                    <Button variant="contained" color="primary" onClick={handleSubmitPurchase} disabled={purchaseItems.length === 0 || purchaseSubmitting} startIcon={purchaseSubmitting ? <CircularProgress size={20} /> : <Receipt />}>
                        {purchaseSubmitting ? 'Creating...' : 'Create Purchase Bill'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
