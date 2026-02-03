import { useEffect, useState } from 'react';
import { 
    Box, Button, Card, CardContent, Table, TableBody, TableCell, TableContainer, 
    TableHead, TableRow, TextField, Dialog, DialogTitle, DialogContent, DialogActions, 
    Typography, IconButton, Chip, Tooltip, Grid, Paper, Tabs, Tab, Alert,
    FormControl, InputLabel, Select, MenuItem, CircularProgress
} from '@mui/material';
import { Delete, Edit, Visibility, Refresh, Add, Payment, Receipt, People, Close, Print, OpenInNew } from '@mui/icons-material';
import { listCustomers, createCustomer, updateCustomer, deleteCustomer } from '../../../services/customer';
import axios from 'axios';
import moment from 'moment';
import pdfMake from 'pdfmake/build/pdfmake';
import { generatePdfDefinition, generatePdfDefinition2 } from '../orders/helper';

export const ListCustomers = () => {
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState(null);
    const [detailsDialog, setDetailsDialog] = useState({ open: false, customer: null, tab: 0 });
    const [paymentDialog, setPaymentDialog] = useState({ open: false, customer: null });
    const [submitting, setSubmitting] = useState(false);
    const [invoiceDialog, setInvoiceDialog] = useState({ open: false, order: null, pdfUrl: null, loading: false });
    
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

    // Function to view invoice PDF
    const handleViewInvoice = async (order) => {
        setInvoiceDialog({ open: true, order, pdfUrl: null, loading: true });
        
        try {
            const token = localStorage.getItem('token');
            // Fetch full order details with items
            const { data } = await axios.get(`/api/orders/${order.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            
            const orderData = data.data || data;
            
            // Prepare order items for PDF
            const orderItems = (orderData.orderItems || orderData.items || []).map(item => ({
                name: item.productName || item.name || 'Item',
                productPrice: item.price || item.productPrice || 0,
                quantity: item.quantity || 0,
                totalPrice: item.totalPrice || (item.price * item.quantity) || 0
            }));
            
            // Calculate totals
            const subTotal = orderItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
            const tax = orderData.tax || 0;
            const total = orderData.total || subTotal + tax;
            
            // Prepare PDF data
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
            
            // Generate PDF
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

    // Payment Dialog handlers - Receive payment FROM customer
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

            alert(`✅ Payment of ₹${parseFloat(paymentForm.amount).toLocaleString('en-IN')} received from ${paymentDialog.customer.name}!`);
            setPaymentDialog({ open: false, customer: null });
            fetchCustomers();
            
            if (detailsDialog.open && detailsDialog.customer?.id === paymentDialog.customer.id) {
                fetchCustomerDetails(paymentDialog.customer.id);
            }
        } catch (error) {
            console.error('Error recording payment:', error);
            alert('❌ Error recording payment. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <People /> Customers
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Tooltip title="Refresh">
                        <IconButton onClick={fetchCustomers} disabled={loading}>
                            <Refresh />
                        </IconButton>
                    </Tooltip>
                    <Button variant="contained" onClick={() => handleOpenDialog()} startIcon={<Add />}>
                        Add Customer
                    </Button>
                </Box>
            </Box>

            {/* Summary Cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={4}>
                    <Paper sx={{ p: 2, bgcolor: '#e3f2fd' }}>
                        <Typography variant="body2" color="text.secondary">Total Customers</Typography>
                        <Typography variant="h4" color="primary" fontWeight="bold">{customers.length}</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} sm={4}>
                    <Paper sx={{ p: 2, bgcolor: '#e8f5e9' }}>
                        <Typography variant="body2" color="text.secondary">Total Receivable (Sales)</Typography>
                        <Typography variant="h4" color="success.main" fontWeight="bold">
                            ₹{customers.reduce((sum, c) => sum + (c.totalDebit || 0), 0).toLocaleString('en-IN')}
                        </Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} sm={4}>
                    <Paper sx={{ p: 2, bgcolor: '#fff3e0' }}>
                        <Typography variant="body2" color="text.secondary">Total Received</Typography>
                        <Typography variant="h4" color="warning.main" fontWeight="bold">
                            ₹{customers.reduce((sum, c) => sum + (c.totalCredit || 0), 0).toLocaleString('en-IN')}
                        </Typography>
                    </Paper>
                </Grid>
            </Grid>

            <Card>
                <CardContent>
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                    <TableCell><strong>Name</strong></TableCell>
                                    <TableCell><strong>Mobile</strong></TableCell>
                                    <TableCell><strong>GSTIN</strong></TableCell>
                                    <TableCell align="right"><strong>Opening</strong></TableCell>
                                    <TableCell align="right"><strong>Sales (Dr)</strong></TableCell>
                                    <TableCell align="right"><strong>Received (Cr)</strong></TableCell>
                                    <TableCell align="right"><strong>Balance</strong></TableCell>
                                    <TableCell align="center"><strong>Actions</strong></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={8} align="center"><CircularProgress size={24} /></TableCell>
                                    </TableRow>
                                ) : customers.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} align="center">No customers found</TableCell>
                                    </TableRow>
                                ) : (
                                    customers.map((customer) => (
                                        <TableRow key={customer.id} hover>
                                            <TableCell>
                                                <Typography fontWeight="bold">{customer.name}</Typography>
                                            </TableCell>
                                            <TableCell>{customer.mobile || '-'}</TableCell>
                                            <TableCell>{customer.gstin || '-'}</TableCell>
                                            <TableCell align="right">
                                                ₹{(customer.openingBalance || 0).toLocaleString('en-IN')}
                                            </TableCell>
                                            <TableCell align="right" sx={{ color: 'success.main' }}>
                                                ₹{(customer.totalDebit || 0).toLocaleString('en-IN')}
                                            </TableCell>
                                            <TableCell align="right" sx={{ color: 'warning.main' }}>
                                                ₹{(customer.totalCredit || 0).toLocaleString('en-IN')}
                                            </TableCell>
                                            <TableCell align="right">
                                                <Chip 
                                                    label={`₹${(customer.balance || 0).toLocaleString('en-IN')}`}
                                                    color={(customer.balance || 0) > 0 ? 'success' : 'default'}
                                                    size="small"
                                                    sx={{ fontWeight: 'bold' }}
                                                />
                                            </TableCell>
                                            <TableCell align="center">
                                                <Tooltip title="Receive Payment">
                                                    <IconButton size="small" color="success" onClick={() => openPaymentDialog(customer)}>
                                                        <Payment fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="View Ledger">
                                                    <IconButton size="small" onClick={() => fetchCustomerDetails(customer.id)}>
                                                        <Visibility fontSize="small" color="primary" />
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
                </CardContent>
            </Card>

            {/* Add/Edit Customer Dialog */}
            <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle>{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</DialogTitle>
                <DialogContent>
                    <TextField label="Name *" name="name" value={formData.name} onChange={handleChange} fullWidth margin="normal" />
                    <TextField label="Mobile" name="mobile" value={formData.mobile} onChange={handleChange} fullWidth margin="normal" />
                    <TextField label="Email" name="email" value={formData.email} onChange={handleChange} fullWidth margin="normal" />
                    <TextField label="Address" name="address" value={formData.address} onChange={handleChange} fullWidth margin="normal" multiline rows={2} />
                    <TextField label="GSTIN" name="gstin" value={formData.gstin} onChange={handleChange} fullWidth margin="normal" />
                    <TextField label="Opening Balance" name="openingBalance" type="number" value={formData.openingBalance} onChange={handleChange} fullWidth margin="normal" />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Cancel</Button>
                    <Button onClick={handleSubmit} variant="contained" disabled={!formData.name}>
                        {editingCustomer ? 'Update' : 'Create'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Receive Payment Dialog */}
            <Dialog open={paymentDialog.open} onClose={() => setPaymentDialog({ open: false, customer: null })} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ bgcolor: '#e8f5e9' }}>
                    💰 Receive Payment from {paymentDialog.customer?.name}
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
                        InputProps={{ inputProps: { min: 0, step: 0.01 } }}
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
                        placeholder="Optional notes about this payment"
                    />
                </DialogContent>
                <DialogActions>
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
                        <Receipt /> Customer Ledger: {detailsDialog.customer?.name}
                    </Box>
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
                </DialogTitle>
                <DialogContent>
                    {detailsDialog.customer && (
                        <Box sx={{ mt: 2 }}>
                            {/* Summary Cards */}
                            <Grid container spacing={2} sx={{ mb: 3 }}>
                                <Grid item xs={6} sm={3}>
                                    <Paper sx={{ p: 2, bgcolor: '#e3f2fd', textAlign: 'center' }}>
                                        <Typography variant="caption" color="text.secondary">Opening Balance</Typography>
                                        <Typography variant="h6">₹{(detailsDialog.customer.openingBalance || 0).toLocaleString('en-IN')}</Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <Paper sx={{ p: 2, bgcolor: '#e8f5e9', textAlign: 'center' }}>
                                        <Typography variant="caption" color="text.secondary">Total Sales (Dr)</Typography>
                                        <Typography variant="h6" color="success.main">₹{(detailsDialog.customer.totalDebit || 0).toLocaleString('en-IN')}</Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <Paper sx={{ p: 2, bgcolor: '#fff3e0', textAlign: 'center' }}>
                                        <Typography variant="caption" color="text.secondary">Total Received (Cr)</Typography>
                                        <Typography variant="h6" color="warning.main">₹{(detailsDialog.customer.totalCredit || 0).toLocaleString('en-IN')}</Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <Paper sx={{ p: 2, bgcolor: (detailsDialog.customer.balance || 0) > 0 ? '#e8f5e9' : '#f5f5f5', textAlign: 'center' }}>
                                        <Typography variant="caption" color="text.secondary">Balance Due</Typography>
                                        <Typography variant="h6" fontWeight="bold" color={(detailsDialog.customer.balance || 0) > 0 ? 'success.main' : 'text.secondary'}>
                                            ₹{(detailsDialog.customer.balance || 0).toLocaleString('en-IN')}
                                        </Typography>
                                    </Paper>
                                </Grid>
                            </Grid>

                            <Tabs value={detailsDialog.tab} onChange={(e, v) => setDetailsDialog({ ...detailsDialog, tab: v })} sx={{ mb: 2 }}>
                                <Tab label={`Orders/Sales (${detailsDialog.customer.orders?.length || 0})`} />
                                <Tab label={`Payments Received (${detailsDialog.customer.payments?.length || 0})`} />
                            </Tabs>

                            {detailsDialog.tab === 0 && (
                                <>
                                    <Typography variant="subtitle2" sx={{ mb: 1 }}>🧾 Sales/Orders (Debit Entries)</Typography>
                                    {detailsDialog.customer.orders?.length > 0 ? (
                                        <TableContainer sx={{ maxHeight: 300 }}>
                                            <Table size="small" stickyHeader>
                                                <TableHead>
                                                    <TableRow sx={{ bgcolor: '#e8f5e9' }}>
                                                        <TableCell><strong>Invoice No</strong></TableCell>
                                                        <TableCell><strong>Date</strong></TableCell>
                                                        <TableCell align="right"><strong>Total</strong></TableCell>
                                                        <TableCell align="right"><strong>Paid</strong></TableCell>
                                                        <TableCell align="right"><strong>Due</strong></TableCell>
                                                        <TableCell><strong>Status</strong></TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {detailsDialog.customer.orders.map((order) => (
                                                        <TableRow key={order.id} hover>
                                                            <TableCell>{order.orderNumber}</TableCell>
                                                            <TableCell>
                                                                {order.orderDate ? 
                                                                    moment(order.orderDate, ['DD-MM-YYYY', 'YYYY-MM-DD', 'DD/MM/YYYY']).format('DD/MM/YYYY') 
                                                                    : '-'}
                                                            </TableCell>
                                                            <TableCell align="right" sx={{ color: 'success.main', fontWeight: 'bold' }}>
                                                                ₹{(order.total || 0).toLocaleString('en-IN')}
                                                            </TableCell>
                                                            <TableCell align="right">₹{(order.paidAmount || 0).toLocaleString('en-IN')}</TableCell>
                                                            <TableCell align="right">₹{(order.dueAmount || 0).toLocaleString('en-IN')}</TableCell>
                                                            <TableCell>
                                                                <Chip label={order.paymentStatus} size="small" color={order.paymentStatus === 'paid' ? 'success' : 'warning'} />
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
                                    ) : (
                                        <Alert severity="info">No orders found for this customer</Alert>
                                    )}
                                </>
                            )}

                            {detailsDialog.tab === 1 && (
                                <>
                                    <Typography variant="subtitle2" sx={{ mb: 1 }}>💰 Payments Received (Credit Entries)</Typography>
                                    {detailsDialog.customer.payments?.length > 0 ? (
                                        <TableContainer sx={{ maxHeight: 300 }}>
                                            <Table size="small" stickyHeader>
                                                <TableHead>
                                                    <TableRow sx={{ bgcolor: '#fff3e0' }}>
                                                        <TableCell><strong>Payment No</strong></TableCell>
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
                                                                    moment(payment.paymentDate, ['DD-MM-YYYY', 'YYYY-MM-DD', 'DD/MM/YYYY']).format('DD/MM/YYYY') 
                                                                    : '-'}
                                                            </TableCell>
                                                            <TableCell align="right" sx={{ color: 'warning.main', fontWeight: 'bold' }}>
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
                                    )}
                                </>
                            )}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDetailsDialog({ open: false, customer: null, tab: 0 })}>Close</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
