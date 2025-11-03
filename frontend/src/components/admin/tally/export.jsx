import { useState, useEffect } from 'react';
import { Box, Button, Card, CardContent, Typography, Grid, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Checkbox, Tabs, Tab, TextField, Alert } from '@mui/material';
import { Download, Refresh } from '@mui/icons-material';
import axios from 'axios';
import { listPurchases } from '../../../services/purchase';

export const TallyExport = () => {
    const [activeTab, setActiveTab] = useState(0);
    const [salesOrders, setSalesOrders] = useState([]);
    const [purchases, setPurchases] = useState([]);
    const [selectedSales, setSelectedSales] = useState([]);
    const [selectedPurchases, setSelectedPurchases] = useState([]);
    const [loading, setLoading] = useState(false);
    const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });

    useEffect(() => {
        if (activeTab === 0) {
            fetchSalesOrders();
        } else if (activeTab === 1) {
            fetchPurchases();
        }
    }, [activeTab]);

    const fetchSalesOrders = async () => {
        try {
            setLoading(true);
            const { data } = await axios.get('/api/orders', {
                params: dateRange.startDate && dateRange.endDate ? dateRange : {}
            });
            setSalesOrders(data.data.rows || []);
        } catch (error) {
            console.error('Error fetching sales orders:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchPurchases = async () => {
        try {
            setLoading(true);
            const { rows } = await listPurchases(dateRange.startDate && dateRange.endDate ? dateRange : {});
            setPurchases(rows || []);
        } catch (error) {
            console.error('Error fetching purchases:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSelectAll = (type) => {
        if (type === 'sales') {
            if (selectedSales.length === salesOrders.length) {
                setSelectedSales([]);
            } else {
                setSelectedSales(salesOrders.map(order => order.id));
            }
        } else {
            if (selectedPurchases.length === purchases.length) {
                setSelectedPurchases([]);
            } else {
                setSelectedPurchases(purchases.map(purchase => purchase.id));
            }
        }
    };

    const handleToggleItem = (id, type) => {
        if (type === 'sales') {
            setSelectedSales(prev => 
                prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
            );
        } else {
            setSelectedPurchases(prev => 
                prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
            );
        }
    };

    const handleExportSelected = async (type) => {
        const ids = type === 'sales' ? selectedSales : selectedPurchases;
        
        if (ids.length === 0) {
            alert('Please select at least one item to export');
            return;
        }

        try {
            const response = await axios.post(`/api/export/tally/${type}`, 
                { ids },
                { 
                    responseType: 'blob',
                    headers: { 'Content-Type': 'application/json' }
                }
            );

            const blob = new Blob([response.data], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `tally_${type}_export_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

            // Clear selection after export
            if (type === 'sales') {
                setSelectedSales([]);
            } else {
                setSelectedPurchases([]);
            }
        } catch (error) {
            console.error('Error exporting:', error);
            alert('Error exporting data. Please try again.');
        }
    };

    const handleExportPayments = () => {
        const url = `/api/export/tally/payments`;
        window.open(url, '_blank');
    };

    const handleExportOutstanding = () => {
        const url = `/api/export/tally/outstanding`;
        window.open(url, '_blank');
    };

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h5" sx={{ mb: 3 }}>Tally Export</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Select specific bills to export for Tally import
            </Typography>

            <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)} sx={{ mb: 3 }}>
                <Tab label="Sales Orders" />
                <Tab label="Purchases" />
                <Tab label="Payments & Outstanding" />
            </Tabs>

            {activeTab === 0 && (
                <Card>
                    <CardContent>
                        <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
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
                            <Button startIcon={<Refresh />} onClick={fetchSalesOrders} variant="outlined">
                                Refresh
                            </Button>
                            <Box sx={{ flexGrow: 1 }} />
                            <Button 
                                variant="contained" 
                                startIcon={<Download />}
                                onClick={() => handleExportSelected('sales')}
                                disabled={selectedSales.length === 0}
                            >
                                Export Selected ({selectedSales.length})
                            </Button>
                        </Box>

                        {salesOrders.length === 0 ? (
                            <Alert severity="info">No sales orders found</Alert>
                        ) : (
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell padding="checkbox">
                                                <Checkbox
                                                    checked={selectedSales.length === salesOrders.length && salesOrders.length > 0}
                                                    indeterminate={selectedSales.length > 0 && selectedSales.length < salesOrders.length}
                                                    onChange={() => handleSelectAll('sales')}
                                                />
                                            </TableCell>
                                            <TableCell>Order No</TableCell>
                                            <TableCell>Date</TableCell>
                                            <TableCell>Customer</TableCell>
                                            <TableCell align="right">Total</TableCell>
                                            <TableCell>Status</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {salesOrders.map((order) => (
                                            <TableRow key={order.id}>
                                                <TableCell padding="checkbox">
                                                    <Checkbox
                                                        checked={selectedSales.includes(order.id)}
                                                        onChange={() => handleToggleItem(order.id, 'sales')}
                                                    />
                                                </TableCell>
                                                <TableCell>{order.orderNumber}</TableCell>
                                                <TableCell>{order.orderDate}</TableCell>
                                                <TableCell>{order.customerName || 'N/A'}</TableCell>
                                                <TableCell align="right">₹{order.total}</TableCell>
                                                <TableCell>{order.paymentStatus || 'paid'}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        )}
                    </CardContent>
                </Card>
            )}

            {activeTab === 1 && (
                <Card>
                    <CardContent>
                        <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
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
                            <Button startIcon={<Refresh />} onClick={fetchPurchases} variant="outlined">
                                Refresh
                            </Button>
                            <Box sx={{ flexGrow: 1 }} />
                            <Button 
                                variant="contained" 
                                startIcon={<Download />}
                                onClick={() => handleExportSelected('purchases')}
                                disabled={selectedPurchases.length === 0}
                            >
                                Export Selected ({selectedPurchases.length})
                            </Button>
                        </Box>

                        {purchases.length === 0 ? (
                            <Alert severity="info">No purchase bills found</Alert>
                        ) : (
                            <TableContainer>
                                <Table size="small">
                                    <TableHead>
                                        <TableRow>
                                            <TableCell padding="checkbox">
                                                <Checkbox
                                                    checked={selectedPurchases.length === purchases.length && purchases.length > 0}
                                                    indeterminate={selectedPurchases.length > 0 && selectedPurchases.length < purchases.length}
                                                    onChange={() => handleSelectAll('purchases')}
                                                />
                                            </TableCell>
                                            <TableCell>Bill No</TableCell>
                                            <TableCell>Date</TableCell>
                                            <TableCell>Supplier</TableCell>
                                            <TableCell align="right">Total</TableCell>
                                            <TableCell>Status</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {purchases.map((purchase) => (
                                            <TableRow key={purchase.id}>
                                                <TableCell padding="checkbox">
                                                    <Checkbox
                                                        checked={selectedPurchases.includes(purchase.id)}
                                                        onChange={() => handleToggleItem(purchase.id, 'purchases')}
                                                    />
                                                </TableCell>
                                                <TableCell>{purchase.billNumber}</TableCell>
                                                <TableCell>{purchase.billDate}</TableCell>
                                                <TableCell>{purchase.supplier?.name || 'N/A'}</TableCell>
                                                <TableCell align="right">₹{purchase.total}</TableCell>
                                                <TableCell>{purchase.paymentStatus || 'unpaid'}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        )}
                    </CardContent>
                </Card>
            )}

            {activeTab === 2 && (
                <Grid container spacing={3}>
                    <Grid item xs={12} md={6}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" sx={{ mb: 1 }}>Payments Export</Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    Export all payment records with party details and references
                                </Typography>
                                <Button 
                                    variant="contained" 
                                    startIcon={<Download />}
                                    onClick={handleExportPayments}
                                    fullWidth
                                >
                                    Download Payments CSV
                                </Button>
                            </CardContent>
                        </Card>
                    </Grid>

                    <Grid item xs={12} md={6}>
                        <Card>
                            <CardContent>
                                <Typography variant="h6" sx={{ mb: 1 }}>Outstanding Export</Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                    Export all outstanding receivables and payables
                                </Typography>
                                <Button 
                                    variant="contained" 
                                    startIcon={<Download />}
                                    onClick={handleExportOutstanding}
                                    fullWidth
                                >
                                    Download Outstanding CSV
                                </Button>
                            </CardContent>
                        </Card>
                    </Grid>
                </Grid>
            )}
        </Box>
    );
};