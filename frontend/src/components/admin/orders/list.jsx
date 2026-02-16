import { Button, Paper, TextField, Typography, TableContainer, Table, TableHead, TableBody, TableCell, TableRow, Chip, Tooltip, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Box, IconButton, CircularProgress, Autocomplete, Alert } from '@mui/material';
import { useNavigate } from 'react-router';
import { useState, useRef, useLayoutEffect, useEffect, useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { listOrdersAction, deleteOrderAction } from '../../../store/orders';
import { Pagination } from '../../common/pagination';
import { useAuth } from '../../../context/AuthContext';
import { Note, Warning, Clear, Refresh, SwapHoriz, PersonAdd, Person } from '@mui/icons-material';
import axios from 'axios';

// Key for storing scroll position
const SCROLL_POSITION_KEY = 'orders_scroll_position';
const SCROLL_FILTERS_KEY = 'orders_filters';

export const ListOrders = () => {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const { isAdmin, isBillingStaff, user } = useAuth();
    const scrollRestoredRef = useRef(false);
    const isInitialLoadRef = useRef(true);
    
    // Both admin and billing staff can toggle payment status
    const canToggleStatus = isAdmin || isBillingStaff;

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
    const [customers, setCustomers] = useState([]);
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [isNewCustomer, setIsNewCustomer] = useState(false);
    const [loadingCustomers, setLoadingCustomers] = useState(false);
    const [changedByName, setChangedByName] = useState(''); // Mandatory name for audit

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
        // Pre-fill changedByName with current user's name if available
        setChangedByName(user?.name || '');
        // Reset selection states
        setSelectedCustomer(null);
        setIsNewCustomer(false);
        // Fetch customers when opening dialog (for toggling to unpaid)
        if (order.paymentStatus === 'paid') {
            fetchCustomers();
            // Try to find existing customer match
            if (order.customerName) {
                // Will be matched after customers are loaded
            }
        }
        setStatusDialogOpen(true);
    };

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
                                                {canToggleStatus ? (
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
            <Dialog open={statusDialogOpen} onClose={handleCancelStatusToggle} maxWidth="sm" fullWidth>
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
                        disabled={isTogglingStatus || (orderToToggle?.paymentStatus === 'paid' && !customerInfo.customerName?.trim())}
                        data-testid="confirm-status-toggle-btn"
                    >
                        {isTogglingStatus ? 'Updating...' : `Mark as ${orderToToggle?.paymentStatus === 'paid' ? 'Unpaid' : 'Paid'}`}
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
};
