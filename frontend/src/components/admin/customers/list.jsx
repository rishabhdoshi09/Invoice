import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    Box, Button, Card, CardContent, Table, TableBody, TableCell, TableContainer, 
    TableHead, TableRow, TextField, Dialog, DialogTitle, DialogContent, DialogActions, 
    Typography, IconButton, Chip, Tooltip, Grid, Paper, Tabs, Tab, Alert,
    FormControl, InputLabel, Select, MenuItem, CircularProgress, Autocomplete,
    InputAdornment, Divider, TablePagination
} from '@mui/material';
import { 
    Delete, Edit, Visibility, Refresh, Add, Payment, Receipt, People, Close, 
    Print, OpenInNew, ShoppingCart, AddShoppingCart, Search, FilterList,
    Download, TrendingUp, AccountBalance, AttachMoney
} from '@mui/icons-material';
import { listCustomers, createCustomer, updateCustomer, deleteCustomer } from '../../../services/customer';
import axios from 'axios';
import moment from 'moment';
import pdfMake from 'pdfmake/build/pdfmake';
import { generatePdfDefinition, generatePdfDefinition2 } from '../orders/helper';

export const ListCustomers = () => {
    const navigate = useNavigate();
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState(null);
    const [detailsDialog, setDetailsDialog] = useState({ open: false, customer: null, tab: 0 });
    const [paymentDialog, setPaymentDialog] = useState({ open: false, customer: null });
    const [submitting, setSubmitting] = useState(false);
    const [invoiceDialog, setInvoiceDialog] = useState({ open: false, order: null, pdfUrl: null, loading: false });
    
    // Search and Filter states
    const [searchTerm, setSearchTerm] = useState('');
    const [balanceFilter, setBalanceFilter] = useState('all'); // all, with-balance, no-balance
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    
    // Add Sale Dialog state
    const [saleDialog, setSaleDialog] = useState({ open: false, customer: null });
    const [products, setProducts] = useState([]);
    const [saleItems, setSaleItems] = useState([]);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [saleQuantity, setSaleQuantity] = useState('');
    const [salePrice, setSalePrice] = useState('');
    const [saleTaxPercent, setSaleTaxPercent] = useState(0);
    const [saleSubmitting, setSaleSubmitting] = useState(false);
    const [saleDate, setSaleDate] = useState(moment().format('YYYY-MM-DD'));
    
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

    // Filtered customers based on search and filter
    const filteredCustomers = useMemo(() => {
        let result = customers;
        
        // Search filter
        if (searchTerm) {
            const search = searchTerm.toLowerCase();
            result = result.filter(c => 
                c.name?.toLowerCase().includes(search) ||
                c.mobile?.toLowerCase().includes(search) ||
                c.gstin?.toLowerCase().includes(search)
            );
        }
        
        // Balance filter
        if (balanceFilter === 'with-balance') {
            result = result.filter(c => (c.balance || 0) > 0);
        } else if (balanceFilter === 'no-balance') {
            result = result.filter(c => (c.balance || 0) <= 0);
        }
        
        return result;
    }, [customers, searchTerm, balanceFilter]);

    // Paginated customers
    const paginatedCustomers = useMemo(() => {
        const start = page * rowsPerPage;
        return filteredCustomers.slice(start, start + rowsPerPage);
    }, [filteredCustomers, page, rowsPerPage]);

    // Summary calculations
    const summary = useMemo(() => ({
        totalCustomers: customers.length,
        withBalance: customers.filter(c => (c.balance || 0) > 0).length,
        totalReceivable: customers.reduce((sum, c) => sum + (c.balance || 0), 0),
        totalSales: customers.reduce((sum, c) => sum + (c.totalDebit || 0), 0),
        totalReceived: customers.reduce((sum, c) => sum + (c.totalCredit || 0), 0)
    }), [customers]);

    const fetchCustomers = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const { data } = await axios.get('/api/customers/with-balance', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setCustomers(data.data?.rows || []);
        } catch (error) {
            console.error('Error fetching customers:', error);
            try {
                const { rows } = await listCustomers({});
                setCustomers(rows);
            } catch (fallbackError) {
                console.error('Fallback error:', fallbackError);
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchCustomerDetails = async (customerId) => {
        try {
            const token = localStorage.getItem('token');
            const { data } = await axios.get(`/api/customers/${customerId}/transactions`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setDetailsDialog({ open: true, customer: data.data, tab: 0 });
        } catch (error) {
            console.error('Error fetching customer details:', error);
            alert('Error fetching customer details');
        }
    };

    // Export to CSV
    const handleExportCSV = () => {
        const headers = ['Name', 'Mobile', 'GSTIN', 'Opening Balance', 'Total Sales', 'Total Received', 'Balance'];
        const rows = filteredCustomers.map(c => [
            c.name || '',
            c.mobile || '',
            c.gstin || '',
            (c.openingBalance || 0).toFixed(2),
            (c.totalDebit || 0).toFixed(2),
            (c.totalCredit || 0).toFixed(2),
            (c.balance || 0).toFixed(2)
        ]);
        
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `customers_${moment().format('YYYY-MM-DD')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Function to view invoice PDF
    const handleViewInvoice = async (order) => {
        setInvoiceDialog({ open: true, order, pdfUrl: null, loading: true });
        
        try {
            const token = localStorage.getItem('token');
            const { data } = await axios.get(`/api/orders/${order.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            const orderData = data.data || data;
            const orderItems = (orderData.orderItems || orderData.items || []).map(item => ({
                name: item.altName || item.productName || item.name || 'Item',
                productPrice: item.price || item.productPrice || 0,
                quantity: item.quantity || 0,
                totalPrice: item.totalPrice || (item.price * item.quantity) || 0
            }));
            
            const subTotal = orderItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
            const tax = orderData.tax || 0;
            const total = orderData.total || subTotal + tax;
            
            const pdfData = {
                orderNumber: orderData.orderNumber || order.orderNumber,
                orderDate: orderData.orderDate || order.orderDate,
                customerName: orderData.customerName || order.customerName || '',
                customerMobile: orderData.customerMobile || order.customerMobile || '',
                orderItems,
                subTotal,
                tax,
                taxPercent: orderData.taxPercent || 0,
                total
            };
            
            const pdfObject = generatePdfDefinition2(pdfData);
            pdfMake.createPdf(pdfObject).getBlob((blob) => {
                const url = URL.createObjectURL(blob);
                setInvoiceDialog(prev => ({ ...prev, pdfUrl: url, loading: false }));
            });
            
        } catch (error) {
            console.error('Error fetching order details:', error);
            setInvoiceDialog(prev => ({ ...prev, loading: false }));
            alert('Error loading invoice. Please try again.');
        }
    };

    const handleCloseInvoice = () => {
        if (invoiceDialog.pdfUrl) {
            URL.revokeObjectURL(invoiceDialog.pdfUrl);
        }
        setInvoiceDialog({ open: false, order: null, pdfUrl: null, loading: false });
    };

    const handlePrintInvoice = () => {
        if (invoiceDialog.pdfUrl) {
            const iframe = document.createElement('iframe');
            iframe.style.display = 'none';
            iframe.src = invoiceDialog.pdfUrl;
            document.body.appendChild(iframe);
            iframe.onload = () => {
                iframe.contentWindow.print();
            };
        }
    };

    // Fetch products for Add Sale dialog
    const fetchProducts = async () => {
        try {
            const token = localStorage.getItem('token');
            const { data } = await axios.get('/api/products', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const productList = data.data?.rows || data.rows || {};
            const productsArray = Array.isArray(productList) 
                ? productList 
                : Object.values(productList);
            setProducts(productsArray);
        } catch (error) {
            console.error('Error fetching products:', error);
        }
    };

    const handleOpenSaleDialog = (customer) => {
        setSaleDialog({ open: true, customer });
        setSaleItems([]);
        setSelectedProduct(null);
        setSaleQuantity('');
        setSalePrice('');
        setSaleTaxPercent(0);
        setSaleDate(moment().format('YYYY-MM-DD'));
        fetchProducts();
    };

    const handleAddSaleItem = () => {
        if (!selectedProduct || !saleQuantity || !salePrice) {
            alert('Please select a product and enter quantity and price');
            return;
        }
        
        const qty = parseFloat(saleQuantity) || 0;
        const price = parseFloat(salePrice) || 0;
        const totalPrice = qty * price;
        
        const newItem = {
            id: Date.now(),
            productId: selectedProduct.id,
            productName: selectedProduct.name,
            altName: selectedProduct.altName || '',
            type: selectedProduct.type || 'non-weighted',
            quantity: qty,
            price: price,
            totalPrice: totalPrice
        };
        
        setSaleItems([...saleItems, newItem]);
        setSelectedProduct(null);
        setSaleQuantity('');
        setSalePrice('');
    };

    const handleRemoveSaleItem = (itemId) => {
        setSaleItems(saleItems.filter(item => item.id !== itemId));
    };

    const saleSubTotal = saleItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const saleTax = Math.round(saleSubTotal * (saleTaxPercent / 100));
    const saleTotal = saleSubTotal + saleTax;

    const handleSubmitSale = async () => {
        if (saleItems.length === 0) {
            alert('Please add at least one item to the sale');
            return;
        }
        
        setSaleSubmitting(true);
        
        try {
            const token = localStorage.getItem('token');
            
            const orderData = {
                customerName: saleDialog.customer?.name || '',
                customerMobile: saleDialog.customer?.mobile || '',
                orderDate: moment(saleDate).format('DD-MM-YYYY'),
                paidAmount: 0,
                subTotal: saleSubTotal,
                tax: saleTax,
                taxPercent: saleTaxPercent,
                total: saleTotal,
                orderItems: saleItems.map((item, index) => ({
                    productId: item.productId,
                    name: item.productName,
                    altName: item.altName || '',
                    type: item.type || 'non-weighted',
                    quantity: item.quantity,
                    productPrice: item.price,
                    totalPrice: item.totalPrice,
                    sortOrder: index
                }))
            };
            
            const { data } = await axios.post('/api/orders', orderData, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            alert(`Sale created successfully! Invoice: ${data.data?.orderNumber || 'Created'}`);
            setSaleDialog({ open: false, customer: null });
            setSaleItems([]);
            fetchCustomers();
            
        } catch (error) {
            console.error('Error creating sale:', error);
            alert('Error creating sale: ' + (error.response?.data?.message || error.message));
        } finally {
            setSaleSubmitting(false);
        }
    };

    useEffect(() => {
        fetchCustomers();
    }, []);

    const handleOpenDialog = (customer = null) => {
        if (customer) {
            setEditingCustomer(customer);
            setFormData({
                name: customer.name,
                mobile: customer.mobile || '',
                email: customer.email || '',
                address: customer.address || '',
                gstin: customer.gstin || '',
                openingBalance: customer.openingBalance || 0
            });
        } else {
            setEditingCustomer(null);
            setFormData({ name: '', mobile: '', email: '', address: '', gstin: '', openingBalance: 0 });
        }
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setEditingCustomer(null);
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async () => {
        try {
            if (editingCustomer) {
                await updateCustomer(editingCustomer.id, formData);
            } else {
                await createCustomer(formData);
            }
            handleCloseDialog();
            fetchCustomers();
        } catch (error) {
            console.error('Error saving customer:', error);
            alert('Error saving customer');
        }
    };

    const handleDelete = async (customerId) => {
        if (window.confirm('Are you sure you want to delete this customer?')) {
            try {
                await deleteCustomer(customerId);
                fetchCustomers();
            } catch (error) {
                const errorMessage = error.response?.data?.message || 'Error deleting customer.';
                alert(errorMessage);
            }
        }
    };

    const openPaymentDialog = (customer) => {
        setPaymentForm({
            amount: '',
            referenceType: 'advance',
            notes: '',
            paymentDate: moment().format('YYYY-MM-DD')
        });
        setPaymentDialog({ open: true, customer });
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
                partyType: 'customer',
                partyName: paymentDialog.customer.name,
                partyId: paymentDialog.customer.id,
                amount: parseFloat(paymentForm.amount),
                referenceType: paymentForm.referenceType,
                notes: paymentForm.notes
            };

            await axios.post('/api/payments', payload, {
                headers: { Authorization: `Bearer ${token}` }
            });

            alert(`Payment of ₹${parseFloat(paymentForm.amount).toLocaleString('en-IN')} received from ${paymentDialog.customer.name}!`);
            setPaymentDialog({ open: false, customer: null });
            fetchCustomers();
            
            if (detailsDialog.open && detailsDialog.customer?.id === paymentDialog.customer.id) {
                fetchCustomerDetails(paymentDialog.customer.id);
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
                    <People color="primary" /> Customer Ledger
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button 
                        variant="outlined" 
                        startIcon={<Download />} 
                        onClick={handleExportCSV}
                        size="small"
                    >
                        Export
                    </Button>
                    <IconButton onClick={fetchCustomers} disabled={loading}>
                        <Refresh />
                    </IconButton>
                    <Button variant="contained" onClick={() => handleOpenDialog()} startIcon={<Add />}>
                        Add Customer
                    </Button>
                </Box>
            </Box>

            {/* Summary Cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={6} sm={2.4}>
                    <Paper sx={{ p: 2, bgcolor: '#e3f2fd', borderLeft: '4px solid #1976d2' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <People fontSize="small" color="primary" />
                            <Typography variant="caption" color="text.secondary">Total Customers</Typography>
                        </Box>
                        <Typography variant="h4" color="primary" fontWeight="bold">{summary.totalCustomers}</Typography>
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
                    <Paper sx={{ p: 2, bgcolor: '#e8f5e9', borderLeft: '4px solid #4caf50' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <TrendingUp fontSize="small" color="success" />
                            <Typography variant="caption" color="text.secondary">Total Sales</Typography>
                        </Box>
                        <Typography variant="h5" color="success.main" fontWeight="bold">
                            ₹{summary.totalSales.toLocaleString('en-IN')}
                        </Typography>
                    </Paper>
                </Grid>
                <Grid item xs={6} sm={2.4}>
                    <Paper sx={{ p: 2, bgcolor: '#f3e5f5', borderLeft: '4px solid #9c27b0' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <AttachMoney fontSize="small" sx={{ color: '#9c27b0' }} />
                            <Typography variant="caption" color="text.secondary">Total Received</Typography>
                        </Box>
                        <Typography variant="h5" sx={{ color: '#9c27b0', fontWeight: 'bold' }}>
                            ₹{summary.totalReceived.toLocaleString('en-IN')}
                        </Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} sm={2.4}>
                    <Paper sx={{ p: 2, bgcolor: '#ffebee', borderLeft: '4px solid #f44336' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Receipt fontSize="small" color="error" />
                            <Typography variant="caption" color="text.secondary">Total Receivable</Typography>
                        </Box>
                        <Typography variant="h5" color="error" fontWeight="bold">
                            ₹{summary.totalReceivable.toLocaleString('en-IN')}
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
                                    <MenuItem value="all">All Customers</MenuItem>
                                    <MenuItem value="with-balance">With Outstanding</MenuItem>
                                    <MenuItem value="no-balance">No Outstanding</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={6} sm={3}>
                            <Typography variant="body2" color="text.secondary">
                                Showing {filteredCustomers.length} of {customers.length} customers
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
                                <TableCell><strong>Customer</strong></TableCell>
                                <TableCell><strong>Contact</strong></TableCell>
                                <TableCell align="right"><strong>Opening</strong></TableCell>
                                <TableCell align="right"><strong>Sales</strong></TableCell>
                                <TableCell align="right"><strong>Received</strong></TableCell>
                                <TableCell align="right"><strong>Balance</strong></TableCell>
                                <TableCell align="center" sx={{ width: 200 }}><strong>Actions</strong></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                                        <CircularProgress size={32} />
                                    </TableCell>
                                </TableRow>
                            ) : paginatedCustomers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                                        <Typography color="text.secondary">
                                            {searchTerm || balanceFilter !== 'all' ? 'No customers match your filter' : 'No customers found'}
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                paginatedCustomers.map((customer) => (
                                    <TableRow key={customer.id} hover sx={{ '&:hover': { bgcolor: '#f8f9fa' } }}>
                                        <TableCell>
                                            <Typography fontWeight="600">{customer.name}</Typography>
                                            {customer.gstin && (
                                                <Typography variant="caption" color="text.secondary">
                                                    GSTIN: {customer.gstin}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {customer.mobile || '-'}
                                        </TableCell>
                                        <TableCell align="right">
                                            ₹{(customer.openingBalance || 0).toLocaleString('en-IN')}
                                        </TableCell>
                                        <TableCell align="right" sx={{ color: 'success.main', fontWeight: 500 }}>
                                            ₹{(customer.totalDebit || 0).toLocaleString('en-IN')}
                                        </TableCell>
                                        <TableCell align="right" sx={{ color: '#9c27b0', fontWeight: 500 }}>
                                            ₹{(customer.totalCredit || 0).toLocaleString('en-IN')}
                                        </TableCell>
                                        <TableCell align="right">
                                            <Chip 
                                                label={`₹${(customer.balance || 0).toLocaleString('en-IN')}`}
                                                color={(customer.balance || 0) > 0 ? 'error' : 'success'}
                                                size="small"
                                                sx={{ fontWeight: 'bold', minWidth: 80 }}
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <Tooltip title="Add Sale (Credit)">
                                                <IconButton size="small" color="primary" onClick={() => handleOpenSaleDialog(customer)}>
                                                    <AddShoppingCart fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Receive Payment">
                                                <IconButton size="small" color="success" onClick={() => openPaymentDialog(customer)}>
                                                    <Payment fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="View Ledger">
                                                <IconButton size="small" onClick={() => fetchCustomerDetails(customer.id)}>
                                                    <Visibility fontSize="small" color="info" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Edit">
                                                <IconButton size="small" onClick={() => handleOpenDialog(customer)}>
                                                    <Edit fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Delete">
                                                <IconButton size="small" onClick={() => handleDelete(customer.id)}>
                                                    <Delete fontSize="small" color="error" />
                                                </IconButton>
                                            </Tooltip>
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
                    onPageChange={(e, newPage) => setPage(newPage)}
                    rowsPerPage={rowsPerPage}
                    onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
                    rowsPerPageOptions={[5, 10, 25, 50]}
                />
            </Card>

            {/* Add/Edit Customer Dialog */}
            <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ bgcolor: '#f5f5f5' }}>
                    {editingCustomer ? 'Edit Customer' : 'Add New Customer'}
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
                        {editingCustomer ? 'Update' : 'Create'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Receive Payment Dialog */}
            <Dialog open={paymentDialog.open} onClose={() => setPaymentDialog({ open: false, customer: null })} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ bgcolor: '#e8f5e9' }}>
                    Receive Payment from {paymentDialog.customer?.name}
                </DialogTitle>
                <DialogContent>
                    <Alert severity="info" sx={{ mt: 2, mb: 2 }}>
                        Outstanding Balance: <strong>₹{(paymentDialog.customer?.balance || 0).toLocaleString('en-IN')}</strong>
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
                            <MenuItem value="order">Against Invoice</MenuItem>
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
                    <Button onClick={() => setPaymentDialog({ open: false, customer: null })} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button 
                        onClick={handlePaymentSubmit} 
                        variant="contained" 
                        color="success"
                        disabled={submitting || !paymentForm.amount}
                        startIcon={submitting ? <CircularProgress size={20} /> : <Payment />}
                    >
                        {submitting ? 'Recording...' : 'Receive Payment'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Customer Ledger Details Dialog */}
            <Dialog 
                open={detailsDialog.open} 
                onClose={() => setDetailsDialog({ open: false, customer: null, tab: 0 })}
                maxWidth="lg"
                fullWidth
            >
                <DialogTitle sx={{ bgcolor: '#e3f2fd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Receipt color="primary" /> 
                        <Box>
                            <Typography variant="h6">{detailsDialog.customer?.name}</Typography>
                            <Typography variant="caption" color="text.secondary">
                                {detailsDialog.customer?.mobile}
                            </Typography>
                        </Box>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button 
                            variant="outlined" 
                            size="small"
                            startIcon={<AddShoppingCart />}
                            onClick={() => {
                                setDetailsDialog({ ...detailsDialog, open: false });
                                handleOpenSaleDialog(detailsDialog.customer);
                            }}
                        >
                            Add Sale
                        </Button>
                        <Button 
                            variant="contained" 
                            color="success" 
                            size="small"
                            startIcon={<Payment />}
                            onClick={() => {
                                setDetailsDialog({ ...detailsDialog, open: false });
                                openPaymentDialog(detailsDialog.customer);
                            }}
                        >
                            Receive Payment
                        </Button>
                    </Box>
                </DialogTitle>
                <DialogContent>
                    {detailsDialog.customer && (
                        <Box sx={{ mt: 2 }}>
                            {/* Summary Cards */}
                            <Grid container spacing={2} sx={{ mb: 3 }}>
                                <Grid item xs={6} sm={3}>
                                    <Paper sx={{ p: 2, bgcolor: '#f5f5f5', textAlign: 'center' }}>
                                        <Typography variant="caption" color="text.secondary">Opening Balance</Typography>
                                        <Typography variant="h6">₹{(detailsDialog.customer.openingBalance || 0).toLocaleString('en-IN')}</Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <Paper sx={{ p: 2, bgcolor: '#e8f5e9', textAlign: 'center' }}>
                                        <Typography variant="caption" color="text.secondary">Total Sales</Typography>
                                        <Typography variant="h6" color="success.main">₹{(detailsDialog.customer.totalDebit || 0).toLocaleString('en-IN')}</Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <Paper sx={{ p: 2, bgcolor: '#f3e5f5', textAlign: 'center' }}>
                                        <Typography variant="caption" color="text.secondary">Total Received</Typography>
                                        <Typography variant="h6" sx={{ color: '#9c27b0' }}>₹{(detailsDialog.customer.totalCredit || 0).toLocaleString('en-IN')}</Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <Paper sx={{ p: 2, bgcolor: (detailsDialog.customer.balance || 0) > 0 ? '#ffebee' : '#e8f5e9', textAlign: 'center' }}>
                                        <Typography variant="caption" color="text.secondary">Balance Due</Typography>
                                        <Typography variant="h6" fontWeight="bold" color={(detailsDialog.customer.balance || 0) > 0 ? 'error' : 'success.main'}>
                                            ₹{(detailsDialog.customer.balance || 0).toLocaleString('en-IN')}
                                        </Typography>
                                    </Paper>
                                </Grid>
                            </Grid>

                            <Tabs value={detailsDialog.tab} onChange={(e, v) => setDetailsDialog({ ...detailsDialog, tab: v })} sx={{ mb: 2 }}>
                                <Tab label={`Invoices (${detailsDialog.customer.orders?.length || 0})`} />
                                <Tab label={`Payments (${detailsDialog.customer.payments?.length || 0})`} />
                            </Tabs>

                            {detailsDialog.tab === 0 && (
                                detailsDialog.customer.orders?.length > 0 ? (
                                    <TableContainer sx={{ maxHeight: 350 }}>
                                        <Table size="small" stickyHeader>
                                            <TableHead>
                                                <TableRow sx={{ bgcolor: '#e8f5e9' }}>
                                                    <TableCell><strong>Invoice</strong></TableCell>
                                                    <TableCell><strong>Date</strong></TableCell>
                                                    <TableCell align="right"><strong>Total</strong></TableCell>
                                                    <TableCell align="right"><strong>Paid</strong></TableCell>
                                                    <TableCell align="right"><strong>Due</strong></TableCell>
                                                    <TableCell><strong>Status</strong></TableCell>
                                                    <TableCell align="center"><strong>View</strong></TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {detailsDialog.customer.orders.map((order) => (
                                                    <TableRow 
                                                        key={order.id} 
                                                        hover 
                                                        sx={{ cursor: 'pointer' }}
                                                        onClick={() => handleViewInvoice(order)}
                                                    >
                                                        <TableCell sx={{ color: 'primary.main', fontWeight: 500 }}>{order.orderNumber}</TableCell>
                                                        <TableCell>
                                                            {order.orderDate ? 
                                                                moment(order.orderDate, ['DD-MM-YYYY', 'YYYY-MM-DD']).format('DD/MM/YYYY') 
                                                                : '-'}
                                                        </TableCell>
                                                        <TableCell align="right" sx={{ fontWeight: 500 }}>
                                                            ₹{(order.total || 0).toLocaleString('en-IN')}
                                                        </TableCell>
                                                        <TableCell align="right">₹{(order.paidAmount || 0).toLocaleString('en-IN')}</TableCell>
                                                        <TableCell align="right" sx={{ color: (order.dueAmount || 0) > 0 ? 'error.main' : 'inherit' }}>
                                                            ₹{(order.dueAmount || 0).toLocaleString('en-IN')}
                                                        </TableCell>
                                                        <TableCell>
                                                            <Chip 
                                                                label={order.paymentStatus} 
                                                                size="small" 
                                                                color={order.paymentStatus === 'paid' ? 'success' : 'warning'} 
                                                            />
                                                        </TableCell>
                                                        <TableCell align="center">
                                                            <IconButton size="small" color="primary">
                                                                <Visibility fontSize="small" />
                                                            </IconButton>
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                ) : (
                                    <Alert severity="info">No invoices found for this customer</Alert>
                                )
                            )}

                            {detailsDialog.tab === 1 && (
                                detailsDialog.customer.payments?.length > 0 ? (
                                    <TableContainer sx={{ maxHeight: 350 }}>
                                        <Table size="small" stickyHeader>
                                            <TableHead>
                                                <TableRow sx={{ bgcolor: '#f3e5f5' }}>
                                                    <TableCell><strong>Payment #</strong></TableCell>
                                                    <TableCell><strong>Date</strong></TableCell>
                                                    <TableCell align="right"><strong>Amount</strong></TableCell>
                                                    <TableCell><strong>Type</strong></TableCell>
                                                    <TableCell><strong>Notes</strong></TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {detailsDialog.customer.payments.map((payment) => (
                                                    <TableRow key={payment.id} hover>
                                                        <TableCell>{payment.paymentNumber}</TableCell>
                                                        <TableCell>
                                                            {payment.paymentDate ? 
                                                                moment(payment.paymentDate, ['DD-MM-YYYY', 'YYYY-MM-DD']).format('DD/MM/YYYY') 
                                                                : '-'}
                                                        </TableCell>
                                                        <TableCell align="right" sx={{ color: '#9c27b0', fontWeight: 'bold' }}>
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
                                    <Alert severity="info">No payments received. Click "Receive Payment" to add one.</Alert>
                                )
                            )}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDetailsDialog({ open: false, customer: null, tab: 0 })}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* Invoice View Dialog */}
            <Dialog 
                open={invoiceDialog.open} 
                onClose={handleCloseInvoice}
                maxWidth="md"
                fullWidth
                PaperProps={{ sx: { height: '90vh' } }}
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', bgcolor: '#f5f5f5' }}>
                    <Box>
                        <Typography variant="h6">Invoice: {invoiceDialog.order?.orderNumber}</Typography>
                        <Typography variant="caption" color="text.secondary">
                            {invoiceDialog.order?.orderDate ? 
                                moment(invoiceDialog.order.orderDate, ['DD-MM-YYYY', 'YYYY-MM-DD']).format('DD MMM YYYY') 
                                : ''}
                        </Typography>
                    </Box>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Tooltip title="Print"><IconButton onClick={handlePrintInvoice} disabled={!invoiceDialog.pdfUrl}><Print /></IconButton></Tooltip>
                        <Tooltip title="Open in New Tab"><IconButton onClick={() => invoiceDialog.pdfUrl && window.open(invoiceDialog.pdfUrl, '_blank')} disabled={!invoiceDialog.pdfUrl}><OpenInNew /></IconButton></Tooltip>
                        <IconButton onClick={handleCloseInvoice}><Close /></IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
                    {invoiceDialog.loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                            <CircularProgress />
                            <Typography sx={{ ml: 2 }}>Loading invoice...</Typography>
                        </Box>
                    ) : invoiceDialog.pdfUrl ? (
                        <Box sx={{ flexGrow: 1, height: '100%' }}>
                            <object data={`${invoiceDialog.pdfUrl}#toolbar=1`} type="application/pdf" style={{ width: '100%', height: '100%', border: 'none' }}>
                                <iframe src={invoiceDialog.pdfUrl} title="Invoice PDF" style={{ width: '100%', height: '100%', border: 'none' }} />
                            </object>
                        </Box>
                    ) : (
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                            <Alert severity="error">Failed to load invoice PDF</Alert>
                        </Box>
                    )}
                </DialogContent>
            </Dialog>

            {/* Add Sale Dialog */}
            <Dialog open={saleDialog.open} onClose={() => !saleSubmitting && setSaleDialog({ open: false, customer: null })} maxWidth="md" fullWidth>
                <DialogTitle sx={{ bgcolor: '#e3f2fd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box>
                        <Typography variant="h6">
                            <AddShoppingCart sx={{ mr: 1, verticalAlign: 'middle' }} />
                            Credit Sale - {saleDialog.customer?.name}
                        </Typography>
                        {saleDialog.customer?.mobile && (
                            <Typography variant="caption" color="text.secondary">{saleDialog.customer.mobile}</Typography>
                        )}
                    </Box>
                    <IconButton onClick={() => !saleSubmitting && setSaleDialog({ open: false, customer: null })}><Close /></IconButton>
                </DialogTitle>
                <DialogContent dividers>
                    {/* Sale Date - for proper bookkeeping */}
                    <Box sx={{ mb: 3, p: 2, bgcolor: '#fff8e1', borderRadius: 1, border: '1px solid #ffe082' }}>
                        <Grid container spacing={2} alignItems="center">
                            <Grid item xs={12} sm={4}>
                                <TextField
                                    fullWidth
                                    size="small"
                                    label="Invoice Date *"
                                    type="date"
                                    value={saleDate}
                                    onChange={(e) => setSaleDate(e.target.value)}
                                    InputLabelProps={{ shrink: true }}
                                    helperText="Set date for bookkeeping"
                                />
                            </Grid>
                            <Grid item xs={12} sm={8}>
                                <Typography variant="body2" color="text.secondary">
                                    📅 Invoice will be dated: <strong>{moment(saleDate).format('DD MMM YYYY')}</strong>
                                </Typography>
                            </Grid>
                        </Grid>
                    </Box>

                    <Grid container spacing={2} sx={{ mb: 2 }}>
                        <Grid item xs={12} md={4}>
                            <Autocomplete
                                size="small"
                                options={products}
                                value={selectedProduct}
                                onChange={(_, val) => {
                                    setSelectedProduct(val);
                                    if (val?.pricePerKg) setSalePrice(val.pricePerKg.toString());
                                }}
                                getOptionLabel={(opt) => opt?.name || ''}
                                renderInput={(params) => <TextField {...params} label="Select Product" />}
                                renderOption={(props, option) => (
                                    <li {...props} key={option.id}>
                                        <Box>
                                            <Typography variant="body2">{option.name}</Typography>
                                            <Typography variant="caption" color="text.secondary">₹{option.pricePerKg}/kg</Typography>
                                        </Box>
                                    </li>
                                )}
                            />
                        </Grid>
                        <Grid item xs={6} md={2}>
                            <TextField size="small" fullWidth label="Qty" type="number" value={saleQuantity} onChange={(e) => setSaleQuantity(e.target.value)} inputProps={{ step: '0.01', min: '0' }} />
                        </Grid>
                        <Grid item xs={6} md={2}>
                            <TextField size="small" fullWidth label="Price" type="number" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} inputProps={{ step: '0.01', min: '0' }} />
                        </Grid>
                        <Grid item xs={6} md={2}>
                            <Typography variant="body2" color="text.secondary">Total</Typography>
                            <Typography variant="h6" color="primary">₹{((parseFloat(saleQuantity) || 0) * (parseFloat(salePrice) || 0)).toLocaleString('en-IN')}</Typography>
                        </Grid>
                        <Grid item xs={6} md={2}>
                            <Button variant="contained" onClick={handleAddSaleItem} disabled={!selectedProduct || !saleQuantity || !salePrice} fullWidth sx={{ height: '100%' }} startIcon={<Add />}>Add</Button>
                        </Grid>
                    </Grid>

                    {saleItems.length > 0 ? (
                        <TableContainer component={Paper} sx={{ mb: 2 }}>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                        <TableCell><strong>Product</strong></TableCell>
                                        <TableCell align="right"><strong>Qty</strong></TableCell>
                                        <TableCell align="right"><strong>Price</strong></TableCell>
                                        <TableCell align="right"><strong>Total</strong></TableCell>
                                        <TableCell align="center"></TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {saleItems.map((item) => (
                                        <TableRow key={item.id}>
                                            <TableCell>{item.productName}</TableCell>
                                            <TableCell align="right">{item.quantity}</TableCell>
                                            <TableCell align="right">₹{item.price.toLocaleString('en-IN')}</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 'bold' }}>₹{item.totalPrice.toLocaleString('en-IN')}</TableCell>
                                            <TableCell align="center">
                                                <IconButton size="small" color="error" onClick={() => handleRemoveSaleItem(item.id)}><Delete fontSize="small" /></IconButton>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    ) : (
                        <Alert severity="info" sx={{ mb: 2 }}>Select a product, enter quantity and price, then click Add</Alert>
                    )}

                    <Grid container justifyContent="flex-end">
                        <Grid item xs={12} md={4}>
                            <Paper sx={{ p: 2, bgcolor: '#f9f9f9' }}>
                                <Grid container spacing={1}>
                                    <Grid item xs={6}><Typography>Sub Total:</Typography></Grid>
                                    <Grid item xs={6}><Typography align="right">₹{saleSubTotal.toLocaleString('en-IN')}</Typography></Grid>
                                    <Grid item xs={6}>
                                        <TextField size="small" label="Tax %" type="number" value={saleTaxPercent} onChange={(e) => setSaleTaxPercent(parseFloat(e.target.value) || 0)} sx={{ width: 80 }} />
                                    </Grid>
                                    <Grid item xs={6}><Typography align="right">₹{saleTax.toLocaleString('en-IN')}</Typography></Grid>
                                    <Grid item xs={12}><Divider sx={{ my: 1 }} /></Grid>
                                    <Grid item xs={6}><Typography variant="h6" fontWeight="bold">Total:</Typography></Grid>
                                    <Grid item xs={6}><Typography variant="h6" fontWeight="bold" align="right" color="primary">₹{saleTotal.toLocaleString('en-IN')}</Typography></Grid>
                                </Grid>
                            </Paper>
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions sx={{ p: 2 }}>
                    <Button onClick={() => setSaleDialog({ open: false, customer: null })} disabled={saleSubmitting}>Cancel</Button>
                    <Button variant="contained" onClick={handleSubmitSale} disabled={saleItems.length === 0 || saleSubmitting} startIcon={saleSubmitting ? <CircularProgress size={20} /> : <Receipt />}>
                        {saleSubmitting ? 'Creating...' : 'Create Invoice'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
