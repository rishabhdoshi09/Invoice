import { useState, useEffect, useCallback } from 'react';
import {
    Box, Card, CardContent, Typography, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Button, Dialog, DialogTitle,
    DialogContent, DialogActions, TextField, IconButton, Tooltip, Chip,
    CircularProgress, Paper, Grid, Alert, Tabs, Tab, Autocomplete,
    FormControl, InputLabel, Select, MenuItem
} from '@mui/material';
import {
    Add, Remove, Refresh, Inventory, Warning, TrendingUp,
    TrendingDown, Edit, History
} from '@mui/icons-material';
import axios from 'axios';
import moment from 'moment';

export const StockManagement = () => {
    const [tab, setTab] = useState(0);
    const [stocks, setStocks] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(false);
    const [summary, setSummary] = useState({
        totalProducts: 0,
        lowStockCount: 0,
        outOfStockCount: 0
    });

    // Dialog states
    const [dialogOpen, setDialogOpen] = useState(false);
    const [dialogType, setDialogType] = useState(''); // 'in', 'out', 'adjust', 'init'
    const [submitting, setSubmitting] = useState(false);

    // Form data
    const [formData, setFormData] = useState({
        productId: '',
        quantity: '',
        newStock: '',
        notes: '',
        minStockLevel: '',
        unit: 'kg',
        initialStock: ''
    });

    const [selectedProduct, setSelectedProduct] = useState(null);

    // Fetch stocks
    const fetchStocks = useCallback(async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            const { data } = await axios.get('/api/stocks', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setStocks(data.data?.rows || []);
        } catch (error) {
            console.error('Error fetching stocks:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch stock summary
    const fetchSummary = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            const { data } = await axios.get('/api/stocks/summary', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSummary(data.data || {});
        } catch (error) {
            console.error('Error fetching summary:', error);
        }
    }, []);

    // Fetch transactions
    const fetchTransactions = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            const { data } = await axios.get('/api/stocks/transactions', {
                headers: { Authorization: `Bearer ${token}` },
                params: { limit: 100 }
            });
            setTransactions(data.data?.rows || []);
        } catch (error) {
            console.error('Error fetching transactions:', error);
        }
    }, []);

    // Fetch products
    const fetchProducts = useCallback(async () => {
        try {
            const token = localStorage.getItem('token');
            const { data } = await axios.get('/api/products', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setProducts(data.data?.rows || []);
        } catch (error) {
            console.error('Error fetching products:', error);
        }
    }, []);

    // Fetch all data
    const fetchAll = useCallback(async () => {
        await Promise.all([fetchStocks(), fetchSummary(), fetchProducts()]);
    }, [fetchStocks, fetchSummary, fetchProducts]);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    useEffect(() => {
        if (tab === 1) {
            fetchTransactions();
        }
    }, [tab, fetchTransactions]);

    // Open dialog
    const openDialog = (type, product = null) => {
        setDialogType(type);
        setSelectedProduct(product);
        setFormData({
            productId: product?.productId || product?.id || '',
            quantity: '',
            newStock: product?.currentStock?.toString() || '',
            notes: '',
            minStockLevel: product?.minStockLevel?.toString() || '0',
            unit: product?.unit || 'kg',
            initialStock: '0'
        });
        setDialogOpen(true);
    };

    // Handle form submit
    const handleSubmit = async () => {
        if (!formData.productId) {
            alert('Please select a product');
            return;
        }

        setSubmitting(true);
        try {
            const token = localStorage.getItem('token');
            
            if (dialogType === 'in') {
                await axios.post('/api/stocks/in', {
                    productId: formData.productId,
                    type: 'in',
                    quantity: parseFloat(formData.quantity),
                    notes: formData.notes
                }, { headers: { Authorization: `Bearer ${token}` } });
            } else if (dialogType === 'out') {
                await axios.post('/api/stocks/out', {
                    productId: formData.productId,
                    type: 'out',
                    quantity: parseFloat(formData.quantity),
                    notes: formData.notes
                }, { headers: { Authorization: `Bearer ${token}` } });
            } else if (dialogType === 'adjust') {
                await axios.post('/api/stocks/adjust', {
                    productId: formData.productId,
                    newStock: parseFloat(formData.newStock),
                    notes: formData.notes
                }, { headers: { Authorization: `Bearer ${token}` } });
            } else if (dialogType === 'init') {
                await axios.post('/api/stocks/initialize', {
                    productId: formData.productId,
                    initialStock: parseFloat(formData.initialStock) || 0,
                    minStockLevel: parseFloat(formData.minStockLevel) || 0,
                    unit: formData.unit
                }, { headers: { Authorization: `Bearer ${token}` } });
            }

            setDialogOpen(false);
            fetchAll();
        } catch (error) {
            console.error('Error:', error);
            alert(error.response?.data?.message || 'Error processing request');
        } finally {
            setSubmitting(false);
        }
    };

    const getDialogTitle = () => {
        switch (dialogType) {
            case 'in': return 'Stock In (Add Stock)';
            case 'out': return 'Stock Out (Remove Stock)';
            case 'adjust': return 'Adjust Stock';
            case 'init': return 'Initialize Stock';
            default: return 'Stock Transaction';
        }
    };

    const getStockStatus = (stock) => {
        if (stock.currentStock <= 0) return { label: 'Out of Stock', color: 'error' };
        if (stock.currentStock <= stock.minStockLevel) return { label: 'Low Stock', color: 'warning' };
        return { label: 'In Stock', color: 'success' };
    };

    return (
        <Box sx={{ p: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Inventory /> Stock Management
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Tooltip title="Refresh">
                        <IconButton onClick={fetchAll} disabled={loading}>
                            <Refresh />
                        </IconButton>
                    </Tooltip>
                    <Button
                        variant="contained"
                        color="success"
                        startIcon={<Add />}
                        onClick={() => openDialog('in')}
                    >
                        Stock In
                    </Button>
                    <Button
                        variant="contained"
                        color="error"
                        startIcon={<Remove />}
                        onClick={() => openDialog('out')}
                    >
                        Stock Out
                    </Button>
                </Box>
            </Box>

            {/* Summary Cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={4}>
                    <Paper sx={{ p: 2, bgcolor: '#e3f2fd' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Inventory sx={{ color: '#1976d2', fontSize: 40 }} />
                            <Box>
                                <Typography variant="body2" color="text.secondary">Total Products</Typography>
                                <Typography variant="h4" color="primary" fontWeight="bold">
                                    {summary.totalProducts || stocks.length}
                                </Typography>
                            </Box>
                        </Box>
                    </Paper>
                </Grid>
                <Grid item xs={12} sm={4}>
                    <Paper sx={{ p: 2, bgcolor: '#fff3e0' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Warning sx={{ color: '#f57c00', fontSize: 40 }} />
                            <Box>
                                <Typography variant="body2" color="text.secondary">Low Stock</Typography>
                                <Typography variant="h4" color="warning.main" fontWeight="bold">
                                    {summary.lowStockCount || 0}
                                </Typography>
                            </Box>
                        </Box>
                    </Paper>
                </Grid>
                <Grid item xs={12} sm={4}>
                    <Paper sx={{ p: 2, bgcolor: '#ffebee' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Remove sx={{ color: '#d32f2f', fontSize: 40 }} />
                            <Box>
                                <Typography variant="body2" color="text.secondary">Out of Stock</Typography>
                                <Typography variant="h4" color="error" fontWeight="bold">
                                    {summary.outOfStockCount || 0}
                                </Typography>
                            </Box>
                        </Box>
                    </Paper>
                </Grid>
            </Grid>

            {/* Tabs */}
            <Tabs value={tab} onChange={(e, v) => setTab(v)} sx={{ mb: 2 }}>
                <Tab icon={<Inventory />} label="Stock Levels" />
                <Tab icon={<History />} label="Transactions" />
            </Tabs>

            {tab === 0 && (
                <Card>
                    <CardContent>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                            <Typography variant="h6">Current Stock Levels</Typography>
                            <Button
                                variant="outlined"
                                size="small"
                                startIcon={<Add />}
                                onClick={() => openDialog('init')}
                            >
                                Initialize New Product Stock
                            </Button>
                        </Box>

                        {loading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                                <CircularProgress />
                            </Box>
                        ) : stocks.length === 0 ? (
                            <Alert severity="info">
                                No stock records found. Initialize stock for your products to start tracking.
                            </Alert>
                        ) : (
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                            <TableCell><strong>Product</strong></TableCell>
                                            <TableCell align="right"><strong>Current Stock</strong></TableCell>
                                            <TableCell align="right"><strong>Min Level</strong></TableCell>
                                            <TableCell align="center"><strong>Unit</strong></TableCell>
                                            <TableCell align="center"><strong>Status</strong></TableCell>
                                            <TableCell align="center"><strong>Actions</strong></TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {stocks.map((stock) => {
                                            const status = getStockStatus(stock);
                                            return (
                                                <TableRow key={stock.id} hover>
                                                    <TableCell>
                                                        <Typography variant="body2" fontWeight="bold">
                                                            {stock.product?.name || 'Unknown Product'}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell align="right">
                                                        <Typography 
                                                            fontWeight="bold" 
                                                            color={status.color === 'error' ? 'error.main' : status.color === 'warning' ? 'warning.main' : 'success.main'}
                                                        >
                                                            {stock.currentStock?.toFixed(2) || 0}
                                                        </Typography>
                                                    </TableCell>
                                                    <TableCell align="right">{stock.minStockLevel || 0}</TableCell>
                                                    <TableCell align="center">{stock.unit || 'kg'}</TableCell>
                                                    <TableCell align="center">
                                                        <Chip label={status.label} size="small" color={status.color} />
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                                            <Tooltip title="Stock In">
                                                                <IconButton 
                                                                    size="small" 
                                                                    color="success"
                                                                    onClick={() => openDialog('in', stock)}
                                                                >
                                                                    <TrendingUp />
                                                                </IconButton>
                                                            </Tooltip>
                                                            <Tooltip title="Stock Out">
                                                                <IconButton 
                                                                    size="small" 
                                                                    color="error"
                                                                    onClick={() => openDialog('out', stock)}
                                                                >
                                                                    <TrendingDown />
                                                                </IconButton>
                                                            </Tooltip>
                                                            <Tooltip title="Adjust">
                                                                <IconButton 
                                                                    size="small" 
                                                                    color="primary"
                                                                    onClick={() => openDialog('adjust', stock)}
                                                                >
                                                                    <Edit />
                                                                </IconButton>
                                                            </Tooltip>
                                                        </Box>
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        )}
                    </CardContent>
                </Card>
            )}

            {tab === 1 && (
                <Card>
                    <CardContent>
                        <Typography variant="h6" sx={{ mb: 2 }}>Stock Transactions History</Typography>
                        
                        {transactions.length === 0 ? (
                            <Alert severity="info">No stock transactions found.</Alert>
                        ) : (
                            <TableContainer sx={{ maxHeight: 500 }}>
                                <Table size="small" stickyHeader>
                                    <TableHead>
                                        <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                            <TableCell><strong>Date</strong></TableCell>
                                            <TableCell><strong>Product</strong></TableCell>
                                            <TableCell align="center"><strong>Type</strong></TableCell>
                                            <TableCell align="right"><strong>Qty</strong></TableCell>
                                            <TableCell align="right"><strong>Before</strong></TableCell>
                                            <TableCell align="right"><strong>After</strong></TableCell>
                                            <TableCell><strong>Notes</strong></TableCell>
                                            <TableCell><strong>By</strong></TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {transactions.map((txn) => (
                                            <TableRow key={txn.id} hover>
                                                <TableCell>
                                                    {moment(txn.transactionDate).format('DD/MM/YYYY')}
                                                </TableCell>
                                                <TableCell>{txn.product?.name || 'Unknown'}</TableCell>
                                                <TableCell align="center">
                                                    <Chip 
                                                        label={txn.type.toUpperCase()} 
                                                        size="small" 
                                                        color={txn.type === 'in' ? 'success' : txn.type === 'out' ? 'error' : 'default'}
                                                    />
                                                </TableCell>
                                                <TableCell align="right">{txn.quantity}</TableCell>
                                                <TableCell align="right">{txn.previousStock}</TableCell>
                                                <TableCell align="right" sx={{ fontWeight: 'bold' }}>{txn.newStock}</TableCell>
                                                <TableCell>{txn.notes || '-'}</TableCell>
                                                <TableCell>{txn.createdByName || '-'}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Transaction Dialog */}
            <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ 
                    bgcolor: dialogType === 'in' ? 'success.light' : dialogType === 'out' ? 'error.light' : 'primary.light',
                    color: 'white'
                }}>
                    {getDialogTitle()}
                </DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                        {/* Product Selection */}
                        {selectedProduct ? (
                            <Alert severity="info">
                                Product: <strong>{selectedProduct.product?.name || selectedProduct.name}</strong>
                            </Alert>
                        ) : (
                            <Autocomplete
                                options={products}
                                getOptionLabel={(option) => option.name || ''}
                                value={products.find(p => p.id === formData.productId) || null}
                                onChange={(e, value) => {
                                    setFormData({ ...formData, productId: value?.id || '' });
                                }}
                                renderInput={(params) => (
                                    <TextField {...params} label="Select Product *" placeholder="Search products" />
                                )}
                            />
                        )}

                        {/* Quantity for In/Out */}
                        {(dialogType === 'in' || dialogType === 'out') && (
                            <TextField
                                label={`Quantity to ${dialogType === 'in' ? 'Add' : 'Remove'} *`}
                                type="number"
                                value={formData.quantity}
                                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                                fullWidth
                                autoFocus
                                InputProps={{ inputProps: { min: 0, step: 0.01 } }}
                            />
                        )}

                        {/* New Stock for Adjust */}
                        {dialogType === 'adjust' && (
                            <TextField
                                label="New Stock Value *"
                                type="number"
                                value={formData.newStock}
                                onChange={(e) => setFormData({ ...formData, newStock: e.target.value })}
                                fullWidth
                                autoFocus
                                InputProps={{ inputProps: { min: 0, step: 0.01 } }}
                            />
                        )}

                        {/* Initialize Stock fields */}
                        {dialogType === 'init' && (
                            <>
                                <TextField
                                    label="Initial Stock"
                                    type="number"
                                    value={formData.initialStock}
                                    onChange={(e) => setFormData({ ...formData, initialStock: e.target.value })}
                                    fullWidth
                                    InputProps={{ inputProps: { min: 0, step: 0.01 } }}
                                />
                                <TextField
                                    label="Minimum Stock Level (for alerts)"
                                    type="number"
                                    value={formData.minStockLevel}
                                    onChange={(e) => setFormData({ ...formData, minStockLevel: e.target.value })}
                                    fullWidth
                                    InputProps={{ inputProps: { min: 0, step: 0.01 } }}
                                />
                                <FormControl fullWidth>
                                    <InputLabel>Unit</InputLabel>
                                    <Select
                                        value={formData.unit}
                                        label="Unit"
                                        onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                                    >
                                        <MenuItem value="kg">Kilograms (kg)</MenuItem>
                                        <MenuItem value="pcs">Pieces (pcs)</MenuItem>
                                        <MenuItem value="ltr">Liters (ltr)</MenuItem>
                                        <MenuItem value="box">Boxes</MenuItem>
                                        <MenuItem value="pack">Packs</MenuItem>
                                    </Select>
                                </FormControl>
                            </>
                        )}

                        {/* Notes */}
                        {dialogType !== 'init' && (
                            <TextField
                                label="Notes"
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                fullWidth
                                multiline
                                rows={2}
                                placeholder="Optional notes about this transaction"
                            />
                        )}
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDialogOpen(false)} disabled={submitting}>Cancel</Button>
                    <Button
                        onClick={handleSubmit}
                        variant="contained"
                        color={dialogType === 'in' ? 'success' : dialogType === 'out' ? 'error' : 'primary'}
                        disabled={submitting || !formData.productId}
                    >
                        {submitting ? <CircularProgress size={24} /> : 'Save'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
