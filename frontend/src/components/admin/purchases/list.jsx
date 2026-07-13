import { useEffect, useState, useRef } from 'react';
import {
    Box, Button, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Typography, TextField, Chip,
    IconButton, Collapse, Paper, Grid, TablePagination, Alert,
    FormControlLabel, Switch, Autocomplete, CircularProgress
} from '@mui/material';
import { Delete, Download, Receipt, Add, Save, Refresh, CheckCircle, KeyboardArrowDown, KeyboardArrowUp } from '@mui/icons-material';
import { listPurchases, deletePurchase } from '../../../services/tally';
import { listSuppliers } from '../../../services/supplier';
import moment from 'moment';
import axios from 'axios';

const PAGE_SIZE_OPTIONS = [25, 50, 100];

export const ListPurchases = () => {
    const [purchases, setPurchases] = useState([]);
    const [totalCount, setTotalCount] = useState(0);
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [expandedRows, setExpandedRows] = useState({});
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(50);
    const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
    
    // Quick Entry State
    const [selectedSupplier, setSelectedSupplier] = useState(null);
    const [billNumber, setBillNumber] = useState('');
    const [billDate, setBillDate] = useState(moment().format('YYYY-MM-DD'));
    const [isPaid, setIsPaid] = useState(false);
    // 'white' | 'grey' → whole total on that side; 'split' → manual amounts below
    const [billType, setBillType] = useState('white');
    const [greySplitInput, setGreySplitInput] = useState('');
    const [whiteSplitInput, setWhiteSplitInput] = useState('');
    const [notes, setNotes] = useState('');
    const [items, setItems] = useState([{ name: '', quantity: '', price: '', totalPrice: 0 }]);
    const [saving, setSaving] = useState(false);
    const [successMessage, setSuccessMessage] = useState('');
    const [billTypeTotals, setBillTypeTotals] = useState({ white: 0, grey: 0 });
    
    // Refs
    const supplierRef = useRef(null);

    // Convert YYYY-MM-DD to DD-MM-YYYY for backend
    const formatDateForApi = (dateStr) => {
        if (!dateStr) return '';
        const [year, month, day] = dateStr.split('-');
        return `${day}-${month}-${year}`;
    };

    const fetchPurchases = async () => {
        try {
            setLoading(true);
            const params = {
                limit: rowsPerPage,
                offset: page * rowsPerPage
            };
            
            if (dateRange.startDate && dateRange.endDate) {
                params.startDate = formatDateForApi(dateRange.startDate);
                params.endDate = formatDateForApi(dateRange.endDate);
            }
            
            const { rows, count } = await listPurchases(params);
            setPurchases(rows || []);
            setTotalCount(count || 0);

            // Grey/White totals across ALL matching purchases (not just the current page).
            // Uses the per-bill amount split; falls back to the legacy billType flag
            // for old rows where both amounts are 0.
            const { rows: allRows } = await listPurchases({ ...params, limit: 10000, offset: 0 });
            const totals = (allRows || []).reduce((acc, p) => {
                const grey = Number(p.greyAmount) || 0;
                const white = Number(p.whiteAmount) || 0;
                if (grey > 0 || white > 0) {
                    acc.grey += grey;
                    acc.white += white;
                } else if (p.billType === 'grey') {
                    acc.grey += Number(p.total) || 0;
                } else {
                    acc.white += Number(p.total) || 0;
                }
                return acc;
            }, { white: 0, grey: 0 });
            setBillTypeTotals(totals);
        } catch (error) {
            console.error('Error fetching purchases:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchSuppliers = async () => {
        try {
            const { rows } = await listSuppliers({});
            setSuppliers(rows || []);
        } catch (error) {
            console.error('Error fetching suppliers:', error);
        }
    };

    useEffect(() => {
        fetchPurchases();
        fetchSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, rowsPerPage]);

    const handlePageChange = (event, newPage) => {
        setPage(newPage);
    };

    const handleRowsPerPageChange = (event) => {
        setRowsPerPage(parseInt(event.target.value, 10));
        setPage(0);
    };

    const handleRefresh = () => {
        setPage(0);
        fetchPurchases();
        fetchSuppliers();
    };

    const toggleRow = (id) => {
        setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
    };

    // Quick Entry Functions
    const updateItemTotal = (index, field, value) => {
        const newItems = [...items];
        newItems[index][field] = value;
        
        const qty = parseFloat(newItems[index].quantity) || 0;
        const price = parseFloat(newItems[index].price) || 0;
        newItems[index].totalPrice = qty * price;
        
        setItems(newItems);
    };

    const addItemRow = () => {
        setItems([...items, { name: '', quantity: '', price: '', totalPrice: 0 }]);
    };

    const removeItemRow = (index) => {
        if (items.length > 1) {
            setItems(items.filter((_, i) => i !== index));
        }
    };

    const subTotal = items.reduce((sum, item) => sum + (item.totalPrice || 0), 0);
    const grandTotal = subTotal;

    const handleKeyDown = (e, index) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (index === items.length - 1 && items[index].name && items[index].quantity && items[index].price) {
                addItemRow();
                setTimeout(() => {
                    const newRowInputs = document.querySelectorAll(`[data-row-index="${items.length}"] input`);
                    if (newRowInputs[0]) newRowInputs[0].focus();
                }, 100);
            }
        }
    };

    const resetForm = () => {
        setSelectedSupplier(null);
        setBillNumber('');
        setBillDate(moment().format('YYYY-MM-DD'));
        setIsPaid(false);
        setBillType('white');
        setGreySplitInput('');
        setWhiteSplitInput('');
        setNotes('');
        setItems([{ name: '', quantity: '', price: '', totalPrice: 0 }]);
    };

    const handleQuickSave = async () => {
        if (!selectedSupplier) {
            alert('Please select a supplier');
            return;
        }
        
        const validItems = items.filter(item => item.name && item.quantity && item.price);
        if (validItems.length === 0) {
            alert('Please add at least one item with name, quantity and price');
            return;
        }

        // Resolve the grey/white amount split from the selected mode
        let greyAmount = 0, whiteAmount = 0;
        if (billType === 'split') {
            greyAmount = parseFloat(greySplitInput) || 0;
            whiteAmount = parseFloat(whiteSplitInput) || 0;
            if (Math.abs(greyAmount + whiteAmount - grandTotal) > 0.02) {
                alert(`Grey (₹${greyAmount}) + White (₹${whiteAmount}) must equal the bill total (₹${grandTotal.toLocaleString('en-IN')}).`);
                return;
            }
        } else if (billType === 'grey') {
            greyAmount = grandTotal;
        } else {
            whiteAmount = grandTotal;
        }

        setSaving(true);
        try {
            const token = localStorage.getItem('token');
            const purchaseData = {
                supplierId: selectedSupplier.id,
                billNumber: billNumber,
                billDate: formatDateForApi(billDate),
                paymentStatus: isPaid ? 'paid' : 'unpaid',
                paidAmount: isPaid ? grandTotal : 0,
                subTotal: subTotal,
                tax: 0,
                taxPercent: 0,
                total: grandTotal,
                billType: greyAmount > whiteAmount ? 'grey' : 'white',
                greyAmount,
                whiteAmount,
                notes: notes.trim() || null,
                purchaseItems: validItems.map(item => ({
                    name: item.name,
                    quantity: parseFloat(item.quantity),
                    price: parseFloat(item.price),
                    totalPrice: item.totalPrice
                }))
            };

            await axios.post('/api/purchases', purchaseData, {
                headers: { Authorization: `Bearer ${token}` }
            });

            setSuccessMessage(`✓ Saved: ${selectedSupplier.name} - ₹${grandTotal.toLocaleString('en-IN')}`);
            setTimeout(() => setSuccessMessage(''), 4000);
            
            resetForm();
            fetchPurchases();
            fetchSuppliers();
            
            if (supplierRef.current) {
                supplierRef.current.focus();
            }
        } catch (error) {
            console.error('Error saving purchase:', error);
            alert('Error: ' + (error.response?.data?.message || error.message));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (purchaseId) => {
        if (window.confirm('Delete this purchase bill?')) {
            try {
                await deletePurchase(purchaseId);
                fetchPurchases();
                fetchSuppliers();
            } catch (error) {
                console.error('Error deleting purchase:', error);
                alert('Error deleting: ' + (error.response?.data?.message || error.message));
            }
        }
    };

    const formatDateForExport = (dateStr) => {
        if (!dateStr) return '-';
        if (dateStr.match && dateStr.match(/^\d{2}-\d{2}-\d{4}$/)) {
            return dateStr;
        }
        const parsed = moment(dateStr);
        return parsed.isValid() ? parsed.format('DD-MM-YYYY') : dateStr;
    };

    const handleExportForCA = async () => {
        try {
            const params = {};
            if (dateRange.startDate && dateRange.endDate) {
                params.startDate = formatDateForApi(dateRange.startDate);
                params.endDate = formatDateForApi(dateRange.endDate);
            }
            
            const { rows } = await listPurchases({ ...params, limit: 10000, offset: 0 });
            
            const headers = ['Bill Date', 'Bill Number', 'Supplier', 'GSTIN', 'Sub Total', 'Tax', 'Total', 'Payment Status', 'Items'];
            const csvRows = [headers.join(',')];
            
            rows.forEach(p => {
                const itemsList = (p.purchaseItems || []).map(item => 
                    `${item.name}(${item.quantity}x${item.price})`
                ).join('; ');
                
                const row = [
                    formatDateForExport(p.billDate),
                    p.billNumber || '',
                    `"${(p.supplier?.name || '').replace(/"/g, '""')}"`,
                    p.supplier?.gstin || '',
                    p.subTotal || 0,
                    p.tax || 0,
                    p.total || 0,
                    p.paymentStatus || '',
                    `"${itemsList.replace(/"/g, '""')}"`
                ];
                csvRows.push(row.join(','));
            });
            
            const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `purchases_${moment().format('YYYY-MM-DD')}.csv`;
            a.click();
        } catch (error) {
            console.error('Export error:', error);
            alert('Error exporting data');
        }
    };

    return (
        <Box sx={{ p: 2, bgcolor: '#f5f5f5', minHeight: '100vh' }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h5" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Receipt color="primary" /> Purchase Bills
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button size="small" startIcon={<Refresh />} onClick={handleRefresh}>Refresh</Button>
                    <Button size="small" variant="outlined" startIcon={<Download />} onClick={handleExportForCA}>Export CSV</Button>
                </Box>
            </Box>

            {/* Success Message */}
            {successMessage && (
                <Alert severity="success" icon={<CheckCircle />} sx={{ mb: 2, py: 0.5 }}>
                    {successMessage}
                </Alert>
            )}

            {/* Quick Entry Form - Always Visible */}
            <Paper sx={{ p: 2, mb: 2, borderLeft: '4px solid #1976d2' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                    <Typography variant="subtitle1" sx={{ color: '#1976d2', fontWeight: 600 }}>
                        ⚡ Quick Entry
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                        {/* Grey / White / Split — whole bill on one side, or a manual amount split */}
                        <Box sx={{ display: 'flex', border: '1px solid #e0e0e0', borderRadius: 1, overflow: 'hidden', height: 34 }}>
                            <Button size="small" onClick={() => setBillType('grey')}
                                sx={{ borderRadius: 0, px: 1.5, minWidth: 0, textTransform: 'none', fontSize: '0.8rem', fontWeight: billType === 'grey' ? 700 : 400,
                                    bgcolor: billType === 'grey' ? '#f3e5f5' : 'transparent', color: billType === 'grey' ? '#6a1b9a' : '#999', borderRight: '1px solid #e0e0e0' }}>
                                ⚫ Grey
                            </Button>
                            <Button size="small" onClick={() => setBillType('white')}
                                sx={{ borderRadius: 0, px: 1.5, minWidth: 0, textTransform: 'none', fontSize: '0.8rem', fontWeight: billType === 'white' ? 700 : 400,
                                    bgcolor: billType === 'white' ? '#e3f2fd' : 'transparent', color: billType === 'white' ? '#1565c0' : '#999', borderRight: '1px solid #e0e0e0' }}>
                                ⚪ White
                            </Button>
                            <Button size="small"
                                onClick={() => {
                                    setBillType('split');
                                    // Sensible starting point: whole total on white, edit from there
                                    if (!greySplitInput && !whiteSplitInput) setWhiteSplitInput(grandTotal ? String(grandTotal) : '');
                                }}
                                sx={{ borderRadius: 0, px: 1.5, minWidth: 0, textTransform: 'none', fontSize: '0.8rem', fontWeight: billType === 'split' ? 700 : 400,
                                    bgcolor: billType === 'split' ? '#fff3e0' : 'transparent', color: billType === 'split' ? '#e65100' : '#999' }}>
                                ⚖ Split
                            </Button>
                        </Box>
                        {billType === 'split' && (() => {
                            const g = parseFloat(greySplitInput) || 0;
                            const w = parseFloat(whiteSplitInput) || 0;
                            const diff = Math.round((grandTotal - g - w) * 100) / 100;
                            const matches = Math.abs(diff) <= 0.02;
                            return (
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                    <TextField size="small" label="⚫ Grey ₹" type="number" value={greySplitInput}
                                        onChange={e => setGreySplitInput(e.target.value)} sx={{ width: 110 }}
                                        inputProps={{ min: 0, step: '0.01' }} />
                                    <TextField size="small" label="⚪ White ₹" type="number" value={whiteSplitInput}
                                        onChange={e => setWhiteSplitInput(e.target.value)} sx={{ width: 110 }}
                                        inputProps={{ min: 0, step: '0.01' }} />
                                    <Typography variant="caption" sx={{ fontWeight: 700, color: matches ? 'success.main' : 'error.main', whiteSpace: 'nowrap' }}>
                                        {matches
                                            ? `✓ = ₹${grandTotal.toLocaleString('en-IN')}`
                                            : diff > 0
                                                ? `₹${diff.toLocaleString('en-IN')} left`
                                                : `₹${Math.abs(diff).toLocaleString('en-IN')} over`}
                                    </Typography>
                                </Box>
                            );
                        })()}
                        <TextField size="small" label="Notes" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional" sx={{ width: 160 }} />
                        <FormControlLabel
                            control={<Switch checked={isPaid} onChange={(e) => setIsPaid(e.target.checked)} size="small" />}
                            label={isPaid ? "Paid" : "Credit (Unpaid)"}
                            sx={{ mr: 0 }}
                        />
                    </Box>
                </Box>
                
                {/* Header Fields */}
                <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
                    <Grid item xs={12} sm={4}>
                        <Autocomplete
                            size="small"
                            options={suppliers}
                            getOptionLabel={(opt) => opt.name || ''}
                            value={selectedSupplier}
                            onChange={(e, val) => setSelectedSupplier(val)}
                            renderInput={(params) => (
                                <TextField {...params} label="Supplier *" placeholder="Search..." inputRef={supplierRef} />
                            )}
                            renderOption={(props, option) => (
                                <li {...props}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                        <span>{option.name}</span>
                                        {option.balance > 0 && (
                                            <Chip label={`Due: ₹${option.balance?.toLocaleString('en-IN')}`} size="small" color="error" sx={{ ml: 1, height: 20, fontSize: '0.7rem' }} />
                                        )}
                                    </Box>
                                </li>
                            )}
                        />
                    </Grid>
                    <Grid item xs={6} sm={2.5}>
                        <TextField
                            fullWidth
                            size="small"
                            label="Bill No"
                            value={billNumber}
                            onChange={(e) => setBillNumber(e.target.value)}
                            placeholder="Auto"
                        />
                    </Grid>
                    <Grid item xs={6} sm={2.5}>
                        <TextField
                            fullWidth
                            size="small"
                            type="date"
                            label="Date"
                            value={billDate}
                            onChange={(e) => setBillDate(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                        />
                    </Grid>
                    <Grid item xs={12} sm={5}>
                        <TextField
                            fullWidth
                            size="small"
                            label="Notes"
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            placeholder="Optional — e.g. transport charges, reference"
                        />
                    </Grid>
                    <Grid item xs={6} sm={1.5}>
                        <Box sx={{ bgcolor: isPaid ? '#e8f5e9' : '#fff3e0', p: 1, borderRadius: 1, textAlign: 'center', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1 }}>Total</Typography>
                            <Typography variant="body1" sx={{ fontWeight: 700, color: isPaid ? 'success.main' : 'warning.dark' }}>
                                ₹{grandTotal.toLocaleString('en-IN')}
                            </Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={6} sm={1.5}>
                        <Button 
                            fullWidth
                            variant="contained" 
                            color="primary" 
                            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <Save />}
                            onClick={handleQuickSave}
                            disabled={saving || !selectedSupplier}
                            sx={{ height: '100%' }}
                        >
                            {saving ? '...' : 'Save'}
                        </Button>
                    </Grid>
                </Grid>

                {/* Items Table */}
                <TableContainer sx={{ bgcolor: 'white', borderRadius: 1, maxHeight: 200 }}>
                    <Table size="small" stickyHeader>
                        <TableHead>
                            <TableRow sx={{ '& th': { bgcolor: '#e8e8e8', py: 0.5 } }}>
                                <TableCell sx={{ width: 30 }}>#</TableCell>
                                <TableCell><strong>Item Name</strong></TableCell>
                                <TableCell sx={{ width: 80 }} align="right"><strong>Qty</strong></TableCell>
                                <TableCell sx={{ width: 100 }} align="right"><strong>Price</strong></TableCell>
                                <TableCell sx={{ width: 100 }} align="right"><strong>Total</strong></TableCell>
                                <TableCell sx={{ width: 40 }}></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {items.map((item, index) => (
                                <TableRow key={index} data-row-index={index} sx={{ '& td': { py: 0.3 } }}>
                                    <TableCell sx={{ color: 'text.secondary', fontSize: '0.75rem' }}>{index + 1}</TableCell>
                                    <TableCell sx={{ p: 0.5 }}>
                                        <TextField
                                            fullWidth
                                            size="small"
                                            variant="standard"
                                            placeholder="Item name"
                                            value={item.name}
                                            onChange={(e) => updateItemTotal(index, 'name', e.target.value)}
                                            InputProps={{ disableUnderline: false, sx: { fontSize: '0.875rem' } }}
                                        />
                                    </TableCell>
                                    <TableCell sx={{ p: 0.5 }}>
                                        <TextField
                                            fullWidth
                                            size="small"
                                            variant="standard"
                                            type="number"
                                            placeholder="0"
                                            value={item.quantity}
                                            onChange={(e) => updateItemTotal(index, 'quantity', e.target.value)}
                                            inputProps={{ style: { textAlign: 'right', fontSize: '0.875rem' } }}
                                        />
                                    </TableCell>
                                    <TableCell sx={{ p: 0.5 }}>
                                        <TextField
                                            fullWidth
                                            size="small"
                                            variant="standard"
                                            type="number"
                                            placeholder="0"
                                            value={item.price}
                                            onChange={(e) => updateItemTotal(index, 'price', e.target.value)}
                                            onKeyDown={(e) => handleKeyDown(e, index)}
                                            inputProps={{ style: { textAlign: 'right', fontSize: '0.875rem' } }}
                                        />
                                    </TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 500, fontSize: '0.875rem' }}>
                                        ₹{(item.totalPrice || 0).toLocaleString('en-IN')}
                                    </TableCell>
                                    <TableCell sx={{ p: 0 }}>
                                        {items.length > 1 && (
                                            <IconButton size="small" onClick={() => removeItemRow(index)} sx={{ p: 0.25 }}>
                                                <Delete fontSize="small" color="error" />
                                            </IconButton>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
                
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 1 }}>
                    <Button size="small" startIcon={<Add />} onClick={addItemRow}>Add Row</Button>
                    <Typography variant="caption" color="text.secondary">
                        Press Enter on price to add new row • Bill No auto-generates if empty
                    </Typography>
                </Box>
            </Paper>

            {/* Grey / White totals */}
            {(billTypeTotals.white > 0 || billTypeTotals.grey > 0) && (
                <Paper variant="outlined" sx={{ mb: 2, px: 2, py: 1, display: 'flex', gap: 3, alignItems: 'center', flexWrap: 'wrap', bgcolor: '#fafafa' }}>
                    <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase', fontSize: '0.7rem' }}>Purchases by type</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#1565c0', border: '2px solid #90caf9' }} />
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#1565c0', fontFamily: 'monospace' }}>⚪ White — ₹{billTypeTotals.white.toLocaleString('en-IN')}</Typography>
                    </Box>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.8 }}>
                        <Box sx={{ width: 10, height: 10, borderRadius: '50%', bgcolor: '#6a1b9a', border: '2px solid #ce93d8' }} />
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#6a1b9a', fontFamily: 'monospace' }}>⚫ Grey — ₹{billTypeTotals.grey.toLocaleString('en-IN')}</Typography>
                    </Box>
                    <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto', fontFamily: 'monospace' }}>
                        Total: ₹{(billTypeTotals.white + billTypeTotals.grey).toLocaleString('en-IN')}
                    </Typography>
                </Paper>
            )}

            {/* Date Filter */}
            <Paper sx={{ p: 1.5, mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                <Typography variant="body2" sx={{ fontWeight: 500 }}>Filter:</Typography>
                <TextField
                    size="small"
                    type="date"
                    label="From"
                    value={dateRange.startDate}
                    onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    sx={{ width: 150 }}
                />
                <TextField
                    size="small"
                    type="date"
                    label="To"
                    value={dateRange.endDate}
                    onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                    InputLabelProps={{ shrink: true }}
                    sx={{ width: 150 }}
                />
                <Button size="small" variant="contained" onClick={fetchPurchases}>Apply</Button>
                <Button size="small" onClick={() => { setDateRange({ startDate: '', endDate: '' }); fetchPurchases(); }}>Clear</Button>
            </Paper>

            {/* Purchase Bills List */}
            <Paper>
                <TableContainer sx={{ maxHeight: 400 }}>
                    <Table size="small" stickyHeader>
                        <TableHead>
                            <TableRow sx={{ '& th': { bgcolor: '#f5f5f5' } }}>
                                <TableCell sx={{ width: 40 }}></TableCell>
                                <TableCell><strong>Bill No</strong></TableCell>
                                <TableCell><strong>Supplier</strong></TableCell>
                                <TableCell><strong>Date</strong></TableCell>
                                <TableCell align="right"><strong>Total</strong></TableCell>
                                <TableCell><strong>Status</strong></TableCell>
                                <TableCell align="center"><strong>Action</strong></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                                        <CircularProgress size={24} />
                                    </TableCell>
                                </TableRow>
                            ) : purchases.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                                        <Typography color="text.secondary">No purchase bills found</Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                purchases.map((purchase) => (
                                    <>
                                        <TableRow 
                                            key={purchase.id} 
                                            hover 
                                            sx={{ cursor: 'pointer' }}
                                            onClick={() => toggleRow(purchase.id)}
                                        >
                                            <TableCell>
                                                <IconButton size="small">
                                                    {expandedRows[purchase.id] ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                                                </IconButton>
                                            </TableCell>
                                            <TableCell sx={{ fontWeight: 500 }}>{purchase.billNumber || '-'}</TableCell>
                                            <TableCell>{purchase.supplier?.name || '-'}</TableCell>
                                            <TableCell>{formatDateForExport(purchase.billDate)}</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 600, color: 'error.main' }}>
                                                ₹{(purchase.total || 0).toLocaleString('en-IN')}
                                            </TableCell>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.4 }}>
                                                    <Chip
                                                        label={purchase.paymentStatus}
                                                        size="small"
                                                        color={purchase.paymentStatus === 'paid' ? 'success' : 'warning'}
                                                        sx={{ height: 20, fontSize: '0.7rem' }}
                                                    />
                                                    {(() => {
                                                        const g = Number(purchase.greyAmount) || 0;
                                                        const w = Number(purchase.whiteAmount) || 0;
                                                        const isSplit = g > 0 && w > 0;
                                                        const isGrey = isSplit ? false : (g > 0 || purchase.billType === 'grey');
                                                        return (
                                                            <Chip
                                                                label={isSplit
                                                                    ? `⚪ ₹${w.toLocaleString('en-IN')} / ⚫ ₹${g.toLocaleString('en-IN')}`
                                                                    : (isGrey ? '⚫ Grey' : '⚪ White')}
                                                                size="small"
                                                                sx={{ height: 16, fontSize: '0.65rem', fontWeight: 600,
                                                                    bgcolor: isSplit ? '#fff3e0' : (isGrey ? '#f3e5f5' : '#e3f2fd'),
                                                                    color: isSplit ? '#e65100' : (isGrey ? '#6a1b9a' : '#1565c0') }}
                                                            />
                                                        );
                                                    })()}
                                                </Box>
                                            </TableCell>
                                            <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                                                <IconButton size="small" color="error" onClick={() => handleDelete(purchase.id)}>
                                                    <Delete fontSize="small" />
                                                </IconButton>
                                            </TableCell>
                                        </TableRow>
                                        <TableRow key={`${purchase.id}-expand`}>
                                            <TableCell colSpan={7} sx={{ py: 0, bgcolor: '#fafafa' }}>
                                                <Collapse in={expandedRows[purchase.id]} timeout="auto" unmountOnExit>
                                                    <Box sx={{ py: 1.5, px: 2 }}>
                                                        {purchase.notes && (
                                                            <Typography variant="body2" color="text.secondary" sx={{ mb: 1, fontStyle: 'italic' }}>
                                                                📝 {purchase.notes}
                                                            </Typography>
                                                        )}
                                                        <Typography variant="caption" sx={{ fontWeight: 600, color: '#1976d2' }}>
                                                            Items ({purchase.purchaseItems?.length || 0})
                                                        </Typography>
                                                        {purchase.purchaseItems && purchase.purchaseItems.length > 0 ? (
                                                            <Table size="small" sx={{ mt: 0.5, bgcolor: 'white' }}>
                                                                <TableHead>
                                                                    <TableRow sx={{ '& th': { py: 0.5, bgcolor: '#e3f2fd', fontSize: '0.75rem' } }}>
                                                                        <TableCell>Item</TableCell>
                                                                        <TableCell align="right">Qty</TableCell>
                                                                        <TableCell align="right">Price</TableCell>
                                                                        <TableCell align="right">Total</TableCell>
                                                                    </TableRow>
                                                                </TableHead>
                                                                <TableBody>
                                                                    {purchase.purchaseItems.map((item, idx) => (
                                                                        <TableRow key={idx} sx={{ '& td': { py: 0.3, fontSize: '0.8rem' } }}>
                                                                            <TableCell>{item.name}</TableCell>
                                                                            <TableCell align="right">{item.quantity}</TableCell>
                                                                            <TableCell align="right">₹{item.price}</TableCell>
                                                                            <TableCell align="right">₹{item.totalPrice}</TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        ) : (
                                                            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
                                                                No items recorded
                                                            </Typography>
                                                        )}
                                                    </Box>
                                                </Collapse>
                                            </TableCell>
                                        </TableRow>
                                    </>
                                ))
                            )}
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
                />
            </Paper>
        </Box>
    );
};

export default ListPurchases;
