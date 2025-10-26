
import { createSlice } from '@reduxjs/toolkit';
import { setNotification, startLoading, stopLoading } from "./application"
import { addProduct, updateProduct, listProducts, deleteProduct } from '../services/product';


const initialState = {
    products: {
        count: 0,
        rows: {}
    }
};
const reducers = {
    setProducts(state, action) {
        state.products = action.payload;
    }
}

const productSlice = createSlice({
    name: 'productState',
    initialState: initialState,
    reducers: reducers
});

const { setProducts } = productSlice.actions;

export default productSlice;


export const listProductsAction = () => {
    return async(dispatch) => {
        try{
            dispatch(startLoading());
            const products = await listProducts({});
            dispatch(setProducts(products));
            dispatch(stopLoading());
        }
        catch(error){
            console.log(error);
            dispatch(stopLoading());
            dispatch(setNotification({ open: true, severity: 'error', message: 'Something went wrong, please try again!'}));
        }
    }
}

export const addProductAction = (payload) => {
    return async(dispatch) => {
        try{
            dispatch(startLoading());
            await addProduct(payload);
            dispatch(setNotification({ open: true, severity: 'success', message: 'Product added successfully'}));
            dispatch(stopLoading());
            dispatch(listProductsAction());
        }
        catch(error){
            console.log(error);
            dispatch(stopLoading());
            dispatch(setNotification({ open: true, severity: 'error', message: 'Something went wrong, please try again!'}));
        }
    }
}

export const updateProductAction = (productId, payload) => {
    return async(dispatch) => {
        try{
            dispatch(startLoading());
            await updateProduct(productId, payload);
            dispatch(setNotification({ open: true, severity: 'success', message: 'Product updated successfully'}));
            dispatch(stopLoading());
            dispatch(listProductsAction());
        }
        catch(error){
            console.log(error);
            dispatch(stopLoading());
            dispatch(setNotification({ open: true, severity: 'error', message: 'Something went wrong, please try again!'}));
        }
    }
}

export const deleteProductAction = (productId) => {
    return async(dispatch) => {
        try{
            dispatch(startLoading());
            await deleteProduct(productId);
            dispatch(setNotification({ open: true, severity: 'success', message: 'Product deleted successfully'}));
            dispatch(stopLoading());
            dispatch(listProductsAction());
        }
        catch(error){
            console.log(error);
            dispatch(stopLoading());
            dispatch(setNotification({ open: true, severity: 'error', message: 'Something went wrong, please try again!'}));
        }
    }
}