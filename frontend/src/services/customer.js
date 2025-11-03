import axios from "axios";

export const listCustomers = async (filters) => {
    try {
        const { data: { data: { count, rows }}} = await axios.get('/api/customers', {
            params: filters,
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return { count, rows };
    } catch(error) {
        console.log(error);
        throw error;
    }
}

export const createCustomer = async (payload) => {
    try {
        const { data } = await axios.post('/api/customers', payload, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return data;
    } catch(error) {
        console.log(error);
        throw error;
    }
}

export const updateCustomer = async (customerId, payload) => {
    try {
        const { data } = await axios.put(`/api/customers/${customerId}`, payload, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return data;
    } catch(error) {
        console.log(error);
        throw error;
    }
}

export const deleteCustomer = async (customerId) => {
    try {
        const { data } = await axios.delete(`/api/customers/${customerId}`, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        return data;
    } catch(error) {
        console.log(error);
        throw error;
    }
}
