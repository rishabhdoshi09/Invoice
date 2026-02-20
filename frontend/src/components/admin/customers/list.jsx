import { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Box, Button, Card, CardContent, Table, TableBody, TableCell, TableContainer, 
    TableHead, TableRow, TextField, Dialog, DialogTitle, DialogContent, DialogActions, 
    Typography, IconButton, Chip, Tooltip, Grid, Paper, Tabs, Tab, Alert,
    FormControl, InputLabel, Select, MenuItem, CircularProgress, Autocomplete,
    InputAdornment, TablePagination, Collapse, Switch, FormControlLabel,
    List, ListItem, ListItemText, ListItemSecondaryAction, Badge
} from '@mui/material';
import { 
    Delete, Visibility, Refresh, Add, Receipt, People, Close, 
    ShoppingCart, Search, Download, CheckCircle,
    KeyboardArrowDown, KeyboardArrowUp, PersonAdd, Warning,
    History, Phone, Email, AccountBalance, TipsAndUpdates, PictureAsPdf
} from '@mui/icons-material';
import axios from 'axios';
import moment from 'moment';
import pdfMake from 'pdfmake/build/pdfmake';
import { generatePdfDefinition } from '../orders/helper';

// Load pdfMake fonts safely
try {
    const vfsFonts = require('pdfmake/build/vfs_fonts');
    if (vfsFonts?.pdfMake?.vfs) {
        pdfMake.vfs = vfsFonts.pdfMake.vfs;
    } else if (vfsFonts?.vfs) {
        pdfMake.vfs = vfsFonts.vfs;
    }
} catch (e) {
    console.warn('pdfMake fonts not loaded:', e);
}

export const ListCustomers = () => {
    const navigate = useNavigate();
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [detailsDialog, setDetailsDialog] = useState({ open: false, customer: null, tab: 0 });
    
    // Search and Filter
    const [searchTerm, setSearchTerm] = useState('');
    const [balanceFilter, setBalanceFilter] = useState('all');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(15);
    
    // Quick Entry Mode
    const [activeTab, setActiveTab] = useState(0);
    const [successMessage, setSuccessMessage] = useState('');
    const [saving, setSaving] = useState(false);
    
    // Quick Add Customer
    const [newCustomer, setNewCustomer] = useState({ name: '', mobile: '', email: '', address: '', gstin: '', openingBalance: 0 });
    const customerNameRef = useRef(null);
    const [duplicateWarning, setDuplicateWarning] = useState('');
    
    // Quick Receipt (Payment from customer)
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [receiptAmount, setReceiptAmount] = useState('');
    const [receiptDate, setReceiptDate] = useState(moment().format('YYYY-MM-DD'));
    const [receiptNotes, setReceiptNotes] = useState('');
    const [createNewCustomer, setCreateNewCustomer] = useState(false);
    const [newCustomerName, setNewCustomerName] = useState('');
    const [newCustomerMobile, setNewCustomerMobile] = useState('');
    
    // Expanded rows
    const [expandedOrder, setExpandedOrder] = useState(null);
    
    // Recent activity
    const [recentReceipts, setRecentReceipts] = useState([]);
    
    // Print/View state
    const [printingInvoice, setPrintingInvoice] = useState(null);
    const [viewingInvoice, setViewingInvoice] = useState(null);
    const [invoicePreviewUrl, setInvoicePreviewUrl] = useState(null);
    const [invoicePreviewOpen, setInvoicePreviewOpen] = useState(false);

    useEffect(() => {
        fetchCustomers();
        fetchRecentReceipts();
    }, []);

    const fetchCustomers = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const { data } = await axios.get('/api/customers/with-balance', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setCustomers(data.data?.rows || []);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchRecentReceipts = async () => {
        try {
            const token = localStorage.getItem('token');
            const { data } = await axios.get('/api/payments?partyType=customer&limit=5', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setRecentReceipts(data.data?.rows || []);
        } catch (error) {
            console.error('Error fetching recent receipts:', error);
        }
    };

    const fetchCustomerDetails = async (customerId) => {
        try {
            const token = localStorage.getItem('token');
            const { data } = await axios.get(`/api/customers/${customerId}/transactions`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setExpandedOrder(null);
            setDetailsDialog({ open: true, customer: data.data, tab: 0 });
        } catch (error) {
            alert('Error fetching details');
        }
    };

    // Fetch full order details and generate PDF
    const fetchOrderAndGeneratePdf = async (orderId) => {
        const token = localStorage.getItem('token');
        const { data } = await axios.get(`/api/orders/${orderId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return data.data || data;
    };

    // Print Invoice function
    const handlePrintInvoice = async (order) => {
        setPrintingInvoice(order.id);
        try {
            const fullOrder = await fetchOrderAndGeneratePdf(order.id);
            const pdfDefinition = generatePdfDefinition(fullOrder);
            pdfMake.createPdf(pdfDefinition).print();
        } catch (error) {
            console.error('Error printing invoice:', error);
            alert('Failed to print invoice. Please try again.');
        } finally {
            setPrintingInvoice(null);
        }
    };

    // View Invoice as PDF in modal
    const handleViewInvoice = async (order) => {
        setViewingInvoice(order.id);
        try {
            const fullOrder = await fetchOrderAndGeneratePdf(order.id);
            const pdfDefinition = generatePdfDefinition(fullOrder);
            pdfMake.createPdf(pdfDefinition).getBlob((blob) => {
                const url = URL.createObjectURL(blob);
                setInvoicePreviewUrl(url);
                setInvoicePreviewOpen(true);
            });
        } catch (error) {
            console.error('Error viewing PDF:', error);
            alert('Failed to load invoice preview. Please try again.');
        } finally {
            setViewingInvoice(null);
        }
    };

    // Close invoice preview
    const handleCloseInvoicePreview = () => {
        setInvoicePreviewOpen(false);
        if (invoicePreviewUrl) {
            URL.revokeObjectURL(invoicePreviewUrl);
            setInvoicePreviewUrl(null);
        }
    };

    // Check for duplicate customer name/mobile
    const checkDuplicate = useCallback((name, mobile) => {
        if (!name.trim() && !mobile.trim()) {
            setDuplicateWarning('');
            return;
        }
        
        let warning = '';
        if (name.trim()) {
            const nameMatch = customers.find(c => 
                c.name.toLowerCase().trim() === name.toLowerCase().trim()
            );
            if (nameMatch) {
                warning = `⚠️ "${nameMatch.name}" already exists (Balance: ₹${nameMatch.balance?.toLocaleString('en-IN')})`;
            }
        }
        
        if (mobile.trim() && mobile.length >= 10) {
            const mobileMatch = customers.find(c => 
                c.mobile && c.mobile === mobile.trim()
            );
            if (mobileMatch && !warning) {
                warning = `⚠️ Mobile ${mobile} belongs to "${mobileMatch.name}"`;
            }
        }
        
        setDuplicateWarning(warning);
    }, [customers]);

    // Filtered customers
    const filteredCustomers = useMemo(() => {
        return customers.filter(c => {
            const matchesSearch = !searchTerm || 
                c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.mobile?.includes(searchTerm) ||
                c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.gstin?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesBalance = balanceFilter === 'all' || 
                (balanceFilter === 'receivable' && c.balance > 0) ||
                (balanceFilter === 'advance' && c.balance < 0) ||
                (balanceFilter === 'clear' && c.balance === 0);
            return matchesSearch && matchesBalance;
        });
    }, [customers, searchTerm, balanceFilter]);

    const paginatedCustomers = filteredCustomers.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

    // Summary stats
    const totalReceivable = customers.reduce((sum, c) => sum + Math.max(0, c.balance || 0), 0);
    const totalAdvance = customers.reduce((sum, c) => sum + Math.abs(Math.min(0, c.balance || 0)), 0);
    const customersWithDue = customers.filter(c => c.balance > 0).length;

    const showSuccess = (msg) => {
        setSuccessMessage(msg);
        setTimeout(() => setSuccessMessage(''), 4000);
    };

    // ========== SMART ADD CUSTOMER ==========
    const handleAddCustomer = async () => {
        if (!newCustomer.name.trim()) {
            alert('Customer name is required');
            return;
        }
        
        // Check for exact duplicate
        const exactMatch = customers.find(c => 
            c.name.toLowerCase().trim() === newCustomer.name.toLowerCase().trim()
        );
        if (exactMatch) {
            if (!window.confirm(`"${exactMatch.name}" already exists. Create anyway?`)) {
                return;
            }
        }
        
        // Check mobile duplicate
        if (newCustomer.mobile && newCustomer.mobile.length >= 10) {
            const mobileMatch = customers.find(c => c.mobile === newCustomer.mobile);
            if (mobileMatch) {
                if (!window.confirm(`Mobile ${newCustomer.mobile} belongs to "${mobileMatch.name}". Create anyway?`)) {
                    return;
                }
            }
        }
        
        setSaving(true);
        try {
            const token = localStorage.getItem('token');
            await axios.post('/api/customers', {
                name: newCustomer.name.trim(),
                mobile: newCustomer.mobile?.trim() || '',
                email: newCustomer.email?.trim() || '',
                address: newCustomer.address?.trim() || '',
                gstin: newCustomer.gstin?.trim() || '',
                openingBalance: parseFloat(newCustomer.openingBalance) || 0
            }, { headers: { Authorization: `Bearer ${token}` } });
            
            showSuccess(`✓ Added: ${newCustomer.name}${newCustomer.mobile ? ` (${newCustomer.mobile})` : ''}`);
            setNewCustomer({ name: '', mobile: '', email: '', address: '', gstin: '', openingBalance: 0 });
            setDuplicateWarning('');
            fetchCustomers();
            customerNameRef.current?.focus();
        } catch (error) {
            alert('Error: ' + (error.response?.data?.message || error.message));
        } finally {
            setSaving(false);
        }
    };

    // ========== SMART RECEIPT (Payment from Customer) ==========
    const handleQuickReceipt = async () => {
        let customerId = selectedCustomer?.id;
        let customerName = selectedCustomer?.name;
        
        // Create new customer if needed
        if (createNewCustomer && newCustomerName.trim()) {
            try {
                const token = localStorage.getItem('token');
                const { data } = await axios.post('/api/customers', {
                    name: newCustomerName.trim(),
                    mobile: newCustomerMobile?.trim() || '',
                    email: '',
                    address: '',
                    gstin: '',
                    openingBalance: 0
                }, { headers: { Authorization: `Bearer ${token}` } });
                customerId = data.data.id;
                customerName = newCustomerName.trim();
            } catch (error) {
                alert('Error creating customer: ' + (error.response?.data?.message || error.message));
                return;
            }
        }
        
        if (!customerId && !customerName) {
            alert('Select or create a customer');
            return;
        }
        if (!receiptAmount || parseFloat(receiptAmount) <= 0) {
            alert('Enter valid amount');
            return;
        }
        
        setSaving(true);
        try {
            const token = localStorage.getItem('token');
            await axios.post('/api/payments', {
                partyType: 'customer',
                partyId: customerId,
                partyName: customerName,
                amount: parseFloat(receiptAmount),
                paymentDate: moment(receiptDate).format('DD-MM-YYYY'),
                referenceType: 'advance',
                notes: receiptNotes
            }, { headers: { Authorization: `Bearer ${token}` } });
            
            showSuccess(`✓ Received ₹${parseFloat(receiptAmount).toLocaleString('en-IN')} from ${customerName}`);
            setSelectedCustomer(null);
            setReceiptAmount('');
            setReceiptNotes('');
            setCreateNewCustomer(false);
            setNewCustomerName('');
            setNewCustomerMobile('');
            fetchCustomers();
            fetchRecentReceipts();
        } catch (error) {
            alert('Error: ' + (error.response?.data?.message || error.message));
        } finally {
            setSaving(false);
        }
    };

    // Quick receipt from table
    const handleQuickReceiptFromTable = (customer) => {
        setActiveTab(1);
        setSelectedCustomer(customer);
        setReceiptAmount(customer.balance > 0 ? customer.balance.toString() : '');
    };

    // Navigate to create order
    const handleCreateSale = (customer) => {
        navigate('/orders/create', { state: { customer } });
    };

    // Delete
    const handleDelete = async (id, name) => {
        if (!window.confirm(`Delete "${name}"? This will fail if they have transactions.`)) return;
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`/api/customers/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            showSuccess(`Deleted: ${name}`);
            fetchCustomers();
        } catch (error) {
            alert('Error: ' + (error.response?.data?.message || error.message));
        }
    };

    // Export
    const handleExport = () => {
        const headers = ['Name', 'Mobile', 'Email', 'GSTIN', 'Sales', 'Received', 'Balance'];
        const rows = filteredCustomers.map(c => [
            c.name,
            c.mobile || '',
            c.email || '',
            c.gstin || '',
            c.totalDebit || 0,
            c.totalCredit || 0,
            c.balance || 0
        ]);
        const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `customers_${moment().format('YYYY-MM-DD')}.csv`;
        a.click();
    };

    return (
        <Box sx={{ p: 2, bgcolor: '#f5f5f5', minHeight: '100vh' }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h5" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <People color="primary" /> Customer Ledger
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button size="small" variant="contained" color="success" startIcon={<ShoppingCart />} onClick={() => navigate('/orders/create')}>
                        New Sale
                    </Button>
                    <Button size="small" startIcon={<Download />} onClick={handleExport}>Export</Button>
                    <Button size="small" startIcon={<Refresh />} onClick={() => { fetchCustomers(); fetchRecentReceipts(); }}>Refresh</Button>
                </Box>
            </Box>

            {/* Summary Cards */}
            <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6} sm={3}>
                    <Card sx={{ bgcolor: '#e8f5e9', cursor: 'pointer' }} onClick={() => setBalanceFilter('receivable')}>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption" color="text.secondary">Total Receivable</Typography>
                            <Typography variant="h6" sx={{ fontWeight: 700, color: 'success.dark' }}>
                                ₹{totalReceivable.toLocaleString('en-IN')}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">{customersWithDue} customers</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Card sx={{ bgcolor: '#fff3e0', cursor: 'pointer' }} onClick={() => setBalanceFilter('advance')}>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption" color="text.secondary">Advance Received</Typography>
                            <Typography variant="h6" sx={{ fontWeight: 700, color: 'warning.dark' }}>
                                ₹{totalAdvance.toLocaleString('en-IN')}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Card sx={{ cursor: 'pointer' }} onClick={() => setBalanceFilter('all')}>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption" color="text.secondary">Total Customers</Typography>
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>{customers.length}</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Card sx={{ bgcolor: '#e3f2fd' }}>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption" color="text.secondary">Net Position</Typography>
                            <Typography variant="h6" sx={{ fontWeight: 700, color: totalReceivable - totalAdvance > 0 ? 'success.main' : 'warning.main' }}>
                                ₹{Math.abs(totalReceivable - totalAdvance).toLocaleString('en-IN')}
                                {totalReceivable - totalAdvance > 0 ? ' ↑' : ' ↓'}
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
                    <Tab icon={<PersonAdd />} label="Add Customer" iconPosition="start" sx={{ minHeight: 48 }} />
                    <Tab icon={<Badge badgeContent={customersWithDue} color="success"><Receipt /></Badge>} label="Receive Payment" iconPosition="start" sx={{ minHeight: 48 }} />
                    <Tab icon={<Badge badgeContent={customers.filter(c => c.balance < 0).length} color="warning"><AccountBalance /></Badge>} label="Advances" iconPosition="start" sx={{ minHeight: 48 }} />
                    <Tab icon={<History />} label="Recent" iconPosition="start" sx={{ minHeight: 48 }} />
                </Tabs>

                <Box sx={{ p: 2 }}>
                    {/* Tab 0: Add Customer */}
                    {activeTab === 0 && (
                        <Box>
                            <Grid container spacing={2} alignItems="center">
                                <Grid item xs={12} sm={3}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Customer Name *"
                                        value={newCustomer.name}
                                        onChange={(e) => {
                                            setNewCustomer({ ...newCustomer, name: e.target.value });
                                            checkDuplicate(e.target.value, newCustomer.mobile);
                                        }}
                                        inputRef={customerNameRef}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddCustomer()}
                                        error={!!duplicateWarning}
                                    />
                                </Grid>
                                <Grid item xs={6} sm={2}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Mobile"
                                        value={newCustomer.mobile}
                                        onChange={(e) => {
                                            setNewCustomer({ ...newCustomer, mobile: e.target.value });
                                            checkDuplicate(newCustomer.name, e.target.value);
                                        }}
                                        InputProps={{ startAdornment: <InputAdornment position="start"><Phone fontSize="small" /></InputAdornment> }}
                                    />
                                </Grid>
                                <Grid item xs={6} sm={2}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Email"
                                        value={newCustomer.email}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                                    />
                                </Grid>
                                <Grid item xs={6} sm={2}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Opening Balance"
                                        type="number"
                                        value={newCustomer.openingBalance}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, openingBalance: e.target.value })}
                                        InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                                    />
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <Button
                                        fullWidth
                                        variant="contained"
                                        onClick={handleAddCustomer}
                                        disabled={saving}
                                        startIcon={saving ? <CircularProgress size={16} /> : <Add />}
                                    >
                                        Add Customer
                                    </Button>
                                </Grid>
                            </Grid>
                            <Grid container spacing={2} sx={{ mt: 0.5 }}>
                                <Grid item xs={6} sm={3}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Address"
                                        value={newCustomer.address}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                                        placeholder="Optional"
                                    />
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="GSTIN"
                                        value={newCustomer.gstin}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, gstin: e.target.value.toUpperCase() })}
                                        placeholder="Optional"
                                    />
                                </Grid>
                            </Grid>
                            {duplicateWarning && (
                                <Alert severity="warning" sx={{ mt: 1, py: 0 }} icon={<Warning />}>
                                    {duplicateWarning}
                                </Alert>
                            )}
                        </Box>
                    )}

                    {/* Tab 1: Receive Payment */}
                    {activeTab === 1 && (
                        <Box>
                            <Grid container spacing={2} alignItems="center">
                                <Grid item xs={12} sm={4}>
                                    {!createNewCustomer ? (
                                        <Autocomplete
                                            size="small"
                                            options={customers.sort((a, b) => (b.balance || 0) - (a.balance || 0))}
                                            getOptionLabel={(o) => o.name || ''}
                                            value={selectedCustomer}
                                            onChange={(e, v) => {
                                                setSelectedCustomer(v);
                                                if (v && v.balance > 0) setReceiptAmount(v.balance.toString());
                                            }}
                                            renderInput={(params) => <TextField {...params} label="Select Customer *" />}
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
                                                            color={option.balance > 0 ? 'success' : option.balance < 0 ? 'warning' : 'default'}
                                                            sx={{ height: 20, fontSize: '0.7rem' }} 
                                                        />
                                                    </Box>
                                                </li>
                                            )}
                                        />
                                    ) : (
                                        <Box sx={{ display: 'flex', gap: 1 }}>
                                            <TextField
                                                size="small"
                                                label="New Customer Name *"
                                                value={newCustomerName}
                                                onChange={(e) => setNewCustomerName(e.target.value)}
                                                sx={{ flex: 1 }}
                                            />
                                            <TextField
                                                size="small"
                                                label="Mobile"
                                                value={newCustomerMobile}
                                                onChange={(e) => setNewCustomerMobile(e.target.value)}
                                                sx={{ width: 130 }}
                                            />
                                        </Box>
                                    )}
                                </Grid>
                                <Grid item xs={6} sm={2}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Amount *"
                                        type="number"
                                        value={receiptAmount}
                                        onChange={(e) => setReceiptAmount(e.target.value)}
                                        InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                                    />
                                </Grid>
                                <Grid item xs={6} sm={2}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        type="date"
                                        label="Date"
                                        value={receiptDate}
                                        onChange={(e) => setReceiptDate(e.target.value)}
                                        InputLabelProps={{ shrink: true }}
                                    />
                                </Grid>
                                <Grid item xs={8} sm={2}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Notes"
                                        value={receiptNotes}
                                        onChange={(e) => setReceiptNotes(e.target.value)}
                                        placeholder="Optional"
                                    />
                                </Grid>
                                <Grid item xs={4} sm={2}>
                                    <Button
                                        fullWidth
                                        variant="contained"
                                        color="success"
                                        onClick={handleQuickReceipt}
                                        disabled={saving}
                                        startIcon={saving ? <CircularProgress size={16} /> : <Receipt />}
                                    >
                                        Receive
                                    </Button>
                                </Grid>
                            </Grid>
                            <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
                                <FormControlLabel
                                    control={<Switch size="small" checked={createNewCustomer} onChange={(e) => {
                                        setCreateNewCustomer(e.target.checked);
                                        if (e.target.checked) setSelectedCustomer(null);
                                    }} />}
                                    label={<Typography variant="body2">Create new customer</Typography>}
                                />
                                {selectedCustomer && selectedCustomer.balance > 0 && (
                                    <Alert severity="success" sx={{ py: 0, flex: 1 }}>
                                        <strong>Due: ₹{selectedCustomer.balance?.toLocaleString('en-IN')}</strong>
                                        <Button size="small" sx={{ ml: 2 }} onClick={() => setReceiptAmount(selectedCustomer.balance.toString())}>
                                            Receive Full
                                        </Button>
                                    </Alert>
                                )}
                                {selectedCustomer && selectedCustomer.balance < 0 && (
                                    <Alert severity="warning" sx={{ py: 0, flex: 1 }}>
                                        <strong>Advance: ₹{Math.abs(selectedCustomer.balance)?.toLocaleString('en-IN')}</strong> (already paid extra)
                                    </Alert>
                                )}
                            </Box>
                        </Box>
                    )}

                    {/* Tab 2: Recent Activity */}
                    {activeTab === 3 && (
                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>Recent Customer Receipts</Typography>
                            {recentReceipts.length === 0 ? (
                                <Typography color="text.secondary">No recent receipts</Typography>
                            ) : (
                                <List dense>
                                    {recentReceipts.map((p) => (
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

                    {/* Tab 2: Advances */}
                    {activeTab === 2 && (
                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <AccountBalance color="warning" fontSize="small" />
                                Customers with Advance Balance
                            </Typography>
                            {customers.filter(c => c.balance < 0).length === 0 ? (
                                <Alert severity="info" sx={{ mt: 1 }}>
                                    No customers have advance payments. When a customer pays more than their due amount, it shows here as advance.
                                </Alert>
                            ) : (
                                <TableContainer sx={{ maxHeight: 300 }}>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow sx={{ '& th': { bgcolor: '#fff3e0', fontWeight: 600 } }}>
                                                <TableCell>Customer</TableCell>
                                                <TableCell>Mobile</TableCell>
                                                <TableCell align="right">Advance Amount</TableCell>
                                                <TableCell align="center">Action</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {customers.filter(c => c.balance < 0).map((customer) => (
                                                <TableRow key={customer.id} hover>
                                                    <TableCell>
                                                        <Typography variant="body2" fontWeight={500}>{customer.name}</Typography>
                                                    </TableCell>
                                                    <TableCell>{customer.mobile || '-'}</TableCell>
                                                    <TableCell align="right">
                                                        <Chip 
                                                            label={`₹${Math.abs(customer.balance).toLocaleString('en-IN')}`} 
                                                            color="warning" 
                                                            size="small"
                                                            sx={{ fontWeight: 600 }}
                                                        />
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <Tooltip title="Create Sale (use advance)">
                                                            <Button 
                                                                size="small" 
                                                                variant="outlined" 
                                                                color="success"
                                                                onClick={() => handleCreateSale(customer)}
                                                                startIcon={<ShoppingCart />}
                                                            >
                                                                Use Advance
                                                            </Button>
                                                        </Tooltip>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                            <Alert severity="info" sx={{ mt: 2 }} icon={<TipsAndUpdates />}>
                                <strong>Tip:</strong> Advance amounts are automatically adjusted when you create a new sale for the customer.
                            </Alert>
                        </Box>
                    )}
                </Box>
            </Paper>

            {/* Search and Filter */}
            <Paper sx={{ p: 1.5, mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                <TextField
                    size="small"
                    placeholder="Search name, mobile, email, GSTIN..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }}
                    sx={{ width: 300 }}
                />
                <FormControl size="small" sx={{ minWidth: 150 }}>
                    <InputLabel>Balance Filter</InputLabel>
                    <Select value={balanceFilter} label="Balance Filter" onChange={(e) => setBalanceFilter(e.target.value)}>
                        <MenuItem value="all">All ({customers.length})</MenuItem>
                        <MenuItem value="receivable">Receivable ({customersWithDue})</MenuItem>
                        <MenuItem value="advance">Advance ({customers.filter(c => c.balance < 0).length})</MenuItem>
                        <MenuItem value="clear">Clear ({customers.filter(c => c.balance === 0).length})</MenuItem>
                    </Select>
                </FormControl>
                <Typography variant="body2" color="text.secondary">
                    Showing {filteredCustomers.length} of {customers.length}
                </Typography>
            </Paper>

            {/* Customers Table */}
            <Paper>
                <TableContainer sx={{ maxHeight: 450 }}>
                    <Table size="small" stickyHeader>
                        <TableHead>
                            <TableRow sx={{ '& th': { bgcolor: '#f5f5f5', fontWeight: 600 } }}>
                                <TableCell>Customer</TableCell>
                                <TableCell>Contact</TableCell>
                                <TableCell align="right">Sales</TableCell>
                                <TableCell align="right">Received</TableCell>
                                <TableCell align="right">Balance</TableCell>
                                <TableCell align="center" sx={{ width: 220 }}>Quick Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                                        <CircularProgress size={28} />
                                    </TableCell>
                                </TableRow>
                            ) : paginatedCustomers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                                        <Typography color="text.secondary">No customers found</Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                paginatedCustomers.map((customer) => (
                                    <TableRow key={customer.id} hover>
                                        <TableCell>
                                            <Typography variant="body2" sx={{ fontWeight: 500 }}>{customer.name}</Typography>
                                            {customer.gstin && <Typography variant="caption" color="text.secondary">{customer.gstin}</Typography>}
                                        </TableCell>
                                        <TableCell>
                                            {customer.mobile && (
                                                <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                    <Phone fontSize="small" sx={{ fontSize: 14, color: 'text.secondary' }} />
                                                    {customer.mobile}
                                                </Typography>
                                            )}
                                            {customer.email && (
                                                <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                    <Email fontSize="small" sx={{ fontSize: 12 }} />
                                                    {customer.email}
                                                </Typography>
                                            )}
                                            {!customer.mobile && !customer.email && '-'}
                                        </TableCell>
                                        <TableCell align="right">
                                            <Typography sx={{ color: 'primary.main', fontWeight: 500 }}>
                                                ₹{(customer.totalDebit || 0).toLocaleString('en-IN')}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Typography sx={{ color: 'success.main', fontWeight: 500 }}>
                                                ₹{(customer.totalCredit || 0).toLocaleString('en-IN')}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Chip
                                                label={`${customer.balance < 0 ? '-' : ''}₹${Math.abs(customer.balance || 0).toLocaleString('en-IN')}`}
                                                color={customer.balance > 0 ? 'success' : customer.balance < 0 ? 'warning' : 'default'}
                                                size="small"
                                                sx={{ fontWeight: 600, minWidth: 80 }}
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                                <Tooltip title="Create Sale">
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        color="primary"
                                                        onClick={() => handleCreateSale(customer)}
                                                        sx={{ minWidth: 40, px: 1 }}
                                                    >
                                                        <ShoppingCart fontSize="small" />
                                                    </Button>
                                                </Tooltip>
                                                <Tooltip title="Receive Payment">
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        color="success"
                                                        onClick={() => handleQuickReceiptFromTable(customer)}
                                                        sx={{ minWidth: 40, px: 1 }}
                                                    >
                                                        <Receipt fontSize="small" />
                                                    </Button>
                                                </Tooltip>
                                                <Tooltip title="View Details">
                                                    <Button
                                                        size="small"
                                                        variant="contained"
                                                        onClick={() => fetchCustomerDetails(customer.id)}
                                                        sx={{ minWidth: 40, px: 1 }}
                                                    >
                                                        <Visibility fontSize="small" />
                                                    </Button>
                                                </Tooltip>
                                                <Tooltip title="Delete">
                                                    <IconButton size="small" onClick={() => handleDelete(customer.id, customer.name)}>
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
                    count={filteredCustomers.length}
                    page={page}
                    onPageChange={(e, p) => setPage(p)}
                    rowsPerPage={rowsPerPage}
                    onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
                    rowsPerPageOptions={[10, 15, 25, 50]}
                />
            </Paper>

            {/* Details Dialog */}
            <Dialog open={detailsDialog.open} onClose={() => setDetailsDialog({ open: false, customer: null, tab: 0 })} maxWidth="md" fullWidth>
                {detailsDialog.customer && (
                    <>
                        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
                            <Box>
                                <Typography variant="h6">{detailsDialog.customer.name}</Typography>
                                <Box sx={{ display: 'flex', gap: 2 }}>
                                    {detailsDialog.customer.mobile && (
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <Phone fontSize="small" sx={{ fontSize: 14 }} /> {detailsDialog.customer.mobile}
                                        </Typography>
                                    )}
                                    {detailsDialog.customer.email && (
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <Email fontSize="small" sx={{ fontSize: 14 }} /> {detailsDialog.customer.email}
                                        </Typography>
                                    )}
                                </Box>
                            </Box>
                            <IconButton onClick={() => setDetailsDialog({ open: false, customer: null, tab: 0 })}>
                                <Close />
                            </IconButton>
                        </DialogTitle>
                        <DialogContent>
                            <Grid container spacing={2} sx={{ mb: 2 }}>
                                <Grid item xs={3}>
                                    <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: '#e3f2fd' }}>
                                        <Typography variant="caption">Opening</Typography>
                                        <Typography variant="h6">₹{(detailsDialog.customer.openingBalance || 0).toLocaleString('en-IN')}</Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={3}>
                                    <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: '#e8f5e9' }}>
                                        <Typography variant="caption">Total Sales</Typography>
                                        <Typography variant="h6">₹{(detailsDialog.customer.totalDebit || 0).toLocaleString('en-IN')}</Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={3}>
                                    <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: '#fff3e0' }}>
                                        <Typography variant="caption">Received</Typography>
                                        <Typography variant="h6">₹{(detailsDialog.customer.totalCredit || 0).toLocaleString('en-IN')}</Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={3}>
                                    <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: detailsDialog.customer.balance > 0 ? '#e8f5e9' : '#fff3e0' }}>
                                        <Typography variant="caption">Balance</Typography>
                                        <Typography variant="h6" sx={{ color: detailsDialog.customer.balance > 0 ? 'success.dark' : 'warning.dark' }}>
                                            ₹{Math.abs(detailsDialog.customer.balance || 0).toLocaleString('en-IN')}
                                            {detailsDialog.customer.balance > 0 ? ' (Due)' : detailsDialog.customer.balance < 0 ? ' (Adv)' : ''}
                                        </Typography>
                                    </Paper>
                                </Grid>
                            </Grid>

                            <Tabs value={detailsDialog.tab} onChange={(e, v) => setDetailsDialog({ ...detailsDialog, tab: v })}>
                                <Tab label={`Invoices (${detailsDialog.customer.orders?.length || 0})`} />
                                <Tab label={`Receipts (${detailsDialog.customer.payments?.length || 0})`} />
                            </Tabs>

                            {detailsDialog.tab === 0 && (
                                <TableContainer sx={{ maxHeight: 300, mt: 1 }}>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow sx={{ '& th': { bgcolor: '#e8f5e9' } }}>
                                                <TableCell width={40}></TableCell>
                                                <TableCell>Invoice #</TableCell>
                                                <TableCell>Date</TableCell>
                                                <TableCell align="right">Total</TableCell>
                                                <TableCell align="right">Paid</TableCell>
                                                <TableCell align="right">Due</TableCell>
                                                <TableCell>Status</TableCell>
                                                <TableCell align="center">Actions</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {detailsDialog.customer.orders?.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={8} align="center" sx={{ py: 2 }}>No invoices yet</TableCell>
                                                </TableRow>
                                            ) : (
                                                detailsDialog.customer.orders?.map((o) => (
                                                    <>
                                                        <TableRow key={o.id} hover>
                                                            <TableCell onClick={() => setExpandedOrder(expandedOrder === o.id ? null : o.id)} sx={{ cursor: 'pointer' }}>
                                                                <IconButton size="small">
                                                                    {expandedOrder === o.id ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                                                                </IconButton>
                                                            </TableCell>
                                                            <TableCell sx={{ fontWeight: 500 }}>{o.orderNumber}</TableCell>
                                                            <TableCell>{o.orderDate ? moment(o.orderDate, ['DD-MM-YYYY', 'YYYY-MM-DD']).format('DD/MM/YY') : '-'}</TableCell>
                                                            <TableCell align="right" sx={{ fontWeight: 600 }}>₹{(o.total || 0).toLocaleString('en-IN')}</TableCell>
                                                            <TableCell align="right" sx={{ color: 'success.main' }}>₹{(o.paidAmount || 0).toLocaleString('en-IN')}</TableCell>
                                                            <TableCell align="right" sx={{ color: 'error.main' }}>₹{(o.dueAmount || 0).toLocaleString('en-IN')}</TableCell>
                                                            <TableCell><Chip label={o.paymentStatus} size="small" color={o.paymentStatus === 'paid' ? 'success' : 'warning'} /></TableCell>
                                                            <TableCell align="center">
                                                                <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                                                    <Tooltip title="View Invoice">
                                                                        <IconButton 
                                                                            size="small" 
                                                                            color="primary"
                                                                            onClick={() => handleViewInvoice(o)}
                                                                            disabled={viewingInvoice === o.id}
                                                                            data-testid={`view-invoice-${o.id}`}
                                                                        >
                                                                            {viewingInvoice === o.id ? <CircularProgress size={18} /> : <Visibility fontSize="small" />}
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                    <Tooltip title="Download PDF">
                                                                        <IconButton 
                                                                            size="small" 
                                                                            color="secondary"
                                                                            onClick={() => handleDownloadInvoicePdf(o)}
                                                                            disabled={downloadingPdf === o.id}
                                                                            data-testid={`download-invoice-${o.id}`}
                                                                        >
                                                                            {downloadingPdf === o.id ? <CircularProgress size={18} /> : <PictureAsPdf fontSize="small" />}
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                </Box>
                                                            </TableCell>
                                                        </TableRow>
                                                        {expandedOrder === o.id && (
                                                            <TableRow>
                                                                <TableCell colSpan={8} sx={{ bgcolor: '#fafafa', py: 0 }}>
                                                                    <Collapse in={true}>
                                                                        <Box sx={{ p: 1.5 }}>
                                                                            <Typography variant="caption" sx={{ fontWeight: 600, color: '#1976d2' }}>
                                                                                Customer ID linked: {o.customerId ? '✓ Yes' : '✗ No (legacy)'}
                                                                            </Typography>
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
                                            <TableRow sx={{ '& th': { bgcolor: '#fff3e0' } }}>
                                                <TableCell>Receipt #</TableCell>
                                                <TableCell>Date</TableCell>
                                                <TableCell align="right">Amount</TableCell>
                                                <TableCell>Notes</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {detailsDialog.customer.payments?.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={4} align="center" sx={{ py: 2 }}>No receipts yet</TableCell>
                                                </TableRow>
                                            ) : (
                                                detailsDialog.customer.payments?.map((p) => (
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
                            <Button onClick={() => handleCreateSale(detailsDialog.customer)} startIcon={<ShoppingCart />} color="primary">
                                Create Sale
                            </Button>
                            <Button onClick={() => handleQuickReceiptFromTable(detailsDialog.customer)} startIcon={<Receipt />} color="success">
                                Receive Payment
                            </Button>
                        </DialogActions>
                    </>
                )}
            </Dialog>

            {/* Invoice Preview Dialog */}
            <Dialog 
                open={invoicePreviewOpen} 
                onClose={handleCloseInvoicePreview} 
                maxWidth="md" 
                fullWidth
                PaperProps={{ sx: { height: '90vh' } }}
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
                    <Typography variant="h6">Invoice Preview</Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                            size="small"
                            variant="outlined"
                            startIcon={<Download />}
                            onClick={() => {
                                if (invoicePreviewUrl) {
                                    const a = document.createElement('a');
                                    a.href = invoicePreviewUrl;
                                    a.download = 'Invoice.pdf';
                                    a.click();
                                }
                            }}
                        >
                            Download
                        </Button>
                        <IconButton onClick={handleCloseInvoicePreview}>
                            <Close />
                        </IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
                    {invoicePreviewUrl ? (
                        <iframe
                            src={invoicePreviewUrl}
                            title="Invoice Preview"
                            style={{ 
                                width: '100%', 
                                height: '100%', 
                                border: 'none',
                                flexGrow: 1
                            }}
                        />
                    ) : (
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                            <CircularProgress />
                        </Box>
                    )}
                </DialogContent>
            </Dialog>
        </Box>
    );
};

export default ListCustomers;
