import { useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Dialog, DialogTitle, DialogContent, DialogActions, Typography, IconButton } from '@mui/material';
import { Delete, Edit } from '@mui/icons-material';
import { listCustomers, createCustomer, updateCustomer, deleteCustomer } from '../../../services/customer';

export const ListCustomers = () => {
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [openDialog, setOpenDialog] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        mobile: '',
        email: '',
        address: '',
        gstin: '',
        openingBalance: 0
    });

    const fetchCustomers = async () => {
        try {
            setLoading(true);
            const { rows } = await listCustomers({});
            setCustomers(rows);
        } catch (error) {
            console.error('Error fetching customers:', error);
        } finally {
            setLoading(false);
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
        setEditingCustomer(null);
    };

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
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
                console.error('Error deleting customer:', error);
                const errorMessage = error.response?.data?.message || 'Error deleting customer. Please try again.';
                alert(errorMessage);
            }
        }
    };

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h5">Customers</Typography>
                <Button variant="contained" onClick={() => handleOpenDialog()}>
                    Add Customer
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
                                    <TableCell align="right">Opening Bal.</TableCell>
                                    <TableCell align="right">Current Bal.</TableCell>
                                    <TableCell align="center">Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={7} align="center">Loading...</TableCell>
                                    </TableRow>
                                ) : customers.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} align="center">No customers found</TableCell>
                                    </TableRow>
                                ) : (
                                    customers.map((customer) => (
                                        <TableRow key={customer.id}>
                                            <TableCell>{customer.name}</TableCell>
                                            <TableCell>{customer.mobile}</TableCell>
                                            <TableCell>{customer.email}</TableCell>
                                            <TableCell>{customer.gstin}</TableCell>
                                            <TableCell align="right">₹{(customer.openingBalance || 0).toLocaleString('en-IN')}</TableCell>
                                            <TableCell align="right" sx={{ color: (customer.currentBalance || 0) > 0 ? 'success.main' : 'text.primary', fontWeight: 'bold' }}>
                                                ₹{(customer.currentBalance || 0).toLocaleString('en-IN')}
                                            </TableCell>
                                            <TableCell align="center">
                                                <IconButton size="small" onClick={() => handleOpenDialog(customer)}>
                                                    <Edit fontSize="small" />
                                                </IconButton>
                                                <IconButton size="small" onClick={() => handleDelete(customer.id)}>
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
                <DialogTitle>{editingCustomer ? 'Edit Customer' : 'Add Customer'}</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                        <TextField
                            label="Customer Name *"
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
                            label="Opening Balance (Amount customer owes you)"
                            name="openingBalance"
                            type="number"
                            value={formData.openingBalance}
                            onChange={handleChange}
                            fullWidth
                            helperText={editingCustomer 
                                ? "⚠️ Only change if correcting initial balance. Current balance will be recalculated."
                                : "Enter the amount this customer already owes you (receivable)"
                            }
                            InputProps={{ inputProps: { min: 0 } }}
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Cancel</Button>
                    <Button onClick={handleSubmit} variant="contained" disabled={!formData.name}>
                        {editingCustomer ? 'Update' : 'Create'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};
