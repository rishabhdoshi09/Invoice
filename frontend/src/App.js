import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { createTheme, ThemeProvider } from "@mui/material";

import { Layout } from "./components/admin/layout";
import { ListProjects } from "./components/admin/products/list";
import { Provider } from "react-redux";
import store from "./store";
import { ListOrders } from "./components/admin/orders/list";
import { CreateOrder } from "./components/admin/orders/create";
import { ListSuppliers } from "./components/admin/suppliers/list";
import { ListCustomers } from "./components/admin/customers/list";
import { ListPurchases } from "./components/admin/purchases/list";
import { ListPayments } from "./components/admin/payments/list";
import { OutstandingReports } from "./components/admin/reports/outstanding";
import { TallyExport } from "./components/admin/tally/export";


const theme = createTheme();

function App() {
  return (
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <BrowserRouter>
          <Routes>
            <Route path={''} element={<Layout />} >
              <Route index element={<Navigate to="/products" replace />} />
              <Route path={'products'} element={<ListProjects />} />
              <Route path={'orders'}>
                <Route index path={''} element={<ListOrders />} />
                <Route path={'create'} element={<CreateOrder />} />
              </Route>
              <Route path={'suppliers'} element={<ListSuppliers />} />
              <Route path={'customers'} element={<ListCustomers />} />
              <Route path={'purchases'} element={<ListPurchases />} />
              <Route path={'payments'} element={<ListPayments />} />
              <Route path={'reports'} element={<OutstandingReports />} />
              <Route path={'tally-export'} element={<TallyExport />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </Provider>
  );
}

export default App;
