import { configureStore } from '@reduxjs/toolkit';

import applicationSlice from './application';
import productSlice from './products';
import orderSlice from './orders';


const store = configureStore({
  reducer: {
    applicationState: applicationSlice.reducer,
    productState: productSlice.reducer,
    orderState: orderSlice.reducer
  },
  // middleware: (getDefaultMiddleware) =>
  //   getDefaultMiddleware({
  //     serializableCheck: false,
  //   })
});

export default store;



