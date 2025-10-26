import axios from "axios";

export const listPurchases = async (filters) => {
    try {
        const { data: { data: { count, rows }}} = await axios.get('/api/purchases', {
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

export const createPurchase = async (payload) => {
    try {
        const { data } = await axios.post('/api/purchases', payload, {
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

export const deletePurchase = async (purchaseId) => {
    try {
        const { data } = await axios.delete(`/api/purchases/${purchaseId}`, {
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

export const listPayments = async (filters) => {
    try {
        const { data: { data: { count, rows }}} = await axios.get('/api/payments', {
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

export const createPayment = async (payload) => {
    try {
        const { data } = await axios.post('/api/payments', payload, {
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

export const getOutstandingPayables = async () => {
    try {
        const { data } = await axios.get('/api/reports/outstanding-payables', {
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

export const getOutstandingReceivables = async () => {
    try {
        const { data } = await axios.get('/api/reports/outstanding-receivables', {
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
