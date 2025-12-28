import axios from 'axios';

const API_URL = process.env.REACT_APP_BACKEND_URL || '';

// Get audit logs
export const getAuditLogs = async (filters = {}) => {
    try {
        const response = await axios.get(`${API_URL}/api/dashboard/audit-logs`, { params: filters });
        return response.data.data;
    } catch (error) {
        throw error.response?.data?.message || 'Failed to fetch audit logs';
    }
};

// Get entity history
export const getEntityHistory = async (entityType, entityId) => {
    try {
        const response = await axios.get(`${API_URL}/api/dashboard/audit-logs/entity/${entityType}/${entityId}`);
        return response.data.data;
    } catch (error) {
        throw error.response?.data?.message || 'Failed to fetch entity history';
    }
};

// Get user activity
export const getUserActivity = async (userId, days = 7) => {
    try {
        const response = await axios.get(`${API_URL}/api/dashboard/audit-logs/user/${userId}`, { params: { days } });
        return response.data.data;
    } catch (error) {
        throw error.response?.data?.message || 'Failed to fetch user activity';
    }
};

// Get recent deletions
export const getRecentDeletions = async (days = 30) => {
    try {
        const response = await axios.get(`${API_URL}/api/dashboard/audit-logs/deletions`, { params: { days } });
        return response.data.data;
    } catch (error) {
        throw error.response?.data?.message || 'Failed to fetch deletions';
    }
};

// Get suspicious activity
export const getSuspiciousActivity = async () => {
    try {
        const response = await axios.get(`${API_URL}/api/dashboard/audit-logs/suspicious`);
        return response.data.data;
    } catch (error) {
        throw error.response?.data?.message || 'Failed to fetch suspicious activity';
    }
};

// Get dashboard stats
export const getDashboardStats = async () => {
    try {
        const response = await axios.get(`${API_URL}/api/dashboard/stats`);
        return response.data.data;
    } catch (error) {
        throw error.response?.data?.message || 'Failed to fetch dashboard stats';
    }
};

// Get today's summary
export const getTodaySummary = async () => {
    try {
        const response = await axios.get(`${API_URL}/api/dashboard/summary/today`);
        return response.data.data;
    } catch (error) {
        throw error.response?.data?.message || 'Failed to fetch today summary';
    }
};

// Get summary by date
export const getSummaryByDate = async (date) => {
    try {
        const response = await axios.get(`${API_URL}/api/dashboard/summary/date/${date}`);
        return response.data.data;
    } catch (error) {
        throw error.response?.data?.message || 'Failed to fetch summary';
    }
};

// Get summaries in range
export const getSummariesInRange = async (startDate, endDate) => {
    try {
        const response = await axios.get(`${API_URL}/api/dashboard/summary/range`, {
            params: { startDate, endDate }
        });
        return response.data.data;
    } catch (error) {
        throw error.response?.data?.message || 'Failed to fetch summaries';
    }
};

// Close day (admin only)
export const closeDay = async (date, notes) => {
    try {
        const response = await axios.post(`${API_URL}/api/dashboard/summary/close/${date}`, { notes });
        return response.data.data;
    } catch (error) {
        throw error.response?.data?.message || 'Failed to close day';
    }
};

// Reopen day (admin only)
export const reopenDay = async (date) => {
    try {
        const response = await axios.post(`${API_URL}/api/dashboard/summary/reopen/${date}`);
        return response.data.data;
    } catch (error) {
        throw error.response?.data?.message || 'Failed to reopen day';
    }
};

// Recalculate summary (admin only)
export const recalculateSummary = async (date) => {
    try {
        const response = await axios.post(`${API_URL}/api/dashboard/summary/recalculate/${date}`);
        return response.data.data;
    } catch (error) {
        throw error.response?.data?.message || 'Failed to recalculate summary';
    }
};

// Set opening balance (admin only)
export const setOpeningBalance = async (amount) => {
    try {
        const response = await axios.post(`${API_URL}/api/dashboard/summary/opening-balance`, { amount });
        return response.data.data;
    } catch (error) {
        throw error.response?.data?.message || 'Failed to set opening balance';
    }
};

// Get invoice sequence info
export const getInvoiceSequence = async () => {
    try {
        const response = await axios.get(`${API_URL}/api/dashboard/invoice-sequence`);
        return response.data.data;
    } catch (error) {
        throw error.response?.data?.message || 'Failed to fetch invoice sequence';
    }
};
