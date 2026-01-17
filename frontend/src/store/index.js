import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';

import applicationSlice from './application';
import productSlice from './products';
import orderSlice from './orders';
import { api } from './api';

const store = configureStore({
  reducer: {
    applicationState: applicationSlice.reducer,
    productState: productSlice.reducer,
    orderState: orderSlice.reducer,
    // Add RTK Query API reducer
    [api.reducerPath]: api.reducer,
  },
  // Add RTK Query middleware for caching, invalidation, polling, etc.
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(api.middleware),
});

// Enable refetchOnFocus and refetchOnReconnect behaviors
setupListeners(store.dispatch);

export default store;
