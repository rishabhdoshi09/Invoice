import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import axios from 'axios';
import {
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  TextField,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  CircularProgress,
  Alert,
  IconButton,
  Tooltip,
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions
} from '@mui/material';
import { Edit as EditIcon, Save as SaveIcon, Cancel as CancelIcon, NoteAdd, Send, Delete, Warning } from '@mui/icons-material';
import { getOrderAction, deleteOrderAction } from '../../../store/orders';
import { setNotification } from '../../../store/application';
import { useAuth } from '../../../context/AuthContext';

export const EditOrder = () => {
  const { orderId } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  
  const [orderData, setOrderData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editedItems, setEditedItems] = useState({});
  const [saving, setSaving] = useState(false);
  const [newNote, setNewNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  
  // Delete confirmation state
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const fetchOrderData = async () => {
      setLoading(true);
      const data = await dispatch(getOrderAction(orderId));
      if (data) {
        setOrderData(data);
        // Initialize edited items with original data
        const itemsMap = {};
        data.orderItems?.forEach(item => {
          itemsMap[item.id] = {
            ...item,
            originalTotal: item.totalPrice
          };
        });
        setEditedItems(itemsMap);
      }
      setLoading(false);
    };

    if (orderId) {
      fetchOrderData();
    }
  }, [orderId, dispatch]);

  const handleEditItem = (itemId) => {
    setEditingItemId(itemId);
  };

  const handleCancelEdit = (itemId) => {
    // Reset to original values
    setEditedItems(prev => ({
      ...prev,
      [itemId]: {
        ...orderData.orderItems.find(item => item.id === itemId),
        originalTotal: prev[itemId].originalTotal
      }
    }));
    setEditingItemId(null);
  };

  const handleItemChange = (itemId, field, value) => {
    const numValue = parseFloat(value) || 0;
    setEditedItems(prev => {
      const item = prev[itemId];
      const updated = { ...item, [field]: numValue };
      
      // Recalculate the other field to maintain total
      if (field === 'quantity' && numValue > 0) {
        updated.productPrice = parseFloat((item.originalTotal / numValue).toFixed(2));
      } else if (field === 'productPrice' && numValue > 0) {
        updated.quantity = parseFloat((item.originalTotal / numValue).toFixed(2));
      }
      
      // Ensure total remains the same
      updated.totalPrice = item.originalTotal;
      
      return { ...prev, [itemId]: updated };
    });
  };

  const handleSaveItem = (itemId) => {
    const item = editedItems[itemId];
    const calculatedTotal = parseFloat((item.quantity * item.productPrice).toFixed(2));
    
    // Validate that the total matches (with small tolerance for floating point)
    if (Math.abs(calculatedTotal - item.originalTotal) > 0.01) {
      dispatch(setNotification({
        open: true,
        severity: 'error',
        message: `Total must remain ${item.originalTotal}. Current: ${calculatedTotal}`
      }));
      return;
    }
    
    setEditingItemId(null);
  };

  const handleSaveOrder = async () => {
    try {
      setSaving(true);
      
      dispatch(setNotification({
        open: true,
        severity: 'info',
        message: 'Saving order... Please wait.'
      }));
      
      // Prepare updated order items
      const updatedOrderItems = Object.values(editedItems).map(item => ({
        id: item.id,
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        productPrice: item.productPrice,
        totalPrice: item.originalTotal, // Keep original total
        type: item.type
      }));
      
      // Verify grand total hasn't changed
      const newSubTotal = updatedOrderItems.reduce((sum, item) => sum + item.totalPrice, 0);
      if (Math.abs(newSubTotal - orderData.subTotal) > 0.01) {
        dispatch(setNotification({
          open: true,
          severity: 'error',
          message: 'Grand total cannot be changed!'
        }));
        setSaving(false);
        return;
      }
      
      // Update order in backend
      const payload = {
        ...orderData,
        orderItems: updatedOrderItems
      };
      
      await axios.put(`/api/orders/${orderId}`, payload, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000 // 10 second timeout
      });
      
      dispatch(setNotification({
        open: true,
        severity: 'success',
        message: 'Order updated successfully!'
      }));
      
      // Refresh order data
      const refreshedData = await dispatch(getOrderAction(orderId));
      if (refreshedData) {
        setOrderData(refreshedData);
        // Re-initialize edited items
        const itemsMap = {};
        refreshedData.orderItems?.forEach(item => {
          itemsMap[item.id] = {
            ...item,
            originalTotal: item.totalPrice
          };
        });
        setEditedItems(itemsMap);
      }
      
      setSaving(false);
    } catch (error) {
      console.error('Error saving order:', error);
      dispatch(setNotification({
        open: true,
        severity: 'error',
        message: error.response?.data?.message || 'Failed to save order. Please try again.'
      }));
      setSaving(false);
    }
  };

  const handleAddNote = async () => {
    if (!newNote.trim()) {
      dispatch(setNotification({
        open: true,
        severity: 'warning',
        message: 'Please enter a note'
      }));
      return;
    }

    try {
      setSavingNote(true);
      
      await axios.post(`/api/orders/${orderId}/notes`, {
        note: newNote.trim()
      });

      dispatch(setNotification({
        open: true,
        severity: 'success',
        message: 'Note added successfully!'
      }));

      // Refresh order data to show updated notes
      const refreshedData = await dispatch(getOrderAction(orderId));
      if (refreshedData) {
        setOrderData(refreshedData);
      }

      setNewNote('');
      setSavingNote(false);
    } catch (error) {
      console.error('Error adding note:', error);
      dispatch(setNotification({
        open: true,
        severity: 'error',
        message: error.response?.data?.message || 'Failed to add note'
      }));
      setSavingNote(false);
    }
  };

  // Delete order handlers
  const handleDeleteClick = () => {
    setDeleteDialogOpen(true);
  };

  const handleDeleteCancel = () => {
    setDeleteDialogOpen(false);
  };

  const handleDeleteConfirm = async () => {
    try {
      setDeleting(true);
      await dispatch(deleteOrderAction(orderId));
      dispatch(setNotification({
        open: true,
        severity: 'success',
        message: 'Invoice deleted successfully!'
      }));
      setDeleteDialogOpen(false);
      navigate('/orders');
    } catch (error) {
      console.error('Error deleting order:', error);
      dispatch(setNotification({
        open: true,
        severity: 'error',
        message: error.response?.data?.message || 'Failed to delete invoice'
      }));
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (!orderData) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" color="error">Order not found</Typography>
        <Button variant="contained" onClick={() => navigate('/orders')} sx={{ mt: 2 }}>
          Back to Orders
        </Button>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3, position: 'relative' }}>
      {/* Loading Overlay */}
      {saving && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999
          }}
        >
          <CircularProgress size={60} sx={{ color: 'white' }} />
          <Typography variant="h6" sx={{ color: 'white', mt: 2 }}>
            Saving order changes...
          </Typography>
        </Box>
      )}

      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Edit Order</Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          {isAdmin && (
            <Button 
              variant="outlined" 
              color="error"
              onClick={handleDeleteClick}
              disabled={saving || deleting}
              startIcon={<Delete />}
            >
              Delete Invoice
            </Button>
          )}
          <Button 
            variant="contained" 
            color="primary"
            onClick={handleSaveOrder}
            disabled={saving || editingItemId !== null}
            startIcon={<SaveIcon />}
          >
            Save Order
          </Button>
          <Button variant="outlined" onClick={() => navigate('/orders')} disabled={saving}>
            Back to Orders
          </Button>
        </Box>
      </Box>

      <Alert severity="info" sx={{ mb: 3 }}>
        You can adjust price and quantity for each item, but the item total and grand total will remain locked.
        For example: 2×3=6 can become 6×1=6 or 1×6=6
      </Alert>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" color="textSecondary">Order Number</Typography>
              <Typography variant="h6">{orderData.orderNumber}</Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <Typography variant="subtitle2" color="textSecondary">Order Date</Typography>
              <Typography variant="h6">{orderData.orderDate}</Typography>
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                size="small"
                label="Customer Name"
                value={orderData.customerName || ''}
                InputProps={{ readOnly: true }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                size="small"
                label="Customer Mobile"
                value={orderData.customerMobile || ''}
                InputProps={{ readOnly: true }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                size="small"
                label="Subtotal (Locked)"
                value={`₹${orderData.subTotal}`}
                InputProps={{ readOnly: true }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                size="small"
                label="Tax"
                value={`₹${orderData.tax} (${orderData.taxPercent}%)`}
                InputProps={{ readOnly: true }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                size="small"
                label="Grand Total (Locked)"
                value={`₹${orderData.total}`}
                InputProps={{ readOnly: true }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    backgroundColor: '#f0f0f0',
                    fontWeight: 'bold'
                  }
                }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                size="small"
                label="Payment Status"
                value={orderData.paymentStatus || 'N/A'}
                InputProps={{ readOnly: true }}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>Order Items</Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell><b>Product Name</b></TableCell>
                  <TableCell><b>Alt Name</b></TableCell>
                  <TableCell align="right"><b>Quantity</b></TableCell>
                  <TableCell align="right"><b>Price</b></TableCell>
                  <TableCell align="right"><b>Total (Locked)</b></TableCell>
                  <TableCell><b>Type</b></TableCell>
                  <TableCell align="center"><b>Actions</b></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orderData.orderItems && orderData.orderItems.length > 0 ? (
                  orderData.orderItems.map((item) => {
                    const isEditing = editingItemId === item.id;
                    const editedItem = editedItems[item.id] || item;
                    
                    return (
                      <TableRow key={item.id}>
                        <TableCell>{item.name}</TableCell>
                        <TableCell sx={{ color: 'text.secondary', fontStyle: 'italic' }}>
                          {item.altName || '-'}
                        </TableCell>
                        <TableCell align="right">
                          {isEditing ? (
                            <TextField
                              type="number"
                              size="small"
                              value={editedItem.quantity}
                              onChange={(e) => handleItemChange(item.id, 'quantity', e.target.value)}
                              inputProps={{ min: 0.01, step: 0.01 }}
                              sx={{ width: 100 }}
                            />
                          ) : (
                            editedItem.quantity
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {isEditing ? (
                            <TextField
                              type="number"
                              size="small"
                              value={editedItem.productPrice}
                              onChange={(e) => handleItemChange(item.id, 'productPrice', e.target.value)}
                              inputProps={{ min: 0.01, step: 0.01 }}
                              sx={{ width: 100 }}
                            />
                          ) : (
                            `₹${editedItem.productPrice}`
                          )}
                        </TableCell>
                        <TableCell align="right" sx={{ fontWeight: 'bold', backgroundColor: '#f9f9f9' }}>
                          ₹{editedItem.originalTotal || item.totalPrice}
                        </TableCell>
                        <TableCell>{item.type}</TableCell>
                        <TableCell align="center">
                          {isEditing ? (
                            <Box>
                              <Tooltip title="Save">
                                <IconButton 
                                  size="small" 
                                  color="primary"
                                  onClick={() => handleSaveItem(item.id)}
                                >
                                  <SaveIcon />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Cancel">
                                <IconButton 
                                  size="small" 
                                  color="default"
                                  onClick={() => handleCancelEdit(item.id)}
                                >
                                  <CancelIcon />
                                </IconButton>
                              </Tooltip>
                            </Box>
                          ) : (
                            <Tooltip title="Edit item">
                              <IconButton 
                                size="small" 
                                color="primary"
                                onClick={() => handleEditItem(item.id)}
                              >
                                <EditIcon />
                              </IconButton>
                            </Tooltip>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableRow>
                    <TableCell colSpan={7} align="center">
                      No items found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Staff Notes Section */}
      <Card sx={{ mt: 3 }}>
        <CardContent>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <NoteAdd color="primary" />
            <Typography variant="h6">
              Staff Notes
              {!isAdmin && (
                <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                  (Use this to report any issues with this order)
                </Typography>
              )}
            </Typography>
          </Box>

          {/* Existing Notes */}
          {orderData.staffNotes ? (
            <Paper 
              variant="outlined" 
              sx={{ 
                p: 2, 
                mb: 2, 
                bgcolor: '#fffde7',
                maxHeight: 200,
                overflow: 'auto'
              }}
            >
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Notes History:
              </Typography>
              {orderData.staffNotes.split('\n').map((note, idx) => (
                <Typography key={idx} variant="body2" sx={{ mb: 0.5, fontFamily: 'monospace' }}>
                  {note}
                </Typography>
              ))}
            </Paper>
          ) : (
            <Alert severity="info" sx={{ mb: 2 }}>
              No notes yet. {!isAdmin && 'Add a note if you need to report any issues with this order.'}
            </Alert>
          )}

          {/* Add New Note */}
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" gutterBottom>
            Add New Note:
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <TextField
              fullWidth
              multiline
              rows={2}
              placeholder="Enter your note here... (e.g., Wrong quantity, customer complaint, etc.)"
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              disabled={savingNote}
              size="small"
            />
            <Button
              variant="contained"
              onClick={handleAddNote}
              disabled={savingNote || !newNote.trim()}
              sx={{ minWidth: 100 }}
              startIcon={savingNote ? <CircularProgress size={16} /> : <Send />}
            >
              {savingNote ? 'Saving...' : 'Add'}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};
