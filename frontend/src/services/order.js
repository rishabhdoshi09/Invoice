
import axios from "axios";

export const listOrders = async (filters) => {
    try{
        const { data: { data: { count, rows }}} = await axios.get('http://localhost:9000/api/orders', {
            params: filters,
            headers: {
              'Content-Type': 'application/json'
            }
        });
        let transformedRows = {};
        rows.forEach(orderObj => transformedRows[orderObj.id] = orderObj);
        return { count: count, rows: transformedRows };
    }
    catch(error){
        console.log(error);
        throw error;
    }
}

export const createOrder = async (payload) => {
    try{
        const response = await axios.post('http://localhost:9000/api/orders', payload, {
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

export const deleteOrder = async (orderId) => {
    try{
        await axios.delete(`http://localhost:9000/api/orders/${orderId}`, {
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
        const response = await axios.get('http://localhost:9000/api/weights', {
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

