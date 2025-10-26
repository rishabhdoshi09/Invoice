import { useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Dialog, DialogTitle, DialogContent, DialogActions, Typography, TextField, Select, MenuItem, FormControl, InputLabel, Chip, IconButton } from '@mui/material';
import { Delete } from '@mui/icons-material';
import { listPurchases, createPurchase, deletePurchase } from '../../../services/tally';
import { listSuppliers } from '../../../services/supplier';
import moment from 'moment';

export const ListPurchases = () => {
    const [purchases, setPurchases] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [openDialog, setOpenDialog] = useState(false);
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

    const fetchPurchases = async () => {
        try {
            setLoading(true);
            const { rows } = await listPurchases({});
            setPurchases(rows);
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
    }, []);

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

    const getStatusColor = (status) => {
        switch(status) {
            case 'paid': return 'success';
            case 'partial': return 'warning';
            case 'unpaid': return 'error';
            default: return 'default';
        }
    };

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h5">Purchase Bills</Typography>
                <Button variant="contained" onClick={handleOpenDialog}>
                    Create Purchase Bill
                </Button>
            </Box>

            <Card>
                <CardContent>
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Bill Number</TableCell>
                                    <TableCell>Date</TableCell>
                                    <TableCell>Supplier</TableCell>
                                    <TableCell align="right">Total</TableCell>
                                    <TableCell align="right">Paid</TableCell>
                                    <TableCell align="right">Due</TableCell>
                                    <TableCell>Status</TableCell>
                                    <TableCell align="center">Action</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={8} align="center">Loading...</TableCell>
                                    </TableRow>
                                ) : purchases.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} align="center">No purchase bills found</TableCell>
                                    </TableRow>
                                ) : (
                                    purchases.map((purchase) => (
                                        <TableRow key={purchase.id}>
                                            <TableCell>{purchase.billNumber}</TableCell>
                                            <TableCell>{moment(purchase.billDate).format('DD-MM-YYYY')}</TableCell>
                                            <TableCell>{purchase.supplier?.name}</TableCell>
                                            <TableCell align="right">₹{purchase.total}</TableCell>
                                            <TableCell align="right">₹{purchase.paidAmount}</TableCell>
                                            <TableCell align="right">₹{purchase.dueAmount}</TableCell>
                                            <TableCell>
                                                <Chip 
                                                    label={purchase.paymentStatus} 
                                                    color={getStatusColor(purchase.paymentStatus)} 
                                                    size="small" 
                                                />
                                            </TableCell>
                                            <TableCell align="center">
                                                <IconButton size="small" onClick={() => handleDelete(purchase.id)}>
                                                    <Delete fontSize="small" />
                                                </IconButton>
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </CardContent>
            </Card>

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
