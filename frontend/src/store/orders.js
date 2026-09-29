
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
            const orders = await listOrders(payload);
            dispatch(setOrders(orders));
        }
        catch(error){
            console.log(error);
            dispatch(setNotification({ open: true, severity: 'error', message: 'Something went wrong, please try again!'}));
        }
    }
}

export const createOrderAction = (payload) => {
    return async(dispatch) => {
        try{
            dispatch(startLoading());
            const { data: { data, linkSuggestion }} = await createOrder(payload);
            dispatch(setNotification({ open: true, severity: 'success', message: 'Order created successfully'}));
            dispatch(stopLoading());

            dispatch(api.util.invalidateTags([
                { type: 'Orders', id: 'LIST' },
                { type: 'Receivables', id: 'LIST' },
                { type: 'Dashboard', id: 'TODAY' }
            ]));

            // linkSuggestion: backend matched an existing customer by name but
            // did NOT auto-link — caller must ask the user and confirm-link.
            return linkSuggestion ? { ...data, linkSuggestion } : data;
        }
        catch(error){
            console.log(error);
            dispatch(stopLoading());
            // Surface the REAL server error (e.g. a validation limit) instead of
            // a generic message, so the operator knows exactly what to fix.
            const serverMsg = error?.response?.data?.message;
            dispatch(setNotification({
                open: true,
                severity: 'error',
                message: serverMsg ? `Invoice NOT saved: ${serverMsg}` : 'Invoice NOT saved — something went wrong. Please try again.'
            }));
            // Return null (NOT {}) so the caller can detect failure. Returning an
            // empty object made a failed save look like success — the UI then
            // showed a fake total / PDF and wiped the in-progress bill.
            return null;
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
            
            dispatch(api.util.invalidateTags([
                { type: 'Orders', id: 'LIST' },
                { type: 'Receivables', id: 'LIST' },
                { type: 'Dashboard', id: 'TODAY' }
            ]));
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
        const delay = (ms) => new Promise((r) => setTimeout(r, ms));
        try{
            dispatch(startLoading());

            // Poll briefly for a SETTLED reading instead of taking the first
            // (possibly mid-settling) value the scale happens to be streaming.
            // Returns as soon as it's stable; bounded so fast billing isn't slowed.
            const MAX_ATTEMPTS = 4;
            const GAP_MS = 120;
            let data = null;
            for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
                ({ data: { data } } = await fetchWeights());
                // Stop early once we have a fresh, settled reading.
                if (data && data.isConnected && data.isStable) break;
                // No point retrying if the scale isn't connected at all.
                if (data && !data.isConnected) break;
                if (attempt < MAX_ATTEMPTS - 1) await delay(GAP_MS);
            }

            dispatch(stopLoading());

            // Check connection status
            if (!data || !data.isConnected) {
                const statusMsg = (data && data.connectionStatus === 'disconnected')
                    ? '⚠️ Scale disconnected! Check RS232 connection.'
                    : (data && data.connectionStatus === 'error')
                    ? '❌ Scale connection error! Check cable and restart.'
                    : (data && data.connectionStatus === 'stale')
                    ? '⚠️ Scale not responding! No data received recently. Check connection.'
                    : '⚠️ Scale connection issue!';
                dispatch(setNotification({ open: true, severity: 'warning', message: statusMsg }));
            } else if (!data.isStable) {
                // Connected & fresh, but the weight hasn't settled — warn so a
                // bouncing/half-placed item isn't billed at the wrong weight.
                dispatch(setNotification({ open: true, severity: 'warning', message: '⚠️ Weight not settled — let the item rest on the scale and fetch again.' }));
            } else {
                dispatch(setNotification({ open: true, severity: 'success', message: 'Weight fetched successfully'}));
            }

            return data || {};
        }
        catch(error){
            console.log(error);
            dispatch(stopLoading());
            dispatch(setNotification({ open: true, severity: 'error', message: '❌ Failed to fetch weight! Check if scale is connected.'}));
            return {};
        }
    }
}