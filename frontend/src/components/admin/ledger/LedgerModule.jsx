import { useState, useEffect } from 'react';
import {
    Box, Paper, Typography, Tabs, Tab, Button, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Chip, CircularProgress, Alert,
    TextField, Grid, Card, CardContent, Divider
} from '@mui/material';
import {
    AccountBalance, Receipt, Assessment, Sync, PlayArrow,
    Refresh, CheckCircle, Error, Warning, TrendingUp
} from '@mui/icons-material';
import axios from 'axios';

const LedgerModule = () => {
    const [activeTab, setActiveTab] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    // Data states
    const [accounts, setAccounts] = useState([]);
    const [healthData, setHealthData] = useState(null);
    const [driftData, setDriftData] = useState(null);
    const [migrationResult, setMigrationResult] = useState(null);
    const [trialBalance, setTrialBalance] = useState(null);
    const [profitLoss, setProfitLoss] = useState(null);
    const [balanceSheet, setBalanceSheet] = useState(null);
    const [reconciliation, setReconciliation] = useState(null);
    const [journalBatches, setJournalBatches] = useState([]);

    // Filter states
    const [dateRange, setDateRange] = useState({
        fromDate: new Date(new Date().getFullYear(), 3, 1).toISOString().split('T')[0], // April 1st (FY start)
        toDate: new Date().toISOString().split('T')[0]
    });

    // Migration states
    const [migrationRunning, setMigrationRunning] = useState(false);

    const getAuthHeader = () => ({
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });

    // Fetch Health Check
    const fetchHealth = async () => {
        try {
            const { data } = await axios.get('/api/ledger/health-check', getAuthHeader());
            setHealthData(data.data);
        } catch (err) {
            console.error('Health check failed:', err);
        }
    };

    // Fetch Drift Check
    const fetchDrift = async () => {
        try {
            const { data } = await axios.get('/api/ledger/daily-drift-check', getAuthHeader());
            setDriftData(data.data);
        } catch (err) {
            console.error('Drift check failed:', err);
        }
    };

    // Fetch Dashboard (health + drift in parallel)
    const fetchDashboard = async () => {
        setLoading(true);
        try { await Promise.all([fetchHealth(), fetchDrift()]); }
        finally { setLoading(false); }
    };

    // Fetch accounts
    const fetchAccounts = async () => {
        try {
            setLoading(true);
            const { data } = await axios.get('/api/ledger/accounts', getAuthHeader());
            setAccounts(data.data || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to fetch accounts');
        } finally {
            setLoading(false);
        }
    };

    // Fetch Trial Balance
    const fetchTrialBalance = async () => {
        try {
            setLoading(true);
            const { data } = await axios.get(`/api/ledger/reports/trial-balance?asOfDate=${dateRange.toDate}`, getAuthHeader());
            setTrialBalance(data.data);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to fetch trial balance');
        } finally {
            setLoading(false);
        }
    };

    // Fetch Profit & Loss
    const fetchProfitLoss = async () => {
        try {
            setLoading(true);
            const { data } = await axios.get(
                `/api/ledger/reports/profit-loss?fromDate=${dateRange.fromDate}&toDate=${dateRange.toDate}`,
                getAuthHeader()
            );
            setProfitLoss(data.data);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to fetch P&L');
        } finally {
            setLoading(false);
        }
    };

    // Fetch Balance Sheet
    const fetchBalanceSheet = async () => {
        try {
            setLoading(true);
            const { data } = await axios.get(`/api/ledger/reports/balance-sheet?asOfDate=${dateRange.toDate}`, getAuthHeader());
            setBalanceSheet(data.data);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to fetch balance sheet');
        } finally {
            setLoading(false);
        }
    };

    // Fetch Reconciliation
    const fetchReconciliation = async () => {
        try {
            setLoading(true);
            const { data } = await axios.get('/api/ledger/migration/reconciliation', getAuthHeader());
            setReconciliation(data.data);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to fetch reconciliation');
        } finally {
            setLoading(false);
        }
    };

    // Fetch Journal Batches
    const fetchJournalBatches = async () => {
        try {
            setLoading(true);
            const { data } = await axios.get('/api/ledger/journal-batches?limit=100', getAuthHeader());
            setJournalBatches(data.data?.batches || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to fetch journal batches');
        } finally {
            setLoading(false);
        }
    };

    // Initialize Chart of Accounts
    const initializeAccounts = async () => {
        try {
            setLoading(true);
            await axios.post('/api/ledger/accounts/initialize', {}, getAuthHeader());
            setSuccess('Chart of accounts initialized successfully');
            await fetchAccounts();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to initialize accounts');
        } finally {
            setLoading(false);
        }
    };

    // Run Migration
    const runMigration = async () => {
        if (!window.confirm('This will migrate all existing data to the ledger. Continue?')) return;
        
        try {
            setMigrationRunning(true);
            setError(null);
            const { data } = await axios.post('/api/ledger/migration/run', {}, getAuthHeader());
            setMigrationResult(data.data);
            setSuccess('Migration completed successfully');
            await fetchReconciliation();
        } catch (err) {
            setError(err.response?.data?.message || 'Migration failed');
        } finally {
            setMigrationRunning(false);
        }
    };

    // Clear Migration
    const clearMigration = async () => {
        if (!window.confirm('This will delete all migration data. Are you sure?')) return;
        
        try {
            setLoading(true);
            await axios.delete('/api/ledger/migration/clear', getAuthHeader());
            setSuccess('Migration data cleared');
            await fetchReconciliation();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to clear migration');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (activeTab === 0) fetchDashboard();
        if (activeTab === 1) fetchAccounts();
        if (activeTab === 2) fetchTrialBalance();
        if (activeTab === 3) fetchProfitLoss();
        if (activeTab === 4) fetchBalanceSheet();
        if (activeTab === 5) fetchReconciliation();
        if (activeTab === 6) fetchJournalBatches();
    }, [activeTab]);

    const formatCurrency = (amount) => {
        return `₹${(Number(amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    };

    return (
        <Box sx={{ p: 3 }}>
            <Paper sx={{ p: 2, mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AccountBalance color="primary" />
                        Ledger Module (Double-Entry Accounting)
                    </Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                            variant="outlined"
                            startIcon={<PlayArrow />}
                            onClick={initializeAccounts}
                            disabled={loading}
                        >
                            Initialize Accounts
                        </Button>
                        <Button
                            variant="contained"
                            color="primary"
                            startIcon={migrationRunning ? <CircularProgress size={16} color="inherit" /> : <Sync />}
                            onClick={runMigration}
                            disabled={migrationRunning}
                        >
                            {migrationRunning ? 'Migrating...' : 'Run Migration'}
                        </Button>
                    </Box>
                </Box>

                {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
                {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>{success}</Alert>}

                <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} variant="scrollable" scrollButtons="auto" sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tab label="Dashboard" icon={<Assessment />} iconPosition="start" data-testid="tab-dashboard" />
                    <Tab label="Chart of Accounts" icon={<AccountBalance />} iconPosition="start" data-testid="tab-accounts" />
                    <Tab label="Trial Balance" icon={<Assessment />} iconPosition="start" data-testid="tab-trial-balance" />
                    <Tab label="Profit & Loss" icon={<TrendingUp />} iconPosition="start" data-testid="tab-profit-loss" />
                    <Tab label="Balance Sheet" icon={<Receipt />} iconPosition="start" data-testid="tab-balance-sheet" />
                    <Tab label="Reconciliation" icon={<Sync />} iconPosition="start" data-testid="tab-reconciliation" />
                    <Tab label="Journal Entries" icon={<Receipt />} iconPosition="start" data-testid="tab-journal-entries" />
                </Tabs>
            </Paper>

            {/* Date Range Filter */}
            {[2, 3, 4].includes(activeTab) && (
                <Paper sx={{ p: 2, mb: 2 }}>
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} sm={4}>
                            <TextField
                                type="date"
                                label="From Date"
                                value={dateRange.fromDate}
                                onChange={(e) => setDateRange({ ...dateRange, fromDate: e.target.value })}
                                fullWidth
                                size="small"
                                InputLabelProps={{ shrink: true }}
                            />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <TextField
                                type="date"
                                label="To Date"
                                value={dateRange.toDate}
                                onChange={(e) => setDateRange({ ...dateRange, toDate: e.target.value })}
                                fullWidth
                                size="small"
                                InputLabelProps={{ shrink: true }}
                            />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <Button
                                variant="contained"
                                startIcon={<Refresh />}
                                onClick={() => {
                                    if (activeTab === 2) fetchTrialBalance();
                                    if (activeTab === 3) fetchProfitLoss();
                                    if (activeTab === 4) fetchBalanceSheet();
                                }}
                            >
                                Refresh
                            </Button>
                        </Grid>
                    </Grid>
                </Paper>
            )}

            {loading && (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                    <CircularProgress />
                </Box>
            )}

            {/* Tab 0: Dashboard */}
            {activeTab === 0 && !loading && (
                <Box>
                    <Grid container spacing={2} sx={{ mb: 2 }}>
                        {/* Health Card */}
                        <Grid item xs={12} md={4}>
                            <Card
                                data-testid="health-card"
                                sx={{
                                    bgcolor: healthData?.isBalanced ? '#0d2818' : '#3b0a0a',
                                    color: '#fff',
                                    border: '1px solid',
                                    borderColor: healthData?.isBalanced ? '#1b5e20' : '#b71c1c',
                                }}
                            >
                                <CardContent>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                        {healthData?.isBalanced
                                            ? <CheckCircle sx={{ color: '#4caf50' }} />
                                            : <Error sx={{ color: '#f44336' }} />}
                                        <Typography variant="subtitle2" sx={{ opacity: 0.8, letterSpacing: 1, textTransform: 'uppercase' }}>
                                            Ledger Health
                                        </Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography variant="body2" sx={{ opacity: 0.7 }}>Total Debits</Typography>
                                        <Typography variant="body1" sx={{ fontFamily: 'monospace', fontWeight: 700 }} data-testid="health-total-debits">
                                            {formatCurrency(healthData?.totalDebits)}
                                        </Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography variant="body2" sx={{ opacity: 0.7 }}>Total Credits</Typography>
                                        <Typography variant="body1" sx={{ fontFamily: 'monospace', fontWeight: 700 }} data-testid="health-total-credits">
                                            {formatCurrency(healthData?.totalCredits)}
                                        </Typography>
                                    </Box>
                                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.15)', my: 1.5 }} />
                                    <Box sx={{ display: 'flex', justifyContent: 'center' }}>
                                        <Chip
                                            data-testid="health-balanced-status"
                                            icon={healthData?.isBalanced ? <CheckCircle /> : <Error />}
                                            label={healthData?.isBalanced ? 'BALANCED' : 'UNBALANCED'}
                                            sx={{
                                                bgcolor: healthData?.isBalanced ? '#1b5e20' : '#b71c1c',
                                                color: '#fff',
                                                fontWeight: 700,
                                                letterSpacing: 1,
                                                '& .MuiChip-icon': { color: '#fff' }
                                            }}
                                        />
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* Drift Status Card */}
                        <Grid item xs={12} md={4}>
                            <Card
                                data-testid="drift-card"
                                sx={{
                                    bgcolor: driftData?.status === 'OK' ? '#0d2818' : driftData ? '#3b0a0a' : '#1a1a2e',
                                    color: '#fff',
                                    border: '1px solid',
                                    borderColor: driftData?.status === 'OK' ? '#1b5e20' : driftData ? '#b71c1c' : '#333',
                                }}
                            >
                                <CardContent>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                        {driftData?.status === 'OK'
                                            ? <CheckCircle sx={{ color: '#4caf50' }} />
                                            : <Warning sx={{ color: '#ff9800' }} />}
                                        <Typography variant="subtitle2" sx={{ opacity: 0.8, letterSpacing: 1, textTransform: 'uppercase' }}>
                                            Drift Monitor
                                        </Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography variant="body2" sx={{ opacity: 0.7 }}>Status</Typography>
                                        <Chip
                                            data-testid="drift-status"
                                            label={driftData?.status || 'N/A'}
                                            size="small"
                                            sx={{
                                                bgcolor: driftData?.status === 'OK' ? '#1b5e20' : '#b71c1c',
                                                color: '#fff',
                                                fontWeight: 700,
                                                fontSize: '0.7rem',
                                            }}
                                        />
                                    </Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                        <Typography variant="body2" sx={{ opacity: 0.7 }}>Mismatches</Typography>
                                        <Typography variant="body1" sx={{ fontWeight: 700 }} data-testid="drift-mismatch-count">
                                            {driftData?.summary?.customersWithDrift ?? '-'}
                                        </Typography>
                                    </Box>
                                    <Divider sx={{ borderColor: 'rgba(255,255,255,0.15)', my: 1.5 }} />
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                                        <Typography variant="body2" sx={{ opacity: 0.7 }}>Last Check</Typography>
                                        <Typography variant="caption" sx={{ fontFamily: 'monospace', opacity: 0.9 }} data-testid="drift-timestamp">
                                            {driftData?.timestamp
                                                ? new Date(driftData.timestamp).toLocaleString()
                                                : 'Never'}
                                        </Typography>
                                    </Box>
                                </CardContent>
                            </Card>
                        </Grid>

                        {/* Migration Control Panel */}
                        <Grid item xs={12} md={4}>
                            <Card
                                data-testid="migration-card"
                                sx={{
                                    bgcolor: '#1a1a2e',
                                    color: '#fff',
                                    border: '1px solid #333',
                                }}
                            >
                                <CardContent>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
                                        <Sync sx={{ color: '#90caf9' }} />
                                        <Typography variant="subtitle2" sx={{ opacity: 0.8, letterSpacing: 1, textTransform: 'uppercase' }}>
                                            Migration Control
                                        </Typography>
                                    </Box>
                                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1, mb: 2 }}>
                                        <Button
                                            data-testid="migration-run-btn"
                                            variant="contained"
                                            fullWidth
                                            startIcon={migrationRunning ? <CircularProgress size={16} color="inherit" /> : <PlayArrow />}
                                            onClick={runMigration}
                                            disabled={migrationRunning}
                                            sx={{ bgcolor: '#1565c0', '&:hover': { bgcolor: '#0d47a1' } }}
                                        >
                                            {migrationRunning ? 'Migrating...' : 'Run Migration'}
                                        </Button>
                                        <Button
                                            data-testid="migration-clear-btn"
                                            variant="outlined"
                                            fullWidth
                                            color="error"
                                            onClick={clearMigration}
                                            disabled={migrationRunning}
                                            sx={{ borderColor: '#b71c1c', color: '#ef5350', '&:hover': { bgcolor: 'rgba(183,28,28,0.1)' } }}
                                        >
                                            Clear Migration Data
                                        </Button>
                                    </Box>
                                    {migrationResult && (
                                        <Box data-testid="migration-summary" sx={{ bgcolor: 'rgba(255,255,255,0.05)', borderRadius: 1, p: 1.5, mt: 1 }}>
                                            <Typography variant="caption" sx={{ opacity: 0.6, display: 'block', mb: 0.5 }}>Last Migration</Typography>
                                            <Typography variant="body2">
                                                Customers: {migrationResult.customers?.migrated ?? 0} &bull;
                                                Orders: {migrationResult.orders?.migrated ?? 0} &bull;
                                                Payments: {migrationResult.payments?.migrated ?? 0}
                                            </Typography>
                                            {(migrationResult.orders?.errors?.length > 0 || migrationResult.payments?.errors?.length > 0) && (
                                                <Typography variant="body2" sx={{ color: '#ef5350', mt: 0.5 }}>
                                                    Errors: {(migrationResult.orders?.errors?.length || 0) + (migrationResult.payments?.errors?.length || 0)}
                                                </Typography>
                                            )}
                                        </Box>
                                    )}
                                </CardContent>
                            </Card>
                        </Grid>
                    </Grid>

                    {/* Drift detail table — only when drifted customers exist */}
                    {driftData?.customerDrift?.length > 0 && (
                        <Paper sx={{ p: 2, bgcolor: '#fff8e1', border: '1px solid #ffe082' }}>
                            <Typography variant="subtitle2" sx={{ mb: 1, color: '#e65100', fontWeight: 700 }}>
                                Customers with Balance Drift
                            </Typography>
                            <TableContainer sx={{ maxHeight: 260 }}>
                                <Table size="small" stickyHeader>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Customer</TableCell>
                                            <TableCell align="right">Old System</TableCell>
                                            <TableCell align="right">Ledger</TableCell>
                                            <TableCell align="right">Difference</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {driftData.customerDrift.map((c) => (
                                            <TableRow key={c.customerId} data-testid={`drift-row-${c.customerId}`}>
                                                <TableCell>{c.customerName}</TableCell>
                                                <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{formatCurrency(c.oldOutstanding)}</TableCell>
                                                <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{formatCurrency(c.ledgerBalance)}</TableCell>
                                                <TableCell align="right" sx={{ fontFamily: 'monospace', color: 'error.main', fontWeight: 700 }}>
                                                    {formatCurrency(c.difference)}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    )}

                    {/* System totals from drift check */}
                    {driftData?.systemTotals && (
                        <Grid container spacing={2} sx={{ mt: 1 }}>
                            <Grid item xs={12} md={6}>
                                <Paper sx={{ p: 2, border: '1px solid', borderColor: driftData.systemTotals.sales.isMatched ? '#c8e6c9' : '#ffcdd2' }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Typography variant="subtitle2">Sales Total</Typography>
                                        <Chip
                                            size="small"
                                            label={driftData.systemTotals.sales.isMatched ? 'MATCHED' : 'MISMATCH'}
                                            color={driftData.systemTotals.sales.isMatched ? 'success' : 'error'}
                                        />
                                    </Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                                        <Typography variant="body2" color="text.secondary">Old: {formatCurrency(driftData.systemTotals.sales.oldSystem)}</Typography>
                                        <Typography variant="body2" color="text.secondary">Ledger: {formatCurrency(driftData.systemTotals.sales.ledgerCredit)}</Typography>
                                    </Box>
                                </Paper>
                            </Grid>
                            <Grid item xs={12} md={6}>
                                <Paper sx={{ p: 2, border: '1px solid', borderColor: driftData.systemTotals.payments.isMatched ? '#c8e6c9' : '#ffcdd2' }}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <Typography variant="subtitle2">Payments Total</Typography>
                                        <Chip
                                            size="small"
                                            label={driftData.systemTotals.payments.isMatched ? 'MATCHED' : 'MISMATCH'}
                                            color={driftData.systemTotals.payments.isMatched ? 'success' : 'error'}
                                        />
                                    </Box>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', mt: 1 }}>
                                        <Typography variant="body2" color="text.secondary">Old: {formatCurrency(driftData.systemTotals.payments.oldSystem)}</Typography>
                                        <Typography variant="body2" color="text.secondary">Ledger: {formatCurrency(driftData.systemTotals.payments.ledgerCashDebit)}</Typography>
                                    </Box>
                                </Paper>
                            </Grid>
                        </Grid>
                    )}
                </Box>
            )}

            {/* Tab 1: Chart of Accounts */}
            {activeTab === 1 && !loading && (
                <TableContainer component={Paper}>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                <TableCell>Code</TableCell>
                                <TableCell>Account Name</TableCell>
                                <TableCell>Type</TableCell>
                                <TableCell>Sub Type</TableCell>
                                <TableCell>Party</TableCell>
                                <TableCell align="center">System</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {accounts.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                                        No accounts found. Click "Initialize Accounts" to create default chart of accounts.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                accounts.map((acc) => (
                                    <TableRow key={acc.id} hover>
                                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{acc.code}</TableCell>
                                        <TableCell>{acc.name}</TableCell>
                                        <TableCell>
                                            <Chip 
                                                label={acc.type} 
                                                size="small"
                                                color={
                                                    acc.type === 'ASSET' ? 'primary' :
                                                    acc.type === 'LIABILITY' ? 'error' :
                                                    acc.type === 'INCOME' ? 'success' :
                                                    acc.type === 'EXPENSE' ? 'warning' : 'default'
                                                }
                                            />
                                        </TableCell>
                                        <TableCell>{acc.subType || '-'}</TableCell>
                                        <TableCell>
                                            {acc.partyType ? (
                                                <Chip label={`${acc.partyType}: ${acc.name}`} size="small" variant="outlined" />
                                            ) : '-'}
                                        </TableCell>
                                        <TableCell align="center">
                                            {acc.isSystemAccount ? <CheckCircle color="success" fontSize="small" /> : '-'}
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Tab 2: Trial Balance */}
            {activeTab === 2 && !loading && trialBalance && (
                <Paper sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6">Trial Balance as of {trialBalance.asOfDate}</Typography>
                        <Chip
                            icon={trialBalance.isBalanced ? <CheckCircle /> : <Error />}
                            label={trialBalance.isBalanced ? 'Balanced' : 'Unbalanced'}
                            color={trialBalance.isBalanced ? 'success' : 'error'}
                        />
                    </Box>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ bgcolor: '#e3f2fd' }}>
                                    <TableCell>Code</TableCell>
                                    <TableCell>Account</TableCell>
                                    <TableCell align="right">Debit</TableCell>
                                    <TableCell align="right">Credit</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {trialBalance.accounts?.map((acc) => (
                                    <TableRow key={acc.id} hover>
                                        <TableCell sx={{ fontFamily: 'monospace' }}>{acc.code}</TableCell>
                                        <TableCell>{acc.name}</TableCell>
                                        <TableCell align="right" sx={{ color: 'primary.main' }}>
                                            {Number(acc.totalDebit) > 0 ? formatCurrency(acc.totalDebit) : '-'}
                                        </TableCell>
                                        <TableCell align="right" sx={{ color: 'error.main' }}>
                                            {Number(acc.totalCredit) > 0 ? formatCurrency(acc.totalCredit) : '-'}
                                        </TableCell>
                                    </TableRow>
                                ))}
                                <TableRow sx={{ bgcolor: '#f5f5f5', fontWeight: 'bold' }}>
                                    <TableCell colSpan={2}><strong>TOTAL</strong></TableCell>
                                    <TableCell align="right"><strong>{formatCurrency(trialBalance.totals?.totalDebit)}</strong></TableCell>
                                    <TableCell align="right"><strong>{formatCurrency(trialBalance.totals?.totalCredit)}</strong></TableCell>
                                </TableRow>
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            )}

            {/* Tab 3: Profit & Loss */}
            {activeTab === 3 && !loading && profitLoss && (
                <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                        <Paper sx={{ p: 2 }}>
                            <Typography variant="h6" sx={{ color: 'success.main', mb: 2 }}>Income</Typography>
                            <TableContainer>
                                <Table size="small">
                                    <TableBody>
                                        {profitLoss.income?.accounts?.map((acc) => (
                                            <TableRow key={acc.id}>
                                                <TableCell>{acc.name}</TableCell>
                                                <TableCell align="right">{formatCurrency(acc.amount)}</TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow sx={{ bgcolor: '#e8f5e9' }}>
                                            <TableCell><strong>Total Income</strong></TableCell>
                                            <TableCell align="right"><strong>{formatCurrency(profitLoss.income?.total)}</strong></TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <Paper sx={{ p: 2 }}>
                            <Typography variant="h6" sx={{ color: 'error.main', mb: 2 }}>Expenses</Typography>
                            <TableContainer>
                                <Table size="small">
                                    <TableBody>
                                        {profitLoss.expenses?.accounts?.map((acc) => (
                                            <TableRow key={acc.id}>
                                                <TableCell>{acc.name}</TableCell>
                                                <TableCell align="right">{formatCurrency(acc.amount)}</TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow sx={{ bgcolor: '#ffebee' }}>
                                            <TableCell><strong>Total Expenses</strong></TableCell>
                                            <TableCell align="right"><strong>{formatCurrency(profitLoss.expenses?.total)}</strong></TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    </Grid>
                    <Grid item xs={12}>
                        <Paper sx={{ p: 3, bgcolor: profitLoss.netProfit >= 0 ? '#e8f5e9' : '#ffebee' }}>
                            <Typography variant="h5" align="center">
                                Net {profitLoss.netProfit >= 0 ? 'Profit' : 'Loss'}: {formatCurrency(Math.abs(profitLoss.netProfit))}
                            </Typography>
                        </Paper>
                    </Grid>
                </Grid>
            )}

            {/* Tab 4: Balance Sheet */}
            {activeTab === 4 && !loading && balanceSheet && (
                <Grid container spacing={2}>
                    <Grid item xs={12} md={6}>
                        <Paper sx={{ p: 2 }}>
                            <Typography variant="h6" sx={{ color: 'primary.main', mb: 2 }}>Assets</Typography>
                            <TableContainer>
                                <Table size="small">
                                    <TableBody>
                                        {balanceSheet.assets?.accounts?.map((acc) => (
                                            <TableRow key={acc.id}>
                                                <TableCell>{acc.name}</TableCell>
                                                <TableCell align="right">{formatCurrency(acc.balance)}</TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow sx={{ bgcolor: '#e3f2fd' }}>
                                            <TableCell><strong>Total Assets</strong></TableCell>
                                            <TableCell align="right"><strong>{formatCurrency(balanceSheet.assets?.total)}</strong></TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <Paper sx={{ p: 2 }}>
                            <Typography variant="h6" sx={{ color: 'error.main', mb: 2 }}>Liabilities & Equity</Typography>
                            <TableContainer>
                                <Table size="small">
                                    <TableBody>
                                        {balanceSheet.liabilities?.accounts?.map((acc) => (
                                            <TableRow key={acc.id}>
                                                <TableCell>{acc.name}</TableCell>
                                                <TableCell align="right">{formatCurrency(acc.balance)}</TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow sx={{ bgcolor: '#ffebee' }}>
                                            <TableCell><strong>Total Liabilities</strong></TableCell>
                                            <TableCell align="right"><strong>{formatCurrency(balanceSheet.liabilities?.total)}</strong></TableCell>
                                        </TableRow>
                                        <TableRow><TableCell colSpan={2}><Divider /></TableCell></TableRow>
                                        {balanceSheet.equity?.accounts?.map((acc) => (
                                            <TableRow key={acc.id}>
                                                <TableCell>{acc.name}</TableCell>
                                                <TableCell align="right">{formatCurrency(acc.balance)}</TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow sx={{ bgcolor: '#f3e5f5' }}>
                                            <TableCell><strong>Total Equity</strong></TableCell>
                                            <TableCell align="right"><strong>{formatCurrency(balanceSheet.equity?.total)}</strong></TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </Paper>
                    </Grid>
                    <Grid item xs={12}>
                        <Paper sx={{ p: 2, bgcolor: balanceSheet.isBalanced ? '#e8f5e9' : '#ffebee' }}>
                            <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 2 }}>
                                {balanceSheet.isBalanced ? <CheckCircle color="success" /> : <Warning color="error" />}
                                <Typography variant="h6">
                                    {balanceSheet.isBalanced 
                                        ? 'Balance Sheet is Balanced (Assets = Liabilities + Equity)'
                                        : 'Balance Sheet is NOT Balanced - Check for errors'
                                    }
                                </Typography>
                            </Box>
                        </Paper>
                    </Grid>
                </Grid>
            )}

            {/* Tab 5: Reconciliation */}
            {activeTab === 5 && !loading && (
                <Paper sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6">Reconciliation Report</Typography>
                        <Box sx={{ display: 'flex', gap: 1 }}>
                            <Button variant="outlined" startIcon={<Refresh />} onClick={fetchReconciliation}>
                                Refresh
                            </Button>
                            <Button variant="outlined" color="error" onClick={clearMigration}>
                                Clear Migration Data
                            </Button>
                        </Box>
                    </Box>

                    {reconciliation && (
                        <>
                            <Grid container spacing={2} sx={{ mb: 3 }}>
                                <Grid item xs={6} md={3}>
                                    <Card sx={{ bgcolor: '#e8f5e9' }}>
                                        <CardContent>
                                            <Typography variant="h4">{reconciliation.summary?.customersMatched || 0}</Typography>
                                            <Typography color="textSecondary">Customers Matched</Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                <Grid item xs={6} md={3}>
                                    <Card sx={{ bgcolor: '#ffebee' }}>
                                        <CardContent>
                                            <Typography variant="h4">{reconciliation.summary?.customersMismatched || 0}</Typography>
                                            <Typography color="textSecondary">Customers Mismatched</Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                <Grid item xs={6} md={3}>
                                    <Card sx={{ bgcolor: '#e8f5e9' }}>
                                        <CardContent>
                                            <Typography variant="h4">{reconciliation.summary?.suppliersMatched || 0}</Typography>
                                            <Typography color="textSecondary">Suppliers Matched</Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                                <Grid item xs={6} md={3}>
                                    <Card sx={{ bgcolor: '#ffebee' }}>
                                        <CardContent>
                                            <Typography variant="h4">{reconciliation.summary?.suppliersMismatched || 0}</Typography>
                                            <Typography color="textSecondary">Suppliers Mismatched</Typography>
                                        </CardContent>
                                    </Card>
                                </Grid>
                            </Grid>

                            <Typography variant="subtitle1" sx={{ mt: 3, mb: 1 }}>Customer Reconciliation</Typography>
                            <TableContainer sx={{ maxHeight: 300 }}>
                                <Table size="small" stickyHeader>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>Customer</TableCell>
                                            <TableCell align="right">Old System</TableCell>
                                            <TableCell align="right">Ledger</TableCell>
                                            <TableCell align="right">Difference</TableCell>
                                            <TableCell align="center">Status</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {reconciliation.customers?.filter(c => !c.isMatched).map((cust) => (
                                            <TableRow key={cust.id} sx={{ bgcolor: '#fff3e0' }}>
                                                <TableCell>{cust.name}</TableCell>
                                                <TableCell align="right">{formatCurrency(cust.oldSystemBalance)}</TableCell>
                                                <TableCell align="right">{formatCurrency(cust.ledgerBalance)}</TableCell>
                                                <TableCell align="right" sx={{ color: 'error.main' }}>
                                                    {formatCurrency(cust.difference)}
                                                </TableCell>
                                                <TableCell align="center">
                                                    <Chip label="Mismatch" color="error" size="small" />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        {reconciliation.customers?.filter(c => c.isMatched).slice(0, 10).map((cust) => (
                                            <TableRow key={cust.id}>
                                                <TableCell>{cust.name}</TableCell>
                                                <TableCell align="right">{formatCurrency(cust.oldSystemBalance)}</TableCell>
                                                <TableCell align="right">{formatCurrency(cust.ledgerBalance)}</TableCell>
                                                <TableCell align="right">-</TableCell>
                                                <TableCell align="center">
                                                    <Chip label="OK" color="success" size="small" />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </>
                    )}

                    {!reconciliation && (
                        <Alert severity="info">
                            Run migration first to see reconciliation report.
                        </Alert>
                    )}
                </Paper>
            )}

            {/* Tab 6: Journal Entries */}
            {activeTab === 6 && !loading && (
                <Paper sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6">Journal Batches</Typography>
                        <Button variant="outlined" startIcon={<Refresh />} onClick={fetchJournalBatches}>
                            Refresh
                        </Button>
                    </Box>
                    <TableContainer sx={{ maxHeight: 500 }}>
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow>
                                    <TableCell>Batch #</TableCell>
                                    <TableCell>Date</TableCell>
                                    <TableCell>Type</TableCell>
                                    <TableCell>Description</TableCell>
                                    <TableCell align="right">Debit</TableCell>
                                    <TableCell align="right">Credit</TableCell>
                                    <TableCell align="center">Status</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {journalBatches.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                                            No journal entries found. Run migration to create entries.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    journalBatches.map((batch) => (
                                        <TableRow key={batch.id} hover>
                                            <TableCell sx={{ fontFamily: 'monospace' }}>{batch.batchNumber}</TableCell>
                                            <TableCell>{batch.transactionDate}</TableCell>
                                            <TableCell>
                                                <Chip label={batch.referenceType} size="small" variant="outlined" />
                                            </TableCell>
                                            <TableCell sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {batch.description}
                                            </TableCell>
                                            <TableCell align="right">{formatCurrency(batch.totalDebit)}</TableCell>
                                            <TableCell align="right">{formatCurrency(batch.totalCredit)}</TableCell>
                                            <TableCell align="center">
                                                {batch.isBalanced ? (
                                                    <Chip icon={<CheckCircle />} label="Balanced" color="success" size="small" />
                                                ) : (
                                                    <Chip icon={<Error />} label="Error" color="error" size="small" />
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            )}
        </Box>
    );
};

export default LedgerModule;
