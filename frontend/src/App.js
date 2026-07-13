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
import { Loans } from "./components/admin/loans/Loans";
import { Employees } from "./components/admin/employees/Employees";
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
import { TodayActivity } from "./components/admin/activity/TodayActivity";
import { CircularProgress, Box } from "@mui/material";
import { NotificationProvider } from "./components/common/SmartNotifications";
import { KeyboardShortcutsHelp, useKeyboardShortcutsHelp } from "./components/common/KeyboardShortcuts";

// ── RS Invoice design system ──────────────────────────────────────────────
// One theme upgrades every page: financial-grade typography (tabular
// numerals so money columns align), a slate + blue palette, soft-bordered
// surfaces, and consistent focus/hover states across all MUI components.
const theme = createTheme({
  palette: {
    primary: {
      main: '#1565C0',
      light: '#42A5F5',
      dark: '#0D47A1',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#334155',
      contrastText: '#FFFFFF',
    },
    success: { main: '#2E7D32', light: '#4CAF50' },
    warning: { main: '#E65100', light: '#FF9800' },
    error:   { main: '#C62828', light: '#EF5350' },
    info:    { main: '#0277BD' },
    background: {
      default: '#F4F6FA',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#1E293B',
      secondary: '#64748B',
    },
    divider: '#E2E8F0',
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica Neue", Arial, sans-serif',
    h4: { fontWeight: 800, letterSpacing: '-0.02em' },
    h5: { fontWeight: 700, letterSpacing: '-0.01em' },
    h6: { fontWeight: 700 },
    subtitle1: { fontWeight: 600 },
    subtitle2: { fontWeight: 600 },
    body2: { lineHeight: 1.55 },
    caption: { letterSpacing: '0.01em' },
    button: { textTransform: 'none', fontWeight: 600, letterSpacing: '0.01em' },
  },
  shape: { borderRadius: 10 },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        '::selection': { backgroundColor: '#BFDBFE' },
        '*::-webkit-scrollbar': { width: 10, height: 10 },
        '*::-webkit-scrollbar-thumb': {
          backgroundColor: '#CBD5E1',
          borderRadius: 8,
          border: '2px solid transparent',
          backgroundClip: 'content-box',
        },
        '*::-webkit-scrollbar-thumb:hover': { backgroundColor: '#94A3B8' },
        '*::-webkit-scrollbar-track': { background: 'transparent' },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          backgroundColor: '#F8FAFC',
          fontWeight: 700,
          fontSize: '0.72rem',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
          color: '#475569',
          borderBottom: '1px solid #E2E8F0',
          whiteSpace: 'nowrap',
        },
        body: {
          fontSize: '0.875rem',
          borderBottom: '1px solid #F1F5F9',
          // Money columns align digit-for-digit
          fontVariantNumeric: 'tabular-nums',
        },
      },
    },
    MuiTableRow: {
      styleOverrides: {
        root: {
          transition: 'background-color 120ms ease',
          '&:hover': { backgroundColor: '#F1F5F9 !important' },
          '&:last-child td': { border: 0 },
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: { fontWeight: 600, fontSize: '0.78rem', borderRadius: 8 },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 600,
          borderRadius: 8,
          '&:focus-visible': { outline: '2px solid #93C5FD', outlineOffset: 2 },
        },
        contained: {
          boxShadow: 'none',
          '&:hover': { boxShadow: '0 4px 12px rgba(15, 23, 42, 0.16)' },
        },
        outlined: { borderWidth: 1.5, '&:hover': { borderWidth: 1.5 } },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: { '&:focus-visible': { outline: '2px solid #93C5FD', outlineOffset: 2 } },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.08)',
        },
        outlined: { boxShadow: 'none', borderColor: '#E2E8F0' },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          boxShadow: '0 1px 2px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.08)',
          border: '1px solid #EEF2F7',
        },
      },
    },
    MuiTextField: {
      defaultProps: { size: 'small' },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 8,
          backgroundColor: '#FFFFFF',
          '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#94A3B8' },
        },
        notchedOutline: { borderColor: '#CBD5E1' },
      },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 14, boxShadow: '0 24px 64px rgba(15, 23, 42, 0.24)' },
      },
    },
    MuiDialogTitle: {
      styleOverrides: { root: { fontWeight: 700 } },
    },
    MuiTabs: {
      styleOverrides: {
        indicator: { height: 3, borderRadius: 3 },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: { textTransform: 'none', fontWeight: 600, minHeight: 44 },
      },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: {
          backgroundColor: '#0F172A',
          fontSize: '0.75rem',
          fontWeight: 500,
          borderRadius: 6,
          padding: '6px 10px',
        },
        arrow: { color: '#0F172A' },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: { borderRadius: 10, fontWeight: 500 },
      },
    },
    MuiTablePagination: {
      styleOverrides: {
        root: { fontVariantNumeric: 'tabular-nums' },
      },
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
          <Route path="loans" element={<Loans />} />
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
          <Route path="employees" element={<ProtectedRoute adminOnly><Employees /></ProtectedRoute>} />
          <Route path="activity" element={<TodayActivity />} />
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
