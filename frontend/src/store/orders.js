
import { createSlice } from '@reduxjs/toolkit';
import { setNotification, startLoading, stopLoading } from "./application"
import { createOrder, fetchWeights, listOrders, deleteOrder, getOrder } from '../services/order';
import { api } from './api'; // RTK Query API for cache invalidation


const initialState = {
    orders: {
        count: 0,
        rows: []
    }
};
const reducers = {
    setOrders(state, action) {
        state.orders = action.payload;
    },
    clearOrders(state) {
        state.orders = { count: 0, rows: [] };
    }
}

const orderSlice = createSlice({
    name: 'orderState',
    initialState: initialState,
    reducers: reducers
});

const { setOrders, clearOrders } = orderSlice.actions;

export { clearOrders };

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
            
            // Invalidate RTK Query cache to refresh orders list (NEW WAY)
            dispatch(api.util.invalidateTags([
                { type: 'Orders', id: 'LIST' },
                { type: 'Receivables', id: 'LIST' },
                { type: 'Dashboard', id: 'TODAY' }
            ]));
            
            // Also refresh old Redux store (LEGACY - for any components still using it)
            dispatch(listOrdersAction({ limit: 25, offset: 0 }));
            
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

export const deleteOrderAction = (orderId, filters) => {
    return async(dispatch) => {
        try{
            dispatch(startLoading());
            await deleteOrder(orderId);
            dispatch(setNotification({ open: true, severity: 'success', message: 'Order deleted successfully'}));
            dispatch(stopLoading());
            
            // Invalidate RTK Query cache (NEW WAY)
            dispatch(api.util.invalidateTags([
                { type: 'Orders', id: 'LIST' },
                { type: 'Receivables', id: 'LIST' },
                { type: 'Dashboard', id: 'TODAY' }
            ]));
            
            // Also refresh old Redux store (LEGACY)
            dispatch(listOrdersAction(filters || { limit: 25, offset: 0 }));
        }
        catch(error){
            console.log(error);
            dispatch(stopLoading());
            dispatch(setNotification({ open: true, severity: 'error', message: 'Something went wrong, please try again!'}));
        }
    }
}

export const getOrderAction = (orderId) => {
    return async(dispatch) => {
        try{
            dispatch(startLoading());
            const { data: { data }} = await getOrder(orderId);
            dispatch(stopLoading());
            return data;
        }
        catch(error){
            console.log(error);
            dispatch(stopLoading());
            dispatch(setNotification({ open: true, severity: 'error', message: 'Failed to fetch order details.'}));
            return null;
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