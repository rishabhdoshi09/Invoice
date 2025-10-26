
import { useDispatch, useSelector } from "react-redux";
import { useFormik } from "formik";
import { Box, Button, Grid, Select, MenuItem, TextField } from "@mui/material";

import { updateProductAction } from "../../../store/products";
import { ProductType } from "../../../enums/product";

export const EditProduct = ({ productId }) => {

    const dispatch = useDispatch();
    const { products: { rows} } = useSelector(state => state.productState);
    
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
            if (values.pricePerKg === "") {
                errors.pricePerKg = "Product price is required"
            }
            return errors;
        },
        validateOnBlur: true,
        onSubmit: async (values) => {
            await dispatch(updateProductAction(productId, values));
        }
    });


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
