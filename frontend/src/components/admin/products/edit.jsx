
import { useDispatch, useSelector } from "react-redux";
import { useFormik } from "formik";
import { Box, Button, Grid, Select, MenuItem, TextField, Typography } from "@mui/material";
import { useState, useEffect } from "react";

import { updateProductAction } from "../../../store/products";
import { ProductType } from "../../../enums/product";

export const EditProduct = ({ productId }) => {

    const dispatch = useDispatch();
    const { products: { rows} } = useSelector(state => state.productState);
    
    // Use local state for price input to avoid conversion issues during typing
    const [priceInput, setPriceInput] = useState(String(rows[productId].pricePerKg));
    
    const formik = useFormik({
        initialValues: {
            name: rows[productId].name,
            pricePerKg: rows[productId].pricePerKg,
            type: rows[productId].type
        },
        validate: (values) => {
            const errors = {};
            if (values.name === "") {
                errors.name = "Product name is required"
            }
            if (values.pricePerKg === "" || values.pricePerKg === null || isNaN(values.pricePerKg)) {
                errors.pricePerKg = "Product price is required"
            }
            return errors;
        },
        validateOnBlur: true,
        onSubmit: async (values) => {
            await dispatch(updateProductAction(productId, values));
        }
    });

    // Sync price input to formik when user stops typing (on blur)
    const handlePriceBlur = () => {
        const numValue = parseFloat(priceInput);
        if (!isNaN(numValue)) {
            formik.setFieldValue('pricePerKg', numValue);
        }
    };

    // Handle price input change - keep as string during typing
    const handlePriceChange = (e) => {
        const value = e.target.value;
        setPriceInput(value);
        // Also update formik immediately for validation
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
            formik.setFieldValue('pricePerKg', numValue);
        }
    };

    // Reset local state when product changes
    useEffect(() => {
        setPriceInput(String(rows[productId].pricePerKg));
    }, [productId, rows]);

    // Check if product is high-value (≥300)
    const isHighValue = rows[productId].pricePerKg >= 300;

    // If high-value product, show clean focused interface
    if (isHighValue) {
        return (
            <Box 
                sx={{ 
                    bgcolor: 'white', 
                    p: 4,
                    minHeight: '400px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center'
                }}
            >
                {/* Product Name - Large and Clear */}
                <Typography 
                    variant="h4" 
                    sx={{ 
                        mb: 4, 
                        fontWeight: 500,
                        color: '#333',
                        textAlign: 'center'
                    }}
                >
                    {rows[productId].name}
                </Typography>

                {/* Current Price Display */}
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
                    ₹{rows[productId].pricePerKg}
                </Typography>

                {/* Price Input - Large and Focused */}
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
                        id="pricePerKg"
                        type="text"
                        inputMode="decimal"
                        name="pricePerKg"
                        value={priceInput}
                        onChange={handlePriceChange}
                        onBlur={handlePriceBlur}
                        required
                        error={Boolean(formik.errors.pricePerKg)}
                        helperText={formik.errors.pricePerKg}
                        inputProps={{ 
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
                                    borderColor: parseFloat(priceInput) !== rows[productId].pricePerKg ? '#1976d2' : '#ccc'
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
                {priceInput && !isNaN(parseFloat(priceInput)) && (
                    <Typography 
                        variant="h5" 
                        sx={{ 
                            mb: 4, 
                            color: parseFloat(priceInput) !== rows[productId].pricePerKg ? '#1976d2' : '#999',
                            fontWeight: 600,
                            textAlign: 'center'
                        }}
                    >
                        New Price: ₹{parseFloat(priceInput).toFixed(2)}
                    </Typography>
                )}

                {/* Update Button */}
                <Button 
                    variant="contained" 
                    size="large"
                    onClick={formik.handleSubmit}
                    disabled={parseFloat(priceInput) === rows[productId].pricePerKg || isNaN(parseFloat(priceInput))}
                    sx={{ 
                        minWidth: 200,
                        fontSize: '1.1rem',
                        py: 1.5,
                        mt: 2
                    }}
                >
                    Update Price
                </Button>
                </Button>
            </Box>
        );
    }

    // Regular edit interface for products < 300
    return (    
        <Box component={"form"} noValidate autoComplete="off">
            <Grid container spacing={2}>
                <Grid item xs={12} md={3} >
                    <TextField
                        size="small"
                        id="name"
                        name="name"
                        label="Product Name"
                        value={formik.values.name}
                        onChange={formik.handleChange}
                        required
                        fullWidth
                        error={formik.errors.name}
                        helperText={formik.errors.name}
                    />
                </Grid>
                <Grid item xs={12} md={3} >
                    <TextField
                        size="small"
                        id="pricePerKg"
                        type="number"
                        name="pricePerKg"
                        label="Product Price (per Kg)"
                        value={formik.values.pricePerKg}
                        onChange={formik.handleChange}
                        required
                        fullWidth
                        error={formik.errors.pricePerKg}
                        helperText={formik.errors.pricePerKg}
                    />
                </Grid>

                <Grid item xs={12} md={3} >
                    <Select
                        size="small"
                        id="type"
                        name="type"
                        value={formik.values.type}
                        label="Select Product Type"
                        onChange={formik.handleChange}
                        required
                        fullWidth
                    >
                        <MenuItem value={ProductType.WEIGHTED}>Weighted</MenuItem>
                        <MenuItem value={ProductType.NONWEIGHTED}>Non-weighted</MenuItem>
                    </Select>
                </Grid>

                <Grid item xs={12} md={3}>
                    <Button variant="contained" fullWidth onClick={formik.handleSubmit}>Update Product</Button>
                </Grid>
            </Grid>
        </Box>
    );
}
