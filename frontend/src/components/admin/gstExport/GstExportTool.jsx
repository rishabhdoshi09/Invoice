import { useState, useEffect, useMemo } from 'react';
import {
  Box, Button, Card, CardContent, Typography, Grid, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Checkbox, TextField, Alert, Chip,
  CircularProgress, Paper, Divider, Dialog, DialogTitle, DialogContent,
  DialogActions, IconButton, Tooltip, Collapse, Switch, FormControlLabel,
  Tabs, Tab, TablePagination
} from '@mui/material';
import {
  Download, Refresh, Settings, ExpandMore, ExpandLess,
  CompareArrows, Calculate
} from '@mui/icons-material';
import axios from 'axios';

// Default price rules
const DEFAULT_PRICE_RULES = [
  { id: 1, minPrice: 100, maxPrice: 199, targetPrice: 120, enabled: true },
  { id: 2, minPrice: 200, maxPrice: 299, targetPrice: 220, enabled: true },
  { id: 3, minPrice: 300, maxPrice: 399, targetPrice: 330, enabled: true },
];

const PAGE_SIZE_OPTIONS = [25, 50, 100];
const DEFAULT_PAGE_SIZE = 50;

export const GstExportTool = () => {
  // State
  const [orders, setOrders] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [selectedOrders, setSelectedOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
  const [priceRules, setPriceRules] = useState(DEFAULT_PRICE_RULES);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewOrder, setPreviewOrder] = useState(null);
  const [expandedRows, setExpandedRows] = useState({});
  const [showAdjusted, setShowAdjusted] = useState(true);
  const [activeTab, setActiveTab] = useState(0);
  
  // Pagination state
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(DEFAULT_PAGE_SIZE);

  // Load saved rules from localStorage
  useEffect(() => {
    const savedRules = localStorage.getItem('gstPriceRules');
    if (savedRules) {
      try {
        setPriceRules(JSON.parse(savedRules));
      } catch (e) {
        console.error('Error loading saved rules:', e);
      }
    }
    fetchOrders();
  }, []);

  // Fetch orders when pagination changes
  useEffect(() => {
    fetchOrders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, rowsPerPage]);

  // Save rules to localStorage when changed
  const saveRules = (rules) => {
    setPriceRules(rules);
    localStorage.setItem('gstPriceRules', JSON.stringify(rules));
  };

  // Convert YYYY-MM-DD to DD-MM-YYYY for backend
  const formatDateForApi = (dateStr) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}-${month}-${year}`;
  };

  const fetchOrders = async () => {
    try {
      setLoading(true);
      const params = {
        limit: rowsPerPage,
        offset: page * rowsPerPage,
      };
      
      // Add date range if both dates are provided
      if (dateRange.startDate && dateRange.endDate) {
        params.startDate = formatDateForApi(dateRange.startDate);
        params.endDate = formatDateForApi(dateRange.endDate);
      }
      
      const { data } = await axios.get('/api/orders', { params });
      setOrders(data.data?.rows || []);
      setTotalCount(data.data?.count || 0);
    } catch (error) {
      console.error('Error fetching orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePageChange = (event, newPage) => {
    setPage(newPage);
    setSelectedOrders([]);
  };

  const handleRowsPerPageChange = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
    setSelectedOrders([]);
  };

  const handleRefresh = () => {
    setPage(0);
    fetchOrders();
  };

  // GST Rate constants
  const GST_RATE = 0.05; // 5% total
  const SGST_RATE = 0.025; // 2.5%
  const CGST_RATE = 0.025; // 2.5%

  // Apply price rules to an order item and calculate GST
  const adjustOrderItem = (item) => {
    const price = Number(item.productPrice) || 0;
    const quantity = Number(item.quantity) || 0;
    const totalPrice = Number(item.totalPrice) || 0;

    // Find applicable rule
    const rule = priceRules.find(r => 
      r.enabled && price >= r.minPrice && price <= r.maxPrice
    );

    let finalPrice = price;
    let finalQuantity = quantity;
    let adjusted = false;

    if (rule) {
      finalPrice = rule.targetPrice;
      finalQuantity = Number((totalPrice / rule.targetPrice).toFixed(3));
      adjusted = true;
    }

    // Calculate GST (price is inclusive, so extract base)
    const baseAmount = totalPrice / (1 + GST_RATE);
    const sgstAmount = baseAmount * SGST_RATE;
    const cgstAmount = baseAmount * CGST_RATE;

    return {
      ...item,
      adjusted,
      originalPrice: price,
      originalQuantity: quantity,
      productPrice: finalPrice,
      quantity: finalQuantity,
      baseAmount: baseAmount.toFixed(2),
      sgstAmount: sgstAmount.toFixed(2),
      cgstAmount: cgstAmount.toFixed(2),
    };
  };

  // Apply adjustments to entire order
  const adjustOrder = (order) => {
    if (!order.orderItems || order.orderItems.length === 0) {
      return { ...order, adjusted: false, adjustedItems: [] };
    }

    const adjustedItems = order.orderItems.map(adjustOrderItem);
    const hasAdjustments = adjustedItems.some(item => item.adjusted);

    return {
      ...order,
      adjusted: hasAdjustments,
      adjustedItems,
    };
  };

  // Memoized adjusted orders
  const adjustedOrders = useMemo(() => {
    return orders.map(adjustOrder);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, priceRules]);

  // Toggle row expansion
  const toggleRow = (orderId) => {
    setExpandedRows(prev => ({
      ...prev,
      [orderId]: !prev[orderId]
    }));
  };

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedOrders.length === orders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(orders.map(o => o.id));
    }
  };

  const handleToggleOrder = (orderId) => {
    setSelectedOrders(prev =>
      prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]
    );
  };

  // Add new price rule
  const addPriceRule = () => {
    const newId = Math.max(...priceRules.map(r => r.id), 0) + 1;
    saveRules([...priceRules, { id: newId, minPrice: 0, maxPrice: 99, targetPrice: 50, enabled: true }]);
  };

  // Update price rule
  const updateRule = (id, field, value) => {
    const updated = priceRules.map(rule =>
      rule.id === id ? { ...rule, [field]: field === 'enabled' ? value : Number(value) } : rule
    );
    saveRules(updated);
  };

  // Delete price rule
  const deleteRule = (id) => {
    saveRules(priceRules.filter(rule => rule.id !== id));
  };

  // Export functions - fetch all in batches for full export
  const handleExportExcel = async (useAdjusted = true) => {
    try {
      setExporting(true);
      
      // Fetch all orders in batches
      const batchSize = 500;
      let allOrders = [];
      
      for (let offset = 0; offset < totalCount; offset += batchSize) {
        const params = {
          limit: batchSize,
          offset,
        };
        
        // Add date range if both dates are provided
        if (dateRange.startDate && dateRange.endDate) {
          params.startDate = formatDateForApi(dateRange.startDate);
          params.endDate = formatDateForApi(dateRange.endDate);
        }
        
        const { data } = await axios.get('/api/orders', { params });
        allOrders = [...allOrders, ...(data.data?.rows || [])];
      }

      // Apply adjustments if needed
      const ordersToExport = selectedOrders.length > 0 
        ? allOrders.filter(o => selectedOrders.includes(o.id)).map(adjustOrder)
        : allOrders.map(adjustOrder);

      if (ordersToExport.length === 0) {
        alert('No orders to export');
        return;
      }

      const response = await axios.post('/api/gst-export/excel', {
        orders: ordersToExport,
        useAdjusted,
        priceRules: useAdjusted ? priceRules.filter(r => r.enabled) : []
      }, {
        responseType: 'blob'
      });

      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `GST_Export_${useAdjusted ? 'Adjusted' : 'Original'}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Export error:', error);
      alert('Export failed. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  // Format date for display
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    if (dateString.match(/^\d{2}-\d{2}-\d{4}$/)) {
      return dateString;
    }
    try {
      return new Date(dateString).toLocaleDateString('en-IN');
    } catch {
      return dateString;
    }
  };

  // Calculate stats from current page data
  const stats = useMemo(() => {
    const adjustedCount = adjustedOrders.filter(o => o.adjusted).length;
    const totalValue = adjustedOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const itemsAdjusted = adjustedOrders.reduce((sum, o) => 
      sum + (o.adjustedItems?.filter(i => i.adjusted).length || 0), 0
    );

    return { totalOrders: totalCount, adjustedCount, totalValue, itemsAdjusted };
  }, [adjustedOrders, totalCount]);

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box>
          <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Calculate /> GST Invoice Export Tool
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Adjust product prices for GST compliance while preserving invoice totals
          </Typography>
        </Box>
        <Button
          variant="outlined"
          startIcon={<Settings />}
          onClick={() => setSettingsOpen(true)}
          data-testid="price-rules-settings-btn"
        >
          Price Rules
        </Button>
      </Box>

      {/* Info Alert */}
      <Alert severity="info" sx={{ mb: 3 }}>
        <strong>How it works:</strong> Set price ranges and target prices. Items in those ranges will be adjusted 
        to the target price, with quantity recalculated to maintain the same line total. 
        Original totals are never changed.
      </Alert>

      {/* Stats Cards */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={6} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'primary.light', color: 'white' }}>
            <Typography variant="h4">{stats.totalOrders}</Typography>
            <Typography variant="body2">Total Invoices</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'warning.light' }}>
            <Typography variant="h4">{stats.adjustedCount}</Typography>
            <Typography variant="body2">On This Page (Adjusted)</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'success.light', color: 'white' }}>
            <Typography variant="h4">{stats.itemsAdjusted}</Typography>
            <Typography variant="body2">Items on Page (Adjusted)</Typography>
          </Paper>
        </Grid>
        <Grid item xs={6} md={3}>
          <Paper sx={{ p: 2, textAlign: 'center', bgcolor: 'info.light', color: 'white' }}>
            <Typography variant="h4">₹{stats.totalValue.toLocaleString()}</Typography>
            <Typography variant="body2">Page Value (Unchanged)</Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Active Price Rules Display */}
      <Paper sx={{ p: 2, mb: 3, bgcolor: 'grey.50' }}>
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Active Price Rules:</Typography>
        <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          {priceRules.filter(r => r.enabled).map(rule => (
            <Chip
              key={rule.id}
              label={`₹${rule.minPrice}-${rule.maxPrice} → ₹${rule.targetPrice}`}
              color="primary"
              variant="outlined"
              size="small"
            />
          ))}
          {priceRules.filter(r => r.enabled).length === 0 && (
            <Typography variant="body2" color="text.secondary">No active rules. Click "Price Rules" to configure.</Typography>
          )}
        </Box>
      </Paper>

      {/* Tabs */}
      <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ mb: 2 }}>
        <Tab label="All Invoices" data-testid="all-invoices-tab" />
        <Tab label="Adjusted Only" data-testid="adjusted-only-tab" />
      </Tabs>

      {/* Controls */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <TextField
              label="Start Date"
              type="date"
              size="small"
              value={dateRange.startDate}
              onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              data-testid="start-date-input"
            />
            <TextField
              label="End Date"
              type="date"
              size="small"
              value={dateRange.endDate}
              onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
              InputLabelProps={{ shrink: true }}
              data-testid="end-date-input"
            />
            <Button
              variant="outlined"
              startIcon={loading ? <CircularProgress size={16} /> : <Refresh />}
              onClick={handleRefresh}
              disabled={loading}
              data-testid="refresh-btn"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </Button>

            <FormControlLabel
              control={
                <Switch
                  checked={showAdjusted}
                  onChange={(e) => setShowAdjusted(e.target.checked)}
                />
              }
              label="Show Adjusted Values"
            />

            <Box sx={{ flexGrow: 1 }} />

            <Button
              variant="outlined"
              startIcon={exporting ? <CircularProgress size={16} /> : <Download />}
              onClick={() => handleExportExcel(false)}
              disabled={totalCount === 0 || exporting}
              data-testid="export-original-btn"
            >
              Export Original
            </Button>
            <Button
              variant="contained"
              color="success"
              startIcon={exporting ? <CircularProgress size={16} color="inherit" /> : <Download />}
              onClick={() => handleExportExcel(true)}
              disabled={totalCount === 0 || exporting}
              data-testid="export-adjusted-btn"
            >
              {exporting ? 'Exporting...' : `Export Adjusted (${selectedOrders.length > 0 ? selectedOrders.length : totalCount})`}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Orders Table */}
      <Card>
        <CardContent>
          {loading ? (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
              <CircularProgress />
            </Box>
          ) : adjustedOrders.length === 0 ? (
            <Alert severity="info">No invoices found. Try adjusting the date range.</Alert>
          ) : (
            <Paper variant="outlined">
              <TableContainer sx={{ maxHeight: 500 }}>
                <Table size="small" stickyHeader>
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedOrders.length === orders.length && orders.length > 0}
                          indeterminate={selectedOrders.length > 0 && selectedOrders.length < orders.length}
                          onChange={handleSelectAll}
                          data-testid="select-all-checkbox"
                        />
                      </TableCell>
                      <TableCell width={40}></TableCell>
                      <TableCell>Invoice No</TableCell>
                      <TableCell>Date</TableCell>
                      <TableCell>Customer</TableCell>
                      <TableCell align="right">Items</TableCell>
                      <TableCell align="right">Subtotal</TableCell>
                      <TableCell align="right">Tax</TableCell>
                      <TableCell align="right">Total</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {(activeTab === 1 ? adjustedOrders.filter(o => o.adjusted) : adjustedOrders).map((order) => (
                      <>
                        <TableRow
                          key={order.id}
                          hover
                        >
                          <TableCell padding="checkbox">
                            <Checkbox
                              checked={selectedOrders.includes(order.id)}
                              onChange={() => handleToggleOrder(order.id)}
                              data-testid={`order-checkbox-${order.id}`}
                            />
                          </TableCell>
                          <TableCell>
                            <IconButton
                              size="small"
                              onClick={() => toggleRow(order.id)}
                              data-testid={`expand-row-${order.id}`}
                            >
                              {expandedRows[order.id] ? <ExpandLess /> : <ExpandMore />}
                            </IconButton>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" fontWeight="medium">
                              {order.orderNumber}
                            </Typography>
                          </TableCell>
                          <TableCell>{formatDate(order.orderDate)}</TableCell>
                          <TableCell>{order.customerName || 'Walk-in'}</TableCell>
                          <TableCell align="right">
                            {order.orderItems?.length || 0}
                          </TableCell>
                          <TableCell align="right">₹{Number(order.subTotal || 0).toLocaleString()}</TableCell>
                          <TableCell align="right">₹{Number(order.tax || 0).toLocaleString()}</TableCell>
                          <TableCell align="right">
                            <Typography fontWeight="bold">
                              ₹{Number(order.total || 0).toLocaleString()}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={order.paymentStatus || 'paid'}
                              size="small"
                              color={order.paymentStatus === 'paid' ? 'success' : order.paymentStatus === 'partial' ? 'warning' : 'error'}
                            />
                          </TableCell>
                          <TableCell>
                            <Tooltip title="Compare Original vs Adjusted">
                              <IconButton
                                size="small"
                                onClick={() => setPreviewOrder(order)}
                                data-testid={`preview-btn-${order.id}`}
                              >
                                <CompareArrows />
                              </IconButton>
                            </Tooltip>
                          </TableCell>
                        </TableRow>

                        {/* Expanded Row - Order Items */}
                        <TableRow>
                          <TableCell colSpan={11} sx={{ py: 0, border: 0 }}>
                            <Collapse in={expandedRows[order.id]} timeout="auto" unmountOnExit>
                              <Box sx={{ py: 2, px: 4, bgcolor: 'grey.50' }}>
                                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                  Line Items:
                                </Typography>
                                <Table size="small">
                                  <TableHead>
                                    <TableRow>
                                      <TableCell>Product Name</TableCell>
                                      <TableCell align="right">Product Price</TableCell>
                                      <TableCell align="right">Quantity</TableCell>
                                      <TableCell align="right">Taxable Value</TableCell>
                                      <TableCell align="right">SGST 2.5%</TableCell>
                                      <TableCell align="right">CGST 2.5%</TableCell>
                                      <TableCell align="right">Amount</TableCell>
                                    </TableRow>
                                  </TableHead>
                                  <TableBody>
                                    {(showAdjusted ? (order.adjustedItems || order.orderItems || []) : (order.orderItems || [])).map((item, idx) => (
                                      <TableRow key={idx}>
                                        <TableCell>{item.name}</TableCell>
                                        <TableCell align="right">₹{item.productPrice}</TableCell>
                                        <TableCell align="right">{Number(item.quantity).toFixed(3)}</TableCell>
                                        <TableCell align="right">₹{item.baseAmount || (Number(item.totalPrice) / 1.05).toFixed(2)}</TableCell>
                                        <TableCell align="right">₹{item.sgstAmount || (Number(item.totalPrice) / 1.05 * 0.025).toFixed(2)}</TableCell>
                                        <TableCell align="right">₹{item.cgstAmount || (Number(item.totalPrice) / 1.05 * 0.025).toFixed(2)}</TableCell>
                                        <TableCell align="right">₹{Number(item.totalPrice || 0).toFixed(2)}</TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </Box>
                            </Collapse>
                          </TableCell>
                        </TableRow>
                      </>
                    ))}
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

      {/* Price Rules Settings Dialog */}
      <Dialog open={settingsOpen} onClose={() => setSettingsOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Settings /> Price Adjustment Rules
          </Box>
        </DialogTitle>
        <DialogContent>
          <Alert severity="info" sx={{ mb: 2 }}>
            Define price ranges and their target prices. Items falling within a range will be adjusted 
            to the target price, with quantity recalculated to maintain the same total.
          </Alert>

          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Enabled</TableCell>
                <TableCell>Min Price (₹)</TableCell>
                <TableCell>Max Price (₹)</TableCell>
                <TableCell>Target Price (₹)</TableCell>
                <TableCell>Example</TableCell>
                <TableCell>Action</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {priceRules.map((rule) => {
                const exampleOrigPrice = Math.floor((rule.minPrice + rule.maxPrice) / 2);
                const exampleQty = 0.5;
                const exampleTotal = exampleOrigPrice * exampleQty;
                const exampleNewQty = (exampleTotal / rule.targetPrice).toFixed(3);

                return (
                  <TableRow key={rule.id}>
                    <TableCell>
                      <Switch
                        checked={rule.enabled}
                        onChange={(e) => updateRule(rule.id, 'enabled', e.target.checked)}
                        data-testid={`rule-enabled-${rule.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        type="number"
                        size="small"
                        value={rule.minPrice}
                        onChange={(e) => updateRule(rule.id, 'minPrice', e.target.value)}
                        sx={{ width: 100 }}
                        data-testid={`rule-min-${rule.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        type="number"
                        size="small"
                        value={rule.maxPrice}
                        onChange={(e) => updateRule(rule.id, 'maxPrice', e.target.value)}
                        sx={{ width: 100 }}
                        data-testid={`rule-max-${rule.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <TextField
                        type="number"
                        size="small"
                        value={rule.targetPrice}
                        onChange={(e) => updateRule(rule.id, 'targetPrice', e.target.value)}
                        sx={{ width: 100 }}
                        data-testid={`rule-target-${rule.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="caption" color="text.secondary">
                        ₹{exampleOrigPrice} × {exampleQty}kg = ₹{exampleTotal}
                        <br />
                        → ₹{rule.targetPrice} × {exampleNewQty}kg = ₹{exampleTotal}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        color="error"
                        onClick={() => deleteRule(rule.id)}
                        data-testid={`rule-delete-${rule.id}`}
                      >
                        Delete
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          <Button
            variant="outlined"
            onClick={addPriceRule}
            sx={{ mt: 2 }}
            data-testid="add-rule-btn"
          >
            + Add New Rule
          </Button>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSettingsOpen(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewOrder} onClose={() => setPreviewOrder(null)} maxWidth="lg" fullWidth>
        <DialogTitle>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <CompareArrows /> Invoice Comparison: {previewOrder?.orderNumber}
          </Box>
        </DialogTitle>
        <DialogContent>
          {previewOrder && (
            <Grid container spacing={3}>
              {/* Original */}
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 2, border: '2px solid', borderColor: 'grey.300' }}>
                  <Typography variant="h6" sx={{ mb: 2, color: 'grey.700' }}>
                    📄 Original Invoice
                  </Typography>
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2"><strong>Invoice:</strong> {previewOrder.orderNumber}</Typography>
                    <Typography variant="body2"><strong>Date:</strong> {formatDate(previewOrder.orderDate)}</Typography>
                    <Typography variant="body2"><strong>Customer:</strong> {previewOrder.customerName || 'Walk-in'}</Typography>
                  </Box>
                  <Divider sx={{ my: 1 }} />
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Item</TableCell>
                        <TableCell align="right">Price</TableCell>
                        <TableCell align="right">Qty</TableCell>
                        <TableCell align="right">Total</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(previewOrder.orderItems || []).map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{item.name}</TableCell>
                          <TableCell align="right">₹{item.productPrice}</TableCell>
                          <TableCell align="right">{Number(item.quantity).toFixed(3)}</TableCell>
                          <TableCell align="right">₹{Number(item.totalPrice).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Divider sx={{ my: 1 }} />
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="body2">Subtotal: ₹{previewOrder.subTotal}</Typography>
                    <Typography variant="body2">Tax: ₹{previewOrder.tax}</Typography>
                    <Typography variant="h6">Total: ₹{previewOrder.total}</Typography>
                  </Box>
                </Paper>
              </Grid>

              {/* Adjusted */}
              <Grid item xs={12} md={6}>
                <Paper sx={{ p: 2, border: '2px solid', borderColor: 'primary.main' }}>
                  <Typography variant="h6" sx={{ mb: 2, color: 'primary.dark' }}>
                    Adjusted Invoice (For GST Filing)
                  </Typography>
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="body2"><strong>Invoice:</strong> {previewOrder.orderNumber}</Typography>
                    <Typography variant="body2"><strong>Date:</strong> {formatDate(previewOrder.orderDate)}</Typography>
                    <Typography variant="body2"><strong>Customer:</strong> {previewOrder.customerName || 'Walk-in'}</Typography>
                  </Box>
                  <Divider sx={{ my: 1 }} />
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Product Name</TableCell>
                        <TableCell align="right">Product Price</TableCell>
                        <TableCell align="right">Quantity</TableCell>
                        <TableCell align="right">Amount</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {(previewOrder.adjustedItems || []).map((item, idx) => (
                        <TableRow key={idx}>
                          <TableCell>{item.name}</TableCell>
                          <TableCell align="right">₹{item.productPrice}</TableCell>
                          <TableCell align="right">{Number(item.quantity).toFixed(3)}</TableCell>
                          <TableCell align="right">₹{Number(item.totalPrice).toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <Divider sx={{ my: 1 }} />
                  <Box sx={{ textAlign: 'right' }}>
                    <Typography variant="body2">Subtotal: ₹{previewOrder.subTotal}</Typography>
                    <Typography variant="body2">Tax: ₹{previewOrder.tax}</Typography>
                    <Typography variant="h6">Total: ₹{previewOrder.total}</Typography>
                  </Box>
                </Paper>
              </Grid>
            </Grid>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewOrder(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};
