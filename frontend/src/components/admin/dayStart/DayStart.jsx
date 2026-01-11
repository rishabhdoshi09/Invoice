import React, { useState, useEffect } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Grid,
    TextField,
    Button,
    Alert,
    CircularProgress,
    Paper
} from '@mui/material';
import { AccountBalance, Refresh } from '@mui/icons-material';
import { useAuth } from '../../../context/AuthContext';
import * as dashboardService from '../../../services/dashboard';
import moment from 'moment';

export const DayStart = () => {
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const [todaySummary, setTodaySummary] = useState(null);
    
    // Opening balance state
    const [openingBalanceInput, setOpeningBalanceInput] = useState('');
    const [savingOpeningBalance, setSavingOpeningBalance] = useState(false);

    const fetchData = async () => {
        setLoading(true);
        setError('');
        
        try {
            const summary = await dashboardService.getTodaySummary();
            setTodaySummary(summary);
        } catch (err) {
            setError(err.toString());
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const handleSetOpeningBalance = async () => {
        const amount = parseFloat(openingBalanceInput);
        if (isNaN(amount) || amount < 0) {
            setError('Please enter a valid amount (0 or greater)');
            return;
        }
        
        setSavingOpeningBalance(true);
        setError('');
        setSuccess('');
        
        try {
            await dashboardService.setOpeningBalance(amount);
            setOpeningBalanceInput('');
            setSuccess('Opening balance set successfully!');
            fetchData();
        } catch (err) {
            setError('Failed to set opening balance: ' + err);
        } finally {
            setSavingOpeningBalance(false);
        }
    };

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
                <Typography variant="h4" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <AccountBalance color="primary" />
                    Day Start - Opening Balance
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
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}

            {success && (
                <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
                    {success}
                </Alert>
            )}

            {/* Date Display */}
            <Typography variant="h6" color="text.secondary" sx={{ mb: 3 }}>
                {moment().format('dddd, MMMM D, YYYY')}
            </Typography>

            {/* Opening Balance Section */}
            <Paper sx={{ p: 3, mb: 3, bgcolor: '#fff3e0' }}>
                <Typography variant="h5" gutterBottom sx={{ fontWeight: 'bold', color: '#e65100' }}>
                    💵 Opening Balance Entry
                </Typography>
                
                <Grid container spacing={3} alignItems="center">
                    <Grid item xs={12} md={4}>
                        <Box>
                            <Typography variant="body2" color="text.secondary">
                                Current Opening Balance:
                            </Typography>
                            <Typography variant="h3" sx={{ fontWeight: 'bold', color: '#e65100' }}>
                                ₹{todaySummary?.openingBalance?.toLocaleString('en-IN') || 0}
                            </Typography>
                            {todaySummary?.openingBalanceSetAt && (
                                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                                    Set by <strong>{todaySummary?.openingBalanceSetBy}</strong> at {moment(todaySummary?.openingBalanceSetAt).format('hh:mm A')}
                                </Typography>
                            )}
                        </Box>
                    </Grid>
                    
                    <Grid item xs={12} md={4}>
                        <Box>
                            <Typography variant="body2" color="text.secondary">
                                Today's Sales So Far:
                            </Typography>
                            <Typography variant="h4" sx={{ fontWeight: 'bold', color: '#1565c0' }}>
                                ₹{todaySummary?.totalSales?.toLocaleString('en-IN') || 0}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {todaySummary?.totalOrders || 0} orders
                            </Typography>
                        </Box>
                    </Grid>
                    
                    <Grid item xs={12} md={4}>
                        <Box>
                            <Typography variant="body2" color="text.secondary">
                                Expected Cash in Drawer:
                            </Typography>
                            <Typography variant="h4" sx={{ fontWeight: 'bold', color: '#2e7d32' }}>
                                ₹{((todaySummary?.openingBalance || 0) + (todaySummary?.totalSales || 0)).toLocaleString('en-IN')}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Opening + Sales
                            </Typography>
                        </Box>
                    </Grid>
                </Grid>
            </Paper>

            {/* Set Opening Balance Card */}
            <Card sx={{ maxWidth: 500 }}>
                <CardContent>
                    <Typography variant="h6" gutterBottom>
                        Set Today's Opening Balance
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Enter the cash amount in the drawer at the start of the day.
                    </Typography>
                    
                    <Box sx={{ display: 'flex', gap: 2, alignItems: 'flex-start' }}>
                        <TextField
                            label="Opening Balance Amount"
                            type="number"
                            value={openingBalanceInput}
                            onChange={(e) => setOpeningBalanceInput(e.target.value)}
                            placeholder="Enter amount"
                            InputProps={{ 
                                startAdornment: <Typography sx={{ mr: 1 }}>₹</Typography> 
                            }}
                            disabled={savingOpeningBalance}
                            fullWidth
                            inputProps={{ min: 0, step: 0.01 }}
                            data-testid="opening-balance-input"
                        />
                        <Button
                            variant="contained"
                            onClick={handleSetOpeningBalance}
                            disabled={savingOpeningBalance || !openingBalanceInput}
                            sx={{ minWidth: 100, height: 56 }}
                            data-testid="set-opening-balance-btn"
                        >
                            {savingOpeningBalance ? <CircularProgress size={24} /> : 'SET'}
                        </Button>
                    </Box>
                    
                    <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
                        This will be recorded with your username ({user?.username}) and timestamp.
                    </Typography>
                </CardContent>
            </Card>

            {/* Info Section */}
            <Box sx={{ mt: 3 }}>
                <Alert severity="info">
                    <Typography variant="body2">
                        <strong>Tip:</strong> Set the opening balance at the start of each day before creating any orders. 
                        This helps track expected cash in the drawer throughout the day.
                    </Typography>
                </Alert>
            </Box>
        </Box>
    );
};

export default DayStart;
