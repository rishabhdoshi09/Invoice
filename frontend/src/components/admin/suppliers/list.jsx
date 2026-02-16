import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { 
    Box, Button, Card, CardContent, Table, TableBody, TableCell, TableContainer, 
    TableHead, TableRow, TextField, Dialog, DialogTitle, DialogContent, DialogActions, 
    Typography, IconButton, Chip, Tooltip, Grid, Paper, Tabs, Tab, Alert,
    FormControl, InputLabel, Select, MenuItem, CircularProgress, Autocomplete,
    InputAdornment, Divider, TablePagination, Collapse, Switch, FormControlLabel,
    List, ListItem, ListItemText, ListItemSecondaryAction, Badge
} from '@mui/material';
import { 
    Delete, Edit, Visibility, Refresh, Add, Payment, Receipt, Close,
    Search, Download, AccountBalance, ShoppingBag, CheckCircle,
    KeyboardArrowDown, KeyboardArrowUp, Save, PersonAdd, Warning,
    History, TrendingUp, TrendingDown, Link, LinkOff, ContentCopy
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
            const { data } = await axios.post('/api/suppliers', {
                name: newSupplier.name.trim(),
                mobile: newSupplier.mobile || null,
                gstin: newSupplier.gstin || null,
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

            {/* Details Dialog */}
            <Dialog open={detailsDialog.open} onClose={() => setDetailsDialog({ open: false, supplier: null, tab: 0 })} maxWidth="md" fullWidth>
                {detailsDialog.supplier && (
                    <>
                        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
                            <Box>
                                <Typography variant="h6">{detailsDialog.supplier.name}</Typography>
                                {detailsDialog.supplier.mobile && <Typography variant="caption" color="text.secondary">{detailsDialog.supplier.mobile}</Typography>}
                            </Box>
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
                                                    <TableCell colSpan={6} align="center" sx={{ py: 2 }}>No purchases yet</TableCell>
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
                                                                            <Typography variant="caption" sx={{ fontWeight: 600, color: '#1976d2' }}>Items ({p.purchaseItems?.length || 0}):</Typography>
                                                                            {p.purchaseItems?.length > 0 ? (
                                                                                <Table size="small" sx={{ mt: 0.5 }}>
                                                                                    <TableBody>
                                                                                        {p.purchaseItems.map((item, idx) => (
                                                                                            <TableRow key={idx}>
                                                                                                <TableCell>{item.name}</TableCell>
                                                                                                <TableCell align="right">{item.quantity} × ₹{item.price}</TableCell>
                                                                                                <TableCell align="right" sx={{ fontWeight: 500 }}>= ₹{item.totalPrice}</TableCell>
                                                                                            </TableRow>
                                                                                        ))}
                                                                                    </TableBody>
                                                                                </Table>
                                                                            ) : (
                                                                                <Typography variant="body2" color="text.secondary">No items recorded</Typography>
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
                                                    <TableCell colSpan={4} align="center" sx={{ py: 2 }}>No payments yet</TableCell>
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
                        <DialogActions>
                            <Button onClick={() => handleQuickPayFromTable(detailsDialog.supplier)} startIcon={<Payment />} color="success">
                                Make Payment
                            </Button>
                            <Button onClick={() => handleQuickPurchaseFromTable(detailsDialog.supplier)} startIcon={<ShoppingBag />}>
                                Add Purchase
                            </Button>
                        </DialogActions>
                    </>
                )}
            </Dialog>
        </Box>
    );
};

export default ListSuppliers;
