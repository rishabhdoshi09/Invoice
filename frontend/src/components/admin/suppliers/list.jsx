import { useEffect, useState, useMemo, useRef } from 'react';
import { 
    Box, Button, Card, CardContent, Table, TableBody, TableCell, TableContainer, 
    TableHead, TableRow, TextField, Dialog, DialogTitle, DialogContent, DialogActions, 
    Typography, IconButton, Chip, Tooltip, Grid, Paper, Tabs, Tab, Alert,
    FormControl, InputLabel, Select, MenuItem, CircularProgress, Autocomplete,
    InputAdornment, Divider, TablePagination, Collapse
} from '@mui/material';
import { 
    Delete, Edit, Visibility, Refresh, Add, Payment, Receipt, Close,
    Search, Download, AccountBalance, ShoppingBag, CheckCircle,
    KeyboardArrowDown, KeyboardArrowUp, Save, PersonAdd
} from '@mui/icons-material';
import { listSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../../../services/supplier';
import axios from 'axios';
import moment from 'moment';

export const ListSuppliers = () => {
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [detailsDialog, setDetailsDialog] = useState({ open: false, supplier: null, tab: 0 });
    
    // Search and Filter
    const [searchTerm, setSearchTerm] = useState('');
    const [balanceFilter, setBalanceFilter] = useState('all');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    
    // Quick Entry Mode
    const [activeTab, setActiveTab] = useState(0); // 0: Supplier, 1: Payment, 2: Purchase
    const [successMessage, setSuccessMessage] = useState('');
    const [saving, setSaving] = useState(false);
    
    // Quick Add Supplier
    const [newSupplier, setNewSupplier] = useState({ name: '', mobile: '', openingBalance: 0 });
    const supplierNameRef = useRef(null);
    
    // Quick Payment
    const [selectedSupplier, setSelectedSupplier] = useState(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(moment().format('YYYY-MM-DD'));
    const [paymentNotes, setPaymentNotes] = useState('');
    
    // Quick Purchase
    const [purchaseSupplier, setPurchaseSupplier] = useState(null);
    const [purchaseBillNo, setPurchaseBillNo] = useState('');
    const [purchaseDate, setPurchaseDate] = useState(moment().format('YYYY-MM-DD'));
    const [purchaseItems, setPurchaseItems] = useState([{ name: '', qty: '', price: '', total: 0 }]);
    
    // Expanded rows
    const [expandedPurchase, setExpandedPurchase] = useState(null);

    useEffect(() => {
        fetchSuppliers();
    }, []);

    const fetchSuppliers = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const { data } = await axios.get('/api/suppliers/with-balance', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSuppliers(data.data?.rows || []);
        } catch (error) {
            console.error('Error:', error);
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
            setExpandedPurchase(null);
            setDetailsDialog({ open: true, supplier: data.data, tab: 0 });
        } catch (error) {
            alert('Error fetching details');
        }
    };

    // Filtered suppliers
    const filteredSuppliers = useMemo(() => {
        return suppliers.filter(s => {
            const matchesSearch = !searchTerm || 
                s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                s.mobile?.includes(searchTerm);
            const matchesBalance = balanceFilter === 'all' || 
                (balanceFilter === 'due' && s.balance > 0) ||
                (balanceFilter === 'clear' && s.balance <= 0);
            return matchesSearch && matchesBalance;
        });
    }, [suppliers, searchTerm, balanceFilter]);

    const paginatedSuppliers = filteredSuppliers.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

    // Summary stats
    const totalDue = suppliers.reduce((sum, s) => sum + Math.max(0, s.balance || 0), 0);
    const totalAdvance = suppliers.reduce((sum, s) => sum + Math.abs(Math.min(0, s.balance || 0)), 0);

    const showSuccess = (msg) => {
        setSuccessMessage(msg);
        setTimeout(() => setSuccessMessage(''), 3000);
    };

    // ========== QUICK ADD SUPPLIER ==========
    const handleAddSupplier = async () => {
        if (!newSupplier.name.trim()) {
            alert('Supplier name is required');
            return;
        }
        setSaving(true);
        try {
            const token = localStorage.getItem('token');
            await axios.post('/api/suppliers', newSupplier, {
                headers: { Authorization: `Bearer ${token}` }
            });
            showSuccess(`✓ Added: ${newSupplier.name}`);
            setNewSupplier({ name: '', mobile: '', openingBalance: 0 });
            fetchSuppliers();
            supplierNameRef.current?.focus();
        } catch (error) {
            alert('Error: ' + (error.response?.data?.message || error.message));
        } finally {
            setSaving(false);
        }
    };

    // ========== QUICK PAYMENT ==========
    const handleQuickPayment = async () => {
        if (!selectedSupplier) {
            alert('Select a supplier');
            return;
        }
        if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
            alert('Enter valid amount');
            return;
        }
        setSaving(true);
        try {
            const token = localStorage.getItem('token');
            await axios.post('/api/payments', {
                partyType: 'supplier',
                partyId: selectedSupplier.id,
                partyName: selectedSupplier.name,
                amount: parseFloat(paymentAmount),
                paymentDate: moment(paymentDate).format('DD-MM-YYYY'),
                referenceType: 'advance',
                notes: paymentNotes
            }, { headers: { Authorization: `Bearer ${token}` } });
            
            showSuccess(`✓ Paid ₹${parseFloat(paymentAmount).toLocaleString('en-IN')} to ${selectedSupplier.name}`);
            setSelectedSupplier(null);
            setPaymentAmount('');
            setPaymentNotes('');
            fetchSuppliers();
        } catch (error) {
            alert('Error: ' + (error.response?.data?.message || error.message));
        } finally {
            setSaving(false);
        }
    };

    // ========== QUICK PURCHASE ==========
    const updatePurchaseItem = (index, field, value) => {
        const items = [...purchaseItems];
        items[index][field] = value;
        items[index].total = (parseFloat(items[index].qty) || 0) * (parseFloat(items[index].price) || 0);
        setPurchaseItems(items);
    };

    const addPurchaseRow = () => {
        setPurchaseItems([...purchaseItems, { name: '', qty: '', price: '', total: 0 }]);
    };

    const removePurchaseRow = (index) => {
        if (purchaseItems.length > 1) {
            setPurchaseItems(purchaseItems.filter((_, i) => i !== index));
        }
    };

    const purchaseTotal = purchaseItems.reduce((sum, item) => sum + (item.total || 0), 0);

    const handleQuickPurchase = async () => {
        if (!purchaseSupplier) {
            alert('Select a supplier');
            return;
        }
        const validItems = purchaseItems.filter(i => i.name && i.qty && i.price);
        if (validItems.length === 0) {
            alert('Add at least one item');
            return;
        }
        setSaving(true);
        try {
            const token = localStorage.getItem('token');
            await axios.post('/api/purchases', {
                supplierId: purchaseSupplier.id,
                billNumber: purchaseBillNo,
                billDate: moment(purchaseDate).format('DD-MM-YYYY'),
                paymentStatus: 'unpaid',
                paidAmount: 0,
                subTotal: purchaseTotal,
                tax: 0,
                taxPercent: 0,
                total: purchaseTotal,
                purchaseItems: validItems.map(i => ({
                    name: i.name,
                    quantity: parseFloat(i.qty),
                    price: parseFloat(i.price),
                    totalPrice: i.total
                }))
            }, { headers: { Authorization: `Bearer ${token}` } });
            
            showSuccess(`✓ Purchase ₹${purchaseTotal.toLocaleString('en-IN')} from ${purchaseSupplier.name}`);
            setPurchaseSupplier(null);
            setPurchaseBillNo('');
            setPurchaseItems([{ name: '', qty: '', price: '', total: 0 }]);
            fetchSuppliers();
        } catch (error) {
            alert('Error: ' + (error.response?.data?.message || error.message));
        } finally {
            setSaving(false);
        }
    };

    // Delete
    const handleDelete = async (id) => {
        if (!window.confirm('Delete this supplier?')) return;
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`/api/suppliers/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchSuppliers();
        } catch (error) {
            alert('Error: ' + (error.response?.data?.message || error.message));
        }
    };

    const handleDeletePurchase = async (purchaseId) => {
        if (!window.confirm('Delete this purchase bill?')) return;
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`/api/purchases/${purchaseId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (detailsDialog.supplier?.id) {
                fetchSupplierDetails(detailsDialog.supplier.id);
            }
            fetchSuppliers();
        } catch (error) {
            alert('Error: ' + (error.response?.data?.message || error.message));
        }
    };

    return (
        <Box sx={{ p: 2, bgcolor: '#f5f5f5', minHeight: '100vh' }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h5" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AccountBalance color="primary" /> Supplier Ledger
                </Typography>
                <Button size="small" startIcon={<Refresh />} onClick={fetchSuppliers}>Refresh</Button>
            </Box>

            {/* Summary Cards */}
            <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6} sm={3}>
                    <Card sx={{ bgcolor: '#fff3e0' }}>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption" color="text.secondary">Total Payable</Typography>
                            <Typography variant="h6" sx={{ fontWeight: 700, color: 'warning.dark' }}>
                                ₹{totalDue.toLocaleString('en-IN')}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Card sx={{ bgcolor: '#e8f5e9' }}>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption" color="text.secondary">Advance Given</Typography>
                            <Typography variant="h6" sx={{ fontWeight: 700, color: 'success.dark' }}>
                                ₹{totalAdvance.toLocaleString('en-IN')}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Card>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption" color="text.secondary">Total Suppliers</Typography>
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>{suppliers.length}</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Card>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption" color="text.secondary">With Due</Typography>
                            <Typography variant="h6" sx={{ fontWeight: 700, color: 'error.main' }}>
                                {suppliers.filter(s => s.balance > 0).length}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Success Message */}
            {successMessage && (
                <Alert severity="success" icon={<CheckCircle />} sx={{ mb: 2, py: 0.5 }}>
                    {successMessage}
                </Alert>
            )}

            {/* Quick Entry Tabs */}
            <Paper sx={{ mb: 2 }}>
                <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tab icon={<PersonAdd />} label="Add Supplier" iconPosition="start" sx={{ minHeight: 48 }} />
                    <Tab icon={<Payment />} label="Quick Payment" iconPosition="start" sx={{ minHeight: 48 }} />
                    <Tab icon={<ShoppingBag />} label="Quick Purchase" iconPosition="start" sx={{ minHeight: 48 }} />
                </Tabs>

                <Box sx={{ p: 2 }}>
                    {/* Tab 0: Add Supplier */}
                    {activeTab === 0 && (
                        <Grid container spacing={2} alignItems="center">
                            <Grid item xs={12} sm={4}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Supplier Name *"
                                    value={newSupplier.name}
                                    onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                                    inputRef={supplierNameRef}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddSupplier()}
                                />
                            </Grid>
                            <Grid item xs={6} sm={3}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Mobile"
                                    value={newSupplier.mobile}
                                    onChange={(e) => setNewSupplier({ ...newSupplier, mobile: e.target.value })}
                                />
                            </Grid>
                            <Grid item xs={6} sm={3}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Opening Balance"
                                    type="number"
                                    value={newSupplier.openingBalance}
                                    onChange={(e) => setNewSupplier({ ...newSupplier, openingBalance: parseFloat(e.target.value) || 0 })}
                                />
                            </Grid>
                            <Grid item xs={12} sm={2}>
                                <Button
                                    fullWidth
                                    variant="contained"
                                    onClick={handleAddSupplier}
                                    disabled={saving}
                                    startIcon={saving ? <CircularProgress size={16} /> : <Add />}
                                >
                                    Add
                                </Button>
                            </Grid>
                        </Grid>
                    )}

                    {/* Tab 1: Quick Payment */}
                    {activeTab === 1 && (
                        <Grid container spacing={2} alignItems="center">
                            <Grid item xs={12} sm={4}>
                                <Autocomplete
                                    size="small"
                                    options={suppliers}
                                    getOptionLabel={(o) => o.name || ''}
                                    value={selectedSupplier}
                                    onChange={(e, v) => setSelectedSupplier(v)}
                                    renderInput={(params) => <TextField {...params} label="Supplier *" />}
                                    renderOption={(props, option) => (
                                        <li {...props}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                                <span>{option.name}</span>
                                                {option.balance > 0 && (
                                                    <Chip label={`₹${option.balance?.toLocaleString('en-IN')}`} size="small" color="error" sx={{ height: 20 }} />
                                                )}
                                            </Box>
                                        </li>
                                    )}
                                />
                            </Grid>
                            <Grid item xs={6} sm={2}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Amount *"
                                    type="number"
                                    value={paymentAmount}
                                    onChange={(e) => setPaymentAmount(e.target.value)}
                                    InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                                />
                            </Grid>
                            <Grid item xs={6} sm={2}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    type="date"
                                    label="Date"
                                    value={paymentDate}
                                    onChange={(e) => setPaymentDate(e.target.value)}
                                    InputLabelProps={{ shrink: true }}
                                />
                            </Grid>
                            <Grid item xs={8} sm={2}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Notes"
                                    value={paymentNotes}
                                    onChange={(e) => setPaymentNotes(e.target.value)}
                                />
                            </Grid>
                            <Grid item xs={4} sm={2}>
                                <Button
                                    fullWidth
                                    variant="contained"
                                    color="success"
                                    onClick={handleQuickPayment}
                                    disabled={saving}
                                    startIcon={saving ? <CircularProgress size={16} /> : <Payment />}
                                >
                                    Pay
                                </Button>
                            </Grid>
                            {selectedSupplier && selectedSupplier.balance > 0 && (
                                <Grid item xs={12}>
                                    <Alert severity="warning" sx={{ py: 0 }}>
                                        Due: ₹{selectedSupplier.balance?.toLocaleString('en-IN')}
                                        <Button size="small" sx={{ ml: 2 }} onClick={() => setPaymentAmount(selectedSupplier.balance)}>
                                            Pay Full
                                        </Button>
                                    </Alert>
                                </Grid>
                            )}
                        </Grid>
                    )}

                    {/* Tab 2: Quick Purchase */}
                    {activeTab === 2 && (
                        <Box>
                            <Grid container spacing={2} sx={{ mb: 1 }}>
                                <Grid item xs={12} sm={4}>
                                    <Autocomplete
                                        size="small"
                                        options={suppliers}
                                        getOptionLabel={(o) => o.name || ''}
                                        value={purchaseSupplier}
                                        onChange={(e, v) => setPurchaseSupplier(v)}
                                        renderInput={(params) => <TextField {...params} label="Supplier *" />}
                                    />
                                </Grid>
                                <Grid item xs={6} sm={2}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Bill No"
                                        value={purchaseBillNo}
                                        onChange={(e) => setPurchaseBillNo(e.target.value)}
                                        placeholder="Auto"
                                    />
                                </Grid>
                                <Grid item xs={6} sm={2}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        type="date"
                                        label="Date"
                                        value={purchaseDate}
                                        onChange={(e) => setPurchaseDate(e.target.value)}
                                        InputLabelProps={{ shrink: true }}
                                    />
                                </Grid>
                                <Grid item xs={6} sm={2}>
                                    <Box sx={{ bgcolor: '#e3f2fd', p: 1, borderRadius: 1, textAlign: 'center' }}>
                                        <Typography variant="caption">Total</Typography>
                                        <Typography variant="body1" sx={{ fontWeight: 700 }}>₹{purchaseTotal.toLocaleString('en-IN')}</Typography>
                                    </Box>
                                </Grid>
                                <Grid item xs={6} sm={2}>
                                    <Button
                                        fullWidth
                                        variant="contained"
                                        onClick={handleQuickPurchase}
                                        disabled={saving}
                                        startIcon={saving ? <CircularProgress size={16} /> : <Save />}
                                        sx={{ height: '100%' }}
                                    >
                                        Save
                                    </Button>
                                </Grid>
                            </Grid>
                            
                            <TableContainer sx={{ bgcolor: 'white', borderRadius: 1, maxHeight: 180 }}>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow sx={{ '& th': { bgcolor: '#f5f5f5', py: 0.5 } }}>
                                            <TableCell>#</TableCell>
                                            <TableCell>Item Name</TableCell>
                                            <TableCell sx={{ width: 80 }}>Qty</TableCell>
                                            <TableCell sx={{ width: 100 }}>Price</TableCell>
                                            <TableCell sx={{ width: 100 }}>Total</TableCell>
                                            <TableCell sx={{ width: 40 }}></TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {purchaseItems.map((item, idx) => (
                                            <TableRow key={idx}>
                                                <TableCell sx={{ py: 0.3 }}>{idx + 1}</TableCell>
                                                <TableCell sx={{ py: 0.3 }}>
                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        variant="standard"
                                                        placeholder="Item"
                                                        value={item.name}
                                                        onChange={(e) => updatePurchaseItem(idx, 'name', e.target.value)}
                                                    />
                                                </TableCell>
                                                <TableCell sx={{ py: 0.3 }}>
                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        variant="standard"
                                                        type="number"
                                                        value={item.qty}
                                                        onChange={(e) => updatePurchaseItem(idx, 'qty', e.target.value)}
                                                    />
                                                </TableCell>
                                                <TableCell sx={{ py: 0.3 }}>
                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        variant="standard"
                                                        type="number"
                                                        value={item.price}
                                                        onChange={(e) => updatePurchaseItem(idx, 'price', e.target.value)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' && idx === purchaseItems.length - 1) {
                                                                addPurchaseRow();
                                                            }
                                                        }}
                                                    />
                                                </TableCell>
                                                <TableCell sx={{ py: 0.3, fontWeight: 500 }}>₹{item.total.toLocaleString('en-IN')}</TableCell>
                                                <TableCell sx={{ py: 0.3 }}>
                                                    {purchaseItems.length > 1 && (
                                                        <IconButton size="small" onClick={() => removePurchaseRow(idx)}>
                                                            <Delete fontSize="small" color="error" />
                                                        </IconButton>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                            <Button size="small" startIcon={<Add />} onClick={addPurchaseRow} sx={{ mt: 1 }}>Add Row</Button>
                        </Box>
                    )}
                </Box>
            </Paper>

            {/* Search and Filter */}
            <Paper sx={{ p: 1.5, mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                <TextField
                    size="small"
                    placeholder="Search supplier..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }}
                    sx={{ width: 250 }}
                />
                <FormControl size="small" sx={{ minWidth: 120 }}>
                    <InputLabel>Balance</InputLabel>
                    <Select value={balanceFilter} label="Balance" onChange={(e) => setBalanceFilter(e.target.value)}>
                        <MenuItem value="all">All</MenuItem>
                        <MenuItem value="due">With Due</MenuItem>
                        <MenuItem value="clear">Clear/Advance</MenuItem>
                    </Select>
                </FormControl>
            </Paper>

            {/* Suppliers Table */}
            <Paper>
                <TableContainer sx={{ maxHeight: 400 }}>
                    <Table size="small" stickyHeader>
                        <TableHead>
                            <TableRow sx={{ '& th': { bgcolor: '#f5f5f5' } }}>
                                <TableCell><strong>Supplier</strong></TableCell>
                                <TableCell><strong>Mobile</strong></TableCell>
                                <TableCell align="right"><strong>Purchases</strong></TableCell>
                                <TableCell align="right"><strong>Paid</strong></TableCell>
                                <TableCell align="right"><strong>Balance</strong></TableCell>
                                <TableCell align="center"><strong>Actions</strong></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                                        <CircularProgress size={24} />
                                    </TableCell>
                                </TableRow>
                            ) : paginatedSuppliers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                                        <Typography color="text.secondary">No suppliers found</Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                paginatedSuppliers.map((supplier) => (
                                    <TableRow key={supplier.id} hover>
                                        <TableCell sx={{ fontWeight: 500 }}>{supplier.name}</TableCell>
                                        <TableCell>{supplier.mobile || '-'}</TableCell>
                                        <TableCell align="right" sx={{ color: 'error.main' }}>
                                            ₹{(supplier.totalDebit || 0).toLocaleString('en-IN')}
                                        </TableCell>
                                        <TableCell align="right" sx={{ color: 'success.main' }}>
                                            ₹{(supplier.totalCredit || 0).toLocaleString('en-IN')}
                                        </TableCell>
                                        <TableCell align="right">
                                            <Chip
                                                label={`₹${Math.abs(supplier.balance || 0).toLocaleString('en-IN')}`}
                                                color={supplier.balance > 0 ? 'error' : supplier.balance < 0 ? 'success' : 'default'}
                                                size="small"
                                                sx={{ fontWeight: 600 }}
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <Button
                                                size="small"
                                                variant="outlined"
                                                onClick={() => fetchSupplierDetails(supplier.id)}
                                                sx={{ mr: 0.5, minWidth: 60 }}
                                            >
                                                View
                                            </Button>
                                            <IconButton size="small" onClick={() => handleDelete(supplier.id)}>
                                                <Delete fontSize="small" color="error" />
                                            </IconButton>
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
                    onPageChange={(e, p) => setPage(p)}
                    rowsPerPage={rowsPerPage}
                    onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
                    rowsPerPageOptions={[10, 25, 50]}
                />
            </Paper>

            {/* Details Dialog */}
            <Dialog open={detailsDialog.open} onClose={() => setDetailsDialog({ open: false, supplier: null, tab: 0 })} maxWidth="md" fullWidth>
                {detailsDialog.supplier && (
                    <>
                        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Typography variant="h6">{detailsDialog.supplier.name}</Typography>
                            <IconButton onClick={() => setDetailsDialog({ open: false, supplier: null, tab: 0 })}>
                                <Close />
                            </IconButton>
                        </DialogTitle>
                        <DialogContent>
                            <Grid container spacing={2} sx={{ mb: 2 }}>
                                <Grid item xs={3}>
                                    <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: '#e3f2fd' }}>
                                        <Typography variant="caption">Opening</Typography>
                                        <Typography variant="h6">₹{(detailsDialog.supplier.openingBalance || 0).toLocaleString('en-IN')}</Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={3}>
                                    <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: '#ffebee' }}>
                                        <Typography variant="caption">Purchases</Typography>
                                        <Typography variant="h6">₹{(detailsDialog.supplier.totalDebit || 0).toLocaleString('en-IN')}</Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={3}>
                                    <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: '#e8f5e9' }}>
                                        <Typography variant="caption">Paid</Typography>
                                        <Typography variant="h6">₹{(detailsDialog.supplier.totalCredit || 0).toLocaleString('en-IN')}</Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={3}>
                                    <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: detailsDialog.supplier.balance > 0 ? '#fff3e0' : '#e8f5e9' }}>
                                        <Typography variant="caption">Balance</Typography>
                                        <Typography variant="h6" sx={{ color: detailsDialog.supplier.balance > 0 ? 'warning.dark' : 'success.dark' }}>
                                            ₹{Math.abs(detailsDialog.supplier.balance || 0).toLocaleString('en-IN')}
                                        </Typography>
                                    </Paper>
                                </Grid>
                            </Grid>

                            <Tabs value={detailsDialog.tab} onChange={(e, v) => setDetailsDialog({ ...detailsDialog, tab: v })}>
                                <Tab label={`Purchases (${detailsDialog.supplier.purchases?.length || 0})`} />
                                <Tab label={`Payments (${detailsDialog.supplier.payments?.length || 0})`} />
                            </Tabs>

                            {detailsDialog.tab === 0 && (
                                <TableContainer sx={{ maxHeight: 300, mt: 1 }}>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow sx={{ '& th': { bgcolor: '#ffebee' } }}>
                                                <TableCell width={40}></TableCell>
                                                <TableCell>Bill No</TableCell>
                                                <TableCell>Date</TableCell>
                                                <TableCell align="right">Total</TableCell>
                                                <TableCell>Status</TableCell>
                                                <TableCell align="center">Action</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {detailsDialog.supplier.purchases?.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={6} align="center">No purchases</TableCell>
                                                </TableRow>
                                            ) : (
                                                detailsDialog.supplier.purchases?.map((p) => (
                                                    <>
                                                        <TableRow key={p.id} hover sx={{ cursor: 'pointer' }} onClick={() => setExpandedPurchase(expandedPurchase === p.id ? null : p.id)}>
                                                            <TableCell>
                                                                <IconButton size="small">
                                                                    {expandedPurchase === p.id ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                                                                </IconButton>
                                                            </TableCell>
                                                            <TableCell>{p.billNumber || '-'}</TableCell>
                                                            <TableCell>{p.billDate ? moment(p.billDate, ['DD-MM-YYYY', 'YYYY-MM-DD']).format('DD/MM/YY') : '-'}</TableCell>
                                                            <TableCell align="right" sx={{ fontWeight: 600, color: 'error.main' }}>₹{(p.total || 0).toLocaleString('en-IN')}</TableCell>
                                                            <TableCell><Chip label={p.paymentStatus} size="small" color={p.paymentStatus === 'paid' ? 'success' : 'warning'} /></TableCell>
                                                            <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                                                                <IconButton size="small" color="error" onClick={() => handleDeletePurchase(p.id)}>
                                                                    <Delete fontSize="small" />
                                                                </IconButton>
                                                            </TableCell>
                                                        </TableRow>
                                                        {expandedPurchase === p.id && (
                                                            <TableRow>
                                                                <TableCell colSpan={6} sx={{ bgcolor: '#fafafa', py: 0 }}>
                                                                    <Collapse in={true}>
                                                                        <Box sx={{ p: 1.5 }}>
                                                                            <Typography variant="caption" sx={{ fontWeight: 600, color: '#1976d2' }}>Items:</Typography>
                                                                            {p.purchaseItems?.map((item, idx) => (
                                                                                <Typography key={idx} variant="body2">
                                                                                    {item.name} - {item.quantity} x ₹{item.price} = ₹{item.totalPrice}
                                                                                </Typography>
                                                                            ))}
                                                                            {(!p.purchaseItems || p.purchaseItems.length === 0) && (
                                                                                <Typography variant="body2" color="text.secondary">No items</Typography>
                                                                            )}
                                                                        </Box>
                                                                    </Collapse>
                                                                </TableCell>
                                                            </TableRow>
                                                        )}
                                                    </>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}

                            {detailsDialog.tab === 1 && (
                                <TableContainer sx={{ maxHeight: 300, mt: 1 }}>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow sx={{ '& th': { bgcolor: '#e8f5e9' } }}>
                                                <TableCell>Payment #</TableCell>
                                                <TableCell>Date</TableCell>
                                                <TableCell align="right">Amount</TableCell>
                                                <TableCell>Notes</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {detailsDialog.supplier.payments?.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={4} align="center">No payments</TableCell>
                                                </TableRow>
                                            ) : (
                                                detailsDialog.supplier.payments?.map((p) => (
                                                    <TableRow key={p.id} hover>
                                                        <TableCell>{p.paymentNumber}</TableCell>
                                                        <TableCell>{p.paymentDate ? moment(p.paymentDate, ['DD-MM-YYYY', 'YYYY-MM-DD']).format('DD/MM/YY') : '-'}</TableCell>
                                                        <TableCell align="right" sx={{ fontWeight: 600, color: 'success.main' }}>₹{(p.amount || 0).toLocaleString('en-IN')}</TableCell>
                                                        <TableCell>{p.notes || '-'}</TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                        </DialogContent>
                    </>
                )}
            </Dialog>
        </Box>
    );
};

export default ListSuppliers;
