
import axios from "axios";

export const listProducts = async (filters) => {
    try{
        const { data: { data: { count, rows }}} = await axios.get('http://localhost:9000/api/products', {
            headers: {
              'Content-Type': 'application/json'
            }
        });
        let transformedRows = {};
        rows.forEach(productObj => transformedRows[productObj.id] = productObj);
        return { count: count, rows: transformedRows };
    }
    catch(error){
        console.log(error);
        throw error;
    }
}

export const addProduct = async (payload) => {
    try{
        await axios.post('http://localhost:9000/api/products', payload, {
            headers: {
              'Content-Type': 'application/json'
            }
        });
    }
    catch(error){
        throw error;
    }
}

export const updateProduct = async (productId, payload) => {
    try{
        await axios.put(`http://localhost:9000/api/products/${productId}`, payload, {
            headers: {
              'Content-Type': 'application/json'
            }
        });
    }
    catch(error){
        throw error;
    }
}

export const deleteProduct = async (productId) => {
    try{
        await axios.delete(`http://localhost:9000/api/products/${productId}`, {
            headers: {
              'Content-Type': 'application/json'
            }
        });
    }
    catch(error){
        throw error;
    }
}

export const getProduct = async (productId) => {
    try{
        const res = await axios.get(`http://localhost:9000/api/products/${productId}`, {
            headers: {
              'Content-Type': 'application/json'
            }
        });
        return res;
    }
    catch(error){
        throw error;
    }
}