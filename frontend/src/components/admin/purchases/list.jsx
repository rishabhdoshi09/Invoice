import { useEffect, useState } from 'react';
import { 
    Box, Button, Card, CardContent, Table, TableBody, TableCell, TableContainer, 
    TableHead, TableRow, Dialog, DialogTitle, DialogContent, DialogActions, 
    Typography, TextField, Select, MenuItem, FormControl, InputLabel, Chip, 
    IconButton, Collapse, Paper, Grid, Divider, TablePagination, Alert,
    FormControlLabel, Switch
} from '@mui/material';
import { Delete, ExpandMore, ExpandLess, Download, Visibility, Receipt } from '@mui/icons-material';
import { listPurchases, createPurchase, deletePurchase } from '../../../services/tally';
import { listSuppliers } from '../../../services/supplier';
import moment from 'moment';
import axios from 'axios';

const PAGE_SIZE_OPTIONS = [25, 50, 100];

export const ListPurchases = () => {
    const [purchases, setPurchases] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [openDialog, setOpenDialog] = useState(false);
    const [viewDialog, setViewDialog] = useState(null);
    const [expandedRows, setExpandedRows] = useState({});
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(50);
    const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
    const [isPaid, setIsPaid] = useState(true);  // Toggle for Paid/Unpaid
    const [formData, setFormData] = useState({
        billDate: moment().format('YYYY-MM-DD'),
        supplierId: '',
        subTotal: 0,
        tax: 0,
        taxPercent: 18,
        total: 0,
        paidAmount: 0,
        purchaseItems: []
    });
    const [currentItem, setCurrentItem] = useState({
        name: '',
        quantity: 1,
        price: 0,
        totalPrice: 0
    });

    // Convert YYYY-MM-DD to DD-MM-YYYY for backend
    const formatDateForApi = (dateStr) => {
        if (!dateStr) return '';
        const [year, month, day] = dateStr.split('-');
        return `${day}-${month}-${year}`;
    };

    const fetchPurchases = async () => {
        try {
            setLoading(true);
            const params = {
                limit: rowsPerPage,
                offset: page * rowsPerPage
            };
            
            if (dateRange.startDate && dateRange.endDate) {
                params.startDate = formatDateForApi(dateRange.startDate);
                params.endDate = formatDateForApi(dateRange.endDate);
            }
            
            const { rows, count } = await listPurchases(params);
            setPurchases(rows || []);
            setTotalCount(count || 0);
        } catch (error) {
            console.error('Error fetching purchases:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchSuppliers = async () => {
        try {
            const { rows } = await listSuppliers({});
            setSuppliers(rows);
        } catch (error) {
            console.error('Error fetching suppliers:', error);
        }
    };

    useEffect(() => {
        fetchPurchases();
        fetchSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, rowsPerPage]);

    const handlePageChange = (event, newPage) => {
        setPage(newPage);
    };

    const handleRowsPerPageChange = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    const handleRefresh = () => {
        setPage(0);
        fetchPurchases();
    };

    const toggleRow = (id) => {
        setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
    };

    const handleOpenDialog = () => {
        setFormData({
            billDate: moment().format('YYYY-MM-DD'),
            supplierId: '',
            subTotal: 0,
            tax: 0,
            taxPercent: 18,
            total: 0,
            paidAmount: 0,
            purchaseItems: []
        });
        setIsPaid(true);  // Default to paid
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData({
            ...formData,
            [name]: value
        });

        if (name === 'taxPercent' || name === 'subTotal') {
            const subtotal = name === 'subTotal' ? parseFloat(value) || 0 : formData.subTotal;
            const taxPct = name === 'taxPercent' ? parseFloat(value) || 0 : formData.taxPercent;
            const taxAmt = (subtotal * taxPct) / 100;
            const total = subtotal + taxAmt;
            
            setFormData(prev => ({
                ...prev,
                [name]: value,
                tax: taxAmt,
                total: total
            }));
        }
    };

    const handleItemChange = (e) => {
        const { name, value } = e.target;
        const newItem = { ...currentItem, [name]: value };
        
        if (name === 'quantity' || name === 'price') {
            newItem.totalPrice = (parseFloat(newItem.quantity) || 0) * (parseFloat(newItem.price) || 0);
        }
        
        setCurrentItem(newItem);
    };

    const handleAddItem = () => {
        if (!currentItem.name || currentItem.quantity <= 0 || currentItem.price <= 0) {
            alert('Please fill all item fields');
            return;
        }

        const items = [...formData.purchaseItems, currentItem];
        const subTotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
        const tax = (subTotal * formData.taxPercent) / 100;
        const total = subTotal + tax;

        setFormData({
            ...formData,
            purchaseItems: items,
            subTotal,
            tax,
            total
        });

        setCurrentItem({
            name: '',
            quantity: 1,
            price: 0,
            totalPrice: 0
        });
    };

    const handleRemoveItem = (index) => {
        const items = formData.purchaseItems.filter((_, i) => i !== index);
        const subTotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
        const tax = (subTotal * formData.taxPercent) / 100;
        const total = subTotal + tax;

        setFormData({
            ...formData,
            purchaseItems: items,
            subTotal,
            tax,
            total
        });
    };

    const handleSubmit = async () => {
        if (!formData.supplierId || formData.purchaseItems.length === 0) {
            alert('Please select supplier and add items');
            return;
        }

        try {
            await createPurchase(formData);
            handleCloseDialog();
            fetchPurchases();
        } catch (error) {
            console.error('Error creating purchase:', error);
            alert('Error creating purchase');
        }
    };

    const handleDelete = async (purchaseId) => {
        if (window.confirm('Are you sure you want to delete this purchase?')) {
            try {
                await deletePurchase(purchaseId);
                fetchPurchases();
            } catch (error) {
                console.error('Error deleting purchase:', error);
            }
        }
    };

    // Format date for export - handles both DD-MM-YYYY string and ISO date formats
    const formatDateForExport = (dateStr) => {
        if (!dateStr) return '-';
        // If already in DD-MM-YYYY format, return as-is
        if (dateStr.match && dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
            return dateStr;
        }
        // Otherwise try to parse and format
        const parsed = moment(dateStr);
        return parsed.isValid() ? parsed.format('DD-MM-YYYY') : dateStr;
    };

    // Export purchases for CA
    const handleExportForCA = async () => {
        try {
            // Build CSV
            const headers = [
                'Bill Number', 'Bill Date', 'Supplier Name', 'Supplier GSTIN',
                'Item Name', 'Quantity', 'Unit Price', 'Taxable Value',
                'CGST Rate', 'CGST Amount', 'SGST Rate', 'SGST Amount',
                'Total Tax', 'Line Total', 'Bill Total', 'Payment Status'
            ];

            const rows = [];
            for (const purchase of purchases) {
                const items = purchase.purchaseItems || [];
                const taxRate = (purchase.taxPercent || 18) / 2; // Split CGST/SGST
                
                if (items.length === 0) {
                    // No items, just add summary row
                    rows.push([
                        purchase.billNumber,
                        formatDateForExport(purchase.billDate),
                        purchase.supplier?.name || '',
                        purchase.supplier?.gstin || 'N/A',
                        'N/A', 0, 0, purchase.subTotal,
                        taxRate, purchase.tax / 2, taxRate, purchase.tax / 2,
                        purchase.tax, purchase.total, purchase.total,
                        purchase.paymentStatus
                    ]);
                } else {
                    for (const item of items) {
                        const itemTax = (item.totalPrice * (purchase.taxPercent || 18)) / 100;
                        rows.push([
                            purchase.billNumber,
                            formatDateForExport(purchase.billDate),
                            purchase.supplier?.name || '',
                            purchase.supplier?.gstin || 'N/A',
                            item.name,
                            item.quantity,
                            item.price,
                            item.totalPrice,
                            taxRate, itemTax / 2, taxRate, itemTax / 2,
                            itemTax, item.totalPrice + itemTax, purchase.total,
                            purchase.paymentStatus
                        ]);
                    }
                }
            }

            const csvContent = [
                headers.join(','),
                ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            ].join('\n');

            const blob = new Blob([csvContent], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `Purchase_Bills_${moment().format('YYYY-MM-DD')}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (error) {
            console.error('Export error:', error);
            alert('Export failed');
        }
    };

    const getStatusColor = (status) => {
        switch(status) {
            case 'paid': return 'success';
            case 'partial': return 'warning';
            case 'unpaid': return 'error';
            default: return 'default';
        }
    };

    // Calculate GST breakdown for display
    const calculateGST = (amount, taxPercent = 18) => {
        const cgstRate = taxPercent / 2;
        const sgstRate = taxPercent / 2;
        const taxable = amount / (1 + taxPercent / 100);
        const cgst = taxable * (cgstRate / 100);
        const sgst = taxable * (sgstRate / 100);
        return { taxable: taxable.toFixed(2), cgst: cgst.toFixed(2), sgst: sgst.toFixed(2), cgstRate, sgstRate };
    };

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box>
                    <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Receipt /> Purchase Bills
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                        Manage purchase bills and export for CA
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button variant="outlined" startIcon={<Download />} onClick={handleExportForCA} disabled={purchases.length === 0}>
                        Export for CA
                    </Button>
                    <Button variant="contained" onClick={handleOpenDialog}>
                        Create Purchase Bill
                    </Button>
                </Box>
            </Box>

            {/* Filters */}
            <Card sx={{ mb: 2 }}>
                <CardContent sx={{ py: 1.5 }}>
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                        <TextField
                            label="Start Date"
                            type="date"
                            size="small"
                            value={dateRange.startDate}
                            onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                            InputLabelProps={{ shrink: true }}
                        />
                        <TextField
                            label="End Date"
                            type="date"
                            size="small"
                            value={dateRange.endDate}
                            onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                            InputLabelProps={{ shrink: true }}
                        />
                        <Button variant="outlined" onClick={handleRefresh}>
                            Filter
                        </Button>
                    </Box>
                </CardContent>
            </Card>

            <Card>
                <CardContent>
                    {purchases.length === 0 && !loading ? (
                        <Alert severity="info">No purchase bills found</Alert>
                    ) : (
                        <Paper variant="outlined">
                            <TableContainer sx={{ maxHeight: 500 }}>
                                <Table size="small" stickyHeader>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell width={40}></TableCell>
                                            <TableCell>Bill Number</TableCell>
                                            <TableCell>Date</TableCell>
                                            <TableCell>Supplier</TableCell>
                                            <TableCell align="right">Subtotal</TableCell>
                                            <TableCell align="right">Tax</TableCell>
                                            <TableCell align="right">Total</TableCell>
                                            <TableCell align="right">Paid</TableCell>
                                            <TableCell>Status</TableCell>
                                            <TableCell align="center">Actions</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {loading ? (
                                            <TableRow>
                                                <TableCell colSpan={10} align="center">Loading...</TableCell>
                                            </TableRow>
                                        ) : (
                                            purchases.map((purchase) => (
                                                <>
                                                    <TableRow key={purchase.id} hover>
                                                        <TableCell>
                                                            <IconButton size="small" onClick={() => toggleRow(purchase.id)}>
                                                                {expandedRows[purchase.id] ? <ExpandLess /> : <ExpandMore />}
                                                            </IconButton>
                                                        </TableCell>
                                                        <TableCell><strong>{purchase.billNumber}</strong></TableCell>
                                                        <TableCell>{purchase.billDate ? (purchase.billDate.includes('-') && purchase.billDate.split('-')[0].length === 2 ? purchase.billDate : moment(purchase.billDate).format('DD-MM-YYYY')) : '-'}</TableCell>
                                                        <TableCell>{purchase.supplier?.name}</TableCell>
                                                        <TableCell align="right">₹{Number(purchase.subTotal).toLocaleString()}</TableCell>
                                                        <TableCell align="right">₹{Number(purchase.tax).toLocaleString()}</TableCell>
                                                        <TableCell align="right"><strong>₹{Number(purchase.total).toLocaleString()}</strong></TableCell>
                                                        <TableCell align="right">₹{Number(purchase.paidAmount).toLocaleString()}</TableCell>
                                                        <TableCell>
                                                            <Chip 
                                                                label={purchase.paymentStatus} 
                                                                color={getStatusColor(purchase.paymentStatus)} 
                                                                size="small" 
                                                            />
                                                        </TableCell>
                                                        <TableCell align="center">
                                                            <IconButton size="small" onClick={() => setViewDialog(purchase)} title="View Details">
                                                                <Visibility fontSize="small" />
                                                            </IconButton>
                                                            <IconButton size="small" onClick={() => handleDelete(purchase.id)} title="Delete">
                                                                <Delete fontSize="small" />
                                                            </IconButton>
                                                        </TableCell>
                                                    </TableRow>
                                                    
                                                    {/* Expanded Row - Line Items with GST */}
                                                    <TableRow>
                                                        <TableCell colSpan={10} sx={{ py: 0, border: 0 }}>
                                                            <Collapse in={expandedRows[purchase.id]} timeout="auto" unmountOnExit>
                                                                <Box sx={{ py: 2, px: 4, bgcolor: 'grey.50' }}>
                                                                    <Typography variant="subtitle2" sx={{ mb: 1 }}>Line Items (GST @ {purchase.taxPercent || 18}%):</Typography>
                                                                    <Table size="small">
                                                                        <TableHead>
                                                                            <TableRow>
                                                                                <TableCell>Item Name</TableCell>
                                                                                <TableCell align="right">Qty</TableCell>
                                                                                <TableCell align="right">Unit Price</TableCell>
                                                                                <TableCell align="right">Taxable Value</TableCell>
                                                                                <TableCell align="right">CGST {(purchase.taxPercent || 18) / 2}%</TableCell>
                                                                                <TableCell align="right">SGST {(purchase.taxPercent || 18) / 2}%</TableCell>
                                                                                <TableCell align="right">Amount</TableCell>
                                                                            </TableRow>
                                                                        </TableHead>
                                                                        <TableBody>
                                                                            {(purchase.purchaseItems || []).map((item, idx) => {
                                                                                const taxPercent = purchase.taxPercent || 18;
                                                                                const taxable = item.totalPrice;
                                                                                const cgst = (taxable * (taxPercent / 2)) / 100;
                                                                                const sgst = (taxable * (taxPercent / 2)) / 100;
                                                                                const total = taxable + cgst + sgst;
                                                                                return (
                                                                                    <TableRow key={idx}>
                                                                                        <TableCell>{item.name}</TableCell>
                                                                                        <TableCell align="right">{item.quantity}</TableCell>
                                                                                        <TableCell align="right">₹{Number(item.price).toFixed(2)}</TableCell>
                                                                                        <TableCell align="right">₹{taxable.toFixed(2)}</TableCell>
                                                                                        <TableCell align="right">₹{cgst.toFixed(2)}</TableCell>
                                                                                        <TableCell align="right">₹{sgst.toFixed(2)}</TableCell>
                                                                                        <TableCell align="right">₹{total.toFixed(2)}</TableCell>
                                                                                    </TableRow>
                                                                                );
                                                                            })}
                                                                        </TableBody>
                                                                    </Table>
                                                                </Box>
                                                            </Collapse>
                                                        </TableCell>
                                                    </TableRow>
                                                </>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                            <TablePagination
                                component="div"
                                count={totalCount}
                                page={page}
                                onPageChange={handlePageChange}
                                rowsPerPage={rowsPerPage}
                                onRowsPerPageChange={handleRowsPerPageChange}
                                rowsPerPageOptions={PAGE_SIZE_OPTIONS}
                                showFirstButton
                                showLastButton
                            />
                        </Paper>
                    )}
                </CardContent>
            </Card>

            {/* View Details Dialog */}
            <Dialog open={!!viewDialog} onClose={() => setViewDialog(null)} maxWidth="md" fullWidth>
                <DialogTitle>Purchase Bill Details</DialogTitle>
                <DialogContent>
                    {viewDialog && (
                        <Box>
                            <Grid container spacing={2} sx={{ mb: 2 }}>
                                <Grid item xs={6}>
                                    <Typography variant="body2"><strong>Bill Number:</strong> {viewDialog.billNumber}</Typography>
                                    <Typography variant="body2"><strong>Date:</strong> {viewDialog.billDate ? (viewDialog.billDate.includes('-') && viewDialog.billDate.split('-')[0].length === 2 ? viewDialog.billDate : moment(viewDialog.billDate).format('DD-MM-YYYY')) : '-'}</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="body2"><strong>Supplier:</strong> {viewDialog.supplier?.name}</Typography>
                                    <Typography variant="body2"><strong>GSTIN:</strong> {viewDialog.supplier?.gstin || 'N/A'}</Typography>
                                </Grid>
                            </Grid>
                            <Divider sx={{ my: 2 }} />
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>Items:</Typography>
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Item</TableCell>
                                        <TableCell align="right">Qty</TableCell>
                                        <TableCell align="right">Price</TableCell>
                                        <TableCell align="right">Taxable</TableCell>
                                        <TableCell align="right">CGST</TableCell>
                                        <TableCell align="right">SGST</TableCell>
                                        <TableCell align="right">Total</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {(viewDialog.purchaseItems || []).map((item, idx) => {
                                        const taxPercent = viewDialog.taxPercent || 18;
                                        const taxable = item.totalPrice;
                                        const cgst = (taxable * (taxPercent / 2)) / 100;
                                        const sgst = (taxable * (taxPercent / 2)) / 100;
                                        return (
                                            <TableRow key={idx}>
                                                <TableCell>{item.name}</TableCell>
                                                <TableCell align="right">{item.quantity}</TableCell>
                                                <TableCell align="right">₹{item.price}</TableCell>
                                                <TableCell align="right">₹{taxable.toFixed(2)}</TableCell>
                                                <TableCell align="right">₹{cgst.toFixed(2)}</TableCell>
                                                <TableCell align="right">₹{sgst.toFixed(2)}</TableCell>
                                                <TableCell align="right">₹{(taxable + cgst + sgst).toFixed(2)}</TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                            <Divider sx={{ my: 2 }} />
                            <Box sx={{ textAlign: 'right' }}>
                                <Typography variant="body2">Subtotal: ₹{viewDialog.subTotal}</Typography>
                                <Typography variant="body2">Tax ({viewDialog.taxPercent || 18}%): ₹{viewDialog.tax}</Typography>
                                <Typography variant="h6">Total: ₹{viewDialog.total}</Typography>
                                <Chip label={viewDialog.paymentStatus} color={getStatusColor(viewDialog.paymentStatus)} sx={{ mt: 1 }} />
                            </Box>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setViewDialog(null)}>Close</Button>
                </DialogActions>
            </Dialog>

            {/* Create Purchase Dialog */}
            <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
                <DialogTitle>Create Purchase Bill</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                        <Box sx={{ display: 'flex', gap: 2 }}>
                            <TextField
                                label="Bill Date"
                                name="billDate"
                                type="date"
                                value={formData.billDate}
                                onChange={handleChange}
                                fullWidth
                                InputLabelProps={{ shrink: true }}
                            />
                            <FormControl fullWidth>
                                <InputLabel>Supplier *</InputLabel>
                                <Select
                                    name="supplierId"
                                    value={formData.supplierId}
                                    onChange={handleChange}
                                    label="Supplier *"
                                >
                                    {suppliers.map((supplier) => (
                                        <MenuItem key={supplier.id} value={supplier.id}>
                                            {supplier.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Box>

                        <Typography variant="h6" sx={{ mt: 2 }}>Add Items</Typography>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <TextField
                                label="Item Name"
                                name="name"
                                value={currentItem.name}
                                onChange={handleItemChange}
                                size="small"
                                sx={{ flex: 2 }}
                            />
                            <TextField
                                label="Qty"
                                name="quantity"
                                type="number"
                                value={currentItem.quantity}
                                onChange={handleItemChange}
                                size="small"
                                sx={{ flex: 1 }}
                            />
                            <TextField
                                label="Price"
                                name="price"
                                type="number"
                                value={currentItem.price}
                                onChange={handleItemChange}
                                size="small"
                                sx={{ flex: 1 }}
                            />
                            <TextField
                                label="Total"
                                value={currentItem.totalPrice}
                                size="small"
                                disabled
                                sx={{ flex: 1 }}
                            />
                            <Button variant="contained" onClick={handleAddItem} size="small">
                                Add
                            </Button>
                        </Box>

                        {formData.purchaseItems.length > 0 && (
                            <Box sx={{ mt: 2 }}>
                                <Typography variant="subtitle2">Items:</Typography>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Name</TableCell>
                                            <TableCell align="right">Qty</TableCell>
                                            <TableCell align="right">Price</TableCell>
                                            <TableCell align="right">Total</TableCell>
                                            <TableCell></TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {formData.purchaseItems.map((item, index) => (
                                            <TableRow key={index}>
                                                <TableCell>{item.name}</TableCell>
                                                <TableCell align="right">{item.quantity}</TableCell>
                                                <TableCell align="right">₹{item.price}</TableCell>
                                                <TableCell align="right">₹{item.totalPrice}</TableCell>
                                                <TableCell>
                                                    <IconButton size="small" onClick={() => handleRemoveItem(index)}>
                                                        <Delete fontSize="small" />
                                                    </IconButton>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </Box>
                        )}

                        <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                            <TextField
                                label="Tax %"
                                name="taxPercent"
                                type="number"
                                value={formData.taxPercent}
                                onChange={handleChange}
                                fullWidth
                            />
                            <TextField
                                label="SubTotal"
                                value={formData.subTotal}
                                disabled
                                fullWidth
                            />
                            <TextField
                                label="Tax Amount"
                                value={formData.tax}
                                disabled
                                fullWidth
                            />
                            <TextField
                                label="Total"
                                value={formData.total}
                                disabled
                                fullWidth
                            />
                        </Box>

                        <TextField
                            label="Paid Amount"
                            name="paidAmount"
                            type="number"
                            value={formData.paidAmount}
                            onChange={handleChange}
                            fullWidth
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Cancel</Button>
                    <Button onClick={handleSubmit} variant="contained">
                        Create Purchase Bill
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
