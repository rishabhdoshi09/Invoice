
import { useDispatch } from "react-redux";
import { useFormik } from "formik";
import { Box, Button, Grid, Select, MenuItem, TextField } from "@mui/material";

import { addProductAction } from "../../../store/products";
import { ProductType } from "../../../enums/product";

export const CreateProduct = () => {

    const dispatch = useDispatch();

    const formik = useFormik({
        initialValues: {
            name: "",
            pricePerKg: "",
            type: ProductType.WEIGHTED
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
            await dispatch(addProductAction(values));
            formik.resetForm();
        }
    });


    return (    
        <Box component={"form"} noValidate autoComplete="off">
            <Grid container spacing={2}>
                <Grid item xs={12} md={2} >
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
                <Grid item xs={12} md={2} >
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

                <Grid item xs={12} md={2} >
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

                <Grid item xs={12} md={2}>
                    <Button variant="contained" fullWidth onClick={formik.handleSubmit}>Add Product</Button>
                </Grid>
            </Grid>
        </Box>
    );
}
