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

    // Account Ledger states
    const [selectedAccount, setSelectedAccount] = useState(null);
    const [accountLedger, setAccountLedger] = useState(null);

    // Filter states
    const [dateRange, setDateRange] = useState(() => {
        const now = new Date();
        // Indian Financial Year: Apr 1 to Mar 31. If before April, FY started previous year.
        const fyStartYear = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
        return {
            fromDate: new Date(fyStartYear, 3, 1).toISOString().split('T')[0],
            toDate: now.toISOString().split('T')[0]
        };
    });

    // Migration states
    const [migrationRunning, setMigrationRunning] = useState(false);

    // Forensic Audit states
    const [forensicData, setForensicData] = useState(null);
    const [forensicRunning, setForensicRunning] = useState(false);
    const [selectedFixes, setSelectedFixes] = useState(new Set());
    const [fixRunning, setFixRunning] = useState(false);

    // Recovery Script states
    const [recoveryPreview, setRecoveryPreview] = useState(null);
    const [recoveryRunning, setRecoveryRunning] = useState(false);
    const [recoveryResult, setRecoveryResult] = useState(null);
    const [validationResult, setValidationResult] = useState(null);

    // Forensic Classification states
    const [classifyData, setClassifyData] = useState(null);
    const [classifyRunning, setClassifyRunning] = useState(false);
    const [repairPreview, setRepairPreview] = useState(null);
    const [repairRunning, setRepairRunning] = useState(false);
    const [repairResult, setRepairResult] = useState(null);

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

    // Fetch Account Ledger (transaction-by-transaction with running balance)
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

    // Open Account Ledger for a specific account
    const openAccountLedger = (account) => {
        setSelectedAccount(account);
        setActiveTab(8); // Account Ledger tab index
        fetchAccountLedger(account.id);
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

    // Forensic Audit: Scan
    const runForensicScan = async () => {
        try {
            setForensicRunning(true);
            setError(null);
            setSelectedFixes(new Set());
            const { data } = await axios.get('/api/data-audit/forensic', getAuthHeader());
            setForensicData(data.data);
            if (data.data.contradictions.length === 0 && data.data.paidWithoutEvidence.length === 0) {
                setSuccess('No issues found. All orders look clean.');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to run forensic scan');
        } finally {
            setForensicRunning(false);
        }
    };

    // Forensic Audit: Fix selected orders
    const fixSelectedOrders = async (action) => {
        if (selectedFixes.size === 0) return;
        const userName = prompt('Enter your name for the audit trail (required):');
        if (!userName || !userName.trim()) return;
        const actionLabel = action === 'reset_to_unpaid' ? 'UNPAID' : 'PAID';
        if (!window.confirm(`This will set ${selectedFixes.size} orders to ${actionLabel}. Every change will be logged. Proceed?`)) return;

        try {
            setFixRunning(true);
            setError(null);
            const { data } = await axios.post('/api/data-audit/fix', {
                orderIds: Array.from(selectedFixes),
                action,
                changedBy: userName.trim()
            }, getAuthHeader());
            setSuccess(data.message);
            setSelectedFixes(new Set());
            // Re-run scan to refresh
            await runForensicScan();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to fix orders');
        } finally {
            setFixRunning(false);
        }
    };

    const toggleFixSelection = (orderId) => {
        setSelectedFixes(prev => {
            const next = new Set(prev);
            if (next.has(orderId)) next.delete(orderId);
            else next.add(orderId);
            return next;
        });
    };

    // Recovery Script: Preview
    const runRecoveryPreview = async () => {
        try {
            setRecoveryRunning(true);
            setError(null);
            setRecoveryResult(null);
            setValidationResult(null);
            const { data } = await axios.get('/api/data-audit/recovery/preview', getAuthHeader());
            setRecoveryPreview(data.data);
            if (data.data.totalChanges === 0) {
                setSuccess('No changes needed. All orders already match their receipt allocations.');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to run recovery preview');
        } finally {
            setRecoveryRunning(false);
        }
    };

    // Recovery Script: Execute
    const executeRecovery = async (includeExcluded = false) => {
        const userName = prompt('Enter your name for the audit trail (MANDATORY):');
        if (!userName || !userName.trim()) return;
        const totalChanges = (recoveryPreview?.step2_4?.count || 0) + (includeExcluded ? recoveryPreview?.step5?.totalFound : recoveryPreview?.step5?.includedCount || 0);
        if (!window.confirm(`FINAL CONFIRMATION:\n\nThis will modify ${totalChanges} orders.\nEvery change will be logged in audit_logs.\n\nProceed?`)) return;

        try {
            setRecoveryRunning(true);
            setError(null);
            const { data } = await axios.post('/api/data-audit/recovery/execute', {
                changedBy: userName.trim(),
                includeExcluded
            }, getAuthHeader());
            setRecoveryResult(data.data);
            setRecoveryPreview(null);
            setSuccess(data.message);
            // Auto-run validation
            await runValidation();
        } catch (err) {
            setError(err.response?.data?.message || 'Failed to execute recovery');
        } finally {
            setRecoveryRunning(false);
        }
    };

    // Recovery Script: Validate
    const runValidation = async () => {
        try {
            const { data } = await axios.get('/api/data-audit/recovery/validate', getAuthHeader());
            setValidationResult(data.data);
        } catch (err) {
            console.error('Validation failed:', err);
        }
    };


    // Forensic Classification: Classify
    const runClassification = async () => {
        try {
            setClassifyRunning(true);
            setError(null);
            setRepairPreview(null);
            setRepairResult(null);
            const { data } = await axios.get('/api/data-audit/classify', getAuthHeader());
            setClassifyData(data.data);
        } catch (err) {
            setError(err.response?.data?.message || 'Classification failed');
        } finally {
            setClassifyRunning(false);
        }
    };

    // Forensic Classification: Repair Preview
    const runRepairPreview = async () => {
        try {
            setRepairRunning(true);
            setError(null);
            const { data } = await axios.post('/api/data-audit/repair/preview', {}, getAuthHeader());
            setRepairPreview(data.data);
            if (data.data.totalRepairs === 0) {
                setSuccess('All order fields are already consistent with evidence. Nothing to repair.');
            }
        } catch (err) {
            setError(err.response?.data?.message || 'Repair preview failed');
        } finally {
            setRepairRunning(false);
        }
    };

    // Forensic Classification: Execute Repair
    const executeRepair = async () => {
        const userName = prompt('Enter your name for the audit trail (MANDATORY):');
        if (!userName || !userName.trim()) return;
        if (!window.confirm(`FINAL CONFIRMATION:\n\nThis will repair ${repairPreview?.totalRepairs || 0} orders.\nEvery change is logged in audit_logs.\n\nProceed?`)) return;
        try {
            setRepairRunning(true);
            setError(null);
            const { data } = await axios.post('/api/data-audit/repair/execute', { changedBy: userName.trim() }, getAuthHeader());
            setRepairResult(data.data);
            setRepairPreview(null);
            setSuccess(data.message);
            // Refresh classification
            await runClassification();
        } catch (err) {
            setError(err.response?.data?.message || 'Repair failed');
        } finally {
            setRepairRunning(false);
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
        // Tab 7 = Posting Matrix (static, no fetch)
        // Tab 8 = Account Ledger (fetched via openAccountLedger)
        if (activeTab === 8 && selectedAccount) fetchAccountLedger(selectedAccount.id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
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
                    <Tab label="Posting Matrix" icon={<AccountBalance />} iconPosition="start" data-testid="tab-posting-matrix" />
                    <Tab label={selectedAccount ? `Ledger: ${selectedAccount.name}` : 'Account Ledger'} icon={<Receipt />} iconPosition="start" data-testid="tab-account-ledger" />
                </Tabs>
            </Paper>

            {/* Date Range Filter */}
            {[2, 3, 4, 8].includes(activeTab) && (
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
                                    if (activeTab === 8 && selectedAccount) fetchAccountLedger(selectedAccount.id);
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


                    {/* Forensic Classification Card */}
                    <Paper data-testid="forensic-classification-card" sx={{ p: 2, mt: 2, bgcolor: '#e8eaf6', border: '2px solid #5c6bc0' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Assessment sx={{ color: '#283593' }} />
                            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#283593' }}>
                                Forensic Classification
                            </Typography>
                        </Box>
                        <Typography variant="body2" sx={{ mb: 2, color: '#37474f' }}>
                            Classifies every order into 5 categories based on verified payment evidence.
                            Read-only scan — does NOT modify data.
                        </Typography>

                        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                            <Button
                                data-testid="classify-btn"
                                variant="contained"
                                startIcon={classifyRunning ? <CircularProgress size={16} color="inherit" /> : <Refresh />}
                                onClick={runClassification}
                                disabled={classifyRunning}
                                sx={{ bgcolor: '#283593', '&:hover': { bgcolor: '#1a237e' } }}
                            >
                                {classifyRunning ? 'Classifying...' : 'Step 1: Classify All Orders'}
                            </Button>
                            {classifyData && classifyData.totalNeedsRepair > 0 && !repairPreview && !repairResult && (
                                <Button
                                    data-testid="repair-preview-btn"
                                    variant="outlined"
                                    startIcon={repairRunning ? <CircularProgress size={16} /> : <Refresh />}
                                    onClick={runRepairPreview}
                                    disabled={repairRunning}
                                    sx={{ borderColor: '#c62828', color: '#c62828' }}
                                >
                                    Step 2: Preview Repair ({classifyData.totalNeedsRepair} orders)
                                </Button>
                            )}
                            {repairPreview && repairPreview.totalRepairs > 0 && (
                                <Button
                                    data-testid="repair-execute-btn"
                                    variant="contained"
                                    startIcon={repairRunning ? <CircularProgress size={16} color="inherit" /> : <PlayArrow />}
                                    onClick={executeRepair}
                                    disabled={repairRunning}
                                    sx={{ bgcolor: '#b71c1c', '&:hover': { bgcolor: '#7f0000' } }}
                                >
                                    Step 3: Execute Repair ({repairPreview.totalRepairs})
                                </Button>
                            )}
                        </Box>

                        {/* Classification Results */}
                        {classifyData && (
                            <Box>
                                {/* Category Summary Cards */}
                                <Grid container spacing={1} sx={{ mb: 2 }}>
                                    {[
                                        { key: 'RECEIPT_PAID', label: 'Receipt Paid', color: '#2e7d32', bg: '#e8f5e9' },
                                        { key: 'PARTIAL_PAID', label: 'Partial Paid', color: '#e65100', bg: '#fff3e0' },
                                        { key: 'CASH_SALE', label: 'Cash Sale', color: '#1565c0', bg: '#e3f2fd' },
                                        { key: 'CREDIT_UNPAID', label: 'Credit Unpaid', color: '#546e7a', bg: '#eceff1' },
                                        { key: 'SUSPICIOUS_PAID', label: 'Suspicious', color: '#b71c1c', bg: '#ffebee' }
                                    ].map(cat => {
                                        const s = classifyData.summary[cat.key] || { count: 0, totalValue: 0, needsRepair: 0 };
                                        return (
                                            <Grid item xs={6} sm={4} md key={cat.key}>
                                                <Box sx={{ p: 1, bgcolor: cat.bg, borderRadius: 1, textAlign: 'center', border: s.needsRepair > 0 ? `2px solid ${cat.color}` : 'none' }}>
                                                    <Typography variant="h6" data-testid={`classify-count-${cat.key}`} sx={{ color: cat.color, fontWeight: 700 }}>
                                                        {s.count}
                                                    </Typography>
                                                    <Typography variant="caption" sx={{ fontWeight: 600 }}>{cat.label}</Typography>
                                                    {s.needsRepair > 0 && (
                                                        <Typography variant="caption" sx={{ display: 'block', color: '#b71c1c', fontWeight: 700 }}>
                                                            {s.needsRepair} need repair
                                                        </Typography>
                                                    )}
                                                    <Typography variant="caption" sx={{ display: 'block', color: '#78909c', fontSize: '0.7rem' }}>
                                                        {formatCurrency(s.totalValue)}
                                                    </Typography>
                                                </Box>
                                            </Grid>
                                        );
                                    })}
                                </Grid>

                                {/* Detail Tables per Category */}
                                {['RECEIPT_PAID', 'PARTIAL_PAID', 'CASH_SALE', 'CREDIT_UNPAID', 'SUSPICIOUS_PAID'].map(catKey => {
                                    const items = classifyData.categories[catKey] || [];
                                    if (items.length === 0) return null;
                                    const catColors = { RECEIPT_PAID: '#2e7d32', PARTIAL_PAID: '#e65100', CASH_SALE: '#1565c0', CREDIT_UNPAID: '#546e7a', SUSPICIOUS_PAID: '#b71c1c' };
                                    const catBg = { RECEIPT_PAID: '#e8f5e9', PARTIAL_PAID: '#fff3e0', CASH_SALE: '#e3f2fd', CREDIT_UNPAID: '#eceff1', SUSPICIOUS_PAID: '#ffebee' };
                                    return (
                                        <Box key={catKey} sx={{ mb: 2 }}>
                                            <Typography variant="subtitle2" sx={{ color: catColors[catKey], fontWeight: 700, mb: 0.5 }}>
                                                {catKey.replace(/_/g, ' ')} ({items.length})
                                            </Typography>
                                            <TableContainer sx={{ maxHeight: 220 }}>
                                                <Table size="small" stickyHeader>
                                                    <TableHead>
                                                        <TableRow sx={{ bgcolor: catBg[catKey] }}>
                                                            <TableCell>Invoice</TableCell>
                                                            <TableCell>Customer</TableCell>
                                                            <TableCell align="right">Total</TableCell>
                                                            <TableCell>Current Status</TableCell>
                                                            <TableCell align="right">Alloc</TableCell>
                                                            <TableCell>Fields OK?</TableCell>
                                                        </TableRow>
                                                    </TableHead>
                                                    <TableBody>
                                                        {items.map(o => (
                                                            <TableRow key={o.orderId} data-testid={`classify-row-${o.orderNumber}`}
                                                                sx={{ bgcolor: o.needsRepair ? '#fff8e1' : 'inherit' }}>
                                                                <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.8rem' }}>{o.orderNumber}</TableCell>
                                                                <TableCell sx={{ fontSize: '0.8rem' }}>{o.customerName}</TableCell>
                                                                <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{formatCurrency(o.total)}</TableCell>
                                                                <TableCell>
                                                                    <Chip size="small" label={`${o.current.paymentStatus} (${formatCurrency(o.current.paidAmount)})`}
                                                                        color={o.current.paymentStatus === 'paid' ? 'success' : o.current.paymentStatus === 'partial' ? 'warning' : 'default'}
                                                                        sx={{ fontSize: '0.7rem' }} />
                                                                </TableCell>
                                                                <TableCell align="right" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{formatCurrency(o.evidence.allocTotal)}</TableCell>
                                                                <TableCell>
                                                                    {o.fieldCorrect
                                                                        ? <Typography variant="caption" sx={{ color: '#2e7d32', fontWeight: 700 }}>OK</Typography>
                                                                        : <Typography variant="caption" sx={{ color: '#b71c1c', fontWeight: 700 }}>
                                                                            MISMATCH → {o.expected.paymentStatus} ({formatCurrency(o.expected.paidAmount)})
                                                                          </Typography>
                                                                    }
                                                                </TableCell>
                                                            </TableRow>
                                                        ))}
                                                    </TableBody>
                                                </Table>
                                            </TableContainer>
                                        </Box>
                                    );
                                })}
                            </Box>
                        )}

                        {/* Repair Preview */}
                        {repairPreview && repairPreview.totalRepairs > 0 && (
                            <Box sx={{ mt: 2 }}>
                                <Alert severity="warning" sx={{ mb: 1 }}>
                                    <strong>Repair Preview:</strong> {repairPreview.totalRepairs} orders will be changed.
                                    {repairPreview.byAction && (
                                        <span> ({Object.entries(repairPreview.byAction).filter(([,v]) => v > 0).map(([k,v]) => `${k}: ${v}`).join(', ')})</span>
                                    )}
                                </Alert>
                                <TableContainer sx={{ maxHeight: 300 }}>
                                    <Table size="small" stickyHeader>
                                        <TableHead>
                                            <TableRow sx={{ bgcolor: '#ffecb3' }}>
                                                <TableCell>Invoice</TableCell>
                                                <TableCell>Customer</TableCell>
                                                <TableCell>Before</TableCell>
                                                <TableCell>After</TableCell>
                                                <TableCell>Action</TableCell>
                                                <TableCell>Source</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {repairPreview.repairs.map(r => (
                                                <TableRow key={r.orderId} data-testid={`repair-row-${r.orderNumber}`}>
                                                    <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.8rem' }}>{r.orderNumber}</TableCell>
                                                    <TableCell sx={{ fontSize: '0.8rem' }}>{r.customerName}</TableCell>
                                                    <TableCell>
                                                        <Chip size="small" label={`${r.current.paymentStatus} (${formatCurrency(r.current.paidAmount)})`}
                                                            color={r.current.paymentStatus === 'paid' ? 'success' : r.current.paymentStatus === 'partial' ? 'warning' : 'default'}
                                                            sx={{ fontSize: '0.7rem' }} />
                                                    </TableCell>
                                                    <TableCell>
                                                        <Chip size="small" label={`${r.expected.paymentStatus} (${formatCurrency(r.expected.paidAmount)})`}
                                                            sx={{ bgcolor: '#bbdefb', fontWeight: 700, fontSize: '0.7rem' }} />
                                                    </TableCell>
                                                    <TableCell sx={{ fontSize: '0.75rem', fontWeight: 600 }}>{r.repairAction}</TableCell>
                                                    <TableCell sx={{ fontSize: '0.72rem', color: '#546e7a' }}>{r.repairSource}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Box>
                        )}

                        {/* Repair Result */}
                        {repairResult && (
                            <Box sx={{ mt: 2 }}>
                                <Alert severity="success" data-testid="repair-result">
                                    Repaired {repairResult.totalRepaired} orders. Audit log created for each.
                                </Alert>
                                {repairResult.validation && (
                                    <Box sx={{ mt: 1 }}>
                                        <Typography variant="subtitle2" sx={{ color: repairResult.validation.allPassed ? '#2e7d32' : '#c62828', fontWeight: 700 }}>
                                            Post-Repair Validation: {repairResult.validation.allPassed ? 'ALL PASSED' : 'ISSUES FOUND'}
                                        </Typography>
                                        {repairResult.validation.checks?.map((c, i) => (
                                            <Typography key={i} variant="body2" sx={{ fontSize: '0.8rem', color: c.passed ? '#2e7d32' : '#c62828' }}>
                                                {c.passed ? 'PASS' : 'FAIL'}: {c.name} {c.violations > 0 ? `(${c.violations} violations)` : ''}
                                            </Typography>
                                        ))}
                                    </Box>
                                )}
                            </Box>
                        )}
                    </Paper>

                    {/* Forensic Audit Card */}
                    <Paper data-testid="forensic-audit-card" sx={{ p: 2, mt: 2, bgcolor: '#f5f5f5', border: '1px solid #bdbdbd' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Assessment sx={{ color: '#37474f' }} />
                            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#37474f' }}>
                                Forensic Audit
                            </Typography>
                        </Box>
                        <Typography variant="body2" sx={{ mb: 0.5, color: '#546e7a' }}>
                            Rule: <strong>"Status change hua hai to log hona chahiye. Log nahi hai = system bug."</strong>
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2, color: '#546e7a', fontSize: '0.8rem' }}>
                            Scans all orders for: (1) Financial contradictions, (2) Paid without evidence, (3) Who changed what.
                        </Typography>

                        <Button
                            data-testid="forensic-scan-btn"
                            variant="contained"
                            startIcon={forensicRunning ? <CircularProgress size={16} color="inherit" /> : <Refresh />}
                            onClick={runForensicScan}
                            disabled={forensicRunning}
                            sx={{ mb: 2, bgcolor: '#37474f', '&:hover': { bgcolor: '#263238' } }}
                        >
                            {forensicRunning ? 'Scanning...' : 'Run Forensic Scan'}
                        </Button>

                        {forensicData && (
                            <Box>
                                {/* Summary Row */}
                                <Grid container spacing={1} sx={{ mb: 2 }}>
                                    <Grid item xs={6} sm={3}>
                                        <Box sx={{ p: 1, bgcolor: '#e3f2fd', borderRadius: 1, textAlign: 'center' }}>
                                            <Typography variant="h6" data-testid="forensic-total-scanned">{forensicData.summary.totalScanned}</Typography>
                                            <Typography variant="caption">Scanned</Typography>
                                        </Box>
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <Box sx={{ p: 1, bgcolor: forensicData.summary.contradictionCount > 0 ? '#ffebee' : '#e8f5e9', borderRadius: 1, textAlign: 'center' }}>
                                            <Typography variant="h6" data-testid="forensic-contradiction-count" sx={{ color: forensicData.summary.contradictionCount > 0 ? '#c62828' : '#2e7d32' }}>
                                                {forensicData.summary.contradictionCount}
                                            </Typography>
                                            <Typography variant="caption">Contradictions</Typography>
                                        </Box>
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <Box sx={{ p: 1, bgcolor: forensicData.summary.paidWithoutEvidenceCount > 0 ? '#fff3e0' : '#e8f5e9', borderRadius: 1, textAlign: 'center' }}>
                                            <Typography variant="h6" data-testid="forensic-no-evidence-count" sx={{ color: forensicData.summary.paidWithoutEvidenceCount > 0 ? '#e65100' : '#2e7d32' }}>
                                                {forensicData.summary.paidWithoutEvidenceCount}
                                            </Typography>
                                            <Typography variant="caption">Paid, No Evidence</Typography>
                                        </Box>
                                    </Grid>
                                    <Grid item xs={6} sm={3}>
                                        <Box sx={{ p: 1, bgcolor: '#e3f2fd', borderRadius: 1, textAlign: 'center' }}>
                                            <Typography variant="h6">{forensicData.summary.ordersWithToggleLogs}</Typography>
                                            <Typography variant="caption">Have Toggle Logs</Typography>
                                        </Box>
                                    </Grid>
                                </Grid>

                                {/* Category 1: Contradictions */}
                                {forensicData.contradictions.length > 0 && (
                                    <Box sx={{ mb: 2 }}>
                                        <Typography variant="subtitle2" sx={{ color: '#c62828', fontWeight: 700, mb: 1 }}>
                                            Financial Contradictions ({forensicData.contradictions.length})
                                        </Typography>
                                        <TableContainer sx={{ maxHeight: 300 }}>
                                            <Table size="small" stickyHeader>
                                                <TableHead>
                                                    <TableRow sx={{ bgcolor: '#ffebee' }}>
                                                        <TableCell padding="checkbox">
                                                            <input type="checkbox" onChange={(e) => {
                                                                if (e.target.checked) {
                                                                    setSelectedFixes(new Set(forensicData.contradictions.map(c => c.orderId)));
                                                                } else {
                                                                    setSelectedFixes(new Set());
                                                                }
                                                            }} />
                                                        </TableCell>
                                                        <TableCell>Invoice</TableCell>
                                                        <TableCell>Customer</TableCell>
                                                        <TableCell align="right">Total</TableCell>
                                                        <TableCell>Status</TableCell>
                                                        <TableCell align="right">Paid Amt</TableCell>
                                                        <TableCell>Issue</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {forensicData.contradictions.map((c) => (
                                                        <TableRow key={c.orderId} data-testid={`contradiction-row-${c.orderNumber}`}
                                                            sx={{ bgcolor: selectedFixes.has(c.orderId) ? '#ffcdd2' : 'inherit' }}>
                                                            <TableCell padding="checkbox">
                                                                <input type="checkbox" checked={selectedFixes.has(c.orderId)}
                                                                    onChange={() => toggleFixSelection(c.orderId)} />
                                                            </TableCell>
                                                            <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{c.orderNumber}</TableCell>
                                                            <TableCell>{c.customerName}</TableCell>
                                                            <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{formatCurrency(c.total)}</TableCell>
                                                            <TableCell>
                                                                <Chip size="small" label={c.paymentStatus}
                                                                    color={c.paymentStatus === 'paid' ? 'success' : c.paymentStatus === 'partial' ? 'warning' : 'default'} />
                                                            </TableCell>
                                                            <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{formatCurrency(c.paidAmount)}</TableCell>
                                                            <TableCell sx={{ fontSize: '0.75rem', maxWidth: 250, color: '#c62828' }}>{c.issue.detail}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
                                        {selectedFixes.size > 0 && (
                                            <Box sx={{ display: 'flex', gap: 1, mt: 1 }}>
                                                <Button variant="contained" size="small" color="warning"
                                                    data-testid="fix-to-unpaid-btn"
                                                    disabled={fixRunning}
                                                    onClick={() => fixSelectedOrders('reset_to_unpaid')}>
                                                    {fixRunning ? 'Fixing...' : `Reset ${selectedFixes.size} to UNPAID`}
                                                </Button>
                                                <Button variant="contained" size="small" color="success"
                                                    data-testid="fix-to-paid-btn"
                                                    disabled={fixRunning}
                                                    onClick={() => fixSelectedOrders('reset_to_paid')}>
                                                    {fixRunning ? 'Fixing...' : `Reset ${selectedFixes.size} to PAID`}
                                                </Button>
                                            </Box>
                                        )}
                                    </Box>
                                )}

                                {/* Category 2: Paid Without Evidence */}
                                {forensicData.paidWithoutEvidence.length > 0 && (
                                    <Box sx={{ mb: 2 }}>
                                        <Typography variant="subtitle2" sx={{ color: '#e65100', fontWeight: 700, mb: 1 }}>
                                            Paid Without Evidence ({forensicData.paidWithoutEvidence.length})
                                        </Typography>
                                        <Typography variant="body2" sx={{ color: '#795548', mb: 1, fontSize: '0.8rem' }}>
                                            These orders are marked "paid" but have no cash journal, no toggle log, and no payment record.
                                            They could be legitimate old cash sales OR corruption. Review manually.
                                        </Typography>
                                        <TableContainer sx={{ maxHeight: 300 }}>
                                            <Table size="small" stickyHeader>
                                                <TableHead>
                                                    <TableRow sx={{ bgcolor: '#fff3e0' }}>
                                                        <TableCell>Invoice</TableCell>
                                                        <TableCell>Date</TableCell>
                                                        <TableCell>Customer</TableCell>
                                                        <TableCell align="right">Total</TableCell>
                                                        <TableCell>Modified By</TableCell>
                                                        <TableCell>Note</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {forensicData.paidWithoutEvidence.map((p) => (
                                                        <TableRow key={p.orderId} data-testid={`no-evidence-row-${p.orderNumber}`}>
                                                            <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{p.orderNumber}</TableCell>
                                                            <TableCell>{p.orderDate}</TableCell>
                                                            <TableCell>{p.customerName}</TableCell>
                                                            <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{formatCurrency(p.total)}</TableCell>
                                                            <TableCell>{p.modifiedByName || '-'}</TableCell>
                                                            <TableCell sx={{ fontSize: '0.72rem', color: '#795548', maxWidth: 200 }}>{p.note}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
                                    </Box>
                                )}

                                {/* Category 3: Change Attribution */}
                                {forensicData.changeAttribution.length > 0 && (
                                    <Box sx={{ mb: 2 }}>
                                        <Typography variant="subtitle2" sx={{ color: '#1565c0', fontWeight: 700, mb: 1 }}>
                                            Change Attribution — Who Toggled What
                                        </Typography>
                                        <TableContainer>
                                            <Table size="small">
                                                <TableHead>
                                                    <TableRow sx={{ bgcolor: '#e3f2fd' }}>
                                                        <TableCell>User</TableCell>
                                                        <TableCell align="right">Total Changes</TableCell>
                                                        <TableCell align="right">To Paid</TableCell>
                                                        <TableCell align="right">To Unpaid</TableCell>
                                                        <TableCell>First Change</TableCell>
                                                        <TableCell>Last Change</TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {forensicData.changeAttribution.map((a) => (
                                                        <TableRow key={a.userName} data-testid={`attribution-row-${a.userName}`}>
                                                            <TableCell sx={{ fontWeight: 600 }}>{a.userName}</TableCell>
                                                            <TableCell align="right" sx={{ fontWeight: 700 }}>{a.totalChanges}</TableCell>
                                                            <TableCell align="right" sx={{ color: '#2e7d32' }}>{a.toPaid}</TableCell>
                                                            <TableCell align="right" sx={{ color: '#c62828' }}>{a.toUnpaid}</TableCell>
                                                            <TableCell sx={{ fontSize: '0.8rem' }}>{new Date(a.firstChange).toLocaleDateString('en-IN')}</TableCell>
                                                            <TableCell sx={{ fontSize: '0.8rem' }}>{new Date(a.lastChange).toLocaleDateString('en-IN')}</TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
                                    </Box>
                                )}
                            </Box>
                        )}
                    </Paper>


                    {/* Payment Recovery Script Card */}
                    <Paper data-testid="recovery-script-card" sx={{ p: 2, mt: 2, bgcolor: '#fce4ec', border: '1px solid #ef9a9a' }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                            <Warning sx={{ color: '#b71c1c' }} />
                            <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#b71c1c' }}>
                                Payment Recovery Script
                            </Typography>
                        </Box>
                        <Typography variant="body2" sx={{ mb: 0.5, color: '#4e342e' }}>
                            Rebuilds <code>paidAmount</code>, <code>dueAmount</code>, <code>paymentStatus</code> from <strong>receipt_allocations</strong>.
                        </Typography>
                        <Typography variant="body2" sx={{ mb: 2, color: '#4e342e', fontSize: '0.8rem' }}>
                            Step 1: Backup DB. Step 2-4: Recalculate from allocations. Step 5: Reset paid-without-allocations to unpaid (cash sales excluded). Step 6: Audit log every change. Step 7: Validate.
                        </Typography>

                        <Alert severity="warning" sx={{ mb: 2 }} data-testid="backup-reminder">
                            <strong>BACKUP REQUIRED:</strong> Run <code>pg_dump database_name &gt; backup_before_payment_recovery.sql</code> before executing.
                        </Alert>

                        <Box sx={{ display: 'flex', gap: 1, mb: 2, flexWrap: 'wrap' }}>
                            <Button
                                data-testid="recovery-preview-btn"
                                variant="outlined"
                                startIcon={recoveryRunning ? <CircularProgress size={16} /> : <Refresh />}
                                onClick={runRecoveryPreview}
                                disabled={recoveryRunning}
                                sx={{ borderColor: '#b71c1c', color: '#b71c1c', '&:hover': { bgcolor: 'rgba(183,28,28,0.08)' } }}
                            >
                                {recoveryRunning ? 'Scanning...' : 'Step 1: Preview Changes'}
                            </Button>
                            {recoveryPreview && recoveryPreview.totalChanges > 0 && (
                                <Button
                                    data-testid="recovery-execute-btn"
                                    variant="contained"
                                    startIcon={recoveryRunning ? <CircularProgress size={16} color="inherit" /> : <PlayArrow />}
                                    onClick={() => executeRecovery(false)}
                                    disabled={recoveryRunning}
                                    sx={{ bgcolor: '#b71c1c', '&:hover': { bgcolor: '#7f0000' } }}
                                >
                                    Step 2: Execute ({recoveryPreview.totalChanges} changes)
                                </Button>
                            )}
                            {!recoveryPreview && !recoveryResult && (
                                <Button
                                    data-testid="validate-btn"
                                    variant="outlined"
                                    onClick={runValidation}
                                    sx={{ borderColor: '#2e7d32', color: '#2e7d32' }}
                                >
                                    Run Validation Only
                                </Button>
                            )}
                        </Box>

                        {/* Preview Results */}
                        {recoveryPreview && (
                            <Box>
                                {/* Step 2-4: Allocation-based corrections */}
                                <Typography variant="subtitle2" sx={{ color: '#1565c0', fontWeight: 700, mb: 1 }}>
                                    Step 2-4: From Receipt Allocations ({recoveryPreview.step2_4?.count || 0} changes)
                                </Typography>
                                {recoveryPreview.step2_4?.orders?.length > 0 ? (
                                    <TableContainer sx={{ maxHeight: 250, mb: 2 }}>
                                        <Table size="small" stickyHeader>
                                            <TableHead>
                                                <TableRow sx={{ bgcolor: '#e3f2fd' }}>
                                                    <TableCell>Invoice</TableCell>
                                                    <TableCell>Customer</TableCell>
                                                    <TableCell align="right">Total</TableCell>
                                                    <TableCell>Current</TableCell>
                                                    <TableCell>Corrected</TableCell>
                                                    <TableCell align="right">Alloc Total</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {recoveryPreview.step2_4.orders.map((o) => (
                                                    <TableRow key={o.orderId} data-testid={`recovery-step24-${o.orderNumber}`}>
                                                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{o.orderNumber}</TableCell>
                                                        <TableCell>{o.customerName}</TableCell>
                                                        <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{formatCurrency(o.total)}</TableCell>
                                                        <TableCell>
                                                            <Chip size="small" label={`${o.current.paymentStatus} (${formatCurrency(o.current.paidAmount)})`}
                                                                color={o.current.paymentStatus === 'paid' ? 'success' : o.current.paymentStatus === 'partial' ? 'warning' : 'default'} />
                                                        </TableCell>
                                                        <TableCell>
                                                            <Chip size="small" label={`${o.corrected.paymentStatus} (${formatCurrency(o.corrected.paidAmount)})`}
                                                                sx={{ bgcolor: '#bbdefb', fontWeight: 700 }} />
                                                        </TableCell>
                                                        <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{formatCurrency(o.allocationTotal)}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                ) : (
                                    <Alert severity="success" sx={{ mb: 2 }}>All allocated orders already match. No changes needed.</Alert>
                                )}

                                {/* Step 5: No-allocation resets */}
                                <Typography variant="subtitle2" sx={{ color: '#e65100', fontWeight: 700, mb: 1 }}>
                                    Step 5: Paid Without Allocations ({recoveryPreview.step5?.includedCount || 0} to reset, {recoveryPreview.step5?.excludedCount || 0} cash sales excluded)
                                </Typography>
                                {recoveryPreview.step5?.included?.length > 0 && (
                                    <TableContainer sx={{ maxHeight: 200, mb: 1 }}>
                                        <Table size="small" stickyHeader>
                                            <TableHead>
                                                <TableRow sx={{ bgcolor: '#fff3e0' }}>
                                                    <TableCell>Invoice</TableCell>
                                                    <TableCell>Customer</TableCell>
                                                    <TableCell align="right">Total</TableCell>
                                                    <TableCell>Evidence</TableCell>
                                                    <TableCell>Action</TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {recoveryPreview.step5.included.map((o) => (
                                                    <TableRow key={o.orderId} data-testid={`recovery-step5-included-${o.orderNumber}`}>
                                                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600 }}>{o.orderNumber}</TableCell>
                                                        <TableCell>{o.customerName}</TableCell>
                                                        <TableCell align="right" sx={{ fontFamily: 'monospace' }}>{formatCurrency(o.total)}</TableCell>
                                                        <TableCell sx={{ fontSize: '0.75rem' }}>
                                                            {o.evidence.hasToggleLog && <span>Toggle log (by {o.evidence.toggledBy})</span>}
                                                            {o.evidence.hasToggleJournal && <span>Toggle journal</span>}
                                                            {o.evidence.hasDirectPayment && <span>Direct payment</span>}
                                                        </TableCell>
                                                        <TableCell sx={{ color: '#c62828', fontWeight: 700, fontSize: '0.8rem' }}>→ UNPAID</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                )}
                                {recoveryPreview.step5?.excluded?.length > 0 && (
                                    <Box sx={{ mb: 2 }}>
                                        <Typography variant="body2" sx={{ color: '#2e7d32', fontWeight: 600, mb: 0.5 }}>
                                            Excluded (Cash Sales — {recoveryPreview.step5.excludedCount}):
                                        </Typography>
                                        <Box sx={{ pl: 1 }}>
                                            {recoveryPreview.step5.excluded.map((o) => (
                                                <Typography key={o.orderId} variant="body2" sx={{ fontSize: '0.8rem', color: '#546e7a' }}>
                                                    {o.orderNumber} — {o.customerName} — {formatCurrency(o.total)} (no change evidence, likely cash sale)
                                                </Typography>
                                            ))}
                                        </Box>
                                    </Box>
                                )}
                            </Box>
                        )}

                        {/* Execution Result */}
                        {recoveryResult && (
                            <Alert severity="success" sx={{ mb: 2 }} data-testid="recovery-result">
                                Recovery complete: {recoveryResult.step2_4?.count || 0} from allocations + {recoveryResult.step5?.count || 0} reset to unpaid. {recoveryResult.auditLogsCreated} audit logs created.
                            </Alert>
                        )}

                        {/* Step 7: Validation */}
                        {validationResult && (
                            <Box sx={{ mt: 1 }}>
                                <Typography variant="subtitle2" sx={{ color: validationResult.allPassed ? '#2e7d32' : '#c62828', fontWeight: 700, mb: 0.5 }}>
                                    Step 7: Validation {validationResult.allPassed ? 'PASSED' : 'FAILED'}
                                </Typography>
                                {validationResult.checks?.map((check, i) => (
                                    <Box key={i} sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 0.25 }}>
                                        <Typography variant="body2" sx={{ color: check.passed ? '#2e7d32' : '#c62828', fontWeight: 600 }}>
                                            {check.passed ? 'PASS' : 'FAIL'}
                                        </Typography>
                                        <Typography variant="body2" sx={{ fontSize: '0.8rem' }}>
                                            {check.name} {check.violations > 0 ? `(${check.violations} violations)` : ''}
                                        </Typography>
                                    </Box>
                                ))}
                            </Box>
                        )}
                    </Paper>

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
                                    <TableRow key={acc.id} hover sx={{ cursor: 'pointer' }} onClick={() => openAccountLedger(acc)} data-testid={`account-row-${acc.code}`}>
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

            {/* Tab 7: Posting Matrix (Tally-style voucher type reference) */}
            {activeTab === 7 && (
                <Box data-testid="posting-matrix-tab">
                    <Paper sx={{ p: 3, mb: 2 }}>
                        <Typography variant="h6" sx={{ mb: 1 }}>
                            Posting Matrix — Voucher Type Reference
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                            Shows exactly what ledger entries are created for each transaction type.
                            Every transaction creates balanced double-entry postings (Debit = Credit).
                        </Typography>
                    </Paper>

                    {/* Sales Invoice */}
                    <Paper sx={{ p: 2, mb: 2, border: '1px solid #e3f2fd' }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, color: 'primary.main' }}>
                            Sales Invoice (Credit Sale)
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            When a credit invoice is created for a customer
                        </Typography>
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#e3f2fd' }}>
                                        <TableCell>Account</TableCell>
                                        <TableCell align="right">Debit (Dr)</TableCell>
                                        <TableCell align="right">Credit (Cr)</TableCell>
                                        <TableCell>Effect</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 600 }}>Customer Receivable (1200)</TableCell>
                                        <TableCell align="right" sx={{ color: 'primary.main', fontWeight: 600 }}>Invoice Total</TableCell>
                                        <TableCell align="right">-</TableCell>
                                        <TableCell>Customer owes you more</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 600 }}>Sales Revenue (4100)</TableCell>
                                        <TableCell align="right">-</TableCell>
                                        <TableCell align="right" sx={{ color: 'error.main', fontWeight: 600 }}>Invoice Total</TableCell>
                                        <TableCell>Income recorded</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>

                    {/* Cash Sale */}
                    <Paper sx={{ p: 2, mb: 2, border: '1px solid #e8f5e9' }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, color: 'success.main' }}>
                            Cash Sale (Paid at Counter)
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            When invoice is marked as paid during creation
                        </Typography>
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#e8f5e9' }}>
                                        <TableCell>Account</TableCell>
                                        <TableCell align="right">Debit (Dr)</TableCell>
                                        <TableCell align="right">Credit (Cr)</TableCell>
                                        <TableCell>Effect</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 600 }}>Cash in Hand (1100)</TableCell>
                                        <TableCell align="right" sx={{ color: 'primary.main', fontWeight: 600 }}>Invoice Total</TableCell>
                                        <TableCell align="right">-</TableCell>
                                        <TableCell>Cash received</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 600 }}>Sales Revenue (4100)</TableCell>
                                        <TableCell align="right">-</TableCell>
                                        <TableCell align="right" sx={{ color: 'error.main', fontWeight: 600 }}>Invoice Total</TableCell>
                                        <TableCell>Income recorded</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>

                    {/* Receipt (Against Invoice) */}
                    <Paper sx={{ p: 2, mb: 2, border: '1px solid #fff3e0' }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, color: 'warning.dark' }}>
                            Receipt — Against Ref (Payment Against Invoice)
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            When a customer payment is received and allocated against a specific invoice
                        </Typography>
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#fff3e0' }}>
                                        <TableCell>Account</TableCell>
                                        <TableCell align="right">Debit (Dr)</TableCell>
                                        <TableCell align="right">Credit (Cr)</TableCell>
                                        <TableCell>Effect</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 600 }}>Cash in Hand (1100)</TableCell>
                                        <TableCell align="right" sx={{ color: 'primary.main', fontWeight: 600 }}>Receipt Amount</TableCell>
                                        <TableCell align="right">-</TableCell>
                                        <TableCell>Cash received</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 600 }}>Customer Receivable (1200)</TableCell>
                                        <TableCell align="right">-</TableCell>
                                        <TableCell align="right" sx={{ color: 'error.main', fontWeight: 600 }}>Receipt Amount</TableCell>
                                        <TableCell>Customer owes you less</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>

                    {/* Receipt On Account (Advance) */}
                    <Paper sx={{ p: 2, mb: 2, border: '1px solid #f3e5f5' }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, color: 'secondary.main' }}>
                            Receipt — On Account (Advance/Unallocated)
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            Customer pays without specifying which invoice. Stays as advance until manually allocated.
                        </Typography>
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#f3e5f5' }}>
                                        <TableCell>Account</TableCell>
                                        <TableCell align="right">Debit (Dr)</TableCell>
                                        <TableCell align="right">Credit (Cr)</TableCell>
                                        <TableCell>Effect</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 600 }}>Cash in Hand (1100)</TableCell>
                                        <TableCell align="right" sx={{ color: 'primary.main', fontWeight: 600 }}>Payment Amount</TableCell>
                                        <TableCell align="right">-</TableCell>
                                        <TableCell>Cash received</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 600 }}>Customer Receivable (1200)</TableCell>
                                        <TableCell align="right">-</TableCell>
                                        <TableCell align="right" sx={{ color: 'error.main', fontWeight: 600 }}>Payment Amount</TableCell>
                                        <TableCell>Advance recorded (reduces outstanding)</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </TableContainer>
                        <Alert severity="info" sx={{ mt: 1 }}>
                            Until allocated against a specific invoice, this shows as "On Account" in the customer's receipt tab.
                            Use the Allocate tab to manually assign this payment to an invoice.
                        </Alert>
                    </Paper>

                    {/* Payment Toggle */}
                    <Paper sx={{ p: 2, mb: 2, border: '1px solid #ede7f6' }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                            Payment Status Toggle (Unpaid → Paid)
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            When a user manually toggles an invoice from unpaid to paid
                        </Typography>
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#ede7f6' }}>
                                        <TableCell>Account</TableCell>
                                        <TableCell align="right">Debit (Dr)</TableCell>
                                        <TableCell align="right">Credit (Cr)</TableCell>
                                        <TableCell>Effect</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 600 }}>Cash in Hand (1100)</TableCell>
                                        <TableCell align="right" sx={{ color: 'primary.main', fontWeight: 600 }}>Invoice Total</TableCell>
                                        <TableCell align="right">-</TableCell>
                                        <TableCell>Cash received</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 600 }}>Customer Receivable (1200)</TableCell>
                                        <TableCell align="right">-</TableCell>
                                        <TableCell align="right" sx={{ color: 'error.main', fontWeight: 600 }}>Invoice Total</TableCell>
                                        <TableCell>Customer receivable cleared</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>

                    {/* Supplier Payment */}
                    <Paper sx={{ p: 2, mb: 2, border: '1px solid #fce4ec' }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1, color: 'error.main' }}>
                            Supplier Payment
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                            When you pay a supplier for purchases
                        </Typography>
                        <TableContainer>
                            <Table size="small">
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#fce4ec' }}>
                                        <TableCell>Account</TableCell>
                                        <TableCell align="right">Debit (Dr)</TableCell>
                                        <TableCell align="right">Credit (Cr)</TableCell>
                                        <TableCell>Effect</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 600 }}>Supplier Payable (2100)</TableCell>
                                        <TableCell align="right" sx={{ color: 'primary.main', fontWeight: 600 }}>Payment Amount</TableCell>
                                        <TableCell align="right">-</TableCell>
                                        <TableCell>You owe supplier less</TableCell>
                                    </TableRow>
                                    <TableRow>
                                        <TableCell sx={{ fontWeight: 600 }}>Cash in Hand (1100)</TableCell>
                                        <TableCell align="right">-</TableCell>
                                        <TableCell align="right" sx={{ color: 'error.main', fontWeight: 600 }}>Payment Amount</TableCell>
                                        <TableCell>Cash goes out</TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </Paper>

                    {/* Balance Formula Summary */}
                    <Paper sx={{ p: 3, bgcolor: '#f5f5f5', border: '2px solid #1976d2' }}>
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 2, color: 'primary.main' }}>
                            Tally-Correct Balance Formulas
                        </Typography>
                        <Grid container spacing={2}>
                            <Grid item xs={12} md={4}>
                                <Card sx={{ bgcolor: '#e3f2fd', height: '100%' }}>
                                    <CardContent>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Ledger Balance (Authoritative)</Typography>
                                        <Typography variant="body2" sx={{ fontFamily: 'monospace', bgcolor: '#fff', p: 1, borderRadius: 1 }}>
                                            Closing = Opening + Debits - Credits
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <Card sx={{ bgcolor: '#e8f5e9', height: '100%' }}>
                                    <CardContent>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Invoice Due (Derived)</Typography>
                                        <Typography variant="body2" sx={{ fontFamily: 'monospace', bgcolor: '#fff', p: 1, borderRadius: 1 }}>
                                            Due = Total - sum(Allocated Receipts)
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                            <Grid item xs={12} md={4}>
                                <Card sx={{ bgcolor: '#fff3e0', height: '100%' }}>
                                    <CardContent>
                                        <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 1 }}>Customer Outstanding</Typography>
                                        <Typography variant="body2" sx={{ fontFamily: 'monospace', bgcolor: '#fff', p: 1, borderRadius: 1 }}>
                                            sum(Open Invoice Due) - sum(Unadjusted Credits)
                                        </Typography>
                                    </CardContent>
                                </Card>
                            </Grid>
                        </Grid>
                    </Paper>
                </Box>
            )}

            {/* Tab 8: Account Ledger (Tally-style transaction-by-transaction with running balance) */}
            {activeTab === 8 && (
                <Box data-testid="account-ledger-tab">
                    {!selectedAccount ? (
                        <Paper sx={{ p: 4, textAlign: 'center' }}>
                            <AccountBalance sx={{ fontSize: 48, color: 'text.disabled', mb: 2 }} />
                            <Typography variant="h6" color="text.secondary" sx={{ mb: 1 }}>
                                Select an Account
                            </Typography>
                            <Typography variant="body2" color="text.disabled" sx={{ mb: 3 }}>
                                Go to "Chart of Accounts" tab and click any account row to view its ledger.
                            </Typography>
                            <Button
                                variant="outlined"
                                onClick={() => { setActiveTab(1); }}
                                data-testid="go-to-accounts-btn"
                            >
                                Open Chart of Accounts
                            </Button>
                        </Paper>
                    ) : loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                            <CircularProgress />
                        </Box>
                    ) : accountLedger ? (
                        <Box>
                            {/* Account Header */}
                            <Paper sx={{ p: 2, mb: 2, bgcolor: '#f5f5f5' }}>
                                <Grid container spacing={2} alignItems="center">
                                    <Grid item xs={12} md={6}>
                                        <Typography variant="h6" data-testid="ledger-account-name">
                                            {accountLedger.account?.name}
                                        </Typography>
                                        <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                                            <Chip label={accountLedger.account?.code} size="small" variant="outlined" sx={{ fontFamily: 'monospace' }} />
                                            <Chip label={accountLedger.account?.type} size="small" color={
                                                accountLedger.account?.type === 'ASSET' ? 'primary' :
                                                accountLedger.account?.type === 'LIABILITY' ? 'error' :
                                                accountLedger.account?.type === 'INCOME' ? 'success' :
                                                accountLedger.account?.type === 'EXPENSE' ? 'warning' : 'default'
                                            } />
                                            {accountLedger.account?.subType && (
                                                <Chip label={accountLedger.account.subType} size="small" variant="outlined" />
                                            )}
                                            {accountLedger.account?.partyType && (
                                                <Chip label={`Party: ${accountLedger.account.partyType}`} size="small" color="info" variant="outlined" />
                                            )}
                                        </Box>
                                    </Grid>
                                    <Grid item xs={12} md={3}>
                                        <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: '#e3f2fd' }}>
                                            <Typography variant="caption" color="text.secondary">Transactions</Typography>
                                            <Typography variant="h5" sx={{ fontWeight: 700 }} data-testid="ledger-entry-count">
                                                {accountLedger.entries?.length || 0}
                                            </Typography>
                                        </Paper>
                                    </Grid>
                                    <Grid item xs={12} md={3}>
                                        <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: accountLedger.closingBalance >= 0 ? '#e8f5e9' : '#ffebee' }}>
                                            <Typography variant="caption" color="text.secondary">Closing Balance</Typography>
                                            <Typography variant="h5" sx={{ fontWeight: 700, fontFamily: 'monospace', color: accountLedger.closingBalance >= 0 ? 'success.dark' : 'error.dark' }} data-testid="ledger-closing-balance">
                                                {formatCurrency(Math.abs(accountLedger.closingBalance))}
                                                {accountLedger.closingBalance >= 0 ? ' Dr' : ' Cr'}
                                            </Typography>
                                        </Paper>
                                    </Grid>
                                </Grid>
                            </Paper>

                            {/* Ledger Entries Table */}
                            <TableContainer component={Paper} sx={{ maxHeight: 500 }}>
                                <Table size="small" stickyHeader>
                                    <TableHead>
                                        <TableRow sx={{ '& th': { bgcolor: '#1a237e', color: '#fff', fontWeight: 700 } }}>
                                            <TableCell>Date</TableCell>
                                            <TableCell>Voucher No.</TableCell>
                                            <TableCell>Type</TableCell>
                                            <TableCell>Particulars</TableCell>
                                            <TableCell align="right">Debit (Dr)</TableCell>
                                            <TableCell align="right">Credit (Cr)</TableCell>
                                            <TableCell align="right" sx={{ borderLeft: '2px solid rgba(255,255,255,0.3)' }}>Running Balance</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {accountLedger.entries?.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                                                    No transactions found for this account in the selected date range.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            accountLedger.entries?.map((entry, idx) => (
                                                <TableRow
                                                    key={entry.id}
                                                    hover
                                                    data-testid={`ledger-entry-${idx}`}
                                                    sx={{
                                                        bgcolor: idx % 2 === 0 ? '#fafafa' : '#fff',
                                                        '&:hover': { bgcolor: '#e3f2fd' }
                                                    }}
                                                >
                                                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                                                        {entry.transactionDate
                                                            ? new Date(entry.transactionDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
                                                            : '-'}
                                                    </TableCell>
                                                    <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                                                        {entry.batchNumber || '-'}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Chip
                                                            label={entry.referenceType || '-'}
                                                            size="small"
                                                            variant="outlined"
                                                            color={
                                                                entry.referenceType === 'INVOICE' ? 'primary' :
                                                                entry.referenceType === 'PAYMENT' ? 'success' :
                                                                entry.referenceType === 'PAYMENT_TOGGLE' ? 'warning' :
                                                                entry.referenceType === 'CASH_RECEIPT' ? 'info' : 'default'
                                                            }
                                                            sx={{ fontSize: '0.7rem', height: 22 }}
                                                        />
                                                    </TableCell>
                                                    <TableCell sx={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                        {entry.narration || entry.description || '-'}
                                                    </TableCell>
                                                    <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: Number(entry.debit) > 0 ? 700 : 400, color: Number(entry.debit) > 0 ? 'primary.main' : 'text.disabled' }}>
                                                        {Number(entry.debit) > 0 ? formatCurrency(entry.debit) : '-'}
                                                    </TableCell>
                                                    <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: Number(entry.credit) > 0 ? 700 : 400, color: Number(entry.credit) > 0 ? 'error.main' : 'text.disabled' }}>
                                                        {Number(entry.credit) > 0 ? formatCurrency(entry.credit) : '-'}
                                                    </TableCell>
                                                    <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 700, borderLeft: '2px solid #e0e0e0', color: entry.runningBalance >= 0 ? '#1b5e20' : '#b71c1c' }}>
                                                        {formatCurrency(Math.abs(entry.runningBalance))}
                                                        <Typography component="span" variant="caption" sx={{ ml: 0.5, opacity: 0.7 }}>
                                                            {entry.runningBalance >= 0 ? 'Dr' : 'Cr'}
                                                        </Typography>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}

                                        {/* Closing Balance Row */}
                                        {accountLedger.entries?.length > 0 && (
                                            <TableRow sx={{ bgcolor: '#1a237e' }}>
                                                <TableCell colSpan={4} sx={{ fontWeight: 700, color: '#fff' }}>
                                                    Closing Balance
                                                </TableCell>
                                                <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#fff' }}>
                                                    {accountLedger.closingBalance >= 0 ? formatCurrency(accountLedger.closingBalance) : '-'}
                                                </TableCell>
                                                <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#fff' }}>
                                                    {accountLedger.closingBalance < 0 ? formatCurrency(Math.abs(accountLedger.closingBalance)) : '-'}
                                                </TableCell>
                                                <TableCell align="right" sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#fff', borderLeft: '2px solid rgba(255,255,255,0.3)' }}>
                                                    {formatCurrency(Math.abs(accountLedger.closingBalance))} {accountLedger.closingBalance >= 0 ? 'Dr' : 'Cr'}
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </TableBody>
                                </Table>
                            </TableContainer>

                            {/* Navigation hint */}
                            <Box sx={{ mt: 2, display: 'flex', gap: 1 }}>
                                <Button
                                    variant="outlined"
                                    size="small"
                                    onClick={() => setActiveTab(1)}
                                    data-testid="back-to-accounts-btn"
                                >
                                    Back to Chart of Accounts
                                </Button>
                            </Box>
                        </Box>
                    ) : null}
                </Box>
            )}
        </Box>
    );
};

export default LedgerModule;
