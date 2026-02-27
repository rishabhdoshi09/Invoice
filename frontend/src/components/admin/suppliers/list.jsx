import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { 
    Box, Button, Card, CardContent, Table, TableBody, TableCell, TableContainer, 
    TableHead, TableRow, TextField, Dialog, DialogTitle, DialogContent, DialogActions, 
    Typography, IconButton, Chip, Tooltip, Grid, Paper, Tabs, Tab, Alert,
    FormControl, InputLabel, Select, MenuItem, CircularProgress, Autocomplete,
    InputAdornment, TablePagination, Collapse, Switch, FormControlLabel,
    List, ListItem, ListItemText, ListItemSecondaryAction, Badge
} from '@mui/material';
import { 
    Delete, Visibility, Refresh, Add, Payment, Close,
    Search, Download, AccountBalance, ShoppingBag, CheckCircle,
    KeyboardArrowDown, KeyboardArrowUp, Save, PersonAdd, Warning,
    History
} from '@mui/icons-material';
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
    const [rowsPerPage, setRowsPerPage] = useState(15);
    
    // Quick Entry Mode
    const [activeTab, setActiveTab] = useState(0);
    const [successMessage, setSuccessMessage] = useState('');
    const [saving, setSaving] = useState(false);
    
    // Quick Add Supplier
    const [newSupplier, setNewSupplier] = useState({ name: '', mobile: '', gstin: '', openingBalance: 0 });
    const supplierNameRef = useRef(null);
    const [duplicateWarning, setDuplicateWarning] = useState('');
    
    // Quick Payment
    const [selectedSupplier, setSelectedSupplier] = useState(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(moment().format('YYYY-MM-DD'));
    const [paymentNotes, setPaymentNotes] = useState('');
    const [createNewSupplier, setCreateNewSupplier] = useState(false);
    const [newSupplierName, setNewSupplierName] = useState('');
    
    // Quick Purchase
    const [purchaseSupplier, setPurchaseSupplier] = useState(null);
    const [purchaseBillNo, setPurchaseBillNo] = useState('');
    const [purchaseDate, setPurchaseDate] = useState(moment().format('YYYY-MM-DD'));
    const [purchaseItems, setPurchaseItems] = useState([{ name: '', qty: '', price: '', total: 0 }]);
    const [isPurchasePaid, setIsPurchasePaid] = useState(false);
    const [createNewPurchaseSupplier, setCreateNewPurchaseSupplier] = useState(false);
    const [newPurchaseSupplierName, setNewPurchaseSupplierName] = useState('');
    
    // Expanded rows
    const [expandedPurchase, setExpandedPurchase] = useState(null);
    
    // Recent activity
    const [recentPayments, setRecentPayments] = useState([]);

    useEffect(() => {
        fetchSuppliers();
        fetchRecentPayments();
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

    const fetchRecentPayments = async () => {
        try {
            const token = localStorage.getItem('token');
            const { data } = await axios.get('/api/payments?partyType=supplier&limit=5', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setRecentPayments(data.data?.rows || []);
        } catch (error) {
            console.error('Error fetching recent payments:', error);
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

    // Check for duplicate supplier name
    const checkDuplicate = useCallback((name) => {
        if (!name.trim()) {
            setDuplicateWarning('');
            return;
        }
        const exists = suppliers.find(s => 
            s.name.toLowerCase().trim() === name.toLowerCase().trim()
        );
        if (exists) {
            setDuplicateWarning(`⚠️ "${exists.name}" already exists with balance ₹${exists.balance?.toLocaleString('en-IN')}`);
        } else {
            setDuplicateWarning('');
        }
    }, [suppliers]);

    // Filtered suppliers
    const filteredSuppliers = useMemo(() => {
        return suppliers.filter(s => {
            const matchesSearch = !searchTerm || 
                s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                s.mobile?.includes(searchTerm) ||
                s.gstin?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesBalance = balanceFilter === 'all' || 
                (balanceFilter === 'due' && s.balance > 0) ||
                (balanceFilter === 'advance' && s.balance < 0) ||
                (balanceFilter === 'clear' && s.balance === 0);
            return matchesSearch && matchesBalance;
        });
    }, [suppliers, searchTerm, balanceFilter]);

    const paginatedSuppliers = filteredSuppliers.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

    // Summary stats
    const totalDue = suppliers.reduce((sum, s) => sum + Math.max(0, s.balance || 0), 0);
    const totalAdvance = suppliers.reduce((sum, s) => sum + Math.abs(Math.min(0, s.balance || 0)), 0);
    const suppliersWithDue = suppliers.filter(s => s.balance > 0).length;

    const showSuccess = (msg) => {
        setSuccessMessage(msg);
        setTimeout(() => setSuccessMessage(''), 4000);
    };

    // ========== SMART ADD SUPPLIER ==========
    const handleAddSupplier = async () => {
        if (!newSupplier.name.trim()) {
            alert('Supplier name is required');
            return;
        }
        
        // Check for exact duplicate
        const exactMatch = suppliers.find(s => 
            s.name.toLowerCase().trim() === newSupplier.name.toLowerCase().trim()
        );
        if (exactMatch) {
            if (!window.confirm(`"${exactMatch.name}" already exists. Create anyway?`)) {
                return;
            }
        }
        
        setSaving(true);
        try {
            const token = localStorage.getItem('token');
            await axios.post('/api/suppliers', {
                name: newSupplier.name.trim(),
                mobile: newSupplier.mobile?.trim() || '',
                gstin: newSupplier.gstin?.trim() || '',
                openingBalance: parseFloat(newSupplier.openingBalance) || 0
            }, { headers: { Authorization: `Bearer ${token}` } });
            
            showSuccess(`✓ Added: ${newSupplier.name}`);
            setNewSupplier({ name: '', mobile: '', gstin: '', openingBalance: 0 });
            setDuplicateWarning('');
            fetchSuppliers();
            supplierNameRef.current?.focus();
        } catch (error) {
            alert('Error: ' + (error.response?.data?.message || error.message));
        } finally {
            setSaving(false);
        }
    };

    // ========== SMART PAYMENT ==========
    const handleQuickPayment = async () => {
        let supplierId = selectedSupplier?.id;
        let supplierName = selectedSupplier?.name;
        
        // Create new supplier if needed
        if (createNewSupplier && newSupplierName.trim()) {
            try {
                const token = localStorage.getItem('token');
                const { data } = await axios.post('/api/suppliers', {
                    name: newSupplierName.trim(),
                    openingBalance: 0
                }, { headers: { Authorization: `Bearer ${token}` } });
                supplierId = data.data.id;
                supplierName = newSupplierName.trim();
            } catch (error) {
                alert('Error creating supplier: ' + (error.response?.data?.message || error.message));
                return;
            }
        }
        
        if (!supplierId && !supplierName) {
            alert('Select or create a supplier');
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
                partyId: supplierId,
                partyName: supplierName,
                amount: parseFloat(paymentAmount),
                paymentDate: moment(paymentDate).format('DD-MM-YYYY'),
                referenceType: 'advance',
                notes: paymentNotes
            }, { headers: { Authorization: `Bearer ${token}` } });
            
            showSuccess(`✓ Paid ₹${parseFloat(paymentAmount).toLocaleString('en-IN')} to ${supplierName}`);
            setSelectedSupplier(null);
            setPaymentAmount('');
            setPaymentNotes('');
            setCreateNewSupplier(false);
            setNewSupplierName('');
            fetchSuppliers();
            fetchRecentPayments();
        } catch (error) {
            alert('Error: ' + (error.response?.data?.message || error.message));
        } finally {
            setSaving(false);
        }
    };

    // ========== SMART PURCHASE ==========
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
        let supplierId = purchaseSupplier?.id;
        let supplierName = purchaseSupplier?.name;
        
        // Create new supplier if needed
        if (createNewPurchaseSupplier && newPurchaseSupplierName.trim()) {
            try {
                const token = localStorage.getItem('token');
                const { data } = await axios.post('/api/suppliers', {
                    name: newPurchaseSupplierName.trim(),
                    openingBalance: 0
                }, { headers: { Authorization: `Bearer ${token}` } });
                supplierId = data.data.id;
                supplierName = newPurchaseSupplierName.trim();
            } catch (error) {
                alert('Error creating supplier: ' + (error.response?.data?.message || error.message));
                return;
            }
        }
        
        if (!supplierId) {
            alert('Select or create a supplier');
            return;
        }
        
        const validItems = purchaseItems.filter(i => i.name && i.qty && i.price);
        if (validItems.length === 0) {
            alert('Add at least one item with name, qty and price');
            return;
        }
        
        setSaving(true);
        try {
            const token = localStorage.getItem('token');
            await axios.post('/api/purchases', {
                supplierId: supplierId,
                billNumber: purchaseBillNo,
                billDate: moment(purchaseDate).format('DD-MM-YYYY'),
                paymentStatus: isPurchasePaid ? 'paid' : 'unpaid',
                paidAmount: isPurchasePaid ? purchaseTotal : 0,
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
            
            showSuccess(`✓ Purchase ₹${purchaseTotal.toLocaleString('en-IN')} from ${supplierName} (${isPurchasePaid ? 'PAID' : 'CREDIT'})`);
            setPurchaseSupplier(null);
            setPurchaseBillNo('');
            setPurchaseItems([{ name: '', qty: '', price: '', total: 0 }]);
            setIsPurchasePaid(false);
            setCreateNewPurchaseSupplier(false);
            setNewPurchaseSupplierName('');
            fetchSuppliers();
        } catch (error) {
            alert('Error: ' + (error.response?.data?.message || error.message));
        } finally {
            setSaving(false);
        }
    };

    // Quick pay from table
    const handleQuickPayFromTable = (supplier) => {
        setActiveTab(1);
        setSelectedSupplier(supplier);
        setPaymentAmount(supplier.balance > 0 ? supplier.balance.toString() : '');
    };

    // Quick purchase from table
    const handleQuickPurchaseFromTable = (supplier) => {
        setActiveTab(2);
        setPurchaseSupplier(supplier);
    };

    // Delete
    const handleDelete = async (id, name) => {
        if (!window.confirm(`Delete "${name}"? This will fail if they have transactions.`)) return;
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`/api/suppliers/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            showSuccess(`Deleted: ${name}`);
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

    const handleDeletePayment = async (paymentId) => {
        if (!window.confirm('Delete this payment?')) return;
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`/api/payments/${paymentId}`, {
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

    // Export
    const handleExport = () => {
        const headers = ['Name', 'Mobile', 'GSTIN', 'Purchases', 'Paid', 'Balance'];
        const rows = filteredSuppliers.map(s => [
            s.name,
            s.mobile || '',
            s.gstin || '',
            s.totalDebit || 0,
            s.totalCredit || 0,
            s.balance || 0
        ]);
        const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `suppliers_${moment().format('YYYY-MM-DD')}.csv`;
        a.click();
    };

    return (
        <Box sx={{ p: 2, bgcolor: '#f5f5f5', minHeight: '100vh' }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h5" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AccountBalance color="primary" /> Supplier Ledger
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button size="small" startIcon={<Download />} onClick={handleExport}>Export</Button>
                    <Button size="small" startIcon={<Refresh />} onClick={() => { fetchSuppliers(); fetchRecentPayments(); }}>Refresh</Button>
                </Box>
            </Box>

            {/* Summary Cards */}
            <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6} sm={3}>
                    <Card sx={{ bgcolor: '#fff3e0', cursor: 'pointer' }} onClick={() => setBalanceFilter('due')}>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption" color="text.secondary">Total Payable</Typography>
                            <Typography variant="h6" sx={{ fontWeight: 700, color: 'warning.dark' }}>
                                ₹{totalDue.toLocaleString('en-IN')}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">{suppliersWithDue} suppliers</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Card sx={{ bgcolor: '#e8f5e9', cursor: 'pointer' }} onClick={() => setBalanceFilter('advance')}>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption" color="text.secondary">Advance Given</Typography>
                            <Typography variant="h6" sx={{ fontWeight: 700, color: 'success.dark' }}>
                                ₹{totalAdvance.toLocaleString('en-IN')}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Card sx={{ cursor: 'pointer' }} onClick={() => setBalanceFilter('all')}>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption" color="text.secondary">Total Suppliers</Typography>
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>{suppliers.length}</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Card sx={{ bgcolor: '#e3f2fd' }}>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption" color="text.secondary">Net Position</Typography>
                            <Typography variant="h6" sx={{ fontWeight: 700, color: totalDue - totalAdvance > 0 ? 'error.main' : 'success.main' }}>
                                ₹{Math.abs(totalDue - totalAdvance).toLocaleString('en-IN')}
                                {totalDue - totalAdvance > 0 ? ' ↑' : ' ↓'}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Success Message */}
            {successMessage && (
                <Alert severity="success" icon={<CheckCircle />} sx={{ mb: 2, py: 0.5 }} onClose={() => setSuccessMessage('')}>
                    {successMessage}
                </Alert>
            )}

            {/* Quick Entry Tabs */}
            <Paper sx={{ mb: 2 }}>
                <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tab icon={<PersonAdd />} label="Add Supplier" iconPosition="start" sx={{ minHeight: 48 }} />
                    <Tab icon={<Badge badgeContent={suppliersWithDue} color="error"><Payment /></Badge>} label="Quick Payment" iconPosition="start" sx={{ minHeight: 48 }} />
                    <Tab icon={<ShoppingBag />} label="Quick Purchase" iconPosition="start" sx={{ minHeight: 48 }} />
                    <Tab icon={<History />} label="Recent" iconPosition="start" sx={{ minHeight: 48 }} />
                </Tabs>

                <Box sx={{ p: 2 }}>
                    {/* Tab 0: Add Supplier */}
                    {activeTab === 0 && (
                        <Box>
                            <Grid container spacing={2} alignItems="center">
                                <Grid item xs={12} sm={3}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Supplier Name *"
                                        value={newSupplier.name}
                                        onChange={(e) => {
                                            setNewSupplier({ ...newSupplier, name: e.target.value });
                                            checkDuplicate(e.target.value);
                                        }}
                                        inputRef={supplierNameRef}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddSupplier()}
                                        error={!!duplicateWarning}
                                    />
                                </Grid>
                                <Grid item xs={6} sm={2}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Mobile"
                                        value={newSupplier.mobile}
                                        onChange={(e) => setNewSupplier({ ...newSupplier, mobile: e.target.value })}
                                    />
                                </Grid>
                                <Grid item xs={6} sm={2}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="GSTIN"
                                        value={newSupplier.gstin}
                                        onChange={(e) => setNewSupplier({ ...newSupplier, gstin: e.target.value.toUpperCase() })}
                                    />
                                </Grid>
                                <Grid item xs={6} sm={2}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Opening Balance"
                                        type="number"
                                        value={newSupplier.openingBalance}
                                        onChange={(e) => setNewSupplier({ ...newSupplier, openingBalance: e.target.value })}
                                        InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                                    />
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <Button
                                        fullWidth
                                        variant="contained"
                                        onClick={handleAddSupplier}
                                        disabled={saving}
                                        startIcon={saving ? <CircularProgress size={16} /> : <Add />}
                                    >
                                        Add Supplier
                                    </Button>
                                </Grid>
                            </Grid>
                            {duplicateWarning && (
                                <Alert severity="warning" sx={{ mt: 1, py: 0 }} icon={<Warning />}>
                                    {duplicateWarning}
                                </Alert>
                            )}
                        </Box>
                    )}

                    {/* Tab 1: Quick Payment */}
                    {activeTab === 1 && (
                        <Box>
                            <Grid container spacing={2} alignItems="center">
                                <Grid item xs={12} sm={4}>
                                    {!createNewSupplier ? (
                                        <Autocomplete
                                            size="small"
                                            options={suppliers.sort((a, b) => (b.balance || 0) - (a.balance || 0))}
                                            getOptionLabel={(o) => o.name || ''}
                                            value={selectedSupplier}
                                            onChange={(e, v) => {
                                                setSelectedSupplier(v);
                                                if (v && v.balance > 0) setPaymentAmount(v.balance.toString());
                                            }}
                                            renderInput={(params) => <TextField {...params} label="Select Supplier *" />}
                                            renderOption={(props, option) => (
                                                <li {...props}>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                                        <Box>
                                                            <Typography variant="body2">{option.name}</Typography>
                                                            {option.mobile && <Typography variant="caption" color="text.secondary">{option.mobile}</Typography>}
                                                        </Box>
                                                        <Chip 
                                                            label={`₹${Math.abs(option.balance || 0).toLocaleString('en-IN')}`} 
                                                            size="small" 
                                                            color={option.balance > 0 ? 'error' : option.balance < 0 ? 'success' : 'default'}
                                                            sx={{ height: 20, fontSize: '0.7rem' }} 
                                                        />
                                                    </Box>
                                                </li>
                                            )}
                                        />
                                    ) : (
                                        <TextField
                                            fullWidth
                                            size="small"
                                            label="New Supplier Name *"
                                            value={newSupplierName}
                                            onChange={(e) => setNewSupplierName(e.target.value)}
                                            placeholder="Enter new supplier name"
                                        />
                                    )}
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
                                        placeholder="Optional"
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
                            </Grid>
                            <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
                                <FormControlLabel
                                    control={<Switch size="small" checked={createNewSupplier} onChange={(e) => {
                                        setCreateNewSupplier(e.target.checked);
                                        if (e.target.checked) setSelectedSupplier(null);
                                    }} />}
                                    label={<Typography variant="body2">Create new supplier</Typography>}
                                />
                                {selectedSupplier && selectedSupplier.balance > 0 && (
                                    <Alert severity="warning" sx={{ py: 0, flex: 1 }}>
                                        <strong>Due: ₹{selectedSupplier.balance?.toLocaleString('en-IN')}</strong>
                                        <Button size="small" sx={{ ml: 2 }} onClick={() => setPaymentAmount(selectedSupplier.balance.toString())}>
                                            Pay Full
                                        </Button>
                                    </Alert>
                                )}
                                {selectedSupplier && selectedSupplier.balance < 0 && (
                                    <Alert severity="info" sx={{ py: 0, flex: 1 }}>
                                        <strong>Advance: ₹{Math.abs(selectedSupplier.balance)?.toLocaleString('en-IN')}</strong> (overpaid)
                                    </Alert>
                                )}
                            </Box>
                        </Box>
                    )}

                    {/* Tab 2: Quick Purchase */}
                    {activeTab === 2 && (
                        <Box>
                            <Grid container spacing={2} sx={{ mb: 1 }}>
                                <Grid item xs={12} sm={3}>
                                    {!createNewPurchaseSupplier ? (
                                        <Autocomplete
                                            size="small"
                                            options={suppliers}
                                            getOptionLabel={(o) => o.name || ''}
                                            value={purchaseSupplier}
                                            onChange={(e, v) => setPurchaseSupplier(v)}
                                            renderInput={(params) => <TextField {...params} label="Select Supplier *" />}
                                            renderOption={(props, option) => (
                                                <li {...props}>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                                        <span>{option.name}</span>
                                                        {option.balance !== 0 && (
                                                            <Chip 
                                                                label={`₹${Math.abs(option.balance || 0).toLocaleString('en-IN')}`} 
                                                                size="small" 
                                                                color={option.balance > 0 ? 'error' : 'success'}
                                                                sx={{ height: 20 }} 
                                                            />
                                                        )}
                                                    </Box>
                                                </li>
                                            )}
                                        />
                                    ) : (
                                        <TextField
                                            fullWidth
                                            size="small"
                                            label="New Supplier Name *"
                                            value={newPurchaseSupplierName}
                                            onChange={(e) => setNewPurchaseSupplierName(e.target.value)}
                                        />
                                    )}
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
                                <Grid item xs={4} sm={2}>
                                    <Box sx={{ bgcolor: isPurchasePaid ? '#e8f5e9' : '#fff3e0', p: 1, borderRadius: 1, textAlign: 'center' }}>
                                        <Typography variant="caption">{isPurchasePaid ? 'PAID' : 'CREDIT'}</Typography>
                                        <Typography variant="body1" sx={{ fontWeight: 700 }}>₹{purchaseTotal.toLocaleString('en-IN')}</Typography>
                                    </Box>
                                </Grid>
                                <Grid item xs={4} sm={1.5}>
                                    <FormControlLabel
                                        control={<Switch checked={isPurchasePaid} onChange={(e) => setIsPurchasePaid(e.target.checked)} />}
                                        label="Paid"
                                    />
                                </Grid>
                                <Grid item xs={4} sm={1.5}>
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
                            
                            <FormControlLabel
                                control={<Switch size="small" checked={createNewPurchaseSupplier} onChange={(e) => {
                                    setCreateNewPurchaseSupplier(e.target.checked);
                                    if (e.target.checked) setPurchaseSupplier(null);
                                }} />}
                                label={<Typography variant="body2">Create new supplier</Typography>}
                                sx={{ mb: 1 }}
                            />
                            
                            <TableContainer sx={{ bgcolor: 'white', borderRadius: 1, maxHeight: 180 }}>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow sx={{ '& th': { bgcolor: '#f5f5f5', py: 0.5 } }}>
                                            <TableCell sx={{ width: 30 }}>#</TableCell>
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
                                                        placeholder="Item name"
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
                                                        inputProps={{ style: { textAlign: 'right' } }}
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
                                                            if (e.key === 'Enter' && idx === purchaseItems.length - 1 && item.name && item.qty && item.price) {
                                                                addPurchaseRow();
                                                            }
                                                        }}
                                                        inputProps={{ style: { textAlign: 'right' } }}
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
                            <Button size="small" startIcon={<Add />} onClick={addPurchaseRow} sx={{ mt: 1 }}>Add Row (or press Enter)</Button>
                        </Box>
                    )}

                    {/* Tab 3: Recent Activity */}
                    {activeTab === 3 && (
                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>Recent Supplier Payments</Typography>
                            {recentPayments.length === 0 ? (
                                <Typography color="text.secondary">No recent payments</Typography>
                            ) : (
                                <List dense>
                                    {recentPayments.map((p) => (
                                        <ListItem key={p.id} sx={{ bgcolor: 'white', mb: 0.5, borderRadius: 1 }}>
                                            <ListItemText
                                                primary={p.partyName}
                                                secondary={`${p.paymentDate ? moment(p.paymentDate, 'DD-MM-YYYY').format('DD/MM/YY') : '-'} • ${p.notes || 'No notes'}`}
                                            />
                                            <ListItemSecondaryAction>
                                                <Chip label={`₹${(p.amount || 0).toLocaleString('en-IN')}`} color="success" size="small" />
                                            </ListItemSecondaryAction>
                                        </ListItem>
                                    ))}
                                </List>
                            )}
                        </Box>
                    )}
                </Box>
            </Paper>

            {/* Search and Filter */}
            <Paper sx={{ p: 1.5, mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                <TextField
                    size="small"
                    placeholder="Search name, mobile, GSTIN..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }}
                    sx={{ width: 280 }}
                />
                <FormControl size="small" sx={{ minWidth: 140 }}>
                    <InputLabel>Balance Filter</InputLabel>
                    <Select value={balanceFilter} label="Balance Filter" onChange={(e) => setBalanceFilter(e.target.value)}>
                        <MenuItem value="all">All ({suppliers.length})</MenuItem>
                        <MenuItem value="due">With Due ({suppliersWithDue})</MenuItem>
                        <MenuItem value="advance">With Advance ({suppliers.filter(s => s.balance < 0).length})</MenuItem>
                        <MenuItem value="clear">Clear ({suppliers.filter(s => s.balance === 0).length})</MenuItem>
                    </Select>
                </FormControl>
                <Typography variant="body2" color="text.secondary">
                    Showing {filteredSuppliers.length} of {suppliers.length}
                </Typography>
            </Paper>

            {/* Suppliers Table */}
            <Paper>
                <TableContainer sx={{ maxHeight: 450 }}>
                    <Table size="small" stickyHeader>
                        <TableHead>
                            <TableRow sx={{ '& th': { bgcolor: '#f5f5f5', fontWeight: 600 } }}>
                                <TableCell>Supplier</TableCell>
                                <TableCell>Contact</TableCell>
                                <TableCell align="right">Purchases</TableCell>
                                <TableCell align="right">Paid</TableCell>
                                <TableCell align="right">Balance</TableCell>
                                <TableCell align="center" sx={{ width: 200 }}>Quick Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                                        <CircularProgress size={28} />
                                    </TableCell>
                                </TableRow>
                            ) : paginatedSuppliers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                                        <Typography color="text.secondary">No suppliers found</Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                paginatedSuppliers.map((supplier) => (
                                    <TableRow key={supplier.id} hover>
                                        <TableCell>
                                            <Typography variant="body2" sx={{ fontWeight: 500 }}>{supplier.name}</Typography>
                                            {supplier.gstin && <Typography variant="caption" color="text.secondary">{supplier.gstin}</Typography>}
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2">{supplier.mobile || '-'}</Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Typography sx={{ color: 'error.main', fontWeight: 500 }}>
                                                ₹{(supplier.totalDebit || 0).toLocaleString('en-IN')}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Typography sx={{ color: 'success.main', fontWeight: 500 }}>
                                                ₹{(supplier.totalCredit || 0).toLocaleString('en-IN')}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Chip
                                                label={`${supplier.balance < 0 ? '-' : ''}₹${Math.abs(supplier.balance || 0).toLocaleString('en-IN')}`}
                                                color={supplier.balance > 0 ? 'error' : supplier.balance < 0 ? 'success' : 'default'}
                                                size="small"
                                                sx={{ fontWeight: 600, minWidth: 80 }}
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                                <Tooltip title="Make Payment">
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        color="success"
                                                        onClick={() => handleQuickPayFromTable(supplier)}
                                                        sx={{ minWidth: 40, px: 1 }}
                                                    >
                                                        <Payment fontSize="small" />
                                                    </Button>
                                                </Tooltip>
                                                <Tooltip title="Add Purchase">
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        onClick={() => handleQuickPurchaseFromTable(supplier)}
                                                        sx={{ minWidth: 40, px: 1 }}
                                                    >
                                                        <ShoppingBag fontSize="small" />
                                                    </Button>
                                                </Tooltip>
                                                <Tooltip title="View Details">
                                                    <Button
                                                        size="small"
                                                        variant="contained"
                                                        onClick={() => fetchSupplierDetails(supplier.id)}
                                                        sx={{ minWidth: 40, px: 1 }}
                                                    >
                                                        <Visibility fontSize="small" />
                                                    </Button>
                                                </Tooltip>
                                                <Tooltip title="Delete">
                                                    <IconButton size="small" onClick={() => handleDelete(supplier.id, supplier.name)}>
                                                        <Delete fontSize="small" color="error" />
                                                    </IconButton>
                                                </Tooltip>
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
                    onPageChange={(e, p) => setPage(p)}
                    rowsPerPage={rowsPerPage}
                    onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
                    rowsPerPageOptions={[10, 15, 25, 50]}
                />
            </Paper>

            {/* Details Dialog — Tally-style Ledger */}
            <Dialog open={detailsDialog.open} onClose={() => setDetailsDialog({ open: false, supplier: null, tab: 0 })} maxWidth="md" fullWidth
                PaperProps={{ sx: { borderRadius: 1, overflow: 'hidden' } }}>
                {detailsDialog.supplier && (() => {
                    const s = detailsDialog.supplier;
                    // Build unified ledger entries sorted by date
                    const ledgerEntries = [];
                    
                    // Opening balance entry
                    if (s.openingBalance && Number(s.openingBalance) !== 0) {
                        ledgerEntries.push({
                            id: 'opening',
                            date: null,
                            sortDate: '0000-00-00',
                            particulars: 'Opening Balance',
                            refNo: '-',
                            debit: Number(s.openingBalance) > 0 ? Number(s.openingBalance) : 0,
                            credit: Number(s.openingBalance) < 0 ? Math.abs(Number(s.openingBalance)) : 0,
                            type: 'opening'
                        });
                    }
                    
                    // Purchase entries
                    (s.purchases || []).forEach(p => {
                        const d = p.billDate ? moment(p.billDate, ['DD-MM-YYYY', 'YYYY-MM-DD']) : moment(p.createdAt);
                        ledgerEntries.push({
                            id: p.id,
                            date: d.isValid() ? d.format('DD/MM/YYYY') : '-',
                            sortDate: d.isValid() ? d.format('YYYY-MM-DD') : '9999-99-99',
                            particulars: `Purchase`,
                            refNo: p.billNumber || '-',
                            debit: Number(p.total) || 0,
                            credit: 0,
                            type: 'purchase',
                            status: p.paymentStatus,
                            raw: p
                        });
                    });
                    
                    // Payment entries
                    (s.payments || []).forEach(p => {
                        const d = p.paymentDate ? moment(p.paymentDate, ['DD-MM-YYYY', 'YYYY-MM-DD']) : moment(p.createdAt);
                        ledgerEntries.push({
                            id: p.id,
                            date: d.isValid() ? d.format('DD/MM/YYYY') : '-',
                            sortDate: d.isValid() ? d.format('YYYY-MM-DD') : '9999-99-99',
                            particulars: `Payment${p.notes ? ` (${p.notes})` : ''}`,
                            refNo: p.paymentNumber || '-',
                            debit: 0,
                            credit: Number(p.amount) || 0,
                            type: 'payment',
                            raw: p
                        });
                    });
                    
                    // Sort by date ascending
                    ledgerEntries.sort((a, b) => a.sortDate.localeCompare(b.sortDate));
                    
                    // Calculate running balance
                    let runningBal = 0;
                    ledgerEntries.forEach(e => {
                        runningBal += e.debit - e.credit;
                        e.balance = runningBal;
                    });

                    const fmt = (v) => v ? `₹${Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 0 })}` : '';
                    const totalDebit = ledgerEntries.reduce((sum, e) => sum + e.debit, 0);
                    const totalCredit = ledgerEntries.reduce((sum, e) => sum + e.credit, 0);

                    return (
                        <>
                            {/* Tally-style header */}
                            <Box sx={{ bgcolor: '#1a237e', color: '#fff', px: 3, py: 1.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Box>
                                    <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: 0.5 }}>{s.name}</Typography>
                                    <Typography variant="caption" sx={{ opacity: 0.8 }}>
                                        {s.mobile && `${s.mobile} | `}{s.gstin && `GSTIN: ${s.gstin} | `}Supplier Ledger
                                    </Typography>
                                </Box>
                                <IconButton onClick={() => setDetailsDialog({ open: false, supplier: null, tab: 0 })} sx={{ color: '#fff' }}>
                                    <Close />
                                </IconButton>
                            </Box>
                            
                            <DialogContent sx={{ p: 0 }}>
                                {/* Tally-style ledger table */}
                                <TableContainer sx={{ maxHeight: 450 }}>
                                    <Table size="small" stickyHeader sx={{
                                        '& td, & th': { borderColor: '#bdbdbd', py: 0.6, px: 1.2, fontSize: '0.82rem' },
                                        '& th': { bgcolor: '#e8eaf6', fontWeight: 700, color: '#1a237e', borderBottom: '2px solid #1a237e' }
                                    }}>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell width={90}>Date</TableCell>
                                                <TableCell>Particulars</TableCell>
                                                <TableCell width={110}>Ref No.</TableCell>
                                                <TableCell align="right" width={100}>Debit (Dr)</TableCell>
                                                <TableCell align="right" width={100}>Credit (Cr)</TableCell>
                                                <TableCell align="right" width={110}>Balance</TableCell>
                                                <TableCell align="center" width={50}></TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {ledgerEntries.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>No transactions</TableCell>
                                                </TableRow>
                                            ) : (
                                                ledgerEntries.map((e) => (
                                                    <React.Fragment key={e.id}>
                                                        <TableRow
                                                            hover
                                                            sx={{
                                                                bgcolor: e.type === 'opening' ? '#fffde7' : e.type === 'purchase' ? '#fff' : '#f1f8e9',
                                                                cursor: e.type === 'purchase' ? 'pointer' : 'default',
                                                                '&:hover': { bgcolor: e.type === 'purchase' ? '#e3f2fd' : e.type === 'payment' ? '#dcedc8' : '#fff9c4' }
                                                            }}
                                                            onClick={() => {
                                                                if (e.type === 'purchase') setExpandedPurchase(expandedPurchase === e.id ? null : e.id);
                                                            }}
                                                        >
                                                            <TableCell sx={{ fontFamily: 'monospace', whiteSpace: 'nowrap' }}>{e.date || ''}</TableCell>
                                                            <TableCell>
                                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                    {e.type === 'purchase' && (
                                                                        <IconButton size="small" sx={{ p: 0, mr: 0.3 }}>
                                                                            {expandedPurchase === e.id ? <KeyboardArrowUp sx={{ fontSize: 16 }} /> : <KeyboardArrowDown sx={{ fontSize: 16 }} />}
                                                                        </IconButton>
                                                                    )}
                                                                    <Typography variant="body2" sx={{ fontWeight: e.type === 'opening' ? 700 : 500, fontSize: '0.82rem' }}>
                                                                        {e.particulars}
                                                                    </Typography>
                                                                </Box>
                                                            </TableCell>
                                                            <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'text.secondary' }}>{e.refNo}</TableCell>
                                                            <TableCell align="right" sx={{ fontWeight: 600, color: e.debit > 0 ? '#c62828' : 'transparent' }}>
                                                                {e.debit > 0 ? fmt(e.debit) : ''}
                                                            </TableCell>
                                                            <TableCell align="right" sx={{ fontWeight: 600, color: e.credit > 0 ? '#2e7d32' : 'transparent' }}>
                                                                {e.credit > 0 ? fmt(e.credit) : ''}
                                                            </TableCell>
                                                            <TableCell align="right" sx={{ fontWeight: 700, fontFamily: 'monospace' }}>
                                                                {fmt(e.balance)} {e.balance >= 0 ? 'Dr' : 'Cr'}
                                                            </TableCell>
                                                            <TableCell align="center" onClick={(ev) => ev.stopPropagation()}>
                                                                {e.type === 'purchase' && (
                                                                    <IconButton size="small" color="error" onClick={() => handleDeletePurchase(e.id)} sx={{ p: 0.3 }}>
                                                                        <Delete sx={{ fontSize: 16 }} />
                                                                    </IconButton>
                                                                )}
                                                                {e.type === 'payment' && (
                                                                    <IconButton size="small" color="error" onClick={() => handleDeletePayment(e.id)} sx={{ p: 0.3 }}>
                                                                        <Delete sx={{ fontSize: 16 }} />
                                                                    </IconButton>
                                                                )}
                                                            </TableCell>
                                                        </TableRow>
                                                        {/* Expanded purchase items */}
                                                        {e.type === 'purchase' && expandedPurchase === e.id && e.raw?.purchaseItems?.length > 0 && (
                                                            <TableRow>
                                                                <TableCell colSpan={7} sx={{ bgcolor: '#f5f5f5', py: 0, borderBottom: '1px solid #bdbdbd' }}>
                                                                    <Collapse in={true}>
                                                                        <Box sx={{ pl: 5, py: 0.8 }}>
                                                                            {e.raw.purchaseItems.map((item, idx) => (
                                                                                <Typography key={idx} variant="body2" sx={{ fontSize: '0.78rem', color: '#555', lineHeight: 1.6 }}>
                                                                                    {item.name} — {item.quantity} × ₹{item.price} = <strong>₹{(item.totalPrice || 0).toLocaleString('en-IN')}</strong>
                                                                                </Typography>
                                                                            ))}
                                                                        </Box>
                                                                    </Collapse>
                                                                </TableCell>
                                                            </TableRow>
                                                        )}
                                                    </React.Fragment>
                                                ))
                                            )}
                                        </TableBody>
                                        {/* Tally-style totals row */}
                                        {ledgerEntries.length > 0 && (
                                            <TableBody>
                                                <TableRow sx={{ '& td': { borderTop: '2px solid #1a237e', bgcolor: '#e8eaf6', fontWeight: 700 } }}>
                                                    <TableCell colSpan={3} sx={{ fontWeight: 700, color: '#1a237e' }}>TOTAL</TableCell>
                                                    <TableCell align="right" sx={{ color: '#c62828' }}>{fmt(totalDebit)}</TableCell>
                                                    <TableCell align="right" sx={{ color: '#2e7d32' }}>{fmt(totalCredit)}</TableCell>
                                                    <TableCell align="right" sx={{ fontFamily: 'monospace', color: '#1a237e' }}>
                                                        {fmt(totalDebit - totalCredit)} {(totalDebit - totalCredit) >= 0 ? 'Dr' : 'Cr'}
                                                    </TableCell>
                                                    <TableCell></TableCell>
                                                </TableRow>
                                            </TableBody>
                                        )}
                                    </Table>
                                </TableContainer>
                            </DialogContent>
                            <DialogActions sx={{ bgcolor: '#f5f5f5', borderTop: '1px solid #ddd', px: 2, py: 1 }}>
                                <Button onClick={() => handleQuickPayFromTable(s)} startIcon={<Payment />} variant="contained" color="success" size="small">
                                    Make Payment
                                </Button>
                                <Button onClick={() => handleQuickPurchaseFromTable(s)} startIcon={<ShoppingBag />} variant="contained" size="small">
                                    Add Purchase
                                </Button>
                            </DialogActions>
                        </>
                    );
                })()}
            </Dialog>
        </Box>
    );
};

export default ListSuppliers;
