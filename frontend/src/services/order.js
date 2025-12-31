
import axios from "axios";

export const listOrders = async (filters) => {
    try{
        const { data: { data: { count, rows }}} = await axios.get('/api/orders', {
            params: {
                ...filters,
                _t: Date.now() // Cache-busting timestamp
            },
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache',
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

