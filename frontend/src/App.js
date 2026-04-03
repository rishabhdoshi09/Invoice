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
import { DatabaseBackup } from "./components/admin/backup/DatabaseBackup";
import { UserManagement } from "./components/admin/users/UserManagement";
import { DayStart } from "./components/admin/dayStart/DayStart";
import { GstExportTool } from "./components/admin/gstExport/GstExportTool";
import { StockManagement } from "./components/admin/stock/StockManagement";
import LedgerModule from "./components/admin/ledger/LedgerModule";
import BillAuditLogs from "./components/admin/audit/BillAuditLogs";
import { CircularProgress, Box } from "@mui/material";
import { NotificationProvider } from "./components/common/SmartNotifications";
import { KeyboardShortcutsHelp, useKeyboardShortcutsHelp } from "./components/common/KeyboardShortcuts";

const theme = createTheme({
  palette: {
    primary: {
      main: '#1565C0',
      light: '#1976D2',
      dark: '#0D47A1',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#37474F',
      contrastText: '#FFFFFF',
    },
    success: {
      main: '#2E7D32',
      light: '#388E3C',
    },
    warning: {
      main: '#E65100',
    },
    error: {
      main: '#C62828',
    },
    background: {
      default: '#F5F7FA',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#1A237E',
      secondary: '#546E7A',
    },
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica Neue", Arial, sans-serif',
    h4: { fontWeight: 700, letterSpacing: '-0.5px' },
    h5: { fontWeight: 700 },
    h6: { fontWeight: 600 },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600 },
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: { borderRadius: 8 },
  components: {
    MuiTableCell: {
      styleOverrides: {
        head: {
          backgroundColor: '#EEF2F7',
          fontWeight: 700,
          color: '#263238',
          borderBottom: '2px solid #B0BEC5',
          whiteSpace: 'nowrap',
        },
        body: { fontSize: '0.875rem' },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          '&:hover': { backgroundColor: '#F0F7FF !important' },
          '&:last-child td': { border: 0 },
        },
      },
    },
    MuiChip: {
      styleOverrides: { root: { fontWeight: 600, fontSize: '0.78rem' } },
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600 },
        contained: {
          boxShadow: 'none',
          '&:hover': { boxShadow: '0 2px 8px rgba(0,0,0,0.18)' },
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: { boxShadow: '0 1px 4px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.05)' },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: { boxShadow: '0 1px 4px rgba(0,0,0,0.08)' },
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small' },
    },
  },
});

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
          <Route path="bill-audit" element={<ProtectedRoute adminOnly><BillAuditLogs /></ProtectedRoute>} />
          <Route path="backup" element={<ProtectedRoute adminOnly><DatabaseBackup /></ProtectedRoute>} />
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
