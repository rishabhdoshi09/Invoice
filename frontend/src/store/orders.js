
import { createSlice } from '@reduxjs/toolkit';
import { setNotification, startLoading, stopLoading } from "./application"
import { createOrder, fetchWeights, listOrders, deleteOrder } from '../services/order';


const initialState = {
    orders: {
        count: 0,
        rows: {}
    }
};
const reducers = {
    setOrders(state, action) {
        state.orders = action.payload;
    }
}

const orderSlice = createSlice({
    name: 'orderState',
    initialState: initialState,
    reducers: reducers
});

const { setOrders } = orderSlice.actions;

export default orderSlice;


export const listOrdersAction = (payload) => {
    return async(dispatch) => {
        try{
            dispatch(startLoading());
            const orders = await listOrders(payload);
            dispatch(setOrders(orders));
            dispatch(stopLoading());
        }
        catch(error){
            console.log(error);
            dispatch(stopLoading());
            dispatch(setNotification({ open: true, severity: 'error', message: 'Something went wrong, please try again!'}));
        }
    }
}

export const createOrderAction = (payload) => {
    return async(dispatch) => {
        try{
            dispatch(startLoading());
            const { data: { data }} = await createOrder(payload);
            dispatch(setNotification({ open: true, severity: 'success', message: 'Order created successfully'}));
            dispatch(stopLoading());
            return data;
        }
        catch(error){
            console.log(error);
            dispatch(stopLoading());
            dispatch(setNotification({ open: true, severity: 'error', message: 'Something went wrong, please try again!'}));
            return {};
        }
    }
}

export const deleteOrderAction = (orderId) => {
    return async(dispatch) => {
        try{
            dispatch(startLoading());
            await deleteOrder(orderId);
            dispatch(setNotification({ open: true, severity: 'success', message: 'Order deleted successfully'}));
            dispatch(stopLoading());
            dispatch(listOrdersAction());
        }
        catch(error){
            console.log(error);
            dispatch(stopLoading());
            dispatch(setNotification({ open: true, severity: 'error', message: 'Something went wrong, please try again!'}));
        }
    }
}

export const fetchWeightsAction = () => {
    return async(dispatch) => {
        try{
            dispatch(startLoading());
            const { data: { data }} = await fetchWeights();
            dispatch(setNotification({ open: true, severity: 'success', message: 'Weights fetched successfully'}));
            dispatch(stopLoading());
            return data;
        }
        catch(error){
            console.log(error);
            dispatch(stopLoading());
            dispatch(setNotification({ open: true, severity: 'error', message: 'Something went wrong, please try again!'}));
            return {};
        }
    }
}