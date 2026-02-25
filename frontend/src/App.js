import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { createTheme, ThemeProvider } from "@mui/material";

import { AuthProvider, useAuth } from "./context/AuthContext";
import { Login } from "./components/auth/Login";
import { Layout } from "./components/admin/layout";
import { ListProjects } from "./components/admin/products/list";
import { Provider } from "react-redux";
import store from "./store";
import { ListOrders } from "./components/admin/orders/list";
import { CreateOrder } from "./components/admin/orders/create";
import { EditOrder } from "./components/admin/orders/edit";
import { ListSuppliers } from "./components/admin/suppliers/list";
import { ListCustomers } from "./components/admin/customers/list";
import { ListPurchases } from "./components/admin/purchases/list";
import { ListPayments } from "./components/admin/payments/list";
import { DailyPayments } from "./components/admin/dailyPayments/DailyPayments";
import { OutstandingReports } from "./components/admin/reports/outstanding";
import { TallyExport } from "./components/admin/tally/export";
import { AdminDashboard } from "./components/admin/dashboard/AdminDashboard";
import { UserManagement } from "./components/admin/users/UserManagement";
import { DayStart } from "./components/admin/dayStart/DayStart";
import { GstExportTool } from "./components/admin/gstExport/GstExportTool";
import { StockManagement } from "./components/admin/stock/StockManagement";
import LedgerModule from "./components/admin/ledger/LedgerModule";
import { CircularProgress, Box } from "@mui/material";
import { NotificationProvider } from "./components/common/SmartNotifications";
import { KeyboardShortcutsHelp, useKeyboardShortcutsHelp } from "./components/common/KeyboardShortcuts";

const theme = createTheme();

// Protected Route component
const ProtectedRoute = ({ children, adminOnly = false }) => {
  const { isAuthenticated, loading, isAdmin, setupRequired } = useAuth();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (setupRequired || !isAuthenticated) {
    return <Login />;
  }

  if (adminOnly && !isAdmin) {
    return <Navigate to="/products" replace />;
  }

  return children;
};

// App content with auth
const AppContent = () => {
  const { loading, isAuthenticated, setupRequired } = useAuth();
  const { helpOpen, closeHelp } = useKeyboardShortcutsHelp();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (setupRequired || !isAuthenticated) {
    return <Login />;
  }

  return (
    <>
      <Routes>
        <Route path="" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/products" replace />} />
          <Route path="products" element={<ListProjects />} />
          <Route path="orders">
            <Route index path="" element={<ListOrders />} />
            <Route path="create" element={<CreateOrder />} />
            <Route path="edit/:orderId" element={<EditOrder />} />
          </Route>
          <Route path="suppliers" element={<ListSuppliers />} />
          <Route path="customers" element={<ListCustomers />} />
          <Route path="purchases" element={<ListPurchases />} />
          <Route path="payments" element={<ListPayments />} />
          <Route path="daily-payments" element={<DailyPayments />} />
          <Route path="stock" element={<StockManagement />} />
          <Route path="reports">
            <Route index element={<OutstandingReports />} />
            <Route path="outstanding" element={<OutstandingReports />} />
          </Route>
          <Route path="tally-export" element={<TallyExport />} />
          <Route path="gst-export" element={<ProtectedRoute adminOnly><GstExportTool /></ProtectedRoute>} />
          <Route path="day-start" element={<DayStart />} />
          <Route path="ledger" element={<ProtectedRoute adminOnly><LedgerModule /></ProtectedRoute>} />
          <Route 
            path="admin-dashboard" 
            element={
              <ProtectedRoute adminOnly>
                <AdminDashboard />
              </ProtectedRoute>
            } 
          />
          <Route 
            path="users" 
            element={
              <ProtectedRoute adminOnly>
                <UserManagement />
              </ProtectedRoute>
            } 
          />
        </Route>
        <Route path="login" element={<Login />} />
      </Routes>
      
      {/* Keyboard Shortcuts Help Dialog */}
      <KeyboardShortcutsHelp open={helpOpen} onClose={closeHelp} />
    </>
  );
};

function App() {
  return (
    <Provider store={store}>
      <ThemeProvider theme={theme}>
        <AuthProvider>
          <NotificationProvider>
            <BrowserRouter>
              <AppContent />
            </BrowserRouter>
          </NotificationProvider>
        </AuthProvider>
      </ThemeProvider>
    </Provider>
  );
}

export default App;
