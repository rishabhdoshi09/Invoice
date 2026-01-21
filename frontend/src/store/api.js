import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

// RTK Query API with automatic cache invalidation
export const api = createApi({
    reducerPath: 'api',
    baseQuery: fetchBaseQuery({ 
        baseUrl: '/api',
        prepareHeaders: (headers) => {
            const token = localStorage.getItem('token');
            if (token) {
                headers.set('Authorization', `Bearer ${token}`);
            }
            headers.set('Content-Type', 'application/json');
            return headers;
        },
    }),
    // Tag types for cache invalidation
    tagTypes: ['Orders', 'Products', 'Payments', 'Customers', 'Suppliers', 'Dashboard', 'Receivables', 'Payables'],
    
    // Refetch on focus and reconnect for real-time data
    refetchOnFocus: true,
    refetchOnReconnect: true,
    
    endpoints: (builder) => ({
        // ==================== ORDERS ====================
        getOrders: builder.query({
            query: (filters = {}) => {
                // Remove empty values
                const cleanFilters = Object.fromEntries(
                    Object.entries(filters).filter(([_, value]) => value !== "" && value !== undefined && value !== null)
                );
                const params = new URLSearchParams(cleanFilters).toString();
                return `/orders${params ? `?${params}` : ''}`;
            },
            transformResponse: (response) => response.data,
            providesTags: (result) => 
                result?.rows
                    ? [
                        ...result.rows.map(({ id }) => ({ type: 'Orders', id })),
                        { type: 'Orders', id: 'LIST' }
                      ]
                    : [{ type: 'Orders', id: 'LIST' }],
        }),
        
        getOrder: builder.query({
            query: (orderId) => `/orders/${orderId}`,
            transformResponse: (response) => response.data,
            providesTags: (result, error, id) => [{ type: 'Orders', id }],
        }),
        
        createOrder: builder.mutation({
            query: (order) => ({
                url: '/orders',
                method: 'POST',
                body: order,
            }),
            transformResponse: (response) => response.data,
            // Invalidate orders list AND receivables (for credit sales)
            invalidatesTags: [
                { type: 'Orders', id: 'LIST' },
                { type: 'Receivables', id: 'LIST' },
                { type: 'Dashboard', id: 'TODAY' }
            ],
        }),
        
        updateOrder: builder.mutation({
            query: ({ orderId, ...order }) => ({
                url: `/orders/${orderId}`,
                method: 'PUT',
                body: order,
            }),
            transformResponse: (response) => response.data,
            invalidatesTags: (result, error, { orderId }) => [
                { type: 'Orders', id: orderId },
                { type: 'Orders', id: 'LIST' },
                { type: 'Receivables', id: 'LIST' },
                { type: 'Dashboard', id: 'TODAY' }
            ],
        }),
        
        deleteOrder: builder.mutation({
            query: (orderId) => ({
                url: `/orders/${orderId}`,
                method: 'DELETE',
            }),
            invalidatesTags: [
                { type: 'Orders', id: 'LIST' },
                { type: 'Receivables', id: 'LIST' },
                { type: 'Dashboard', id: 'TODAY' }
            ],
        }),
        
        togglePaymentStatus: builder.mutation({
            query: ({ orderId, newStatus }) => ({
                url: `/orders/${orderId}/toggle-payment`,
                method: 'POST',
                body: { newStatus },
            }),
            transformResponse: (response) => response.data,
            invalidatesTags: (result, error, { orderId }) => [
                { type: 'Orders', id: orderId },
                { type: 'Orders', id: 'LIST' },
                { type: 'Receivables', id: 'LIST' },
                { type: 'Customers', id: 'LIST' },
                { type: 'Dashboard', id: 'TODAY' }
            ],
        }),
        
        // ==================== PRODUCTS ====================
        getProducts: builder.query({
            query: () => '/products',
            transformResponse: (response) => {
                const { count, rows } = response.data;
                // Transform to object keyed by id (matching existing format)
                const transformedRows = {};
                rows.forEach(product => {
                    transformedRows[product.id] = product;
                });
                return { count, rows: transformedRows, rowsArray: rows };
            },
            providesTags: (result) => 
                result?.rowsArray
                    ? [
                        ...result.rowsArray.map(({ id }) => ({ type: 'Products', id })),
                        { type: 'Products', id: 'LIST' }
                      ]
                    : [{ type: 'Products', id: 'LIST' }],
        }),
        
        getProduct: builder.query({
            query: (productId) => `/products/${productId}`,
            transformResponse: (response) => response.data,
            providesTags: (result, error, id) => [{ type: 'Products', id }],
        }),
        
        createProduct: builder.mutation({
            query: (product) => ({
                url: '/products',
                method: 'POST',
                body: product,
            }),
            invalidatesTags: [{ type: 'Products', id: 'LIST' }],
        }),
        
        updateProduct: builder.mutation({
            query: ({ productId, ...product }) => ({
                url: `/products/${productId}`,
                method: 'PUT',
                body: product,
            }),
            invalidatesTags: (result, error, { productId }) => [
                { type: 'Products', id: productId },
                { type: 'Products', id: 'LIST' }
            ],
        }),
        
        deleteProduct: builder.mutation({
            query: (productId) => ({
                url: `/products/${productId}`,
                method: 'DELETE',
            }),
            invalidatesTags: [{ type: 'Products', id: 'LIST' }],
        }),
        
        // ==================== PAYMENTS ====================
        getDailySummary: builder.query({
            query: (date) => `/payments/daily-summary?date=${date}`,
            transformResponse: (response) => response.data,
            providesTags: (result, error, date) => [
                { type: 'Payments', id: date },
                { type: 'Payments', id: 'LIST' }
            ],
        }),
        
        createPayment: builder.mutation({
            query: (payment) => ({
                url: '/payments',
                method: 'POST',
                body: payment,
            }),
            invalidatesTags: [
                { type: 'Payments', id: 'LIST' },
                { type: 'Receivables', id: 'LIST' },
                { type: 'Payables', id: 'LIST' },
                { type: 'Dashboard', id: 'TODAY' }
            ],
        }),
        
        deletePayment: builder.mutation({
            query: (paymentId) => ({
                url: `/payments/${paymentId}`,
                method: 'DELETE',
            }),
            invalidatesTags: [
                { type: 'Payments', id: 'LIST' },
                { type: 'Receivables', id: 'LIST' },
                { type: 'Payables', id: 'LIST' },
                { type: 'Dashboard', id: 'TODAY' }
            ],
        }),
        
        // ==================== OUTSTANDING RECEIVABLES/PAYABLES ====================
        getOutstandingReceivables: builder.query({
            query: () => '/reports/outstanding-receivables',
            transformResponse: (response) => response.data,
            providesTags: [{ type: 'Receivables', id: 'LIST' }],
        }),
        
        getOutstandingPayables: builder.query({
            query: () => '/reports/outstanding-payables',
            transformResponse: (response) => response.data,
            providesTags: [{ type: 'Payables', id: 'LIST' }],
        }),
        
        // ==================== DASHBOARD ====================
        getTodaySummary: builder.query({
            query: () => '/dashboard/summary/today',
            transformResponse: (response) => response.data,
            providesTags: [{ type: 'Dashboard', id: 'TODAY' }],
        }),
        
        setOpeningBalance: builder.mutation({
            query: (amount) => ({
                url: '/dashboard/summary/opening-balance',
                method: 'POST',
                body: { amount },
            }),
            invalidatesTags: [{ type: 'Dashboard', id: 'TODAY' }],
        }),
        
        // ==================== CUSTOMERS ====================
        getCustomers: builder.query({
            query: () => '/customers',
            transformResponse: (response) => response.data,
            providesTags: [{ type: 'Customers', id: 'LIST' }],
        }),
        
        // ==================== SUPPLIERS ====================
        getSuppliers: builder.query({
            query: () => '/suppliers',
            transformResponse: (response) => response.data,
            providesTags: [{ type: 'Suppliers', id: 'LIST' }],
        }),
        
        // ==================== WEIGHTS (for scale) ====================
        getWeights: builder.query({
            query: () => '/weights',
            transformResponse: (response) => response.data,
        }),
    }),
});

// Export hooks for usage in components
export const {
    // Orders
    useGetOrdersQuery,
    useGetOrderQuery,
    useCreateOrderMutation,
    useUpdateOrderMutation,
    useDeleteOrderMutation,
    
    // Products
    useGetProductsQuery,
    useGetProductQuery,
    useCreateProductMutation,
    useUpdateProductMutation,
    useDeleteProductMutation,
    
    // Payments
    useGetDailySummaryQuery,
    useCreatePaymentMutation,
    useDeletePaymentMutation,
    
    // Outstanding
    useGetOutstandingReceivablesQuery,
    useGetOutstandingPayablesQuery,
    
    // Dashboard
    useGetTodaySummaryQuery,
    useSetOpeningBalanceMutation,
    
    // Customers & Suppliers
    useGetCustomersQuery,
    useGetSuppliersQuery,
    
    // Weights
    useGetWeightsQuery,
} = api;
