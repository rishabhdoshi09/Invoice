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
  Tooltip
} from '@mui/material';
import { Edit as EditIcon, Save as SaveIcon, Cancel as CancelIcon } from '@mui/icons-material';
import { getOrderAction } from '../../../store/orders';
import { setNotification } from '../../../store/application';

export const EditOrder = () => {
  const { orderId } = useParams();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  
  const [orderData, setOrderData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingItemId, setEditingItemId] = useState(null);
  const [editedItems, setEditedItems] = useState({});
  const [saving, setSaving] = useState(false);

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
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Order Details</Typography>
        <Button variant="outlined" onClick={() => navigate('/orders')}>
          Back to Orders
        </Button>
      </Box>

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
                label="Customer Name"
                value={orderData.customerName || ''}
                InputProps={{ readOnly: true }}
              />
            </Grid>
            <Grid item xs={12} md={6}>
              <TextField
                fullWidth
                label="Customer Mobile"
                value={orderData.customerMobile || ''}
                InputProps={{ readOnly: true }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                label="Subtotal"
                value={`₹${orderData.subTotal}`}
                InputProps={{ readOnly: true }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                label="Tax"
                value={`₹${orderData.tax} (${orderData.taxPercent}%)`}
                InputProps={{ readOnly: true }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
                label="Total"
                value={`₹${orderData.total}`}
                InputProps={{ readOnly: true }}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <TextField
                fullWidth
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
                  <TableCell align="right"><b>Quantity</b></TableCell>
                  <TableCell align="right"><b>Price</b></TableCell>
                  <TableCell align="right"><b>Total</b></TableCell>
                  <TableCell><b>Type</b></TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {orderData.orderItems && orderData.orderItems.length > 0 ? (
                  orderData.orderItems.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>{item.name}</TableCell>
                      <TableCell align="right">{item.quantity}</TableCell>
                      <TableCell align="right">₹{item.productPrice}</TableCell>
                      <TableCell align="right">₹{item.totalPrice}</TableCell>
                      <TableCell>{item.type}</TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      No items found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>
    </Box>
  );
};
