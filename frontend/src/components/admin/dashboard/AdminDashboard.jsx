import React, { useState, useEffect } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Grid,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Chip,
    Button,
    TextField,
    Alert,
    CircularProgress,
    Tabs,
    Tab,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions
} from '@mui/material';
import {
    Refresh,
    Visibility,
    Lock,
    LockOpen
} from '@mui/icons-material';
import { useAuth } from '../../../context/AuthContext';
import * as dashboardService from '../../../services/dashboard';
import moment from 'moment';

const TabPanel = ({ children, value, index }) => (
    <div hidden={value !== index} style={{ paddingTop: 16 }}>
        {value === index && children}
    </div>
);

export const AdminDashboard = () => {
    const { user, isAdmin } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [tabValue, setTabValue] = useState(0);
    
    // Data states
    const [todaySummary, setTodaySummary] = useState(null);
    const [auditLogs, setAuditLogs] = useState({ count: 0, rows: [] });
    const [recentDeletions, setRecentDeletions] = useState([]);
    const [suspiciousActivity, setSuspiciousActivity] = useState({ alerts: [] });
    const [dashboardStats, setDashboardStats] = useState(null);
    const [summaries, setSummaries] = useState([]);
    
    // Filter states
    const [dateRange, setDateRange] = useState({
        startDate: moment().subtract(7, 'days').format('YYYY-MM-DD'),
        endDate: moment().format('YYYY-MM-DD')
    });
    
    // Dialog states
    const [detailDialog, setDetailDialog] = useState({ open: false, data: null });
    
    // Opening balance state
    const [openingBalanceInput, setOpeningBalanceInput] = useState('');
    const [savingOpeningBalance, setSavingOpeningBalance] = useState(false);

    const fetchData = async () => {
        if (!isAdmin) return;
        
        setLoading(true);
        setError('');
        
        try {
            const [summary, logs, deletions, suspicious, stats, range] = await Promise.all([
                dashboardService.getTodaySummary(),
                dashboardService.getAuditLogs({ limit: 50 }),
                dashboardService.getRecentDeletions(30),
                dashboardService.getSuspiciousActivity(),
                dashboardService.getDashboardStats(),
                dashboardService.getSummariesInRange(dateRange.startDate, dateRange.endDate)
            ]);
            
            setTodaySummary(summary);
            setAuditLogs(logs);
            setRecentDeletions(deletions);
            setSuspiciousActivity(suspicious);
            setDashboardStats(stats);
            setSummaries(range);
        } catch (err) {
            setError(err.toString());
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdmin]);

    const handleCloseDay = async (date) => {
        if (!window.confirm(`Are you sure you want to close ${date}? No more orders can be created for this day.`)) {
            return;
        }
        
        try {
            await dashboardService.closeDay(date);
            fetchData();
        } catch (err) {
            alert('Failed to close day: ' + err);
        }
    };

    const handleReopenDay = async (date) => {
        if (!window.confirm(`Are you sure you want to reopen ${date}?`)) {
            return;
        }
        
        try {
            await dashboardService.reopenDay(date);
            fetchData();
        } catch (err) {
            alert('Failed to reopen day: ' + err);
        }
    };

    const handleSetOpeningBalance = async () => {
        const amount = parseFloat(openingBalanceInput);
        if (isNaN(amount) || amount < 0) {
            alert('Please enter a valid amount');
            return;
        }
        
        setSavingOpeningBalance(true);
        try {
            await dashboardService.setOpeningBalance(amount);
            setOpeningBalanceInput('');
            fetchData();
            alert('✅ Opening balance set successfully!');
        } catch (err) {
            alert('Failed to set opening balance: ' + err);
        } finally {
            setSavingOpeningBalance(false);
        }
    };

    const getActionColor = (action) => {
        switch (action) {
            case 'CREATE': return 'success';
            case 'UPDATE': return 'info';
            case 'DELETE': return 'error';
            case 'LOGIN': return 'primary';
            case 'LOGIN_FAILED': return 'warning';
            default: return 'default';
        }
    };

    if (!isAdmin) {
        return (
            <Box sx={{ p: 3 }}>
                <Alert severity="warning">
                    Admin access required. You are logged in as: {user?.role}
                </Alert>
            </Box>
        );
    }

    if (loading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    return (
        <Box sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4">
                    🛡️ Admin Dashboard
                </Typography>
                <Button
                    startIcon={<Refresh />}
                    onClick={fetchData}
                    variant="outlined"
                >
                    Refresh
                </Button>
            </Box>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                </Alert>
            )}

            {/* Opening Balance Section */}
            <Paper sx={{ p: 2, mb: 3, bgcolor: '#fff3e0' }}>
                <Typography variant="h6" gutterBottom>
                    💵 Start of Day - Opening Balance
                </Typography>
                <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={4}>
                        <Box>
                            <Typography variant="body2" color="text.secondary">
                                Current Opening Balance:
                            </Typography>
                            <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#e65100' }}>
                                ₹{todaySummary?.openingBalance?.toLocaleString('en-IN') || 0}
                            </Typography>
                            {todaySummary?.openingBalanceSetAt && (
                                <Typography variant="caption" color="text.secondary">
                                    Set by {todaySummary?.openingBalanceSetBy} at {moment(todaySummary?.openingBalanceSetAt).format('hh:mm A')}
                                </Typography>
                            )}
                        </Box>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                        <Box>
                            <Typography variant="body2" color="text.secondary">
                                Expected Cash in Drawer:
                            </Typography>
                            <Typography variant="h5" sx={{ fontWeight: 'bold', color: '#2e7d32' }}>
                                ₹{((todaySummary?.openingBalance || 0) + (todaySummary?.totalSales || 0)).toLocaleString('en-IN')}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                                Opening (₹{todaySummary?.openingBalance || 0}) + Sales (₹{todaySummary?.totalSales || 0})
                            </Typography>
                        </Box>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                        <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                            <TextField
                                label="Set Opening Balance"
                                type="number"
                                size="small"
                                value={openingBalanceInput}
                                onChange={(e) => setOpeningBalanceInput(e.target.value)}
                                placeholder="Enter amount"
                                InputProps={{ startAdornment: '₹' }}
                                disabled={savingOpeningBalance}
                            />
                            <Button
                                variant="contained"
                                onClick={handleSetOpeningBalance}
                                disabled={savingOpeningBalance || !openingBalanceInput}
                                sx={{ minWidth: 80 }}
                            >
                                {savingOpeningBalance ? '...' : 'Set'}
                            </Button>
                        </Box>
                    </Grid>
                </Grid>
            </Paper>

            {/* Alerts Section */}
            {suspiciousActivity?.alerts?.length > 0 && (
                <Alert severity="warning" sx={{ mb: 3 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                        ⚠️ Security Alerts
                    </Typography>
                    {suspiciousActivity.alerts.map((alert, idx) => (
                        <Typography key={idx} variant="body2">
                            • {alert.message}
                        </Typography>
                    ))}
                </Alert>
            )}

            {/* Summary Cards */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ bgcolor: '#e3f2fd' }}>
                        <CardContent>
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <Typography color="text.secondary" gutterBottom>
                                    💰 Today's Sales
                                </Typography>
                                <Button 
                                    size="small" 
                                    onClick={async () => {
                                        const today = new Date().toISOString().split('T')[0];
                                        try {
                                            await dashboardService.recalculateSummary(today);
                                            fetchData();
                                            alert('✅ Today\'s totals recalculated!');
                                        } catch (err) {
                                            alert('Failed to recalculate: ' + err);
                                        }
                                    }}
                                    sx={{ minWidth: 'auto', p: 0.5, fontSize: '0.7rem' }}
                                >
                                    🔄 Recalc
                                </Button>
                            </Box>
                            <Typography variant="h4" sx={{ fontWeight: 'bold', color: '#1565c0' }}>
                                ₹{todaySummary?.totalSales?.toLocaleString('en-IN') || 0}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {todaySummary?.totalOrders || 0} orders
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card>
                        <CardContent>
                            <Typography color="text.secondary" gutterBottom>
                                Today's Activity
                            </Typography>
                            <Typography variant="h4">
                                {dashboardStats?.todayActivityCount || 0}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                actions logged
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card>
                        <CardContent>
                            <Typography color="text.secondary" gutterBottom>
                                Active Users Today
                            </Typography>
                            <Typography variant="h4">
                                {dashboardStats?.activeUsersToday || 0}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <Card sx={{ bgcolor: todaySummary?.isClosed ? '#ffebee' : '#e8f5e9' }}>
                        <CardContent>
                            <Typography color="text.secondary" gutterBottom>
                                Day Status
                            </Typography>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                {todaySummary?.isClosed ? (
                                    <>
                                        <Lock color="error" />
                                        <Typography variant="h6" color="error">Closed</Typography>
                                    </>
                                ) : (
                                    <>
                                        <LockOpen color="success" />
                                        <Typography variant="h6" color="success.main">Open</Typography>
                                    </>
                                )}
                            </Box>
                            <Button
                                size="small"
                                sx={{ mt: 1 }}
                                onClick={() => todaySummary?.isClosed 
                                    ? handleReopenDay(todaySummary.date)
                                    : handleCloseDay(todaySummary.date)
                                }
                            >
                                {todaySummary?.isClosed ? 'Reopen Day' : 'Close Day'}
                            </Button>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Tabs */}
            <Paper sx={{ mb: 2 }}>
                <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)}>
                    <Tab label="📜 Activity Log" />
                    <Tab label="🗑️ Deletions" />
                    <Tab label="📊 Daily Summaries" />
                </Tabs>
            </Paper>

            {/* Activity Log Tab */}
            <TabPanel value={tabValue} index={0}>
                <TableContainer component={Paper}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Time</TableCell>
                                <TableCell>User</TableCell>
                                <TableCell>Action</TableCell>
                                <TableCell>Entity</TableCell>
                                <TableCell>Description</TableCell>
                                <TableCell>IP</TableCell>
                                <TableCell>Details</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {auditLogs?.rows?.map((log) => (
                                <TableRow key={log.id}>
                                    <TableCell>
                                        {moment(log.createdAt).format('MMM D, HH:mm')}
                                    </TableCell>
                                    <TableCell>
                                        <Box>
                                            <Typography variant="body2">{log.userName}</Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {log.userRole}
                                            </Typography>
                                        </Box>
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={log.action}
                                            size="small"
                                            color={getActionColor(log.action)}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2">{log.entityType}</Typography>
                                        {log.entityName && (
                                            <Typography variant="caption" color="text.secondary">
                                                {log.entityName}
                                            </Typography>
                                        )}
                                    </TableCell>
                                    <TableCell sx={{ maxWidth: 200 }}>
                                        <Typography variant="body2" noWrap>
                                            {log.description}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="caption">{log.ipAddress}</Typography>
                                    </TableCell>
                                    <TableCell>
                                        <IconButton
                                            size="small"
                                            onClick={() => setDetailDialog({ open: true, data: log })}
                                        >
                                            <Visibility fontSize="small" />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </TabPanel>

            {/* Deletions Tab */}
            <TabPanel value={tabValue} index={1}>
                <Alert severity="info" sx={{ mb: 2 }}>
                    Recent deletions in the last 30 days. All deleted data is preserved in audit logs.
                </Alert>
                <TableContainer component={Paper}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Time</TableCell>
                                <TableCell>Deleted By</TableCell>
                                <TableCell>Entity Type</TableCell>
                                <TableCell>Entity Name</TableCell>
                                <TableCell>Details</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {recentDeletions?.map((log) => (
                                <TableRow key={log.id} sx={{ bgcolor: '#fff3e0' }}>
                                    <TableCell>
                                        {moment(log.createdAt).format('MMM D, HH:mm')}
                                    </TableCell>
                                    <TableCell>
                                        <Typography variant="body2">{log.userName}</Typography>
                                        <Typography variant="caption" color="text.secondary">
                                            {log.userRole}
                                        </Typography>
                                    </TableCell>
                                    <TableCell>
                                        <Chip label={log.entityType} size="small" color="error" />
                                    </TableCell>
                                    <TableCell>{log.entityName || log.entityId}</TableCell>
                                    <TableCell>
                                        <IconButton
                                            size="small"
                                            onClick={() => setDetailDialog({ open: true, data: log })}
                                        >
                                            <Visibility fontSize="small" />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))}
                            {recentDeletions?.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={5} align="center">
                                        <Typography color="text.secondary">
                                            No deletions in the last 30 days ✅
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </TabPanel>

            {/* Daily Summaries Tab */}
            <TabPanel value={tabValue} index={2}>
                <Box sx={{ mb: 2, display: 'flex', gap: 2 }}>
                    <TextField
                        label="Start Date"
                        type="date"
                        value={dateRange.startDate}
                        onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                        InputLabelProps={{ shrink: true }}
                        size="small"
                    />
                    <TextField
                        label="End Date"
                        type="date"
                        value={dateRange.endDate}
                        onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                        InputLabelProps={{ shrink: true }}
                        size="small"
                    />
                    <Button variant="contained" onClick={fetchData}>
                        Filter
                    </Button>
                </Box>
                <TableContainer component={Paper}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Date</TableCell>
                                <TableCell align="right">Total Sales</TableCell>
                                <TableCell align="right">Orders</TableCell>
                                <TableCell align="center">Status</TableCell>
                                <TableCell>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {summaries?.map((summary) => (
                                <TableRow key={summary.id}>
                                    <TableCell>
                                        {moment(summary.date).format('ddd, MMM D, YYYY')}
                                    </TableCell>
                                    <TableCell align="right">
                                        <Typography variant="body1" sx={{ fontWeight: 'bold' }}>
                                            ₹{summary.totalSales?.toLocaleString()}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">{summary.totalOrders}</TableCell>
                                    <TableCell align="center">
                                        {summary.isClosed ? (
                                            <Chip label="Closed" size="small" color="error" icon={<Lock />} />
                                        ) : (
                                            <Chip label="Open" size="small" color="success" icon={<LockOpen />} />
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        <Button
                                            size="small"
                                            onClick={() => summary.isClosed
                                                ? handleReopenDay(summary.date)
                                                : handleCloseDay(summary.date)
                                            }
                                        >
                                            {summary.isClosed ? 'Reopen' : 'Close'}
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </TabPanel>

            {/* Detail Dialog */}
            <Dialog
                open={detailDialog.open}
                onClose={() => setDetailDialog({ open: false, data: null })}
                maxWidth="md"
                fullWidth
            >
                <DialogTitle>
                    Audit Log Details
                </DialogTitle>
                <DialogContent>
                    {detailDialog.data && (
                        <Box>
                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <Typography variant="subtitle2" color="text.secondary">Action</Typography>
                                    <Chip label={detailDialog.data.action} color={getActionColor(detailDialog.data.action)} />
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="subtitle2" color="text.secondary">Time</Typography>
                                    <Typography>{moment(detailDialog.data.createdAt).format('YYYY-MM-DD HH:mm:ss')}</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="subtitle2" color="text.secondary">User</Typography>
                                    <Typography>{detailDialog.data.userName} ({detailDialog.data.userRole})</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="subtitle2" color="text.secondary">Entity</Typography>
                                    <Typography>{detailDialog.data.entityType}: {detailDialog.data.entityName || detailDialog.data.entityId}</Typography>
                                </Grid>
                                <Grid item xs={12}>
                                    <Typography variant="subtitle2" color="text.secondary">Description</Typography>
                                    <Typography>{detailDialog.data.description}</Typography>
                                </Grid>
                                {detailDialog.data.oldValues && (
                                    <Grid item xs={12}>
                                        <Typography variant="subtitle2" color="text.secondary">Old Values</Typography>
                                        <Paper sx={{ p: 1, bgcolor: '#ffebee' }}>
                                            <pre style={{ margin: 0, fontSize: '0.75rem', overflow: 'auto' }}>
                                                {JSON.stringify(detailDialog.data.oldValues, null, 2)}
                                            </pre>
                                        </Paper>
                                    </Grid>
                                )}
                                {detailDialog.data.newValues && (
                                    <Grid item xs={12}>
                                        <Typography variant="subtitle2" color="text.secondary">New Values</Typography>
                                        <Paper sx={{ p: 1, bgcolor: '#e8f5e9' }}>
                                            <pre style={{ margin: 0, fontSize: '0.75rem', overflow: 'auto' }}>
                                                {JSON.stringify(detailDialog.data.newValues, null, 2)}
                                            </pre>
                                        </Paper>
                                    </Grid>
                                )}
                                <Grid item xs={6}>
                                    <Typography variant="subtitle2" color="text.secondary">IP Address</Typography>
                                    <Typography>{detailDialog.data.ipAddress}</Typography>
                                </Grid>
                                <Grid item xs={6}>
                                    <Typography variant="subtitle2" color="text.secondary">User Agent</Typography>
                                    <Typography variant="body2" sx={{ wordBreak: 'break-all' }}>
                                        {detailDialog.data.userAgent}
                                    </Typography>
                                </Grid>
                            </Grid>
                        </Box>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDetailDialog({ open: false, data: null })}>
                        Close
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default AdminDashboard;
