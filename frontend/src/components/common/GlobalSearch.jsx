import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Box, TextField, Paper, List, ListItem, ListItemIcon, ListItemText,
    Typography, CircularProgress, Chip, InputAdornment, Divider,
    ClickAwayListener, Fade, IconButton
} from '@mui/material';
import {
    Search, Receipt, People, LocalShipping, Close, KeyboardReturn,
    Phone, AttachMoney
} from '@mui/icons-material';
import axios from 'axios';

export const GlobalSearch = ({ onClose }) => {
    const navigate = useNavigate();
    const inputRef = useRef(null);
    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [results, setResults] = useState({ orders: [], customers: [], suppliers: [] });
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [showResults, setShowResults] = useState(false);

    // Focus input on mount
    useEffect(() => {
        // Use setTimeout to ensure the DOM is ready
        const timer = setTimeout(() => {
            inputRef.current?.focus();
        }, 100);
        return () => clearTimeout(timer);
    }, []);

    // Flatten results for keyboard navigation
    const flatResults = [
        ...results.orders.map(o => ({ type: 'order', data: o })),
        ...results.customers.map(c => ({ type: 'customer', data: c })),
        ...results.suppliers.map(s => ({ type: 'supplier', data: s }))
    ];

    // Search function with debounce
    const performSearch = useCallback(async (searchQuery) => {
        if (!searchQuery.trim() || searchQuery.length < 2) {
            setResults({ orders: [], customers: [], suppliers: [] });
            setShowResults(false);
            return;
        }

        setLoading(true);
        setShowResults(true);
        
        try {
            const token = localStorage.getItem('token');
            const headers = { Authorization: `Bearer ${token}` };
            
            // Search in parallel
            const [ordersRes, customersRes, suppliersRes] = await Promise.all([
                axios.get(`/api/orders?q=${encodeURIComponent(searchQuery)}&limit=5`, { headers }).catch(() => ({ data: { data: { rows: [] } } })),
                axios.get(`/api/customers?q=${encodeURIComponent(searchQuery)}&limit=5`, { headers }).catch(() => ({ data: { data: { rows: [] } } })),
                axios.get(`/api/suppliers?q=${encodeURIComponent(searchQuery)}&limit=5`, { headers }).catch(() => ({ data: { data: { rows: [] } } }))
            ]);

            setResults({
                orders: ordersRes.data?.data?.rows || [],
                customers: customersRes.data?.data?.rows || [],
                suppliers: suppliersRes.data?.data?.rows || []
            });
            setSelectedIndex(0);
        } catch (error) {
            console.error('Search error:', error);
        } finally {
            setLoading(false);
        }
    }, []);

    // Debounced search
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            performSearch(query);
        }, 300);
        return () => clearTimeout(timeoutId);
    }, [query, performSearch]);

    // Handle navigation
    const handleSelect = (item) => {
        if (item.type === 'order') {
            navigate(`/orders/edit/${item.data.id}`);
        } else if (item.type === 'customer') {
            navigate('/customers');
        } else if (item.type === 'supplier') {
            navigate('/suppliers');
        }
        onClose?.();
    };

    // Keyboard navigation
    const handleKeyDown = (e) => {
        if (e.key === 'Escape') {
            onClose?.();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => Math.min(prev + 1, flatResults.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter' && flatResults[selectedIndex]) {
            e.preventDefault();
            handleSelect(flatResults[selectedIndex]);
        }
    };

    const totalResults = results.orders.length + results.customers.length + results.suppliers.length;

    return (
        <ClickAwayListener onClickAway={() => onClose?.()}>
            <Box sx={{ position: 'relative', width: '100%', maxWidth: 600 }}>
                <TextField
                    inputRef={inputRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search orders, customers, suppliers... (Ctrl+K)"
                    fullWidth
                    size="small"
                    autoFocus
                    data-testid="global-search-input"
                    InputProps={{
                        startAdornment: (
                            <InputAdornment position="start">
                                {loading ? <CircularProgress size={20} /> : <Search />}
                            </InputAdornment>
                        ),
                        endAdornment: query && (
                            <InputAdornment position="end">
                                <IconButton size="small" onClick={() => setQuery('')}>
                                    <Close fontSize="small" />
                                </IconButton>
                            </InputAdornment>
                        ),
                        sx: {
                            bgcolor: 'rgba(255,255,255,0.15)',
                            borderRadius: 2,
                            '& input': { color: 'white' },
                            '& .MuiInputAdornment-root': { color: 'rgba(255,255,255,0.7)' }
                        }
                    }}
                    sx={{ '& fieldset': { border: 'none' } }}
                />

                {/* Results dropdown */}
                <Fade in={showResults && (totalResults > 0 || query.length >= 2)}>
                    <Paper
                        sx={{
                            position: 'absolute',
                            top: '100%',
                            left: 0,
                            right: 0,
                            mt: 1,
                            maxHeight: 400,
                            overflow: 'auto',
                            zIndex: 1300,
                            boxShadow: 8,
                            borderRadius: 2
                        }}
                    >
                        {totalResults === 0 && !loading && query.length >= 2 ? (
                            <Box sx={{ p: 2, textAlign: 'center' }}>
                                <Typography color="text.secondary">
                                    No results found for "{query}"
                                </Typography>
                            </Box>
                        ) : (
                            <List dense disablePadding>
                                {/* Orders Section */}
                                {results.orders.length > 0 && (
                                    <>
                                        <ListItem sx={{ bgcolor: '#f5f5f5', py: 0.5 }}>
                                            <Typography variant="caption" fontWeight="bold" color="text.secondary">
                                                ORDERS ({results.orders.length})
                                            </Typography>
                                        </ListItem>
                                        {results.orders.map((order, idx) => {
                                            const isSelected = selectedIndex === idx;
                                            return (
                                                <ListItem
                                                    key={order.id}
                                                    button
                                                    selected={isSelected}
                                                    onClick={() => handleSelect({ type: 'order', data: order })}
                                                    data-testid={`search-result-order-${order.id}`}
                                                    sx={{ '&:hover': { bgcolor: '#e3f2fd' } }}
                                                >
                                                    <ListItemIcon sx={{ minWidth: 36 }}>
                                                        <Receipt color="primary" fontSize="small" />
                                                    </ListItemIcon>
                                                    <ListItemText
                                                        primary={
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                <Typography variant="body2" fontWeight="bold">
                                                                    {order.orderNumber}
                                                                </Typography>
                                                                <Chip
                                                                    label={order.paymentStatus}
                                                                    size="small"
                                                                    color={order.paymentStatus === 'paid' ? 'success' : 'warning'}
                                                                    sx={{ height: 18, fontSize: '0.65rem' }}
                                                                />
                                                            </Box>
                                                        }
                                                        secondary={
                                                            <Typography variant="caption" color="text.secondary">
                                                                {order.customerName || 'Walk-in'} • ₹{(order.total || 0).toLocaleString('en-IN')} • {order.orderDate}
                                                            </Typography>
                                                        }
                                                    />
                                                    {isSelected && <KeyboardReturn fontSize="small" color="action" />}
                                                </ListItem>
                                            );
                                        })}
                                    </>
                                )}

                                {/* Customers Section */}
                                {results.customers.length > 0 && (
                                    <>
                                        <Divider />
                                        <ListItem sx={{ bgcolor: '#f5f5f5', py: 0.5 }}>
                                            <Typography variant="caption" fontWeight="bold" color="text.secondary">
                                                CUSTOMERS ({results.customers.length})
                                            </Typography>
                                        </ListItem>
                                        {results.customers.map((customer, idx) => {
                                            const actualIdx = results.orders.length + idx;
                                            const isSelected = selectedIndex === actualIdx;
                                            return (
                                                <ListItem
                                                    key={customer.id}
                                                    button
                                                    selected={isSelected}
                                                    onClick={() => handleSelect({ type: 'customer', data: customer })}
                                                    data-testid={`search-result-customer-${customer.id}`}
                                                    sx={{ '&:hover': { bgcolor: '#e8f5e9' } }}
                                                >
                                                    <ListItemIcon sx={{ minWidth: 36 }}>
                                                        <People color="success" fontSize="small" />
                                                    </ListItemIcon>
                                                    <ListItemText
                                                        primary={
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                <Typography variant="body2" fontWeight="bold">
                                                                    {customer.name}
                                                                </Typography>
                                                                {customer.balance > 0 && (
                                                                    <Chip
                                                                        icon={<AttachMoney sx={{ fontSize: '0.7rem !important' }} />}
                                                                        label={`₹${customer.balance?.toLocaleString('en-IN')}`}
                                                                        size="small"
                                                                        color="warning"
                                                                        sx={{ height: 18, fontSize: '0.65rem' }}
                                                                    />
                                                                )}
                                                            </Box>
                                                        }
                                                        secondary={
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                                {customer.mobile && (
                                                                    <>
                                                                        <Phone sx={{ fontSize: 12 }} />
                                                                        <Typography variant="caption">{customer.mobile}</Typography>
                                                                    </>
                                                                )}
                                                            </Box>
                                                        }
                                                    />
                                                    {isSelected && <KeyboardReturn fontSize="small" color="action" />}
                                                </ListItem>
                                            );
                                        })}
                                    </>
                                )}

                                {/* Suppliers Section */}
                                {results.suppliers.length > 0 && (
                                    <>
                                        <Divider />
                                        <ListItem sx={{ bgcolor: '#f5f5f5', py: 0.5 }}>
                                            <Typography variant="caption" fontWeight="bold" color="text.secondary">
                                                SUPPLIERS ({results.suppliers.length})
                                            </Typography>
                                        </ListItem>
                                        {results.suppliers.map((supplier, idx) => {
                                            const actualIdx = results.orders.length + results.customers.length + idx;
                                            const isSelected = selectedIndex === actualIdx;
                                            return (
                                                <ListItem
                                                    key={supplier.id}
                                                    button
                                                    selected={isSelected}
                                                    onClick={() => handleSelect({ type: 'supplier', data: supplier })}
                                                    data-testid={`search-result-supplier-${supplier.id}`}
                                                    sx={{ '&:hover': { bgcolor: '#fff3e0' } }}
                                                >
                                                    <ListItemIcon sx={{ minWidth: 36 }}>
                                                        <LocalShipping color="warning" fontSize="small" />
                                                    </ListItemIcon>
                                                    <ListItemText
                                                        primary={
                                                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                                                <Typography variant="body2" fontWeight="bold">
                                                                    {supplier.name}
                                                                </Typography>
                                                                {supplier.balance > 0 && (
                                                                    <Chip
                                                                        icon={<AttachMoney sx={{ fontSize: '0.7rem !important' }} />}
                                                                        label={`₹${supplier.balance?.toLocaleString('en-IN')}`}
                                                                        size="small"
                                                                        color="error"
                                                                        sx={{ height: 18, fontSize: '0.65rem' }}
                                                                    />
                                                                )}
                                                            </Box>
                                                        }
                                                        secondary={
                                                            <Typography variant="caption" color="text.secondary">
                                                                {supplier.gstin || 'Supplier'}
                                                            </Typography>
                                                        }
                                                    />
                                                    {isSelected && <KeyboardReturn fontSize="small" color="action" />}
                                                </ListItem>
                                            );
                                        })}
                                    </>
                                )}

                                {/* Keyboard hint */}
                                <Divider />
                                <Box sx={{ px: 2, py: 1, bgcolor: '#fafafa', display: 'flex', gap: 2, justifyContent: 'center' }}>
                                    <Typography variant="caption" color="text.secondary">
                                        <kbd style={{ background: '#eee', padding: '2px 6px', borderRadius: 3 }}>↑↓</kbd> Navigate
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        <kbd style={{ background: '#eee', padding: '2px 6px', borderRadius: 3 }}>Enter</kbd> Select
                                    </Typography>
                                    <Typography variant="caption" color="text.secondary">
                                        <kbd style={{ background: '#eee', padding: '2px 6px', borderRadius: 3 }}>Esc</kbd> Close
                                    </Typography>
                                </Box>
                            </List>
                        )}
                    </Paper>
                </Fade>
            </Box>
        </ClickAwayListener>
    );
};

export default GlobalSearch;
