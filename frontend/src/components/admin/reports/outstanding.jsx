import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, Tabs, Tab } from '@mui/material';
import { getOutstandingPayables, getOutstandingReceivables } from '../../../services/tally';

export const OutstandingReports = () => {
    const [tab, setTab] = useState(0);
    const [payables, setPayables] = useState({ totalPayable: 0, suppliers: [] });
    const [receivables, setReceivables] = useState({ totalReceivable: 0, customers: [] });
    const [loading, setLoading] = useState(false);

    const fetchReports = async () => {
        try {
            setLoading(true);
            const [payablesData, receivablesData] = await Promise.all([
                getOutstandingPayables(),
                getOutstandingReceivables()
            ]);
            setPayables(payablesData.data);
            setReceivables(receivablesData.data);
        } catch (error) {
            console.error('Error fetching reports:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchReports();
    }, []);

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h5" sx={{ mb: 3 }}>Outstanding Reports</Typography>

            <Tabs value={tab} onChange={(e, newValue) => setTab(newValue)} sx={{ mb: 3 }}>
                <Tab label={`Payables (₹${payables.totalPayable})`} />
                <Tab label={`Receivables (₹${receivables.totalReceivable})`} />
            </Tabs>

            {tab === 0 && (
                <Card>
                    <CardContent>
                        <Typography variant="h6" sx={{ mb: 2 }}>Outstanding Payables</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Total Amount Due to Suppliers: ₹{payables.totalPayable}
                        </Typography>
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Supplier Name</TableCell>
                                        <TableCell>Mobile</TableCell>
                                        <TableCell align="right">Outstanding Balance</TableCell>
                                        <TableCell align="right">Pending Bills</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={4} align="center">Loading...</TableCell>
                                        </TableRow>
                                    ) : payables.suppliers.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} align="center">No outstanding payables</TableCell>
                                        </TableRow>
                                    ) : (
                                        payables.suppliers.map((supplier) => (
                                            <TableRow key={supplier.id}>
                                                <TableCell>{supplier.name}</TableCell>
                                                <TableCell>{supplier.mobile}</TableCell>
                                                <TableCell align="right">₹{supplier.currentBalance}</TableCell>
                                                <TableCell align="right">{supplier.purchaseBills?.length || 0}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </CardContent>
                </Card>
            )}

            {tab === 1 && (
                <Card>
                    <CardContent>
                        <Typography variant="h6" sx={{ mb: 2 }}>Outstanding Receivables</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Total Amount Due from Customers: ₹{receivables.totalReceivable}
                        </Typography>
                        <TableContainer>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Customer Name</TableCell>
                                        <TableCell>Mobile</TableCell>
                                        <TableCell align="right">Total Due</TableCell>
                                        <TableCell align="right">Pending Orders</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={4} align="center">Loading...</TableCell>
                                        </TableRow>
                                    ) : receivables.customers.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} align="center">No outstanding receivables</TableCell>
                                        </TableRow>
                                    ) : (
                                        receivables.customers.map((customer, index) => (
                                            <TableRow key={index}>
                                                <TableCell>{customer.customerName}</TableCell>
                                                <TableCell>{customer.customerMobile}</TableCell>
                                                <TableCell align="right">₹{customer.totalDue}</TableCell>
                                                <TableCell align="right">{customer.orders?.length || 0}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </CardContent>
                </Card>
            )}
        </Box>
    );
};