import { Button, Paper, TextField, Typography, TableContainer, Table, TableHead, TableBody, TableCell, TableRow, Chip, Tooltip, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Box, IconButton, CircularProgress, Autocomplete, Alert, Checkbox } from '@mui/material';
import { useNavigate } from 'react-router';
import { useState, useRef, useLayoutEffect, useEffect, useCallback, memo } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { listOrdersAction, deleteOrderAction, getOrderAction } from '../../../store/orders';
import { Pagination } from '../../common/pagination';
import { useAuth } from '../../../context/AuthContext';
import { Note, Warning, Clear, Refresh, SwapHoriz, PersonAdd, Person, Print, Visibility, WhatsApp } from '@mui/icons-material';
import axios from 'axios';
import { generatePdfDefinition, generatePdfDefinition2 } from './helper';
import { sendInvoiceViaWhatsApp } from '../../../utils/whatsapp';

// Lazy-load pdfMake on first print — avoids adding ~4MB to the initial route bundle
let _pdfMakePromise = null;
const getPdfMake = () => {
    if (!_pdfMakePromise) {
        _pdfMakePromise = import('pdfmake/build/pdfmake').then(async (mod) => {
            const lib = mod.default;
            try {
                const fonts = await import('pdfmake/build/vfs_fonts');
                lib.vfs = fonts?.pdfMake?.vfs || fonts?.vfs;
            } catch {}
            return lib;
        });
    }
    return _pdfMakePromise;
};

// Key for storing scroll position
const SCROLL_POSITION_KEY = 'orders_scroll_position';
const SCROLL_FILTERS_KEY = 'orders_filters';

// ─── Module-level utilities (stable references, no recreation per render) ───
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
        let date;
        if (typeof dateString === 'string') {
            if (dateString.match(/^\d{2}-\d{2}-\d{4}$/)) {
                const [day, month, year] = dateString.split('-');
                date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
            } else if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
                date = new Date(dateString + 'T00:00:00');
            } else {
                date = new Date(dateString);
            }
        } else {
            date = new Date(dateString);
        }
        if (isNaN(date.getTime())) return '-';
        return `${String(date.getDate()).padStart(2,'0')} ${MONTHS_SHORT[date.getMonth()]} ${date.getFullYear()}`;
    } catch { return '-'; }
};

const formatTime = (row) => {
    const dateString = row.createdAt || row.updatedAt || row.orderDate;
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        if (isNaN(date.getTime())) return '-';
        return date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    } catch { return '-'; }
};

const formatCurrency = (amount) => {
    const num = Number(amount) || 0;
    return `₹ ${num.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const getTodayDDMMYYYY = () => {
    const now = new Date();
    return `${String(now.getDate()).padStart(2,'0')}-${String(now.getMonth()+1).padStart(2,'0')}-${now.getFullYear()}`;
};

const isBackdated = (dateString) => {
    if (!dateString || typeof dateString !== 'string') return false;
    return dateString.match(/^\d{2}-\d{2}-\d{4}$/) && dateString !== getTodayDDMMYYYY();
};

const OrderRow = memo(({ row, isChecked, onToggleChecked, canToggleStatus, isAdmin, onStatusToggle, onDelete, onView, isPrintingInvoice, isPrintingReceipt, onPrintInvoice, onPrintReceipt, isDeleting }) => {
    const handleWhatsApp = async (e) => {
        e.stopPropagation();
        try {
            const token = localStorage.getItem('token');
            const { data } = await axios.get(`/api/orders/${row.id}`, { headers: { Authorization: `Bearer ${token}` } });
            const fullOrder = data.data || data;
            sendInvoiceViaWhatsApp(fullOrder.customerMobile || row.customerMobile, fullOrder);
        } catch {
            sendInvoiceViaWhatsApp(row.customerMobile, row);
        }
    };

    return (
        <TableRow hover sx={{ cursor: 'pointer' }} onClick={() => onView(row)}>
            <TableCell padding="checkbox" onClick={(e) => e.stopPropagation()}>
                <Checkbox size="small" checked={isChecked} onChange={() => onToggleChecked(row.id)} />
            </TableCell>
            <TableCell>
                <Typography variant="body2" fontWeight="bold" color="primary">{row.orderNumber}</Typography>
            </TableCell>
            <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Typography variant="body2" fontWeight={500}>{formatDate(row.orderDate)}</Typography>
                    {isBackdated(row.orderDate) && (
                        <Tooltip title="Backdated entry">
                            <Chip label="Back" size="small" color="warning" variant="outlined" sx={{ fontSize: '0.68rem', height: 18, px: 0.2 }} />
                        </Tooltip>
                    )}
                </Box>
            </TableCell>
            <TableCell>
                <Typography variant="body2" color="text.secondary">{formatTime(row)}</Typography>
            </TableCell>
            <TableCell>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    {row.customerName || 'Walk-in'}
                    {row.notes && (
                        <Tooltip title={row.notes}><Note fontSize="small" color="action" /></Tooltip>
                    )}
                </Box>
            </TableCell>
            <TableCell>{row.customerMobile || '-'}</TableCell>
            <TableCell align="right">
                <Typography fontWeight="bold">{formatCurrency(row.total)}</Typography>
            </TableCell>
            <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                {canToggleStatus ? (
                    <Tooltip title="Click to toggle payment status">
                        <Chip
                            label={row.paymentStatus === 'paid' ? 'Paid' : row.paymentStatus === 'partial' ? 'Partial' : 'Unpaid'}
                            size="small"
                            color={row.paymentStatus === 'paid' ? 'success' : row.paymentStatus === 'partial' ? 'warning' : 'error'}
                            onClick={(e) => onStatusToggle(row, e)}
                            onDelete={row.paymentStatus !== 'partial' ? (e) => onStatusToggle(row, e) : undefined}
                            deleteIcon={row.paymentStatus !== 'partial' ? <SwapHoriz fontSize="small" /> : undefined}
                            sx={{ cursor: 'pointer' }}
                            data-testid={`status-chip-${row.id}`}
                        />
                    </Tooltip>
                ) : (
                    row.paymentStatus === 'paid' ? <Chip label="Paid" size="small" color="success" /> :
                    row.paymentStatus === 'partial' ? <Chip label="Partial" size="small" color="warning" /> :
                    <Chip label="Unpaid" size="small" color="error" />
                )}
            </TableCell>
            <TableCell>
                <Typography variant="body2" color="text.secondary" data-testid={`created-by-${row.id}`}>
                    {row.createdByName || '-'}
                </Typography>
            </TableCell>
            <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                    <Tooltip title="View Invoice">
                        <Button size="small" variant="outlined" onClick={() => onView(row)} startIcon={<Visibility fontSize="small" />} data-testid={`view-order-${row.id}`}>
                            View
                        </Button>
                    </Tooltip>
                    <Tooltip title="Print GST Tax Invoice">
                        <Button size="small" variant="outlined" color="secondary" onClick={(e) => onPrintInvoice(row.id, e)} disabled={isPrintingInvoice} startIcon={isPrintingInvoice ? <CircularProgress size={14} /> : <Print fontSize="small" />} data-testid={`print-invoice-${row.id}`}>
                            Invoice
                        </Button>
                    </Tooltip>
                    <Tooltip title="Print simple receipt (no GST) — for customer">
                        <Button size="small" variant="outlined" onClick={(e) => onPrintReceipt(row.id, e)} disabled={isPrintingReceipt} startIcon={isPrintingReceipt ? <CircularProgress size={14} /> : <Print fontSize="small" />} data-testid={`print-receipt-${row.id}`}>
                            Receipt
                        </Button>
                    </Tooltip>
                    <Tooltip title="Send via WhatsApp">
                        <Button size="small" variant="outlined" sx={{ color: '#25D366', borderColor: '#25D366', '&:hover': { borderColor: '#128C7E', bgcolor: '#e8f8f0' } }} onClick={handleWhatsApp} startIcon={<WhatsApp fontSize="small" />} data-testid={`whatsapp-invoice-${row.id}`}>
                            WhatsApp
                        </Button>
                    </Tooltip>
                    {isAdmin && (
                        <Button size="small" variant="outlined" color="error" onClick={() => onDelete(row)} disabled={isDeleting}>
                            Delete
                        </Button>
                    )}
                </Box>
            </TableCell>
        </TableRow>
    );
});

export const ListOrders = () => {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const { isAdmin, isBillingStaff, user } = useAuth();
    const scrollRestoredRef = useRef(false);
    const lastFetchTimeRef = useRef(0);
    
    // Both admin and billing staff can toggle payment status
    const canToggleStatus = isAdmin || isBillingStaff;

    // Get orders from Redux store
    const { orders } = useSelector((state) => state.orderState);
    const { count = 0, rows = [] } = orders || {};
    const [loading, setLoading] = useState(false);

    // Try to restore filters from sessionStorage on initial load
    const getSavedFilters = () => {
        try {
            const savedFilters = sessionStorage.getItem(SCROLL_FILTERS_KEY);
            if (savedFilters) {
                return JSON.parse(savedFilters);
            }
        } catch (e) {
            console.error('Error parsing saved filters:', e);
        }
        return { limit: 25, offset: 0, q: "", date: "" };
    };

    const [filters, setFilters] = useState(getSavedFilters);
    const [refetch, shouldFetch] = useState(false);
    
    // Delete confirmation dialog state
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [orderToDelete, setOrderToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);

    // Payment status toggle dialog state
    const [statusDialogOpen, setStatusDialogOpen] = useState(false);
    const [orderToToggle, setOrderToToggle] = useState(null);
    const [isTogglingStatus, setIsTogglingStatus] = useState(false);
    const [customerInfo, setCustomerInfo] = useState({ customerName: '', customerMobile: '' });
    const [customers, setCustomers] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [isNewCustomer, setIsNewCustomer] = useState(false);
    const [loadingCustomers, setLoadingCustomers] = useState(false);
    const [changedByName, setChangedByName] = useState(''); // Mandatory name for audit
    
    // Manual checkbox state — persisted in sessionStorage so navigation doesn't reset it
    const [checkedIds, setCheckedIds] = useState(() => {
        try {
            const saved = sessionStorage.getItem('orders_checked_ids');
            return saved ? new Set(JSON.parse(saved)) : new Set();
        } catch { return new Set(); }
    });

    const toggleChecked = useCallback((id) => {
        setCheckedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            try { sessionStorage.setItem('orders_checked_ids', JSON.stringify([...next])); } catch {}
            return next;
        });
    }, []);

    // Print state
    const [printingInvoice, setPrintingInvoice] = useState(null);
    const [printingReceipt, setPrintingReceipt] = useState(null);

    const handlePrintInvoice = useCallback(async (orderId, e) => {
        e.stopPropagation();
        setPrintingInvoice(orderId);
        try {
            const [orderData, pdfMake] = await Promise.all([dispatch(getOrderAction(orderId)), getPdfMake()]);
            if (orderData) pdfMake.createPdf(generatePdfDefinition(orderData)).print();
        } catch {
            alert('Failed to print invoice. Please try again.');
        } finally {
            setPrintingInvoice(null);
        }
    }, [dispatch]);

    const handlePrintReceipt = useCallback(async (orderId, e) => {
        e.stopPropagation();
        setPrintingReceipt(orderId);
        try {
            const [orderData, pdfMake] = await Promise.all([dispatch(getOrderAction(orderId)), getPdfMake()]);
            if (orderData) pdfMake.createPdf(generatePdfDefinition2(orderData)).print();
        } catch {
            alert('Failed to print receipt. Please try again.');
        } finally {
            setPrintingReceipt(null);
        }
    }, [dispatch]);

    // Fetch customers for autocomplete
    const fetchCustomers = async () => {
        try {
            setLoadingCustomers(true);
            const token = localStorage.getItem('token');
            const { data } = await axios.get('/api/customers', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const customerList = data.data?.rows || data.rows || [];
            setCustomers(Array.isArray(customerList) ? customerList : Object.values(customerList));
        } catch (error) {
            console.error('Error fetching customers:', error);
        } finally {
            setLoadingCustomers(false);
        }
    };

    const handleDeleteClick = useCallback((order) => {
        setOrderToDelete(order);
        setDeleteDialogOpen(true);
    }, []);

    // Confirm delete
    const handleConfirmDelete = async () => {
        if (orderToDelete) {
            try {
                setIsDeleting(true);
                await dispatch(deleteOrderAction(orderToDelete.id, filters));
            } catch (error) {
                console.error('Failed to delete order:', error);
            } finally {
                setIsDeleting(false);
            }
        }
        setDeleteDialogOpen(false);
        setOrderToDelete(null);
    };

    // Cancel delete
    const handleCancelDelete = () => {
        setDeleteDialogOpen(false);
        setOrderToDelete(null);
    };

    const handleStatusToggleClick = useCallback((order, e) => {
        e.stopPropagation();
        setOrderToToggle(order);
        // Pre-fill customer info if available
        setCustomerInfo({
            customerName: order.customerName || '',
            customerMobile: order.customerMobile || ''
        });
        // Pre-fill changedByName with current user's name if available
        setChangedByName(user?.name || '');
        // Reset selection states
        setSelectedCustomer(null);
        setIsNewCustomer(false);
        // Fetch customers when opening dialog (for toggling to unpaid)
        if (order.paymentStatus === 'paid') {
            fetchCustomers();
        }
        setStatusDialogOpen(true);
    }, [user?.name, fetchCustomers]);

    // Confirm status toggle
    const handleConfirmStatusToggle = async () => {
        if (!orderToToggle) return;
        
        const newStatus = orderToToggle.paymentStatus === 'paid' ? 'unpaid' : 'paid';
        
        // Validate changedByName is required for audit trail
        if (!changedByName?.trim()) {
            alert('Your name is required to record this change');
            return;
        }
        
        // Validate customer name is required when toggling to unpaid
        if (newStatus === 'unpaid' && !customerInfo.customerName?.trim()) {
            alert('Customer name is required when marking as Unpaid');
            return;
        }
        
        try {
            setIsTogglingStatus(true);
            const token = localStorage.getItem('token');
            
            // Include customer info when toggling to unpaid
            const payload = { 
                newStatus,
                changedBy: changedByName.trim() // Mandatory audit field
            };
            if (newStatus === 'unpaid') {
                payload.customerName = customerInfo.customerName.trim();
                payload.customerMobile = customerInfo.customerMobile?.trim() || '';
                // Include customerId if selected from database
                if (selectedCustomer?.id) {
                    payload.customerId = selectedCustomer.id;
                }
            }
            
            await axios.patch(
                `/api/orders/${orderToToggle.id}/payment-status`,
                payload,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            // Refresh the list
            fetchOrders();
        } catch (error) {
            console.error('Failed to toggle payment status:', error);
            alert(error.response?.data?.message || 'Failed to update payment status');
        } finally {
            setIsTogglingStatus(false);
            setStatusDialogOpen(false);
            setOrderToToggle(null);
            setCustomerInfo({ customerName: '', customerMobile: '' });
            setSelectedCustomer(null);
            setIsNewCustomer(false);
            setChangedByName('');
        }
    };

    // Cancel status toggle
    const handleCancelStatusToggle = () => {
        setStatusDialogOpen(false);
        setOrderToToggle(null);
        setCustomerInfo({ customerName: '', customerMobile: '' });
        setSelectedCustomer(null);
        setIsNewCustomer(false);
        setChangedByName('');
    };

    // Fetch orders function — records timestamp to debounce focus handler
    const fetchOrders = useCallback(() => {
        lastFetchTimeRef.current = Date.now();
        setLoading(true);
        dispatch(listOrdersAction(filters)).finally(() => setLoading(false));
    }, [dispatch, filters]);

    // Fetch on explicit filter change (search, date, pagination)
    useEffect(() => {
        if (refetch) {
            shouldFetch(false);
            fetchOrders();
        }
    }, [refetch, fetchOrders]);

    // Fetch on mount (initial load or filter-driven remount)
    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    // Refresh when window regains focus — but skip if we just fetched (e.g. back-navigation)
    useEffect(() => {
        const handleFocus = () => {
            if (Date.now() - lastFetchTimeRef.current > 30000) {
                fetchOrders();
            }
        };
        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [fetchOrders]);

    // Save filters whenever they change
    useEffect(() => {
        sessionStorage.setItem(SCROLL_FILTERS_KEY, JSON.stringify(filters));
    }, [filters]);

    // Restore scroll position — fires as soon as rows are available (cached or fresh)
    useLayoutEffect(() => {
        if (rows.length > 0 && !scrollRestoredRef.current) {
            scrollRestoredRef.current = true;
            const savedPosition = sessionStorage.getItem(SCROLL_POSITION_KEY);
            if (savedPosition) {
                sessionStorage.removeItem(SCROLL_POSITION_KEY);
                requestAnimationFrame(() => {
                    window.scrollTo(0, parseInt(savedPosition, 10));
                });
            }
        }
    }, [rows]);

    const paginate = (limit, offset) => {
        sessionStorage.removeItem(SCROLL_POSITION_KEY);
        scrollRestoredRef.current = false;
        setFilters((prevState) => ({
            ...prevState,
            limit: limit,
            offset: offset,
        }));
        shouldFetch(true);
    };

    const filterChangeHandler = (e) => {
        sessionStorage.removeItem(SCROLL_POSITION_KEY);
        scrollRestoredRef.current = false;
        setFilters((prevState) => ({
            ...prevState,
            [e.target.id]: e.target.value
        }));
    };

    // Debounced filter effect — skip initial mount (mount effect already fetches)
    const isFirstFilterRender = useRef(true);
    useEffect(() => {
        if (isFirstFilterRender.current) { isFirstFilterRender.current = false; return; }
        const t = setTimeout(() => shouldFetch(true), 500);
        return () => clearTimeout(t);
    }, [filters.q, filters.date]);

    const viewOrder = useCallback((row) => {
        sessionStorage.setItem(SCROLL_POSITION_KEY, window.scrollY.toString());
        navigate(`/orders/edit/${row.id}`);
    }, [navigate]);

    const clearFilters = () => {
        sessionStorage.removeItem(SCROLL_POSITION_KEY);
        sessionStorage.removeItem(SCROLL_FILTERS_KEY);
        scrollRestoredRef.current = false;
        setFilters({ limit: 25, offset: 0, q: "", date: "" });
        shouldFetch(true);
    };

    const hasFilters = filters.q || filters.date;

    return (
        <Paper sx={{ width: '100%', overflow: 'hidden', padding: '16px' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h5" fontWeight={700}>Invoices</Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    {loading && <CircularProgress size={20} />}
                    <Tooltip title="Refresh list">
                        <IconButton onClick={fetchOrders} disabled={loading}>
                            <Refresh />
                        </IconButton>
                    </Tooltip>
                    <Button variant="contained" color="primary" onClick={() => navigate('/orders/create')}>
                        + New Invoice
                    </Button>
                </Box>
            </Box>

            {/* Filters */}
            <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center' }}>
                <TextField
                    id="q"
                    label="Search (Order #, Customer, Mobile)"
                    variant="outlined"
                    size="small"
                    value={filters.q}
                    onChange={filterChangeHandler}
                    sx={{ minWidth: 250 }}
                />
                <TextField
                    id="date"
                    label="Filter by Date"
                    type="date"
                    variant="outlined"
                    size="small"
                    value={filters.date}
                    onChange={filterChangeHandler}
                    InputLabelProps={{ shrink: true }}
                />
                {hasFilters && (
                    <Tooltip title="Clear all filters">
                        <IconButton onClick={clearFilters} size="small">
                            <Clear />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>

            {loading && rows.length === 0 ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                    <CircularProgress />
                </Box>
            ) : (
                <>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow>
                                    <TableCell padding="checkbox" />
                                    <TableCell>Invoice #</TableCell>
                                    <TableCell>Date</TableCell>
                                    <TableCell>Time</TableCell>
                                    <TableCell>Customer</TableCell>
                                    <TableCell>Mobile</TableCell>
                                    <TableCell align="right">Total (₹)</TableCell>
                                    <TableCell align="center">Status</TableCell>
                                    <TableCell>Created By</TableCell>
                                    <TableCell align="center">Actions</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {rows.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={10} align="center">
                                            <Typography color="text.secondary" sx={{ py: 6, fontSize: '1rem' }}>
                                                No invoices found
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    rows.map((row) => (
                                        <OrderRow
                                            key={row.id}
                                            row={row}
                                            isChecked={checkedIds.has(row.id)}
                                            onToggleChecked={toggleChecked}
                                            canToggleStatus={canToggleStatus}
                                            isAdmin={isAdmin}
                                            onStatusToggle={handleStatusToggleClick}
                                            onDelete={handleDeleteClick}
                                            onView={viewOrder}
                                            isPrintingInvoice={printingInvoice === row.id}
                                            isPrintingReceipt={printingReceipt === row.id}
                                            onPrintInvoice={handlePrintInvoice}
                                            onPrintReceipt={handlePrintReceipt}
                                            isDeleting={isDeleting}
                                        />
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>

                    {/* Pagination */}
                    <Box sx={{ mt: 2 }}>
                        <Pagination
                            count={count}
                            limit={filters.limit}
                            offset={filters.offset}
                            updateFilters={paginate}
                        />
                    </Box>
                </>
            )}

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteDialogOpen} onClose={handleCancelDelete}>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'error.main' }}>
                    <Warning /> Delete Order
                </DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to delete order <strong>{orderToDelete?.orderNumber}</strong>?
                    </DialogContentText>
                    <DialogContentText sx={{ mt: 1 }}>
                        Customer: {orderToDelete?.customerName || 'Walk-in'}<br />
                        Total: {formatCurrency(orderToDelete?.total)}
                    </DialogContentText>
                    <Typography variant="body2" color="error" sx={{ mt: 2 }}>
                        ⚠️ This action cannot be undone.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCancelDelete} disabled={isDeleting}>Cancel</Button>
                    <Button onClick={handleConfirmDelete} color="error" variant="contained" disabled={isDeleting}>
                        {isDeleting ? 'Deleting...' : 'Delete'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Payment Status Toggle Confirmation Dialog */}
            <Dialog open={statusDialogOpen} onClose={handleCancelStatusToggle} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'primary.main' }}>
                    <SwapHoriz /> Change Payment Status
                </DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to change the payment status of order <strong>{orderToToggle?.orderNumber}</strong>?
                    </DialogContentText>
                    
                    {/* Mandatory Name Field for Audit */}
                    <Box sx={{ mt: 2, p: 2, bgcolor: 'primary.50', borderRadius: 1, border: '1px solid', borderColor: 'primary.200' }}>
                        <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Person fontSize="small" color="primary" /> Your Name (Required for Audit)
                        </Typography>
                        <TextField
                            value={changedByName}
                            onChange={(e) => setChangedByName(e.target.value)}
                            fullWidth
                            size="small"
                            placeholder="Enter your name"
                            required
                            error={!changedByName?.trim()}
                            helperText={!changedByName?.trim() ? 'Your name is required to record this change' : ''}
                            data-testid="changed-by-name-input"
                            autoFocus
                        />
                    </Box>
                    
                    <Box sx={{ mt: 2, p: 2, bgcolor: 'grey.100', borderRadius: 1 }}>
                        <Typography variant="body2">
                            <strong>Customer:</strong> {orderToToggle?.customerName || 'Walk-in'}
                        </Typography>
                        <Typography variant="body2">
                            <strong>Total:</strong> {formatCurrency(orderToToggle?.total)}
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 1 }}>
                            <strong>Current Status:</strong>{' '}
                            <Chip 
                                label={orderToToggle?.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'} 
                                size="small" 
                                color={orderToToggle?.paymentStatus === 'paid' ? 'success' : 'error'}
                            />
                        </Typography>
                        <Typography variant="body2" sx={{ mt: 1 }}>
                            <strong>New Status:</strong>{' '}
                            <Chip 
                                label={orderToToggle?.paymentStatus === 'paid' ? 'Unpaid' : 'Paid'} 
                                size="small" 
                                color={orderToToggle?.paymentStatus === 'paid' ? 'error' : 'success'}
                            />
                        </Typography>
                    </Box>
                    
                    {/* Show customer info fields when toggling to unpaid */}
                    {orderToToggle?.paymentStatus === 'paid' && (
                        <Box sx={{ mt: 3 }}>
                            <Alert severity="info" sx={{ mb: 2 }}>
                                Customer name is <strong>required</strong> when marking as unpaid (credit sale).
                            </Alert>
                            
                            <Typography variant="subtitle2" sx={{ mb: 2 }}>
                                Select Customer from Database:
                            </Typography>
                            
                            <Autocomplete
                                options={customers}
                                value={selectedCustomer}
                                loading={loadingCustomers}
                                onChange={(_, newValue) => {
                                    setSelectedCustomer(newValue);
                                    if (newValue) {
                                        setCustomerInfo({
                                            customerName: newValue.name || '',
                                            customerMobile: newValue.mobile || ''
                                        });
                                        setIsNewCustomer(false);
                                    }
                                }}
                                getOptionLabel={(option) => option?.name || ''}
                                renderOption={(props, option) => (
                                    <li {...props} key={option.id}>
                                        <Box>
                                            <Typography variant="body2" fontWeight="bold">{option.name}</Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {option.mobile || 'No mobile'} • Balance: ₹{(option.currentBalance || 0).toLocaleString('en-IN')}
                                            </Typography>
                                        </Box>
                                    </li>
                                )}
                                renderInput={(params) => (
                                    <TextField 
                                        {...params} 
                                        label="Search Existing Customer"
                                        placeholder="Type to search..."
                                        size="small"
                                        InputProps={{
                                            ...params.InputProps,
                                            endAdornment: (
                                                <>
                                                    {loadingCustomers ? <CircularProgress size={20} /> : null}
                                                    {params.InputProps.endAdornment}
                                                </>
                                            ),
                                        }}
                                    />
                                )}
                                noOptionsText="No customers found"
                                sx={{ mb: 2 }}
                            />
                            
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                <Typography variant="body2" color="text.secondary">— OR —</Typography>
                                <Button 
                                    size="small" 
                                    variant={isNewCustomer ? "contained" : "outlined"}
                                    startIcon={<PersonAdd />}
                                    onClick={() => {
                                        setIsNewCustomer(!isNewCustomer);
                                        if (!isNewCustomer) {
                                            setSelectedCustomer(null);
                                            setCustomerInfo({ customerName: '', customerMobile: '' });
                                        }
                                    }}
                                >
                                    {isNewCustomer ? 'Entering New Customer' : 'Enter New Customer'}
                                </Button>
                            </Box>
                            
                            {isNewCustomer && (
                                <Box sx={{ p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
                                    <TextField
                                        label="Customer Name *"
                                        value={customerInfo.customerName}
                                        onChange={(e) => setCustomerInfo({ ...customerInfo, customerName: e.target.value })}
                                        fullWidth
                                        size="small"
                                        sx={{ mb: 2 }}
                                        placeholder="Enter new customer name"
                                        required
                                        error={!customerInfo.customerName?.trim()}
                                        helperText={!customerInfo.customerName?.trim() ? 'Customer name is required' : ''}
                                    />
                                    <TextField
                                        label="Customer Mobile"
                                        value={customerInfo.customerMobile}
                                        onChange={(e) => setCustomerInfo({ ...customerInfo, customerMobile: e.target.value })}
                                        fullWidth
                                        size="small"
                                        placeholder="Enter mobile number"
                                    />
                                </Box>
                            )}
                            
                            {selectedCustomer && (
                                <Alert severity="success" sx={{ mt: 2 }}>
                                    Selected: <strong>{selectedCustomer.name}</strong> 
                                    {selectedCustomer.mobile && ` (${selectedCustomer.mobile})`}
                                </Alert>
                            )}
                        </Box>
                    )}
                    
                    {orderToToggle?.paymentStatus === 'paid' && (
                        <Typography variant="body2" color="warning.main" sx={{ mt: 2 }}>
                            ⚠️ Marking as &quot;Unpaid&quot; will add ₹{orderToToggle?.total?.toLocaleString('en-IN')} to receivables.
                        </Typography>
                    )}
                    {orderToToggle?.paymentStatus === 'unpaid' && (
                        <Typography variant="body2" color="success.main" sx={{ mt: 2 }}>
                            ✓ Marking as &quot;Paid&quot; will remove ₹{orderToToggle?.total?.toLocaleString('en-IN')} from receivables.
                        </Typography>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCancelStatusToggle} disabled={isTogglingStatus}>Cancel</Button>
                    <Button 
                        onClick={handleConfirmStatusToggle} 
                        color={orderToToggle?.paymentStatus === 'paid' ? 'error' : 'success'} 
                        variant="contained" 
                        disabled={isTogglingStatus || !changedByName?.trim() || (orderToToggle?.paymentStatus === 'paid' && !customerInfo.customerName?.trim())}
                        data-testid="confirm-status-toggle-btn"
                    >
                        {isTogglingStatus ? 'Updating...' : `Mark as ${orderToToggle?.paymentStatus === 'paid' ? 'Unpaid' : 'Paid'}`}
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
};
