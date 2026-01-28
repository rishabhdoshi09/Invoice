import { Button, Paper, TextField, Typography, TableContainer, Table, TableHead, TableBody, TableCell, TableRow, Chip, Tooltip, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Box, IconButton, CircularProgress } from '@mui/material';
import { useNavigate } from 'react-router';
import { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { listOrdersAction, deleteOrderAction } from '../../../store/orders';
import { Pagination } from '../../common/pagination';
import { useAuth } from '../../../context/AuthContext';
import { Note, Warning, Clear, Refresh, SwapHoriz } from '@mui/icons-material';
import axios from 'axios';

// Key for storing scroll position
const SCROLL_POSITION_KEY = 'orders_scroll_position';
const SCROLL_FILTERS_KEY = 'orders_filters';

export const ListOrders = () => {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const { isAdmin } = useAuth();
    const scrollRestoredRef = useRef(false);
    const isInitialLoadRef = useRef(true);

    // Get orders from Redux store
    const { orders } = useSelector((state) => state.orderState);
    const { count = 0, rows = [] } = orders || {};
    const { loading } = useSelector((state) => state.applicationState);

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

    // Handle delete button click - open confirmation dialog
    const handleDeleteClick = (order) => {
        setOrderToDelete(order);
        setDeleteDialogOpen(true);
    };

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

    // Handle status toggle click - open confirmation dialog
    const handleStatusToggleClick = (order, e) => {
        e.stopPropagation();
        setOrderToToggle(order);
        // Pre-fill customer info if available
        setCustomerInfo({
            customerName: order.customerName || '',
            customerMobile: order.customerMobile || ''
        });
        setStatusDialogOpen(true);
    };

    // Confirm status toggle
    const handleConfirmStatusToggle = async () => {
        if (!orderToToggle) return;
        
        const newStatus = orderToToggle.paymentStatus === 'paid' ? 'unpaid' : 'paid';
        
        try {
            setIsTogglingStatus(true);
            const token = localStorage.getItem('token');
            
            // Include customer info when toggling to unpaid
            const payload = { newStatus };
            if (newStatus === 'unpaid') {
                payload.customerName = customerInfo.customerName;
                payload.customerMobile = customerInfo.customerMobile;
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
        }
    };

    // Cancel status toggle
    const handleCancelStatusToggle = () => {
        setStatusDialogOpen(false);
        setOrderToToggle(null);
        setCustomerInfo({ customerName: '', customerMobile: '' });
    };

    // Fetch orders function
    const fetchOrders = useCallback(() => {
        dispatch(listOrdersAction(filters));
    }, [dispatch, filters]);

    // Fetch on filter change
    useEffect(() => {
        if (refetch) {
            shouldFetch(false);
            fetchOrders();
        }
    }, [refetch, fetchOrders]);

    // Always fetch fresh data when component mounts
    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    // Refresh data when window gains focus
    useEffect(() => {
        const handleFocus = () => {
            fetchOrders();
        };
        window.addEventListener('focus', handleFocus);
        return () => window.removeEventListener('focus', handleFocus);
    }, [fetchOrders]);

    // Save filters whenever they change
    useEffect(() => {
        sessionStorage.setItem(SCROLL_FILTERS_KEY, JSON.stringify(filters));
    }, [filters]);

    // Restore scroll position after data is loaded
    useLayoutEffect(() => {
        if (rows.length > 0 && !scrollRestoredRef.current && !isInitialLoadRef.current) {
            const savedPosition = sessionStorage.getItem(SCROLL_POSITION_KEY);
            if (savedPosition) {
                requestAnimationFrame(() => {
                    window.scrollTo(0, parseInt(savedPosition, 10));
                    sessionStorage.removeItem(SCROLL_POSITION_KEY);
                    scrollRestoredRef.current = true;
                });
            }
        }
        if (rows.length > 0) {
            isInitialLoadRef.current = false;
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

    // Debounced filter effect
    useEffect(() => {
        const getData = setTimeout(() => {
            shouldFetch(true);
        }, 500);
        return () => clearTimeout(getData);
    }, [filters.q, filters.date]);

    const viewOrder = (row) => {
        sessionStorage.setItem(SCROLL_POSITION_KEY, window.scrollY.toString());
        navigate(`/orders/edit/${row.id}`);
    };

    const clearFilters = () => {
        sessionStorage.removeItem(SCROLL_POSITION_KEY);
        sessionStorage.removeItem(SCROLL_FILTERS_KEY);
        scrollRestoredRef.current = false;
        setFilters({ limit: 25, offset: 0, q: "", date: "" });
        shouldFetch(true);
    };

    const hasFilters = filters.q || filters.date;

    // Format date for display
    const formatDate = (dateString) => {
        if (!dateString) return '-';
        try {
            // Handle different date formats
            let date;
            if (typeof dateString === 'string') {
                // Handle DD-MM-YYYY format (Indian date format from backend)
                if (dateString.match(/^\d{2}-\d{2}-\d{4}$/)) {
                    const [day, month, year] = dateString.split('-');
                    date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
                }
                // Handle YYYY-MM-DD format
                else if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    date = new Date(dateString + 'T00:00:00');
                }
                // Handle ISO string or other formats
                else {
                    date = new Date(dateString);
                }
            } else {
                date = new Date(dateString);
            }
            
            // Check if date is valid
            if (isNaN(date.getTime())) return '-';
            
            return date.toLocaleDateString('en-IN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric'
            });
        } catch {
            return '-';
        }
    };

    // Format time for display
    const formatTime = (row) => {
        // Try createdAt first, then updatedAt, then use orderDate
        const dateString = row.createdAt || row.updatedAt || row.orderDate;
        if (!dateString) return '-';
        try {
            const date = new Date(dateString);
            // Check if date is valid
            if (isNaN(date.getTime())) return '-';
            return date.toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true
            });
        } catch {
            return '-';
        }
    };

    // Format currency
    const formatCurrency = (amount) => {
        return `₹${(amount || 0).toLocaleString('en-IN')}`;
    };

    return (
        <Paper sx={{ width: '100%', overflow: 'hidden', padding: '10px' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h5">Orders</Typography>
                <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                    {loading && <CircularProgress size={20} />}
                    <Tooltip title="Refresh list">
                        <IconButton onClick={fetchOrders} disabled={loading}>
                            <Refresh />
                        </IconButton>
                    </Tooltip>
                    <Button variant="contained" onClick={() => navigate('/orders/create')}>
                        Create Order
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
                                <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                    <TableCell><strong>Order #</strong></TableCell>
                                    <TableCell><strong>Date</strong></TableCell>
                                    <TableCell><strong>Time</strong></TableCell>
                                    <TableCell><strong>Customer</strong></TableCell>
                                    <TableCell><strong>Mobile</strong></TableCell>
                                    <TableCell align="right"><strong>Total</strong></TableCell>
                                    <TableCell align="center"><strong>Status</strong></TableCell>
                                    <TableCell align="center"><strong>Actions</strong></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {rows.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={8} align="center">
                                            <Typography color="text.secondary" sx={{ py: 4 }}>
                                                No orders found
                                            </Typography>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    rows.map((row) => (
                                        <TableRow 
                                            key={row.id} 
                                            hover 
                                            sx={{ cursor: 'pointer' }}
                                            onClick={() => viewOrder(row)}
                                        >
                                            <TableCell>
                                                <Typography variant="body2" fontWeight="bold" color="primary">
                                                    {row.orderNumber}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>{formatDate(row.orderDate)}</TableCell>
                                            <TableCell>
                                                <Typography variant="body2" color="text.secondary">
                                                    {formatTime(row)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                    {row.customerName || 'Walk-in'}
                                                    {row.notes && (
                                                        <Tooltip title={row.notes}>
                                                            <Note fontSize="small" color="action" />
                                                        </Tooltip>
                                                    )}
                                                </Box>
                                            </TableCell>
                                            <TableCell>{row.customerMobile || '-'}</TableCell>
                                            <TableCell align="right">
                                                <Typography fontWeight="bold">
                                                    {formatCurrency(row.total)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                                                {isAdmin ? (
                                                    <Tooltip title="Click to toggle payment status">
                                                        <Chip 
                                                            label={row.paymentStatus === 'paid' ? 'Paid' : row.paymentStatus === 'partial' ? 'Partial' : 'Unpaid'} 
                                                            size="small" 
                                                            color={row.paymentStatus === 'paid' ? 'success' : row.paymentStatus === 'partial' ? 'warning' : 'error'}
                                                            onClick={(e) => handleStatusToggleClick(row, e)}
                                                            onDelete={row.paymentStatus !== 'partial' ? (e) => handleStatusToggleClick(row, e) : undefined}
                                                            deleteIcon={row.paymentStatus !== 'partial' ? <SwapHoriz fontSize="small" /> : undefined}
                                                            sx={{ cursor: 'pointer' }}
                                                            data-testid={`status-chip-${row.id}`}
                                                        />
                                                    </Tooltip>
                                                ) : (
                                                    row.paymentStatus === 'paid' ? (
                                                        <Chip label="Paid" size="small" color="success" />
                                                    ) : row.paymentStatus === 'partial' ? (
                                                        <Chip label="Partial" size="small" color="warning" />
                                                    ) : (
                                                        <Chip label="Unpaid" size="small" color="error" />
                                                    )
                                                )}
                                            </TableCell>
                                            <TableCell align="center" onClick={(e) => e.stopPropagation()}>
                                                <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                                    <Button 
                                                        size="small" 
                                                        variant="outlined"
                                                        onClick={() => viewOrder(row)}
                                                    >
                                                        View
                                                    </Button>
                                                    {isAdmin && (
                                                        <Button 
                                                            size="small" 
                                                            variant="outlined" 
                                                            color="error"
                                                            onClick={() => handleDeleteClick(row)}
                                                            disabled={isDeleting}
                                                        >
                                                            Delete
                                                        </Button>
                                                    )}
                                                </Box>
                                            </TableCell>
                                        </TableRow>
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
            <Dialog open={statusDialogOpen} onClose={handleCancelStatusToggle}>
                <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, color: 'primary.main' }}>
                    <SwapHoriz /> Change Payment Status
                </DialogTitle>
                <DialogContent>
                    <DialogContentText>
                        Are you sure you want to change the payment status of order <strong>{orderToToggle?.orderNumber}</strong>?
                    </DialogContentText>
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
                        disabled={isTogglingStatus}
                        data-testid="confirm-status-toggle-btn"
                    >
                        {isTogglingStatus ? 'Updating...' : `Mark as ${orderToToggle?.paymentStatus === 'paid' ? 'Unpaid' : 'Paid'}`}
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
};
