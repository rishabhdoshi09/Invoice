
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

            // Poll until the current item's weight has SETTLED and return the
            // instant it has — a settled item fills on the first poll. Waiting
            // briefly covers a press made while the item is still bouncing;
            // failing within ~0.5 s is what forced a USB replug after each item.
            // Fail fast when the scale is physically absent.
            const DEADLINE_MS = 2000;
            const GAP_MS = 200;
            const startedAt = Date.now();
            let data = null;
            let epochAtPress = null;
            let itemChanged = false;
            for (;;) {
                ({ data: { data } } = await fetchWeights());
                if (data && data.itemEpoch != null) {
                    if (epochAtPress === null) {
                        epochAtPress = data.itemEpoch;
                    } else if (data.itemEpoch !== epochAtPress) {
                        // The pan was emptied (or the scale reconnected) after
                        // the press: whatever settles now is a different item
                        // from the one this press was for. Never bill it here.
                        itemChanged = true;
                        break;
                    }
                }
                // A settled 0 is the empty pan: '/' pressed while the item is
                // still being placed. Keep waiting for the item to land.
                if (data && data.isConnected && data.isStable && Number(data.weight) > 0) break;
                if (data && data.devicePresent === false) break;
                if (Date.now() - startedAt + GAP_MS > DEADLINE_MS) break;
                await delay(GAP_MS);
            }

            dispatch(stopLoading());

            if (itemChanged) {
                dispatch(setNotification({ open: true, severity: 'warning', message: '⚠️ The item on the scale changed while weighing — check the item and fetch again.' }));
                // Every consumer fills only on isConnected && isStable.
                return { ...data, isStable: false };
            }

            // Check connection status
            if (!data || !data.isConnected) {
                const statusMsg = (data && data.devicePresent === false)
                    ? '⚠️ The Mac cannot see the scale right now (USB dropped). It reconnects automatically — re-seat the cable/adapter if this continues.'
                    : (data && data.recovering)
                    ? '⚠️ Scale reconnecting — fetch again in a moment.'
                    : (data && data.connectionStatus === 'error')
                    ? '❌ Scale connection error! Check the cable.'
                    : '⚠️ Scale not responding — no fresh reading. Fetch again in a moment.';
                dispatch(setNotification({ open: true, severity: 'warning', message: statusMsg }));
            } else if (!data.isStable) {
                // Connected & fresh, but still moving after the wait — refuse so
                // a bouncing/half-placed item isn't billed at the wrong weight.
                dispatch(setNotification({ open: true, severity: 'warning', message: '⚠️ Weight not settled — hold the item still and fetch again.' }));
            } else if (!(Number(data.weight) > 0)) {
                dispatch(setNotification({ open: true, severity: 'warning', message: '⚠️ Scale reads 0 — place the item on the scale and fetch again.' }));
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