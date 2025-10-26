import axios from "axios";

export const listSuppliers = async (filters) => {
    try {
        const { data: { data: { count, rows }}} = await axios.get('/api/suppliers', {
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

export const createSupplier = async (payload) => {
    try {
        const { data } = await axios.post('/api/suppliers', payload, {
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

export const updateSupplier = async (supplierId, payload) => {
    try {
        const { data } = await axios.put(`/api/suppliers/${supplierId}`, payload, {
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

export const deleteSupplier = async (supplierId) => {
    try {
        const { data } = await axios.delete(`/api/suppliers/${supplierId}`, {
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
