import { BrowserRouter, Routes, Route } from "react-router-dom";
import { createTheme, ThemeProvider } from "@mui/material";

import { Layout } from "./components/admin/layout";
import { ListProjects } from "./components/admin/products/list";
import { Provider } from "react-redux";
import store from "./store";
import { ListOrders } from "./components/admin/orders/list";
import { CreateOrder } from "./components/admin/orders/create";


const theme = createTheme();

function App() {
  return (
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <BrowserRouter>
          <Routes>
            <Route path={''} element={<Layout />} >
              <Route path={'products'} element={<ListProjects />} />
              <Route path={'orders'}>
                <Route index path={''} element={<ListOrders />} />
                <Route path={'create'} element={<CreateOrder />} />
              </Route>
            </Route>
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </Provider>
  );
}

export default App;
