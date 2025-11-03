import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Box, TextField, Button, Typography, Card, Alert } from '@mui/material';
import axios from 'axios';

export const FocusedPriceEdit = () => {
    const { productId } = useParams();
    const navigate = useNavigate();
    const [product, setProduct] = useState(null);
    const [newPrice, setNewPrice] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchProduct();
    }, [productId]);

    const fetchProduct = async () => {
        try {
            setLoading(true);
            const { data } = await axios.get(`/api/products/${productId}`);
            setProduct(data.data);
            setNewPrice(data.data.pricePerKg.toString());
        } catch (error) {
            console.error('Error fetching product:', error);
            setError('Product not found');
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!newPrice || isNaN(newPrice) || parseFloat(newPrice) < 0) {
            setError('Please enter a valid price');
            return;
        }

        try {
            await axios.put(`/api/products/${productId}`, {
                ...product,
                pricePerKg: parseFloat(newPrice)
            });
            navigate('/products', { state: { message: 'Price updated successfully' } });
        } catch (error) {
            console.error('Error updating price:', error);
            setError('Failed to update price. Please try again.');
        }
    };

    const handleCancel = () => {
        navigate('/products');
    };

    if (loading) {
        return (
            <Box sx={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                minHeight: '100vh',
                bgcolor: '#f5f5f5'
            }}>
                <Typography variant="h6">Loading...</Typography>
            </Box>
        );
    }

    if (error && !product) {
        return (
            <Box sx={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                minHeight: '100vh',
                bgcolor: '#f5f5f5'
            }}>
                <Card sx={{ p: 4 }}>
                    <Alert severity="error">{error}</Alert>
                    <Button onClick={handleCancel} sx={{ mt: 2 }}>Go Back</Button>
                </Card>
            </Box>
        );
    }

    return (
        <Box sx={{ 
            minHeight: '100vh',
            bgcolor: '#f5f5f5',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            p: 3
        }}>
            {/* Product Name - Clear and Large */}
            <Typography 
                variant="h4" 
                sx={{ 
                    mb: 4, 
                    fontWeight: 500,
                    color: '#333',
                    textAlign: 'center'
                }}
            >
                {product?.name}
            </Typography>

            {/* Current Price Reference */}
            <Typography 
                variant="h6" 
                sx={{ 
                    mb: 1, 
                    color: '#666',
                    textAlign: 'center'
                }}
            >
                Current Price:
            </Typography>
            <Typography 
                variant="h3" 
                sx={{ 
                    mb: 6, 
                    color: '#999',
                    fontWeight: 300,
                    textAlign: 'center'
                }}
            >
                ₹{product?.pricePerKg}
            </Typography>

            {/* New Price Input - Large and Clear */}
            <Box sx={{ width: '100%', maxWidth: 500, mb: 4 }}>
                <Typography 
                    variant="h6" 
                    sx={{ 
                        mb: 2, 
                        color: '#333',
                        textAlign: 'center',
                        fontWeight: 600
                    }}
                >
                    Enter New Price
                </Typography>
                <TextField
                    fullWidth
                    value={newPrice}
                    onChange={(e) => {
                        setNewPrice(e.target.value);
                        setError('');
                    }}
                    type="number"
                    inputProps={{ 
                        min: 0,
                        step: 0.01,
                        style: { 
                            fontSize: '3rem',
                            textAlign: 'center',
                            fontWeight: 500,
                            padding: '24px'
                        }
                    }}
                    sx={{
                        '& .MuiOutlinedInput-root': {
                            bgcolor: 'white',
                            '& fieldset': {
                                borderWidth: '3px',
                                borderColor: newPrice && parseFloat(newPrice) !== product?.pricePerKg ? '#1976d2' : '#ccc'
                            },
                            '&:hover fieldset': {
                                borderColor: '#1976d2',
                            },
                            '&.Mui-focused fieldset': {
                                borderColor: '#1976d2',
                            }
                        }
                    }}
                    autoFocus
                />
            </Box>

            {/* Price Preview */}
            {newPrice && !isNaN(newPrice) && (
                <Typography 
                    variant="h5" 
                    sx={{ 
                        mb: 4, 
                        color: parseFloat(newPrice) !== product?.pricePerKg ? '#1976d2' : '#999',
                        fontWeight: 600,
                        textAlign: 'center'
                    }}
                >
                    New Price: ₹{parseFloat(newPrice).toFixed(2)}
                </Typography>
            )}

            {/* Error Message */}
            {error && (
                <Alert severity="error" sx={{ mb: 3, maxWidth: 500 }}>
                    {error}
                </Alert>
            )}

            {/* Action Buttons */}
            <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                <Button
                    variant="outlined"
                    size="large"
                    onClick={handleCancel}
                    sx={{ 
                        minWidth: 150,
                        fontSize: '1.1rem',
                        py: 1.5
                    }}
                >
                    Cancel
                </Button>
                <Button
                    variant="contained"
                    size="large"
                    onClick={handleSave}
                    disabled={!newPrice || parseFloat(newPrice) === product?.pricePerKg}
                    sx={{ 
                        minWidth: 150,
                        fontSize: '1.1rem',
                        py: 1.5
                    }}
                >
                    Save Price
                </Button>
            </Box>
        </Box>
    );
};
