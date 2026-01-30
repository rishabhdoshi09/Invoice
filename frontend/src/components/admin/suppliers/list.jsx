import { useEffect, useState } from 'react';
import { 
    Box, Button, Card, CardContent, Table, TableBody, TableCell, TableContainer, 
    TableHead, TableRow, TextField, Dialog, DialogTitle, DialogContent, DialogActions, 
    Typography, IconButton, Chip, Tooltip, Grid, Paper, Tabs, Tab, Alert,
    FormControl, InputLabel, Select, MenuItem, CircularProgress
} from '@mui/material';
import { Delete, Edit, Visibility, Refresh, Add, Payment, Receipt, LocalShipping } from '@mui/icons-material';
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

    // Payment Dialog handlers
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

            alert(`✅ Payment of ₹${parseFloat(paymentForm.amount).toLocaleString('en-IN')} to ${paymentDialog.supplier.name} recorded!`);
            setPaymentDialog({ open: false, supplier: null });
            fetchSuppliers();
            
            // Also refresh details if open
            if (detailsDialog.open && detailsDialog.supplier?.id === paymentDialog.supplier.id) {
                fetchSupplierDetails(paymentDialog.supplier.id);
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
                    <LocalShipping /> Suppliers
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Tooltip title="Refresh">
                        <IconButton onClick={fetchSuppliers} disabled={loading}>
                            <Refresh />
                        </IconButton>
                    </Tooltip>
                    <Button variant="contained" onClick={() => handleOpenDialog()} startIcon={<Add />}>
                        Add Supplier
                    </Button>
                </Box>
            </Box>

            {/* Summary Cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={4}>
                    <Paper sx={{ p: 2, bgcolor: '#e3f2fd' }}>
                        <Typography variant="body2" color="text.secondary">Total Suppliers</Typography>
                        <Typography variant="h4" color="primary" fontWeight="bold">{suppliers.length}</Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} sm={4}>
                    <Paper sx={{ p: 2, bgcolor: '#ffebee' }}>
                        <Typography variant="body2" color="text.secondary">Total Payable (Debit)</Typography>
                        <Typography variant="h4" color="error" fontWeight="bold">
                            ₹{suppliers.reduce((sum, s) => sum + (s.totalDebit || 0), 0).toLocaleString('en-IN')}
                        </Typography>
                    </Paper>
                </Grid>
                <Grid item xs={12} sm={4}>
                    <Paper sx={{ p: 2, bgcolor: '#e8f5e9' }}>
                        <Typography variant="body2" color="text.secondary">Total Paid (Credit)</Typography>
                        <Typography variant="h4" color="success.main" fontWeight="bold">
                            ₹{suppliers.reduce((sum, s) => sum + (s.totalCredit || 0), 0).toLocaleString('en-IN')}
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
                                    <TableCell align="right"><strong>Purchases (Dr)</strong></TableCell>
                                    <TableCell align="right"><strong>Paid (Cr)</strong></TableCell>
                                    <TableCell align="right"><strong>Balance</strong></TableCell>
                                    <TableCell align="center"><strong>Actions</strong></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={8} align="center"><CircularProgress size={24} /></TableCell>
                                    </TableRow>
                                ) : suppliers.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} align="center">No suppliers found</TableCell>
                                    </TableRow>
                                ) : (
                                    suppliers.map((supplier) => (
                                        <TableRow key={supplier.id} hover>
                                            <TableCell>
                                                <Typography fontWeight="bold">{supplier.name}</Typography>
                                            </TableCell>
                                            <TableCell>{supplier.mobile || '-'}</TableCell>
                                            <TableCell>{supplier.gstin || '-'}</TableCell>
                                            <TableCell align="right">
                                                ₹{(supplier.openingBalance || 0).toLocaleString('en-IN')}
                                            </TableCell>
                                            <TableCell align="right" sx={{ color: 'error.main' }}>
                                                ₹{(supplier.totalDebit || 0).toLocaleString('en-IN')}
                                            </TableCell>
                                            <TableCell align="right" sx={{ color: 'success.main' }}>
                                                ₹{(supplier.totalCredit || 0).toLocaleString('en-IN')}
                                            </TableCell>
                                            <TableCell align="right">
                                                <Chip 
                                                    label={`₹${(supplier.balance || 0).toLocaleString('en-IN')}`}
                                                    color={(supplier.balance || 0) > 0 ? 'error' : 'success'}
                                                    size="small"
                                                    sx={{ fontWeight: 'bold' }}
                                                />
                                            </TableCell>
                                            <TableCell align="center">
                                                <Tooltip title="Make Payment">
                                                    <IconButton size="small" color="success" onClick={() => openPaymentDialog(supplier)}>
                                                        <Payment fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="View Ledger">
                                                    <IconButton size="small" onClick={() => fetchSupplierDetails(supplier.id)}>
                                                        <Visibility fontSize="small" color="primary" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Edit">
                                                    <IconButton size="small" onClick={() => handleOpenDialog(supplier)}>
                                                        <Edit fontSize="small" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Delete">
                                                    <IconButton size="small" onClick={() => handleDelete(supplier.id)}>
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

            {/* Add/Edit Supplier Dialog */}
            <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle>{editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}</DialogTitle>
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
                        {editingSupplier ? 'Update' : 'Create'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Payment Dialog */}
            <Dialog open={paymentDialog.open} onClose={() => setPaymentDialog({ open: false, supplier: null })} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ bgcolor: '#e8f5e9' }}>
                    💰 Make Payment to {paymentDialog.supplier?.name}
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
                        placeholder="Optional notes about this payment"
                    />
                </DialogContent>
                <DialogActions>
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
                        <Receipt /> Supplier Ledger: {detailsDialog.supplier?.name}
                    </Box>
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
                </DialogTitle>
                <DialogContent>
                    {detailsDialog.supplier && (
                        <Box sx={{ mt: 2 }}>
                            {/* Summary Cards */}
                            <Grid container spacing={2} sx={{ mb: 3 }}>
                                <Grid item xs={6} sm={3}>
                                    <Paper sx={{ p: 2, bgcolor: '#e3f2fd', textAlign: 'center' }}>
                                        <Typography variant="caption" color="text.secondary">Opening Balance</Typography>
                                        <Typography variant="h6">₹{(detailsDialog.supplier.openingBalance || 0).toLocaleString('en-IN')}</Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <Paper sx={{ p: 2, bgcolor: '#ffebee', textAlign: 'center' }}>
                                        <Typography variant="caption" color="text.secondary">Total Purchases (Dr)</Typography>
                                        <Typography variant="h6" color="error">₹{(detailsDialog.supplier.totalDebit || 0).toLocaleString('en-IN')}</Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <Paper sx={{ p: 2, bgcolor: '#e8f5e9', textAlign: 'center' }}>
                                        <Typography variant="caption" color="text.secondary">Total Paid (Cr)</Typography>
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
                                <Tab label={`Purchases (${detailsDialog.supplier.purchases?.length || 0})`} />
                                <Tab label={`Payments (${detailsDialog.supplier.payments?.length || 0})`} />
                            </Tabs>

                            {detailsDialog.tab === 0 && (
                                <>
                                    <Typography variant="subtitle2" sx={{ mb: 1 }}>📦 Purchase Bills (Debit Entries)</Typography>
                                    {detailsDialog.supplier.purchases?.length > 0 ? (
                                        <TableContainer sx={{ maxHeight: 300 }}>
                                            <Table size="small" stickyHeader>
                                                <TableHead>
                                                    <TableRow sx={{ bgcolor: '#ffebee' }}>
                                                        <TableCell><strong>Bill No</strong></TableCell>
                                                        <TableCell><strong>Date</strong></TableCell>
                                                        <TableCell align="right"><strong>Total</strong></TableCell>
                                                        <TableCell align="right"><strong>Paid</strong></TableCell>
                                                        <TableCell align="right"><strong>Due</strong></TableCell>
                                                        <TableCell><strong>Status</strong></TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {detailsDialog.supplier.purchases.map((purchase) => (
                                                        <TableRow key={purchase.id} hover>
                                                            <TableCell>{purchase.billNumber}</TableCell>
                                                            <TableCell>
                                                                {purchase.billDate ? 
                                                                    moment(purchase.billDate, ['DD-MM-YYYY', 'YYYY-MM-DD', 'DD/MM/YYYY']).format('DD/MM/YYYY') 
                                                                    : '-'}
                                                            </TableCell>
                                                            <TableCell align="right" sx={{ color: 'error.main', fontWeight: 'bold' }}>
                                                                ₹{(purchase.total || 0).toLocaleString('en-IN')}
                                                            </TableCell>
                                                            <TableCell align="right">₹{(purchase.paidAmount || 0).toLocaleString('en-IN')}</TableCell>
                                                            <TableCell align="right">₹{(purchase.dueAmount || 0).toLocaleString('en-IN')}</TableCell>
                                                            <TableCell>
                                                                <Chip label={purchase.paymentStatus} size="small" color={purchase.paymentStatus === 'paid' ? 'success' : 'warning'} />
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
                                    ) : (
                                        <Alert severity="info">No purchase bills found</Alert>
                                    )}
                                </>
                            )}

                            {detailsDialog.tab === 1 && (
                                <>
                                    <Typography variant="subtitle2" sx={{ mb: 1 }}>💰 Payments Made (Credit Entries)</Typography>
                                    {detailsDialog.supplier.payments?.length > 0 ? (
                                        <TableContainer sx={{ maxHeight: 300 }}>
                                            <Table size="small" stickyHeader>
                                                <TableHead>
                                                    <TableRow sx={{ bgcolor: '#e8f5e9' }}>
                                                        <TableCell><strong>Payment No</strong></TableCell>
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
                                                            <TableCell>{payment.paymentDate}</TableCell>
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
                                    )}
                                </>
                            )}
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDetailsDialog({ open: false, supplier: null, tab: 0 })}>Close</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
