import { useEffect, useState } from 'react';
import { Box, Button, Card, CardContent, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Dialog, DialogTitle, DialogContent, DialogActions, Typography, TextField, Select, MenuItem, FormControl, InputLabel, Chip } from '@mui/material';
import { listPayments, createPayment } from '../../../services/tally';
import { listSuppliers } from '../../../services/supplier';
import { listPurchases } from '../../../services/tally';
import moment from 'moment';

export const ListPayments = () => {
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [openDialog, setOpenDialog] = useState(false);
    const [suppliers, setSuppliers] = useState([]);
    const [purchases, setPurchases] = useState([]);
    const [formData, setFormData] = useState({
        paymentDate: moment().format('YYYY-MM-DD'),
        partyId: '',
        partyName: '',
        partyType: 'supplier',
        amount: 0,
        referenceType: 'purchase',
        referenceId: '',
        referenceNumber: '',
        notes: ''
    });

    const fetchPayments = async () => {
        try {
            setLoading(true);
            const { rows } = await listPayments({});
            setPayments(rows);
        } catch (error) {
            console.error('Error fetching payments:', error);
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

    const fetchPurchases = async () => {
        try {
            const { rows } = await listPurchases({});
            setPurchases(rows);
        } catch (error) {
            console.error('Error fetching purchases:', error);
        }
    };

    useEffect(() => {
        fetchPayments();
        fetchSuppliers();
        fetchPurchases();
    }, []);

    const handleOpenDialog = () => {
        setFormData({
            paymentDate: moment().format('YYYY-MM-DD'),
            partyId: '',
            partyName: '',
            partyType: 'supplier',
            amount: 0,
            referenceType: 'purchase',
            referenceId: '',
            referenceNumber: '',
            notes: ''
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

        if (name === 'partyId') {
            const supplier = suppliers.find(s => s.id === value);
            if (supplier) {
                setFormData(prev => ({
                    ...prev,
                    partyId: value,
                    partyName: supplier.name
                }));
            }
        }

        if (name === 'referenceId') {
            const purchase = purchases.find(p => p.id === value);
            if (purchase) {
                setFormData(prev => ({
                    ...prev,
                    referenceId: value,
                    referenceNumber: purchase.billNumber
                }));
            }
        }
    };

    const handleSubmit = async () => {
        if (!formData.partyId || !formData.amount) {
            alert('Please fill required fields');
            return;
        }

        try {
            await createPayment(formData);
            handleCloseDialog();
            fetchPayments();
        } catch (error) {
            console.error('Error creating payment:', error);
            alert('Error creating payment');
        }
    };

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h5">Payments</Typography>
                <Button variant="contained" onClick={handleOpenDialog}>
                    Record Payment
                </Button>
            </Box>

            <Card>
                <CardContent>
                    <TableContainer>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Payment No</TableCell>
                                    <TableCell>Date</TableCell>
                                    <TableCell>Party Name</TableCell>
                                    <TableCell>Type</TableCell>
                                    <TableCell align="right">Amount</TableCell>
                                    <TableCell>Reference</TableCell>
                                    <TableCell>Notes</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {loading ? (
                                    <TableRow>
                                        <TableCell colSpan={7} align="center">Loading...</TableCell>
                                    </TableRow>
                                ) : payments.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} align="center">No payments found</TableCell>
                                    </TableRow>
                                ) : (
                                    payments.map((payment) => (
                                        <TableRow key={payment.id}>
                                            <TableCell>{payment.paymentNumber}</TableCell>
                                            <TableCell>{moment(payment.paymentDate).format('DD-MM-YYYY')}</TableCell>
                                            <TableCell>{payment.partyName}</TableCell>
                                            <TableCell>
                                                <Chip label={payment.partyType} size="small" />
                                            </TableCell>
                                            <TableCell align="right">₹{payment.amount}</TableCell>
                                            <TableCell>{payment.referenceNumber || '-'}</TableCell>
                                            <TableCell>{payment.notes || '-'}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </CardContent>
            </Card>

            <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle>Record Payment</DialogTitle>
                <DialogContent>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                        <TextField
                            label="Payment Date"
                            name="paymentDate"
                            type="date"
                            value={formData.paymentDate}
                            onChange={handleChange}
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                        />
                        <FormControl fullWidth>
                            <InputLabel>Party Type</InputLabel>
                            <Select
                                name="partyType"
                                value={formData.partyType}
                                onChange={handleChange}
                                label="Party Type"
                            >
                                <MenuItem value="supplier">Supplier</MenuItem>
                                <MenuItem value="customer">Customer</MenuItem>
                            </Select>
                        </FormControl>
                        <FormControl fullWidth>
                            <InputLabel>Select Party *</InputLabel>
                            <Select
                                name="partyId"
                                value={formData.partyId}
                                onChange={handleChange}
                                label="Select Party *"
                            >
                                {suppliers.map((supplier) => (
                                    <MenuItem key={supplier.id} value={supplier.id}>
                                        {supplier.name}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                        <TextField
                            label="Amount *"
                            name="amount"
                            type="number"
                            value={formData.amount}
                            onChange={handleChange}
                            fullWidth
                        />
                        <FormControl fullWidth>
                            <InputLabel>Reference Type</InputLabel>
                            <Select
                                name="referenceType"
                                value={formData.referenceType}
                                onChange={handleChange}
                                label="Reference Type"
                            >
                                <MenuItem value="purchase">Purchase</MenuItem>
                                <MenuItem value="order">Order</MenuItem>
                                <MenuItem value="advance">Advance</MenuItem>
                            </Select>
                        </FormControl>
                        {formData.referenceType === 'purchase' && (
                            <FormControl fullWidth>
                                <InputLabel>Purchase Bill</InputLabel>
                                <Select
                                    name="referenceId"
                                    value={formData.referenceId}
                                    onChange={handleChange}
                                    label="Purchase Bill"
                                >
                                    {purchases.filter(p => p.supplierId === formData.partyId).map((purchase) => (
                                        <MenuItem key={purchase.id} value={purchase.id}>
                                            {purchase.billNumber} - ₹{purchase.dueAmount} due
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        )}
                        <TextField
                            label="Notes"
                            name="notes"
                            value={formData.notes}
                            onChange={handleChange}
                            fullWidth
                            multiline
                            rows={2}
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>Cancel</Button>
                    <Button onClick={handleSubmit} variant="contained">
                        Record Payment
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};