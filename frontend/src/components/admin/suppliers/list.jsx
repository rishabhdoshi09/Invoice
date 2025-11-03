import { useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Dialog, DialogTitle, DialogContent, DialogActions, Typography, IconButton } from '@mui/material';
import { Delete, Edit } from '@mui/icons-material';
import { listSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../../../services/supplier';

export const ListSuppliers = () => {
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState(null);
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
            const { rows } = await listSuppliers({});
            setSuppliers(rows);
        } catch (error) {
            console.error('Error fetching suppliers:', error);
        } finally {
            setLoading(false);
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
                <Button variant="contained" onClick={() => handleOpenDialog()}>
                    Add Supplier
                </Button>
            </Box>

            <Card>
                <CardContent>
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Name</TableCell>
                                    <TableCell>Mobile</TableCell>
                                    <TableCell>Email</TableCell>
                                    <TableCell>GSTIN</TableCell>
                                    <TableCell align="right">Current Balance</TableCell>
                                    <TableCell align="center">Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={6} align="center">Loading...</TableCell>
                                    </TableRow>
                                ) : suppliers.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} align="center">No suppliers found</TableCell>
                                    </TableRow>
                                ) : (
                                    suppliers.map((supplier) => (
                                        <TableRow key={supplier.id}>
                                            <TableCell>{supplier.name}</TableCell>
                                            <TableCell>{supplier.mobile}</TableCell>
                                            <TableCell>{supplier.email}</TableCell>
                                            <TableCell>{supplier.gstin}</TableCell>
                                            <TableCell align="right">₹{supplier.currentBalance || 0}</TableCell>
                                            <TableCell align="center">
                                                <IconButton size="small" onClick={() => handleOpenDialog(supplier)}>
                                                    <Edit fontSize="small" />
                                                </IconButton>
                                                <IconButton size="small" onClick={() => handleDelete(supplier.id)}>
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
                        {!editingSupplier && (
                            <TextField
                                label="Opening Balance"
                                name="openingBalance"
                                type="number"
                                value={formData.openingBalance}
                                onChange={handleChange}
                                fullWidth
                            />
                        )}
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
