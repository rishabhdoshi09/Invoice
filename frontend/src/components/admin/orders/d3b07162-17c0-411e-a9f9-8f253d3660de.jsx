import moment from 'moment/moment';
import { useEffect, useState } from 'react';
import { useFormik } from "formik";
import { useDispatch, useSelector } from 'react-redux';
import { Autocomplete, Box, Button, Card, CardContent, Grid, TextField, Typography, Select, MenuItem } from '@mui/material';
import { CreateProduct } from '../products/create';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
import { generatePdfDefinition, generatePdfDefinition2 } from './helper';
import { Delete, Sync } from '@mui/icons-material';
import { createOrderAction, fetchWeightsAction } from '../../../store/orders';
import { ProductType } from '../../../enums/product';

pdfMake.vfs = pdfFonts.pdfMake.vfs;

export const CreateOrder = () => {

    const dispatch = useDispatch();
    const initialOrderProps = {
        customerName: "",
        customerMobile: "",
        orderNumber: "ORD-XXXXXXXX",
        orderDate: moment().format("DD-MM-YYYY"),
        orderItems: [],
        subTotal: 0,
        tax: 0,
        taxPercent: 0,
        total: 0
    };
    const { products: { rows} } = useSelector(state => state.productState);
    const productOptions = Object.keys(rows)?.map(id => { return { label: rows[id].name.toUpperCase(), productId: id, value: rows[id].name } });

    const onProductSelect = (e, value) => {
        if(value){
            const { label, productId } = value;
            formik.setFieldValue('id', productId ?? "");
            formik.setFieldValue('name', productId ? rows[productId]?.name : "");
            formik.setFieldValue('type', productId ? rows[productId]?.type : "" );
            formik.setFieldValue('productPrice', productId ? rows[productId]?.pricePerKg : 0);
            formik.setFieldValue('totalPrice', productId ? rows[productId]?.pricePerKg * formik.values.quantity : 0);
        }
        else{
            formik.resetForm();
        }
    }

    const onPriceChange = (e) => {
        const val = e.target.value;
        formik.setFieldValue('productPrice', val);
        formik.setFieldValue('totalPrice', formik.values.quantity * val);
    }
    const onQuantityChange = (e) => {
        const val = e.target.value;
        formik.setFieldValue('quantity', val);
        formik.setFieldValue('totalPrice', formik.values.productPrice * val);
    }

    const weighingScaleHandler = async () => {
        const { weight} = await dispatch(fetchWeightsAction());

        if(weight){
            formik.setFieldValue('quantity', weight ); 
            formik.setFieldValue('totalPrice', formik.values.productPrice * weight);
        }
    }

    const onCustomerInfoChange = (e) => {

        const { id, value} = e.target;

        const obj = {};
        if(id === 'taxPercent'){
            obj['taxPercent'] = Number(value);
            obj['tax'] = Math.round(orderProps.subTotal * ( value / 100));
            obj['total'] = orderProps.subTotal + obj['tax'];
        }

        setOrderProps((prevProps) => {
            return {
                ...prevProps,
                [e.target.id]: e.target.value,
                ...obj
            }
        });
    }

    const removeItem = (index) => {

        if(window.confirm('Are you sure, you want to delete ?')){

            const item = orderProps.orderItems[index];

            const subTotal = Math.round(orderProps.subTotal - item.totalPrice);
            const tax = Math.round(subTotal * (orderProps.taxPercent / 100));

            const newItem = {
                subTotal: subTotal,
                tax: tax,
                total: subTotal + tax,
                orderItems: orderProps.orderItems.filter((item, position) => position !== index)
            };

            setOrderProps((prevProps)=> {
                const newProps = {
                    ...prevProps,
                    ...newItem
                }
                generatePdf(newProps);
                return newProps;
            });
        }
    }

    const generatePdf = (pdfProps) => {
        const updatedProps = JSON.parse(JSON.stringify(pdfProps));
        updatedProps.orderItems = updatedProps['orderItems']?.map(item => { return { 
            name: rows[item.productId].name,
            productPrice: item.productPrice,
            quantity: item.quantity,
            totalPrice: item.totalPrice
        }}) ?? [];

        const pdfObject = template === 1 ? generatePdfDefinition(updatedProps) : generatePdfDefinition2(updatedProps) ;
        pdfMake.createPdf(pdfObject).getBlob((blob) => {
            const url = URL.createObjectURL(blob);
            setPdfUrl(url);
        });  
    };

    const createOrder = async() => {
        const { orderNumber } = await dispatch(createOrderAction(orderProps));
        
        if(orderNumber){
            setOrderProps((prevProps)=> {
                const newProps = {
                    ...prevProps,
                    orderNumber: orderNumber
                }
                generatePdf(newProps);
                return initialOrderProps;
            });
        }
    }

    const [pdfUrl, setPdfUrl] = useState('');
    const [template, setTemplate] = useState(1);
    const [orderProps, setOrderProps] = useState(initialOrderProps);

    const formik = useFormik({
        enableReinitialize: true,
        initialValues: {
            id:"",
            type: "",
            name: "",
            template: 1,
            productPrice: 0,
            quantity: 0,
            totalPrice: 0
        },
        onSubmit: async (values) => {

            const subTotal = Math.round(orderProps.subTotal + values.totalPrice);
            const tax = Math.round(subTotal * (orderProps.taxPercent / 100));

            const newItem = {
                subTotal: subTotal,
                tax: tax,
                total: subTotal + tax,
                orderItems: [...orderProps.orderItems, {
                    productId: values.id,
                    name: values.name,
                    quantity: values.quantity,
                    productPrice: values.productPrice,
                    totalPrice: values.totalPrice,
                    type: values.type
                }]
            };

            setOrderProps((prevProps)=> {
                const newProps = {
                    ...prevProps,
                    ...newItem
                }
                generatePdf(newProps);
                return newProps;
            });
            formik.resetForm();
        }
    });

    useEffect(() => {
        generatePdf(orderProps);
    }, [template]);

    return (
        <>

        <Card>
            <CardContent>
            <CreateProduct />
            </CardContent>
        </Card>
        
        <br></br>
        <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
                <Box component={"form"} noValidate autoComplete="off">
                    <Grid container spacing={2}>
                       <Grid item xs={12} md={4} >
                            <TextField
                                size="small"
                                id="customerName"
                                name="customerName"
                                label="Customer Name"
                                value={orderProps.customerName}
                                onChange={onCustomerInfoChange}
                                required
                                fullWidth
                            />
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <TextField
                                size="small"
                                id="customerMobile"
                                name="customeMobile"
                                label="Customer Mobile"
                                value={orderProps.customerMobile}
                                onChange={onCustomerInfoChange}
                                required
                                fullWidth
                            />
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <TextField
                                size="small"
                                type='number'
                                id="taxPercent"
                                name="taxPercent"
                                label="Tax Percentage"
                                value={orderProps.taxPercent}
                                onChange={onCustomerInfoChange}
                                required
                                fullWidth
                            />
                        </Grid>

                        <Grid item xs={12}>
                            <Typography variant="subtitle2" sx={{ mt: 1, mb: 1 }}>Quick Select:</Typography>
                            <Button
                                size="small"
                                variant="outlined"
                                sx={{ mr: 1 }}
                                onClick={() => {
                                    const product = productOptions.find(p => p.label.toLowerCase().includes('dabba'));
                                    if (product) {
                                        onProductSelect(null, product);
                                    } else {
                                        alert("Product '/dabba' not found");
                                    }
                                }}
                            >/dabba</Button>
                            <Button
                                size="small"
                                variant="outlined"
                                onClick={() => {
                                    const product = productOptions.find(p => p.label.toLowerCase().includes('thali delhi'));
                                    if (product) {
                                        onProductSelect(null, product);
                                    } else {
                                        alert("Product '///thali delhi' not found");
                                    }
                                }}
                            >///thali delhi</Button>
<Button
    size="small"
    variant="outlined"
    onClick={() => {
        const product = productOptions.find(p => p.label.toLowerCase().includes('kadi tiffin'));
        if (product) {
            onProductSelect(null, product);
        } else {
            alert("Product 'kadi tiffin' not found");
        }
    }}
>kadi tiffin</Button>
                        </Grid>


                        <Grid item xs={12} md={6} mt={2} >
                            <Select
                                size="small"
                                id="template"
                                name="template"
                                value={template}
                                label="Select Template"
                                onChange={(e)=>setTemplate(e.target.value)}
                                required
                                fullWidth
                            >
                                <MenuItem value={1}>PDF Template 1</MenuItem>
                                <MenuItem value={2}>PDF Template 2</MenuItem>
                            </Select>
                        </Grid>
                        
<Grid item xs={12} md={6} mt={2}>
  <TextField
    fullWidth
    label="Description"
    value={description}
    onChange={(e) => setDescription(e.target.value)}
    multiline
    minRows={1}
    maxRows={3}
  />
</Grid>

<Grid item xs={12} md={6} mt={2}>
                       


                            <Autocomplete
                        
                                size="small"
                                id="name"
                                name="name"
                                value={formik.values.name}
                                disablePortal
                                options={productOptions}
                                onChange={onProductSelect}
                                
                                renderInput={(params) => <TextField {...params} label="Select Product" />}
                                />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                type="number"  
                                size="small"
                                id="productPrice"
                                name="productPrice"
                                label="Product Price"
                                value={formik.values.productPrice}
                                onChange={onPriceChange}
                                required
                                fullWidth
                                error={formik.errors.productPrice}
                                helperText={formik.errors.productPrice}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                size="small"
                                id="type"
                                name="type"
                                label="Product Type"
                                value={formik.values.type}
                                disabled
                                required
                                fullWidth
                                error={formik.errors.type}
                                helperText={formik.errors.type}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                size="small"
                                type="number"
                                id="quantity"
                                name="quantity"
                                label="Quantity (Kg)"
                                value={formik.values.quantity}
                                onChange={onQuantityChange}
                                required
                                fullWidth
                                error={formik.errors.quantity}
                                helperText={formik.errors.quantity}
                                InputProps={{endAdornment: formik.values.type === ProductType.WEIGHTED ? <Button onClick={weighingScaleHandler}><Sync/></Button> : ""}}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                size="small"
                                id="price"
                                name="price"
                                label="Total Price"
                                value={formik.values.totalPrice}
                                disabled
                                required
                                fullWidth
                                error={formik.errors.totalPrice}
                                helperText={formik.errors.totalPrice}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <Button variant="contained" onClick={createOrder} sx={{float: "right", margin: "5px"}} disabled={orderProps.orderItems.length === 0}> Submit</Button>
                            <Button variant="contained" onClick={formik.handleSubmit} sx={{float: "right", margin: "5px"}} disabled={formik.values.name === ""}>Add Product</Button>
                        </Grid>
                    </Grid>
                </Box>

                <br></br>

                {orderProps.orderItems?.map((item, index) => {
                    return (
                        <Card sx={{padding: '5px 15px ', margin: '5px 2px'}}>
                            <Grid container>
                                <Grid item xs={10}>
                                    <Typography variant='body2'>Name: {rows[item.productId].name} | Qty: {item.quantity} | Price: {item.totalPrice}</Typography>
                                </Grid>
                                <Grid item xs={2}>
                                    <Button size="small" onClick={() => removeItem(index)}><Delete /></Button>
                                </Grid>
                            </Grid>
                        </Card>
                    );
                })}
            </Grid>


            <Grid item xs={12} sm={6} >
                <Box
                    sx={{
                        height: '90vh',
                        width: '100%',
                        display: 'flex',
                        flexDirection: 'column'
                    }}
                >
                    <Box
                        sx={{
                            flexGrow: 1,
                            '& iframe': {
                                width: '100%',
                                height: '100%',
                                border: 'none'
                            }
                        }}
                    >
                        <iframe src={pdfUrl} title='Invoice' />
                    </Box>
                </Box>
            </Grid>
        </Grid>
        </>
    );
}