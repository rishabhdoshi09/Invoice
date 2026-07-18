
import axios from "axios";

export const listOrders = async (filters) => {
    try{
        // Remove empty string values to avoid validation issues
        const cleanFilters = Object.fromEntries(
            Object.entries(filters).filter(([key, value]) => value !== "" && value !== undefined && value !== null)
        );
        
        const { data: { data: { count, rows }}} = await axios.get('/api/orders', {
            // _t cache-buster + no-store headers: the browser was serving a
            // stale cached copy of this GET, so invoices created after the
            // list first loaded never appeared until a hard refresh.
            params: { ...cleanFilters, _t: Date.now() },
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache, no-store, must-revalidate',
              'Pragma': 'no-cache'
            }
        });
        // Keep rows as array to preserve order from backend (sorted by createdAt DESC)
        return { count: count, rows: rows };
    }
    catch(error){
        console.log(error);
        throw error;
    }
}

export const createOrder = async (payload) => {
    try{
        const response = await axios.post('/api/orders', payload, {
            headers: {
              'Content-Type': 'application/json'
            }
        });
        return response;
    }
    catch(error){
        throw error;
    }
}

export const getOrder = async (orderId) => {
    try{
        const response = await axios.get(`/api/orders/${orderId}`, {
            headers: {
              'Content-Type': 'application/json'
            }
        });
        return response;
    }
    catch(error){
        console.error('Error fetching order:', error);
        throw error;
    }
}

export const deleteOrder = async (orderId) => {
    try{
        await axios.delete(`/api/orders/${orderId}`, {
            headers: {
              'Content-Type': 'application/json'
            }
        });
    }
    catch(error){
        throw error;
    }
}

export const fetchWeights = async () => {
    try{
        const response = await axios.get('/api/weights', {
            headers: {
              'Content-Type': 'application/json'
            }
        });
        return response;
    }
    catch(error){
        throw error;
    }
}

