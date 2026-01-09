import { Button, Paper, TextField, Typography, TableContainer, Table, TableHead, TableBody, TableCell, TableRow, Chip, Tooltip, Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, Box, IconButton } from '@mui/material';
import { useNavigate, useLocation } from 'react-router';
import { useDispatch, useSelector } from 'react-redux';
import { useEffect, useState, useRef, useLayoutEffect } from 'react';
import { listOrdersAction, deleteOrderAction  } from '../../../store/orders';
import { Pagination } from '../../common/pagination';
import { useAuth } from '../../../context/AuthContext';
import { Note, Warning, Clear, Refresh } from '@mui/icons-material';

// Key for storing scroll position
const SCROLL_POSITION_KEY = 'orders_scroll_position';
const SCROLL_FILTERS_KEY = 'orders_filters';

export const ListOrders = () => {

    const dispatch = useDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const { isAdmin } = useAuth();
    const { orders: { count, rows } } = useSelector(state => state.orderState);
    const tableRef = useRef(null);
    const scrollRestoredRef = useRef(false);
    const isInitialLoadRef = useRef(true);

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

    const [refetch, shouldFetch] = useState(true);
    const [filters, setFilters] = useState(getSavedFilters);
    
    // Delete confirmation dialog state
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [orderToDelete, setOrderToDelete] = useState(null);

    // Handle delete button click - open confirmation dialog
    const handleDeleteClick = (order) => {
        setOrderToDelete(order);
        setDeleteDialogOpen(true);
    };

    // Confirm delete
    const handleConfirmDelete = () => {
        if (orderToDelete) {
            dispatch(deleteOrderAction(orderToDelete.id, filters));
        }
        setDeleteDialogOpen(false);
        setOrderToDelete(null);
    };

    // Cancel delete
    const handleCancelDelete = () => {
        setDeleteDialogOpen(false);
        setOrderToDelete(null);
    };

    // Save filters whenever they change
    useEffect(() => {
        sessionStorage.setItem(SCROLL_FILTERS_KEY, JSON.stringify(filters));
    }, [filters]);

    useEffect(() => {
        if (refetch) {
            shouldFetch(false);
            dispatch(listOrdersAction(filters));
        }
    }, [refetch, dispatch, filters]);

    // Always fetch fresh data when component mounts
    useEffect(() => {
        // Force fresh fetch on every mount
        dispatch(listOrdersAction(filters));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Restore scroll position after data is loaded - use useLayoutEffect for sync scroll restoration
    useLayoutEffect(() => {
        if (rows.length > 0 && !scrollRestoredRef.current) {
            const savedPosition = sessionStorage.getItem(SCROLL_POSITION_KEY);
            if (savedPosition) {
                // Use requestAnimationFrame to ensure DOM is fully rendered
                requestAnimationFrame(() => {
                    window.scrollTo(0, parseInt(savedPosition, 10));
                    sessionStorage.removeItem(SCROLL_POSITION_KEY);
                    scrollRestoredRef.current = true;
                });
            }
            isInitialLoadRef.current = false;
        }
    }, [rows]);

    const paginate = (limit, offset) => {
        shouldFetch(true);
        // Clear scroll position when changing pages
        sessionStorage.removeItem(SCROLL_POSITION_KEY);
        scrollRestoredRef.current = false;
        setFilters((prevState) => {
            return {
                ...prevState,
                limit: limit,
                offset: offset,
            };
        });
    };

    const filterChangeHandler = (e) => {
        // Clear scroll position when filtering
        sessionStorage.removeItem(SCROLL_POSITION_KEY);
        scrollRestoredRef.current = false;
        setFilters((prevState) => {
            return {
                ...prevState,
                [e.target.id]: e.target.value
            };
        });
    }

    useEffect(() => {
        // Skip the initial load debounce effect if we're restoring from saved state
        if (isInitialLoadRef.current) {
            return;
        }
        
        const getData = setTimeout(() => {
            dispatch(listOrdersAction(filters));
        }, 500);
    
        return () => clearTimeout(getData);
    }, [filters.q, dispatch, filters]);

    // Save scroll position and navigate to edit
    const handleEditClick = (orderId) => {
        sessionStorage.setItem(SCROLL_POSITION_KEY, window.scrollY.toString());
        navigate(`edit/${orderId}`);
    };

    const handleDateChange = (e) => {
        sessionStorage.removeItem(SCROLL_POSITION_KEY);
        scrollRestoredRef.current = false;
        setFilters((prevState) => ({
            ...prevState,
            date: e.target.value,
            offset: 0  // Reset to first page when filtering
        }));
        shouldFetch(true);
    };

    const clearDateFilter = () => {
        setFilters((prevState) => ({
            ...prevState,
            date: "",
            offset: 0
        }));
        sessionStorage.removeItem(SCROLL_FILTERS_KEY); // Clear saved filters
        shouldFetch(true);
    };

    const clearAllFilters = () => {
        const defaultFilters = { limit: 25, offset: 0, q: "", date: "" };
        setFilters(defaultFilters);
        sessionStorage.removeItem(SCROLL_FILTERS_KEY);
        shouldFetch(true);
    };

    return (
        <>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap', mb: 2 }}>
                <TextField size="small" id="q" label="Search Order" onChange={filterChangeHandler} value={filters.q || ''} sx={{minWidth: '200px'}}></TextField>
                <TextField 
                    size="small" 
                    id="date" 
                    label="Filter by Date" 
                    type="date"
                    value={filters.date || ''}
                    onChange={handleDateChange}
                    InputLabelProps={{ shrink: true }}
                    sx={{minWidth: '180px'}}
                />
                {filters.date && (
                    <Button 
                        variant="outlined" 
                        size="small" 
                        onClick={clearDateFilter}
                        startIcon={<Clear />}
                    >
                        Clear Date
                    </Button>
                )}
                {(filters.date || filters.q) && (
                    <Button 
                        variant="text" 
                        size="small" 
                        color="error"
                        onClick={clearAllFilters}
                    >
                        Clear All Filters
                    </Button>
                )}
                <Tooltip title="Refresh list">
                    <IconButton 
                        color="primary" 
                        onClick={() => dispatch(listOrdersAction(filters))}
                        sx={{ ml: 1 }}
                    >
                        <Refresh />
                    </IconButton>
                </Tooltip>
                <Button variant="contained" onClick={() => navigate(`create`)}>Create Order</Button>
            </Box>

            <TableContainer component={Paper} ref={tableRef}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell><b>Order Number</b></TableCell>
                            <TableCell><b>Order Date</b></TableCell>
                            <TableCell><b>Name</b></TableCell>
                            <TableCell><b>Mobile</b></TableCell>
                            <TableCell><b>Subtotal</b></TableCell>
                            <TableCell><b>Tax</b></TableCell>
                            <TableCell><b>Total</b></TableCell>
                            <TableCell><b>Notes</b></TableCell>
                            <TableCell><b>Action</b></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {
                            rows.map((orderObj) => {
                                return (
                                    <TableRow key={orderObj.id} sx={orderObj.staffNotes ? { bgcolor: '#fff8e1' } : {}} id={`order-row-${orderObj.id}`}>
                                        <TableCell>{orderObj.orderNumber}</TableCell>
                                        <TableCell>{orderObj.orderDate}</TableCell>
                                        <TableCell>{orderObj.customerName}</TableCell>
                                        <TableCell>{orderObj.customerMobile}</TableCell>
                                        <TableCell>{orderObj.subTotal}</TableCell>
                                        <TableCell>{orderObj.tax} ({orderObj.taxPercent}%)</TableCell>
                                        <TableCell>{orderObj.total}</TableCell>
                                        <TableCell>
                                            {orderObj.staffNotes ? (
                                                <Tooltip title={orderObj.staffNotes.split('\n').slice(-1)[0]}>
                                                    <Chip 
                                                        icon={<Note />} 
                                                        label="Has Notes" 
                                                        size="small" 
                                                        color="warning"
                                                    />
                                                </Tooltip>
                                            ) : (
                                                <Typography variant="caption" color="text.secondary">-</Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Button variant='outlined' sx={{margin: '5px'}} onClick={() => handleEditClick(orderObj.id)}>
                                                {isAdmin ? 'Edit' : 'View/Note'}
                                            </Button>
                                            {isAdmin && (
                                                <Button 
                                                    variant='outlined' 
                                                    color="error"
                                                    sx={{margin: '5px'}} 
                                                    onClick={() => handleDeleteClick(orderObj)}
                                                >
                                                    Delete
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        }
                    </TableBody>
                </Table>
            </TableContainer>
            <Pagination
                limit={filters.limit}
                offset={filters.offset}
                count={count}
                updateFilters={paginate}
            />

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={deleteDialogOpen}
                onClose={handleCancelDelete}
                aria-labelledby="delete-dialog-title"
                aria-describedby="delete-dialog-description"
            >
                <DialogTitle id="delete-dialog-title" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Warning color="error" />
                    Confirm Delete
                </DialogTitle>
                <DialogContent>
                    <DialogContentText id="delete-dialog-description">
                        Are you sure you want to delete order <strong>{orderToDelete?.orderNumber}</strong>?
                        <br /><br />
                        <strong>Customer:</strong> {orderToDelete?.customerName}
                        <br />
                        <strong>Total:</strong> ₹{orderToDelete?.total}
                        <br /><br />
                        This action cannot be undone.
                    </DialogContentText>
                </DialogContent>
                <DialogActions sx={{ px: 3, pb: 2 }}>
                    <Button onClick={handleCancelDelete} variant="outlined">
                        Cancel
                    </Button>
                    <Button onClick={handleConfirmDelete} variant="contained" color="error" autoFocus>
                        Delete Order
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
}
