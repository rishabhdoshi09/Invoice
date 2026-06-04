import { useState, useEffect } from 'react';
import {
    Box, Paper, Typography, Tabs, Tab, Button, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Chip, CircularProgress, Alert,
    TextField, Grid, Card, CardContent, Divider, IconButton, Tooltip
} from '@mui/material';
import {
    AccountBalance, Receipt, Assessment, Refresh,
    CheckCircle, Error, Warning, TrendingUp, OpenInNew
} from '@mui/icons-material';
import axios from 'axios';

const LedgerModule = () => {
    const [activeTab, setActiveTab] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(null);

    // Data states
    const [accounts, setAccounts] = useState([]);
    const [accountsCount, setAccountsCount] = useState(null); // null = unknown, 0 = not initialized
    const [healthData, setHealthData] = useState(null);
    const [driftData, setDriftData] = useState(null);
    const [trialBalance, setTrialBalance] = useState(null);
    const [profitLoss, setProfitLoss] = useState(null);
    const [balanceSheet, setBalanceSheet] = useState(null);
    const [journalBatches, setJournalBatches] = useState([]);
    const [migrating, setMigrating] = useState(false);

    // Account Ledger states
    const [selectedAccount, setSelectedAccount] = useState(null);
    const [accountLedger, setAccountLedger] = useState(null);

    // Date filter (Indian Financial Year default)
    const [dateRange, setDateRange] = useState(() => {
        const now = new Date();
        const fyStartYear = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
        return {
            fromDate: new Date(fyStartYear, 3, 1).toISOString().split('T')[0],
            toDate: now.toISOString().split('T')[0]
        };
    });

    const getAuthHeader = () => ({
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
    });

    const fetchHealth = async () => {
        try {
            const { data } = await axios.get('/api/ledger/health-check', getAuthHeader());
            setHealthData(data.data);
        } catch (err) {
            console.error('Health check failed:', err);
        }
    };

    const fetchDrift = async () => {
        try {
            const { data } = await axios.get('/api/ledger/daily-drift-check', getAuthHeader());
            setDriftData(data.data);
        } catch (err) {
            console.error('Drift check failed:', err);
        }
    };

    const fetchDashboard = async () => {
        setLoading(true);
        try {
            await Promise.all([fetchHealth(), fetchDrift()]);
            // Also check if accounts are initialized
            const { data } = await axios.get('/api/ledger/accounts', getAuthHeader());
            setAccountsCount((data.data || []).length);
        } catch (err) {
            // If accounts fails (e.g. description column missing), keep null
            console.error('Dashboard fetch error:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleImportAllData = async () => {
        setMigrating(true);
        setError(null);
        setSuccess(null);
        try {
            await axios.post('/api/ledger/migration/run', {}, getAuthHeader());
            setSuccess('Ledger initialized and all historical data imported. Refreshing...');
            await fetchDashboard();
        } catch (err) {
            setError(err.response?.data?.message || 'Import failed. Please try again.');
        } finally {
            setMigrating(false);
        }
    };

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

    const fetchJournalBatches = async () => {
        try {
            setLoading(true);
            const { data } = await axios.get('/api/ledger/journal-batches?limit=200', getAuthHeader());
            setJournalBatches(data.data?.batches || []);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to fetch journal entries');
        } finally {
            setLoading(false);
        }
    };

    const fetchAccountLedger = async (accountId) => {
        try {
            setLoading(true);
            setError(null);
            const params = `?fromDate=${dateRange.fromDate}&toDate=${dateRange.toDate}`;
            const { data } = await axios.get(`/api/ledger/accounts/${accountId}/ledger${params}`, getAuthHeader());
            setAccountLedger(data.data);
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to fetch account ledger');
        } finally {
            setLoading(false);
        }
    };

    const openAccountLedger = (account) => {
        setSelectedAccount(account);
        setActiveTab(6);
        fetchAccountLedger(account.id);
    };

    useEffect(() => {
        if (activeTab === 0) fetchDashboard();
        if (activeTab === 1) fetchAccounts();
        if (activeTab === 2) fetchTrialBalance();
        if (activeTab === 3) fetchProfitLoss();
        if (activeTab === 4) fetchBalanceSheet();
        if (activeTab === 5) fetchJournalBatches();
        if (activeTab === 6 && selectedAccount) fetchAccountLedger(selectedAccount.id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTab]);

    const fmt = (amount) =>
        `₹${(Number(amount) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;

    const refreshCurrent = () => {
        if (activeTab === 0) fetchDashboard();
        if (activeTab === 1) fetchAccounts();
        if (activeTab === 2) fetchTrialBalance();
        if (activeTab === 3) fetchProfitLoss();
        if (activeTab === 4) fetchBalanceSheet();
        if (activeTab === 5) fetchJournalBatches();
        if (activeTab === 6 && selectedAccount) fetchAccountLedger(selectedAccount.id);
    };

    return (
        <Box sx={{ p: 3 }}>
            <Paper sx={{ p: 2, mb: 3 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h5" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <AccountBalance color="primary" />
                        Ledger — Double Entry Accounting
                    </Typography>
                    <Tooltip title="Refresh current tab">
                        <IconButton onClick={refreshCurrent} disabled={loading}>
                            {loading ? <CircularProgress size={20} /> : <Refresh />}
                        </IconButton>
                    </Tooltip>
                </Box>

                {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
                {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>{success}</Alert>}

                <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} variant="scrollable" scrollButtons="auto" sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tab label="Dashboard"         icon={<Assessment />}     iconPosition="start" />
                    <Tab label="Chart of Accounts" icon={<AccountBalance />} iconPosition="start" />
                    <Tab label="Trial Balance"     icon={<Assessment />}     iconPosition="start" />
                    <Tab label="Profit & Loss"     icon={<TrendingUp />}     iconPosition="start" />
                    <Tab label="Balance Sheet"     icon={<Receipt />}        iconPosition="start" />
                    <Tab label="Journal Entries"   icon={<Receipt />}        iconPosition="start" />
                    <Tab label="Account Ledger"    icon={<AccountBalance />} iconPosition="start" />
                </Tabs>
            </Paper>

            {/* Date Range Filter — shown for reports + account ledger */}
            {[2, 3, 4, 6].includes(activeTab) && (
                <Paper sx={{ p: 2, mb: 2 }}>
                    <Grid container spacing={2} alignItems="center">
                        <Grid item xs={12} sm={4}>
                            <TextField type="date" label="From Date" value={dateRange.fromDate} size="small" fullWidth
                                InputLabelProps={{ shrink: true }}
                                onChange={(e) => setDateRange(d => ({ ...d, fromDate: e.target.value }))} />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <TextField type="date" label="To Date" value={dateRange.toDate} size="small" fullWidth
                                InputLabelProps={{ shrink: true }}
                                onChange={(e) => setDateRange(d => ({ ...d, toDate: e.target.value }))} />
                        </Grid>
                        <Grid item xs={12} sm={4}>
                            <Button variant="contained" startIcon={<Refresh />} onClick={refreshCurrent}>
                                Apply
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

            {/* ── Tab 0: Dashboard ── */}
            {activeTab === 0 && !loading && (
                <Box>
                    {/* Setup required */}
                    {accountsCount === 0 && (
                        <Paper sx={{ p: 4, textAlign: 'center', mb: 2 }}>
                            <AccountBalance sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
                            <Typography variant="h6" gutterBottom>Ledger Not Initialized</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 3, maxWidth: 480, mx: 'auto' }}>
                                The double-entry ledger needs to be set up once. This will create the Chart of Accounts
                                and import all your existing orders, purchases, and payments as journal entries.
                                Going forward, every new transaction will be posted automatically.
                            </Typography>
                            <Button
                                variant="contained"
                                size="large"
                                onClick={handleImportAllData}
                                disabled={migrating}
                                startIcon={migrating ? <CircularProgress size={18} color="inherit" /> : null}
                            >
                                {migrating ? 'Setting up...' : 'Initialize Ledger & Import All Data'}
                            </Button>
                        </Paper>
                    )}

                    {/* Active ledger summary */}
                    {accountsCount > 0 && (
                        <Grid container spacing={2}>
                            {/* Balance status */}
                            <Grid item xs={12} md={4}>
                                <Card variant="outlined">
                                    <CardContent>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                                            {healthData?.isBalanced
                                                ? <CheckCircle color="success" fontSize="small" />
                                                : <Error color="error" fontSize="small" />}
                                            <Typography variant="subtitle1" fontWeight={600}>Ledger Balance</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                                            <Typography variant="body2" color="text.secondary">Total Debits</Typography>
                                            <Typography variant="body2" fontFamily="monospace" fontWeight={600}>{fmt(healthData?.totalDebits)}</Typography>
                                        </Box>
                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                                            <Typography variant="body2" color="text.secondary">Total Credits</Typography>
                                            <Typography variant="body2" fontFamily="monospace" fontWeight={600}>{fmt(healthData?.totalCredits)}</Typography>
                                        </Box>
                                        <Divider sx={{ mb: 1.5 }} />
                                        <Chip
                                            size="small"
                                            label={healthData?.isBalanced ? 'Balanced' : 'Not Balanced'}
                                            color={healthData?.isBalanced ? 'success' : 'error'}
                                        />
                                    </CardContent>
                                </Card>
                            </Grid>

                            {/* Accounts count */}
                            <Grid item xs={12} md={4}>
                                <Card variant="outlined">
                                    <CardContent>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
                                            <AccountBalance color="primary" fontSize="small" />
                                            <Typography variant="subtitle1" fontWeight={600}>Chart of Accounts</Typography>
                                        </Box>
                                        <Typography variant="h4" fontWeight={700} color="primary.main">{accountsCount}</Typography>
                                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>accounts active</Typography>
                                        <Divider sx={{ my: 1.5 }} />
                                        <Button size="small" onClick={() => setActiveTab(1)}>View Accounts</Button>
                                    </CardContent>
                                </Card>
                            </Grid>

                            {/* Reports */}
                            <Grid item xs={12} md={4}>
                                <Card variant="outlined">
                                    <CardContent>
                                        <Typography variant="subtitle1" fontWeight={600} gutterBottom>Reports</Typography>
                                        {[
                                            { label: 'Trial Balance', tab: 2 },
                                            { label: 'Profit & Loss', tab: 3 },
                                            { label: 'Balance Sheet', tab: 4 },
                                            { label: 'Journal Entries', tab: 5 },
                                        ].map(({ label, tab }) => (
                                            <Button key={tab} fullWidth variant="text" size="small"
                                                endIcon={<OpenInNew fontSize="small" />}
                                                onClick={() => setActiveTab(tab)}
                                                sx={{ mb: 0.5, justifyContent: 'space-between' }}>
                                                {label}
                                            </Button>
                                        ))}
                                    </CardContent>
                                </Card>
                            </Grid>

                            {/* Re-import option */}
                            <Grid item xs={12}>
                                <Paper variant="outlined" sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 2 }}>
                                    <Box>
                                        <Typography variant="body2" fontWeight={600}>Re-import Historical Data</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            Run this if you added old orders/payments and want them reflected in the ledger. Safe to run multiple times.
                                        </Typography>
                                    </Box>
                                    <Button variant="outlined" size="small" onClick={handleImportAllData} disabled={migrating}
                                        startIcon={migrating ? <CircularProgress size={14} color="inherit" /> : null}>
                                        {migrating ? 'Running...' : 'Re-import'}
                                    </Button>
                                </Paper>
                            </Grid>
                        </Grid>
                    )}
                </Box>
            )}

            {/* ── Tab 1: Chart of Accounts ── */}
            {activeTab === 1 && !loading && (
                <Paper>
                    <Box sx={{ p: 2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Typography variant="h6">Chart of Accounts</Typography>
                        <Typography variant="body2" color="text.secondary">Click any account to view its ledger</Typography>
                    </Box>
                    <TableContainer>
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ bgcolor: '#e3f2fd' }}>
                                    <TableCell sx={{ fontWeight: 700 }}>Code</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Account Name</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Sub Type</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {accounts.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                            No accounts found. Ledger may not be initialized yet.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    accounts.map((acc) => (
                                        <TableRow key={acc.id} hover sx={{ cursor: 'pointer' }}
                                            onClick={() => openAccountLedger(acc)}>
                                            <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#1565C0' }}>{acc.code}</TableCell>
                                            <TableCell>{acc.name}</TableCell>
                                            <TableCell>
                                                <Chip label={acc.type} size="small"
                                                    color={
                                                        acc.type === 'ASSET'     ? 'primary' :
                                                        acc.type === 'LIABILITY' ? 'error'   :
                                                        acc.type === 'INCOME'    ? 'success'  :
                                                        acc.type === 'EXPENSE'   ? 'warning'  : 'default'
                                                    } />
                                            </TableCell>
                                            <TableCell sx={{ color: 'text.secondary', fontSize: 13 }}>{acc.subType || '—'}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            )}

            {/* ── Tab 2: Trial Balance ── */}
            {activeTab === 2 && !loading && (
                <Paper sx={{ p: 2 }}>
                    {trialBalance ? (
                        <>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Typography variant="h6">Trial Balance — as of {trialBalance.asOfDate}</Typography>
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
                                            <TableCell sx={{ fontWeight: 700 }}>Code</TableCell>
                                            <TableCell sx={{ fontWeight: 700 }}>Account</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 700, color: '#1565C0' }}>Debit (₹)</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 700, color: '#C62828' }}>Credit (₹)</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {trialBalance.accounts?.map((acc) => (
                                            <TableRow key={acc.id} hover>
                                                <TableCell sx={{ fontFamily: 'monospace', color: '#1565C0' }}>{acc.code}</TableCell>
                                                <TableCell>{acc.name}</TableCell>
                                                <TableCell align="right" sx={{ fontFamily: 'monospace', color: '#1565C0' }}>
                                                    {Number(acc.totalDebit) > 0 ? fmt(acc.totalDebit) : '—'}
                                                </TableCell>
                                                <TableCell align="right" sx={{ fontFamily: 'monospace', color: '#C62828' }}>
                                                    {Number(acc.totalCredit) > 0 ? fmt(acc.totalCredit) : '—'}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                        <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                            <TableCell colSpan={2}><strong>TOTAL</strong></TableCell>
                                            <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#1565C0' }}>
                                                {fmt(trialBalance.totals?.totalDebit)}
                                            </TableCell>
                                            <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#C62828' }}>
                                                {fmt(trialBalance.totals?.totalCredit)}
                                            </TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        </>
                    ) : (
                        <Alert severity="info">No data. Adjust date range and click Apply.</Alert>
                    )}
                </Paper>
            )}

            {/* ── Tab 3: Profit & Loss ── */}
            {activeTab === 3 && !loading && (
                profitLoss ? (
                    <Grid container spacing={2}>
                        <Grid item xs={12} md={6}>
                            <Paper sx={{ p: 2 }}>
                                <Typography variant="h6" sx={{ color: 'success.main', mb: 2, fontWeight: 700 }}>Income</Typography>
                                <TableContainer>
                                    <Table size="small">
                                        <TableBody>
                                            {profitLoss.income?.accounts?.map((acc) => (
                                                <TableRow key={acc.id} hover>
                                                    <TableCell>{acc.name}</TableCell>
                                                    <TableCell align="right" sx={{ fontFamily: 'monospace', color: '#2E7D32', fontWeight: 600 }}>
                                                        {fmt(acc.amount)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            <TableRow sx={{ bgcolor: '#e8f5e9' }}>
                                                <TableCell><strong>Total Income</strong></TableCell>
                                                <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#2E7D32' }}>
                                                    {fmt(profitLoss.income?.total)}
                                                </TableCell>
                                            </TableRow>
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Paper>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Paper sx={{ p: 2 }}>
                                <Typography variant="h6" sx={{ color: 'error.main', mb: 2, fontWeight: 700 }}>Expenses</Typography>
                                <TableContainer>
                                    <Table size="small">
                                        <TableBody>
                                            {profitLoss.expenses?.accounts?.map((acc) => (
                                                <TableRow key={acc.id} hover>
                                                    <TableCell>{acc.name}</TableCell>
                                                    <TableCell align="right" sx={{ fontFamily: 'monospace', color: '#C62828', fontWeight: 600 }}>
                                                        {fmt(acc.amount)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            <TableRow sx={{ bgcolor: '#ffebee' }}>
                                                <TableCell><strong>Total Expenses</strong></TableCell>
                                                <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#C62828' }}>
                                                    {fmt(profitLoss.expenses?.total)}
                                                </TableCell>
                                            </TableRow>
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Paper>
                        </Grid>
                        <Grid item xs={12}>
                            <Paper sx={{ p: 3, bgcolor: profitLoss.netProfit >= 0 ? '#e8f5e9' : '#ffebee', textAlign: 'center' }}>
                                <Typography variant="h5" sx={{ fontWeight: 700, color: profitLoss.netProfit >= 0 ? '#2E7D32' : '#C62828' }}>
                                    Net {profitLoss.netProfit >= 0 ? 'Profit' : 'Loss'}: {fmt(Math.abs(profitLoss.netProfit))}
                                </Typography>
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                    Period: {dateRange.fromDate} to {dateRange.toDate}
                                </Typography>
                            </Paper>
                        </Grid>
                    </Grid>
                ) : <Alert severity="info">No data. Adjust date range and click Apply.</Alert>
            )}

            {/* ── Tab 4: Balance Sheet ── */}
            {activeTab === 4 && !loading && (
                balanceSheet ? (
                    <Grid container spacing={2}>
                        <Grid item xs={12} md={6}>
                            <Paper sx={{ p: 2 }}>
                                <Typography variant="h6" sx={{ color: 'primary.main', mb: 2, fontWeight: 700 }}>Assets</Typography>
                                <TableContainer>
                                    <Table size="small">
                                        <TableBody>
                                            {balanceSheet.assets?.accounts?.map((acc) => (
                                                <TableRow key={acc.id} hover>
                                                    <TableCell>{acc.name}</TableCell>
                                                    <TableCell align="right" sx={{ fontFamily: 'monospace', color: '#1565C0', fontWeight: 600 }}>
                                                        {fmt(acc.balance)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            <TableRow sx={{ bgcolor: '#e3f2fd' }}>
                                                <TableCell><strong>Total Assets</strong></TableCell>
                                                <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#1565C0' }}>
                                                    {fmt(balanceSheet.assets?.total)}
                                                </TableCell>
                                            </TableRow>
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Paper>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <Paper sx={{ p: 2 }}>
                                <Typography variant="h6" sx={{ color: 'error.main', mb: 2, fontWeight: 700 }}>Liabilities</Typography>
                                <TableContainer>
                                    <Table size="small">
                                        <TableBody>
                                            {balanceSheet.liabilities?.accounts?.map((acc) => (
                                                <TableRow key={acc.id} hover>
                                                    <TableCell>{acc.name}</TableCell>
                                                    <TableCell align="right" sx={{ fontFamily: 'monospace', color: '#C62828', fontWeight: 600 }}>
                                                        {fmt(acc.balance)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            <TableRow sx={{ bgcolor: '#ffebee' }}>
                                                <TableCell><strong>Total Liabilities</strong></TableCell>
                                                <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#C62828' }}>
                                                    {fmt(balanceSheet.liabilities?.total)}
                                                </TableCell>
                                            </TableRow>
                                            <TableRow><TableCell colSpan={2}><Divider /></TableCell></TableRow>
                                            {balanceSheet.equity?.accounts?.map((acc) => (
                                                <TableRow key={acc.id} hover>
                                                    <TableCell>{acc.name}</TableCell>
                                                    <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                                                        {fmt(acc.balance)}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                            <TableRow sx={{ bgcolor: '#f3e5f5' }}>
                                                <TableCell><strong>Total Equity</strong></TableCell>
                                                <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                                                    {fmt(balanceSheet.equity?.total)}
                                                </TableCell>
                                            </TableRow>
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Paper>
                        </Grid>
                        <Grid item xs={12}>
                            <Paper sx={{ p: 2, bgcolor: balanceSheet.isBalanced ? '#e8f5e9' : '#ffebee' }}>
                                <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 1 }}>
                                    {balanceSheet.isBalanced ? <CheckCircle color="success" /> : <Warning color="error" />}
                                    <Typography variant="h6" sx={{ fontWeight: 700, color: balanceSheet.isBalanced ? '#2E7D32' : '#C62828' }}>
                                        {balanceSheet.isBalanced
                                            ? 'Balance Sheet is Balanced (Assets = Liabilities + Equity)'
                                            : 'Balance Sheet is NOT Balanced — check for errors'}
                                    </Typography>
                                </Box>
                            </Paper>
                        </Grid>
                    </Grid>
                ) : <Alert severity="info">No data. Adjust date range and click Apply.</Alert>
            )}

            {/* ── Tab 5: Journal Entries ── */}
            {activeTab === 5 && !loading && (
                <Paper sx={{ p: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                        <Typography variant="h6">Journal Entries</Typography>
                        <Button variant="outlined" startIcon={<Refresh />} onClick={fetchJournalBatches}>Refresh</Button>
                    </Box>
                    <TableContainer sx={{ maxHeight: 600 }}>
                        <Table size="small" stickyHeader>
                            <TableHead>
                                <TableRow sx={{ bgcolor: '#e3f2fd' }}>
                                    <TableCell sx={{ fontWeight: 700 }}>Batch #</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Type</TableCell>
                                    <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700 }}>Debit (₹)</TableCell>
                                    <TableCell align="right" sx={{ fontWeight: 700 }}>Credit (₹)</TableCell>
                                    <TableCell align="center" sx={{ fontWeight: 700 }}>Status</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {journalBatches.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                            No journal entries found.
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    journalBatches.map((batch) => (
                                        <TableRow key={batch.id} hover>
                                            <TableCell sx={{ fontFamily: 'monospace', fontSize: 12, color: '#1565C0' }}>{batch.batchNumber}</TableCell>
                                            <TableCell sx={{ fontSize: 12 }}>{batch.transactionDate}</TableCell>
                                            <TableCell>
                                                <Chip label={batch.referenceType} size="small" variant="outlined" sx={{ fontSize: 11 }} />
                                            </TableCell>
                                            <TableCell sx={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>
                                                {batch.description}
                                            </TableCell>
                                            <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: 12, color: '#1565C0' }}>
                                                {fmt(batch.totalDebit)}
                                            </TableCell>
                                            <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: 12, color: '#C62828' }}>
                                                {fmt(batch.totalCredit)}
                                            </TableCell>
                                            <TableCell align="center">
                                                {batch.isBalanced
                                                    ? <Chip icon={<CheckCircle />} label="OK" color="success" size="small" />
                                                    : <Chip icon={<Error />} label="Error" color="error" size="small" />}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </TableContainer>
                </Paper>
            )}

            {/* ── Tab 6: Account Ledger ── */}
            {activeTab === 6 && !loading && (
                <Box>
                    {!selectedAccount ? (
                        <Alert severity="info">
                            Go to <strong>Chart of Accounts</strong> tab and click on any account to view its ledger.
                        </Alert>
                    ) : (
                        <Paper sx={{ p: 2 }}>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                                <Box>
                                    <Typography variant="h6">{selectedAccount.name}</Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        Code: {selectedAccount.code} · {selectedAccount.type}
                                    </Typography>
                                </Box>
                                <Button variant="outlined" startIcon={<Refresh />}
                                    onClick={() => fetchAccountLedger(selectedAccount.id)}>
                                    Refresh
                                </Button>
                            </Box>

                            {accountLedger ? (
                                <>
                                    <Grid container spacing={2} sx={{ mb: 2 }}>
                                        {[
                                            { label: 'Opening Balance', value: fmt(accountLedger.openingBalance), color: '#555' },
                                            { label: 'Total Debit',     value: fmt(accountLedger.totalDebit),     color: '#1565C0' },
                                            { label: 'Total Credit',    value: fmt(accountLedger.totalCredit),    color: '#C62828' },
                                            { label: 'Closing Balance', value: fmt(accountLedger.closingBalance), color: '#2E7D32', bold: true },
                                        ].map(card => (
                                            <Grid item xs={6} sm={3} key={card.label}>
                                                <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                                                    <Typography variant="caption" color="text.secondary">{card.label}</Typography>
                                                    <Typography variant="h6" sx={{ fontWeight: card.bold ? 700 : 500, color: card.color, fontFamily: 'monospace' }}>
                                                        {card.value}
                                                    </Typography>
                                                </Paper>
                                            </Grid>
                                        ))}
                                    </Grid>
                                    <TableContainer sx={{ maxHeight: 500 }}>
                                        <Table size="small" stickyHeader>
                                            <TableHead>
                                                <TableRow sx={{ bgcolor: '#e3f2fd' }}>
                                                    <TableCell sx={{ fontWeight: 700 }}>Date</TableCell>
                                                    <TableCell sx={{ fontWeight: 700 }}>Description</TableCell>
                                                    <TableCell sx={{ fontWeight: 700 }}>Ref</TableCell>
                                                    <TableCell align="right" sx={{ fontWeight: 700, color: '#1565C0' }}>Debit (₹)</TableCell>
                                                    <TableCell align="right" sx={{ fontWeight: 700, color: '#C62828' }}>Credit (₹)</TableCell>
                                                    <TableCell align="right" sx={{ fontWeight: 700 }}>Balance (₹)</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {accountLedger.entries?.map((entry, i) => (
                                                    <TableRow key={i} hover>
                                                        <TableCell sx={{ fontSize: 12 }}>{entry.transactionDate}</TableCell>
                                                        <TableCell sx={{ fontSize: 12, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {entry.description}
                                                        </TableCell>
                                                        <TableCell sx={{ fontSize: 11, color: 'text.secondary' }}>
                                                            {entry.referenceType}
                                                        </TableCell>
                                                        <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: 12, color: '#1565C0' }}>
                                                            {Number(entry.debit) > 0 ? fmt(entry.debit) : '—'}
                                                        </TableCell>
                                                        <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: 12, color: '#C62828' }}>
                                                            {Number(entry.credit) > 0 ? fmt(entry.credit) : '—'}
                                                        </TableCell>
                                                        <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: 12, fontWeight: 600 }}>
                                                            {fmt(entry.runningBalance)}
                                                        </TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                </>
                            ) : (
                                <Alert severity="info">No entries in this date range.</Alert>
                            )}
                        </Paper>
                    )}
                </Box>
            )}
        </Box>
    );
};

export default LedgerModule;
