import { useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Dialog, DialogTitle, DialogContent, DialogActions, Typography, IconButton, Chip, Tooltip } from '@mui/material';
import { Delete, Edit, Visibility, Refresh } from '@mui/icons-material';
import { listSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../../../services/supplier';
import axios from 'axios';

export const ListSuppliers = () => {
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState(null);
    const [detailsDialog, setDetailsDialog] = useState({ open: false, supplier: null });
    const [formData, setFormData] = useState({
        name: '',
        mobile: '',
        email: '',
        address: '',
        gstin: '',
        openingBalance: 0
    });

    const fetchSuppliers = async () => {
        try {
            setLoading(true);
            const token = localStorage.getItem('token');
            // Use the new endpoint with balance
            const { data } = await axios.get('/api/suppliers/with-balance', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setSuppliers(data.data?.rows || []);
        } catch (error) {
            console.error('Error fetching suppliers:', error);
            // Fallback to regular list
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
            setDetailsDialog({ open: true, supplier: data.data });
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
            setFormData({
                name: '',
                mobile: '',
                email: '',
                address: '',
                gstin: '',
                openingBalance: 0
            });
        }
        setOpenDialog(true);
    };

    const handleCloseDialog = () => {
        setOpenDialog(false);
        setEditingSupplier(null);
    };

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
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
                console.error('Error deleting supplier:', error);
                const errorMessage = error.response?.data?.message || 'Error deleting supplier. Please try again.';
                alert(errorMessage);
            }
        }
    };

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h5">Suppliers</Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Tooltip title="Refresh">
                        <IconButton onClick={fetchSuppliers} disabled={loading}>
                            <Refresh />
                        </IconButton>
                    </Tooltip>
                    <Button variant="contained" onClick={() => handleOpenDialog()}>
                        Add Supplier
                    </Button>
                </Box>
            </Box>

            <Card>
                <CardContent>
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                    <TableCell><strong>Name</strong></TableCell>
                                    <TableCell><strong>Mobile</strong></TableCell>
                                    <TableCell><strong>GSTIN</strong></TableCell>
                                    <TableCell align="right"><strong>Opening Bal.</strong></TableCell>
                                    <TableCell align="right"><strong>Total Debit</strong></TableCell>
                                    <TableCell align="right"><strong>Total Credit</strong></TableCell>
                                    <TableCell align="right"><strong>Balance</strong></TableCell>
                                    <TableCell align="center"><strong>Actions</strong></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={8} align="center">Loading...</TableCell>
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
                                                <Tooltip title="View Details">
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

            <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle>{editingSupplier ? 'Edit Supplier' : 'Add Supplier'}</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                        <TextField
                            label="Supplier Name *"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            fullWidth
                            required
                        />
                        <TextField
                            label="Mobile"
                            name="mobile"
                            value={formData.mobile}
                            onChange={handleChange}
                            fullWidth
                        />
                        <TextField
                            label="Email"
                            name="email"
                            type="email"
                            value={formData.email}
                            onChange={handleChange}
                            fullWidth
                        />
                        <TextField
                            label="Address"
                            name="address"
                            value={formData.address}
                            onChange={handleChange}
                            fullWidth
                            multiline
                            rows={2}
                        />
                        <TextField
                            label="GSTIN"
                            name="gstin"
                            value={formData.gstin}
                            onChange={handleChange}
                            fullWidth
                        />
                        <TextField
                            label="Opening Balance (Amount you owe supplier)"
                            name="openingBalance"
                            type="number"
                            value={formData.openingBalance}
                            onChange={handleChange}
                            fullWidth
                            helperText={editingSupplier 
                                ? "⚠️ Only change if correcting initial balance. Current balance will be recalculated."
                                : "Enter the amount you already owe this supplier (payable)"
                            }
                            InputProps={{ inputProps: { min: 0 } }}
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Cancel</Button>
                    <Button onClick={handleSubmit} variant="contained" disabled={!formData.name}>
                        {editingSupplier ? 'Update' : 'Create'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
