import { useState, useEffect } from 'react';
import { 
    Box, Button, Card, CardContent, Typography, Grid, Table, TableBody, 
    TableCell, TableContainer, TableHead, TableRow, Checkbox, Tabs, Tab, 
    TextField, Alert, Chip, CircularProgress, TablePagination, Paper
} from '@mui/material';
import { Download, Refresh, CheckCircle, Receipt } from '@mui/icons-material';
import axios from 'axios';
import { listPurchases } from '../../../services/purchase';

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 50;

export const TallyExport = () => {
    const [activeTab, setActiveTab] = useState(0);
    const [salesOrders, setSalesOrders] = useState([]);
    const [purchases, setPurchases] = useState([]);
    const [selectedSales, setSelectedSales] = useState([]);
    const [selectedPurchases, setSelectedPurchases] = useState([]);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
    const [totalSalesCount, setTotalSalesCount] = useState(0);
    const [totalPurchasesCount, setTotalPurchasesCount] = useState(0);
    
    // Pagination state
    const [salesPage, setSalesPage] = useState(0);
    const [salesRowsPerPage, setSalesRowsPerPage] = useState(DEFAULT_PAGE_SIZE);
    const [purchasesPage, setPurchasesPage] = useState(0);
    const [purchasesRowsPerPage, setPurchasesRowsPerPage] = useState(DEFAULT_PAGE_SIZE);

    useEffect(() => {
        if (activeTab === 0) {
            fetchSalesOrders();
        } else if (activeTab === 1) {
            fetchPurchases();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab, salesPage, salesRowsPerPage, purchasesPage, purchasesRowsPerPage]);

    const fetchSalesOrders = async () => {
        try {
            setLoading(true);
            const params = {
                limit: salesRowsPerPage,
                offset: salesPage * salesRowsPerPage,
                ...(dateRange.startDate && dateRange.endDate ? dateRange : {})
            };
            const { data } = await axios.get('/api/orders', { params });
            setSalesOrders(data.data?.rows || []);
            setTotalSalesCount(data.data?.count || 0);
        } catch (error) {
            console.error('Error fetching sales orders:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchPurchases = async () => {
        try {
            setLoading(true);
            const params = {
                limit: purchasesRowsPerPage,
                offset: purchasesPage * purchasesRowsPerPage,
                ...(dateRange.startDate && dateRange.endDate ? dateRange : {})
            };
            const { rows, count } = await listPurchases(params);
            setPurchases(rows || []);
            setTotalPurchasesCount(count || 0);
        } catch (error) {
            console.error('Error fetching purchases:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleSalesPageChange = (event, newPage) => {
        setSalesPage(newPage);
        setSelectedSales([]); // Clear selection on page change
    };

    const handleSalesRowsPerPageChange = (event) => {
        setSalesRowsPerPage(parseInt(event.target.value, 10));
        setSalesPage(0);
        setSelectedSales([]);
    };

    const handlePurchasesPageChange = (event, newPage) => {
        setPurchasesPage(newPage);
        setSelectedPurchases([]);
    };

    const handlePurchasesRowsPerPageChange = (event) => {
        setPurchasesRowsPerPage(parseInt(event.target.value, 10));
        setPurchasesPage(0);
        setSelectedPurchases([]);
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

    // Export ALL records by fetching in batches (for full export)
    const handleExportAll = async (type) => {
        if (type === 'sales' && totalSalesCount === 0) {
            alert('No items to export');
            return;
        }
        if (type === 'purchases' && totalPurchasesCount === 0) {
            alert('No items to export');
            return;
        }

        try {
            setExporting(true);
            
            // Fetch all IDs in batches for export
            const totalCount = type === 'sales' ? totalSalesCount : totalPurchasesCount;
            const batchSize = 500;
            let allIds = [];
            
            for (let offset = 0; offset < totalCount; offset += batchSize) {
                const params = {
                    limit: batchSize,
                    offset,
                    ...(dateRange.startDate && dateRange.endDate ? dateRange : {})
                };
                
                if (type === 'sales') {
                    const { data } = await axios.get('/api/orders', { params });
                    allIds = [...allIds, ...(data.data?.rows || []).map(o => o.id)];
                } else {
                    const { rows } = await listPurchases(params);
                    allIds = [...allIds, ...(rows || []).map(p => p.id)];
                }
            }

            const response = await axios.post(`/api/export/tally/${type}`, 
                { ids: allIds },
                { 
                    responseType: 'blob',
                    headers: { 'Content-Type': 'application/json' }
                }
            );

            const blob = new Blob([response.data], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = type === 'sales' 
                ? `GSTR1_Sales_${new Date().toISOString().split('T')[0]}.csv`
                : `tally_${type}_ALL_${new Date().toISOString().split('T')[0]}.csv`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error exporting:', error);
            alert('Error exporting data. Please try again.');
        } finally {
            setExporting(false);
        }
    };

    const handleExportSelected = async (type) => {
        const ids = type === 'sales' ? selectedSales : selectedPurchases;
        
        if (ids.length === 0) {
            alert('Please select at least one item to export');
            return;
        }

        try {
            setExporting(true);
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
            link.download = type === 'sales'
                ? `GSTR1_Sales_Selected_${new Date().toISOString().split('T')[0]}.csv`
                : `tally_${type}_export_${new Date().toISOString().split('T')[0]}.csv`;
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
        } finally {
            setExporting(false);
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

    const handleRefresh = () => {
        if (activeTab === 0) {
            setSalesPage(0);
            fetchSalesOrders();
        } else if (activeTab === 1) {
            setPurchasesPage(0);
            fetchPurchases();
        }
    };

    // Helper to get invoice type
    const getInvoiceType = (gstin) => {
        if (gstin && gstin.trim() && gstin.trim().toUpperCase() !== 'URP') {
            return 'B2B';
        }
        return 'B2C';
    };

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h5" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                <Receipt /> GST Export (GSTR-1 Compliant)
            </Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                Export invoices in GSTR-1 format for GST filing
            </Typography>
            <Alert severity="info" sx={{ mb: 3 }}>
                <strong>Export Fields:</strong> Invoice Number, Invoice Date, Buyer GSTIN/URP, Place of Supply, HSN (7323), Taxable Value, CGST/SGST/IGST, Invoice Type (B2B/B2C)
            </Alert>

            <Tabs value={activeTab} onChange={(e, newValue) => setActiveTab(newValue)} sx={{ mb: 3 }}>
                <Tab label={`Sales Invoices ${totalSalesCount > 0 ? `(${totalSalesCount})` : ''}`} />
                <Tab label={`Purchases ${totalPurchasesCount > 0 ? `(${totalPurchasesCount})` : ''}`} />
                <Tab label="Payments & Outstanding" />
            </Tabs>

            {activeTab === 0 && (
                <Card>
                    <CardContent>
                        <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
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
                            <Button 
                                startIcon={loading ? <CircularProgress size={16} /> : <Refresh />} 
                                onClick={handleRefresh} 
                                variant="outlined" 
                                disabled={loading}
                            >
                                {loading ? 'Loading...' : 'Refresh'}
                            </Button>
                            <Box sx={{ flexGrow: 1 }} />
                            <Button 
                                variant="contained" 
                                color="success"
                                startIcon={exporting ? <CircularProgress size={16} color="inherit" /> : <Download />}
                                onClick={() => handleExportAll('sales')}
                                disabled={totalSalesCount === 0 || exporting}
                            >
                                {exporting ? 'Exporting...' : `Export ALL (${totalSalesCount})`}
                            </Button>
                            <Button 
                                variant="outlined" 
                                startIcon={<Download />}
                                onClick={() => handleExportSelected('sales')}
                                disabled={selectedSales.length === 0 || exporting}
                            >
                                Export Selected ({selectedSales.length})
                            </Button>
                        </Box>

                        {loading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                                <CircularProgress />
                            </Box>
                        ) : salesOrders.length === 0 ? (
                            <Alert severity="info">No sales invoices found</Alert>
                        ) : (
                            <Paper variant="outlined">
                                <TableContainer sx={{ maxHeight: 500 }}>
                                    <Table size="small" stickyHeader>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell padding="checkbox">
                                                    <Checkbox
                                                        checked={selectedSales.length === salesOrders.length && salesOrders.length > 0}
                                                        indeterminate={selectedSales.length > 0 && selectedSales.length < salesOrders.length}
                                                        onChange={() => handleSelectAll('sales')}
                                                    />
                                                </TableCell>
                                                <TableCell>Invoice No</TableCell>
                                                <TableCell>Date</TableCell>
                                                <TableCell>Buyer Name</TableCell>
                                                <TableCell>GSTIN/URP</TableCell>
                                                <TableCell>Place of Supply</TableCell>
                                                <TableCell align="right">Taxable Value</TableCell>
                                                <TableCell align="right">Tax</TableCell>
                                                <TableCell align="right">Total</TableCell>
                                                <TableCell>Type</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {salesOrders.map((order) => (
                                                <TableRow key={order.id} hover>
                                                    <TableCell padding="checkbox">
                                                        <Checkbox
                                                            checked={selectedSales.includes(order.id)}
                                                            onChange={() => handleToggleItem(order.id, 'sales')}
                                                        />
                                                    </TableCell>
                                                    <TableCell>{order.orderNumber}</TableCell>
                                                    <TableCell>{order.orderDate}</TableCell>
                                                    <TableCell>{order.customerName || 'N/A'}</TableCell>
                                                    <TableCell>{order.customerGstin || 'URP'}</TableCell>
                                                    <TableCell>{order.placeOfSupply || '27-MH'}</TableCell>
                                                    <TableCell align="right">₹{order.subTotal}</TableCell>
                                                    <TableCell align="right">₹{order.tax} ({order.taxPercent}%)</TableCell>
                                                    <TableCell align="right">₹{order.total}</TableCell>
                                                    <TableCell>
                                                        <Chip 
                                                            label={getInvoiceType(order.customerGstin)} 
                                                            size="small" 
                                                            color={getInvoiceType(order.customerGstin) === 'B2B' ? 'primary' : 'default'}
                                                        />
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                                <TablePagination
                                    component="div"
                                    count={totalSalesCount}
                                    page={salesPage}
                                    onPageChange={handleSalesPageChange}
                                    rowsPerPage={salesRowsPerPage}
                                    onRowsPerPageChange={handleSalesRowsPerPageChange}
                                    rowsPerPageOptions={PAGE_SIZE_OPTIONS}
                                    showFirstButton
                                    showLastButton
                                />
                            </Paper>
                        )}
                    </CardContent>
                </Card>
            )}

            {activeTab === 1 && (
                <Card>
                    <CardContent>
                        <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
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
                            <Button 
                                startIcon={loading ? <CircularProgress size={16} /> : <Refresh />} 
                                onClick={handleRefresh} 
                                variant="outlined" 
                                disabled={loading}
                            >
                                {loading ? 'Loading...' : 'Refresh'}
                            </Button>
                            <Box sx={{ flexGrow: 1 }} />
                            <Button 
                                variant="contained" 
                                color="success"
                                startIcon={exporting ? <CircularProgress size={16} color="inherit" /> : <Download />}
                                onClick={() => handleExportAll('purchases')}
                                disabled={totalPurchasesCount === 0 || exporting}
                            >
                                {exporting ? 'Exporting...' : `Export ALL (${totalPurchasesCount})`}
                            </Button>
                            <Button 
                                variant="outlined" 
                                startIcon={<Download />}
                                onClick={() => handleExportSelected('purchases')}
                                disabled={selectedPurchases.length === 0 || exporting}
                            >
                                Export Selected ({selectedPurchases.length})
                            </Button>
                        </Box>

                        {loading ? (
                            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                                <CircularProgress />
                            </Box>
                        ) : purchases.length === 0 ? (
                            <Alert severity="info">No purchase bills found</Alert>
                        ) : (
                            <Paper variant="outlined">
                                <TableContainer sx={{ maxHeight: 500 }}>
                                    <Table size="small" stickyHeader>
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
                                                <TableRow key={purchase.id} hover>
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
                                <TablePagination
                                    component="div"
                                    count={totalPurchasesCount}
                                    page={purchasesPage}
                                    onPageChange={handlePurchasesPageChange}
                                    rowsPerPage={purchasesRowsPerPage}
                                    onRowsPerPageChange={handlePurchasesRowsPerPageChange}
                                    rowsPerPageOptions={PAGE_SIZE_OPTIONS}
                                    showFirstButton
                                    showLastButton
                                />
                            </Paper>
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
