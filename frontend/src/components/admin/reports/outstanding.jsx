import { useEffect, useState } from 'react';
import { Box, Card, CardContent, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography, Tabs, Tab } from '@mui/material';
import { getOutstandingPayables, getOutstandingReceivables } from '../../../services/tally';

export const OutstandingReports = () => {
    const [tab, setTab] = useState(0);
    const [payables, setPayables] = useState([]);
    const [receivables, setReceivables] = useState([]);
    const [totalPayable, setTotalPayable] = useState(0);
    const [totalReceivable, setTotalReceivable] = useState(0);
    const [loading, setLoading] = useState(false);

    const fetchReports = async () => {
        try {
            setLoading(true);
            const [payablesRes, receivablesRes] = await Promise.all([
                getOutstandingPayables(),
                getOutstandingReceivables()
            ]);
            
            // Handle both old and new API response structures
            const payablesData = payablesRes.data;
            const receivablesData = receivablesRes.data;
            
            // New structure: data is array, totalPayable/totalReceivable are separate
            if (Array.isArray(payablesData)) {
                setPayables(payablesData);
                setTotalPayable(payablesRes.totalPayable || 0);
            } else {
                // Old structure: data.suppliers, data.totalPayable
                setPayables(payablesData?.suppliers || []);
                setTotalPayable(payablesData?.totalPayable || 0);
            }
            
            if (Array.isArray(receivablesData)) {
                setReceivables(receivablesData);
                setTotalReceivable(receivablesRes.totalReceivable || 0);
            } else {
                // Old structure: data.customers, data.totalReceivable
                setReceivables(receivablesData?.customers || []);
                setTotalReceivable(receivablesData?.totalReceivable || 0);
            }
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
                <Tab label={`Payables (₹${totalPayable.toLocaleString('en-IN')})`} />
                <Tab label={`Receivables (₹${totalReceivable.toLocaleString('en-IN')})`} />
            </Tabs>

            {tab === 0 && (
                <Card>
                    <CardContent>
                        <Typography variant="h6" sx={{ mb: 2 }}>Outstanding Payables</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Total Amount Due to Suppliers: ₹{totalPayable.toLocaleString('en-IN')}
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
                                    ) : payables.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} align="center">No outstanding payables</TableCell>
                                        </TableRow>
                                    ) : (
                                        payables.map((supplier, index) => (
                                            <TableRow key={supplier.supplierId || index}>
                                                <TableCell>{supplier.supplierName || supplier.name}</TableCell>
                                                <TableCell>{supplier.supplierMobile || supplier.mobile || '-'}</TableCell>
                                                <TableCell align="right">₹{(supplier.totalOutstanding || supplier.currentBalance || 0).toLocaleString('en-IN')}</TableCell>
                                                <TableCell align="right">{supplier.billCount || supplier.bills?.length || 0}</TableCell>
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
                            Total Amount Due from Customers: ₹{totalReceivable.toLocaleString('en-IN')}
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
                                    ) : receivables.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={4} align="center">No outstanding receivables</TableCell>
                                        </TableRow>
                                    ) : (
                                        receivables.map((customer, index) => (
                                            <TableRow key={index}>
                                                <TableCell>{customer.customerName || customer.name}</TableCell>
                                                <TableCell>{customer.customerMobile || customer.mobile || '-'}</TableCell>
                                                <TableCell align="right">₹{(customer.totalOutstanding || customer.totalDue || 0).toLocaleString('en-IN')}</TableCell>
                                                <TableCell align="right">{customer.orderCount || customer.orders?.length || 0}</TableCell>
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