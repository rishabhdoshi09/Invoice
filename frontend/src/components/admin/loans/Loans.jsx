import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Button, Card, CardContent, Typography, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Paper, Chip, TextField, Dialog,
    DialogTitle, DialogContent, DialogActions, IconButton, Tooltip, Alert,
    ToggleButtonGroup, ToggleButton, InputAdornment, CircularProgress, Divider,
    Collapse
} from '@mui/material';
import {
    Add, Delete, KeyboardArrowDown, KeyboardArrowUp, Search,
    CallMade, CallReceived, Refresh, AccountBalance
} from '@mui/icons-material';
import axios from 'axios';
import moment from 'moment';

const fmt = v => `₹${Math.abs(Number(v) || 0).toLocaleString('en-IN')}`;
const token = () => localStorage.getItem('token');
const headers = () => ({ Authorization: `Bearer ${token()}` });

export const Loans = () => {
    const [loans, setLoans] = useState([]);
    const [summary, setSummary] = useState({});
    const [loading, setLoading] = useState(true);
    const [typeFilter, setTypeFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('active');
    const [search, setSearch] = useState('');
    const [addOpen, setAddOpen] = useState(false);
    const [expandedId, setExpandedId] = useState(null);
    const [repayDialog, setRepayDialog] = useState({ open: false, loan: null });
    const [successMsg, setSuccessMsg] = useState('');

    const fetchLoans = useCallback(async () => {
        setLoading(true);
        try {
            const params = new URLSearchParams();
            if (typeFilter !== 'all') params.append('type', typeFilter);
            if (statusFilter !== 'all') params.append('status', statusFilter);
            if (search) params.append('search', search);
            const res = await axios.get(`/api/loans?${params}`, { headers: headers() });
            setLoans(res.data?.data?.rows || []);
            setSummary(res.data?.data?.summary || {});
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [typeFilter, statusFilter, search]);

    useEffect(() => { fetchLoans(); }, [fetchLoans]);

    const handleDelete = async (loanId) => {
        if (!window.confirm('Delete this loan record? This cannot be undone.')) return;
        try {
            await axios.delete(`/api/loans/${loanId}`, { headers: headers() });
            setSuccessMsg('Loan deleted.');
            fetchLoans();
        } catch (err) {
            alert(err?.response?.data?.message || 'Failed to delete.');
        }
    };

    const handleDeleteRepayment = async (loan, txnId) => {
        if (!window.confirm('Delete this repayment? Balance will be restored.')) return;
        try {
            await axios.delete(`/api/loans/${loan.id}/repayments/${txnId}`, { headers: headers() });
            setSuccessMsg('Repayment deleted.');
            fetchLoans();
        } catch (err) {
            alert(err?.response?.data?.message || 'Failed to delete repayment.');
        }
    };

    return (
        <Box sx={{ maxWidth: 1100, mx: 'auto', px: 2, py: 3 }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                <Box>
                    <Typography variant="h5" fontWeight={700}>Loans</Typography>
                    <Typography variant="body2" color="text.secondary">Track interest-free loans given and received</Typography>
                </Box>
                <Button variant="contained" startIcon={<Add />} onClick={() => setAddOpen(true)}>
                    Add Loan
                </Button>
            </Box>

            {successMsg && (
                <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMsg('')}>{successMsg}</Alert>
            )}

            {/* Summary Cards */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, mb: 3 }}>
                <Card sx={{ borderLeft: '4px solid #1565c0', bgcolor: '#e3f2fd' }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Typography variant="caption" color="text.secondary">Given (Principal)</Typography>
                        <Typography variant="h6" fontWeight={700} color="#1565c0">{fmt(summary.totalGiven)}</Typography>
                    </CardContent>
                </Card>
                <Card sx={{ borderLeft: '4px solid #c62828', bgcolor: '#ffebee' }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Typography variant="caption" color="text.secondary">Given (Outstanding)</Typography>
                        <Typography variant="h6" fontWeight={700} color="#c62828">{fmt(summary.totalGivenBalance)}</Typography>
                    </CardContent>
                </Card>
                <Card sx={{ borderLeft: '4px solid #2e7d32', bgcolor: '#e8f5e9' }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Typography variant="caption" color="text.secondary">Received (Principal)</Typography>
                        <Typography variant="h6" fontWeight={700} color="#2e7d32">{fmt(summary.totalReceived)}</Typography>
                    </CardContent>
                </Card>
                <Card sx={{ borderLeft: '4px solid #f57c00', bgcolor: '#fff3e0' }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Typography variant="caption" color="text.secondary">Received (Outstanding)</Typography>
                        <Typography variant="h6" fontWeight={700} color="#f57c00">{fmt(summary.totalReceivedBalance)}</Typography>
                    </CardContent>
                </Card>
            </Box>

            {/* Filters */}
            <Card sx={{ mb: 2 }}>
                <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 }, display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
                    <ToggleButtonGroup size="small" exclusive value={typeFilter} onChange={(_, v) => v && setTypeFilter(v)}>
                        <ToggleButton value="all">All</ToggleButton>
                        <ToggleButton value="given" sx={{ color: '#1565c0' }}>
                            <CallMade fontSize="small" sx={{ mr: 0.5 }} />Given
                        </ToggleButton>
                        <ToggleButton value="received" sx={{ color: '#2e7d32' }}>
                            <CallReceived fontSize="small" sx={{ mr: 0.5 }} />Received
                        </ToggleButton>
                    </ToggleButtonGroup>

                    <ToggleButtonGroup size="small" exclusive value={statusFilter} onChange={(_, v) => v && setStatusFilter(v)}>
                        <ToggleButton value="all">All</ToggleButton>
                        <ToggleButton value="active">Active</ToggleButton>
                        <ToggleButton value="settled">Settled</ToggleButton>
                    </ToggleButtonGroup>

                    <TextField
                        size="small" placeholder="Search party name…" value={search}
                        onChange={e => setSearch(e.target.value)}
                        InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
                        sx={{ width: 220 }}
                    />
                    <IconButton size="small" onClick={fetchLoans}><Refresh fontSize="small" /></IconButton>
                </CardContent>
            </Card>

            {/* Table */}
            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
            ) : loans.length === 0 ? (
                <Alert severity="info">No loans found. Click "Add Loan" to record one.</Alert>
            ) : (
                <TableContainer component={Paper}>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ '& th': { bgcolor: '#f5f5f5', fontWeight: 700 } }}>
                                <TableCell width={32} />
                                <TableCell>Loan No.</TableCell>
                                <TableCell>Type</TableCell>
                                <TableCell>Party</TableCell>
                                <TableCell>Date</TableCell>
                                <TableCell align="right">Principal</TableCell>
                                <TableCell align="right">Outstanding</TableCell>
                                <TableCell align="right">Repaid</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell align="center">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loans.map(loan => {
                                const repaid = Number(loan.principalAmount) - Number(loan.balanceAmount);
                                const isExpanded = expandedId === loan.id;
                                return (
                                    <React.Fragment key={loan.id}>
                                        <TableRow hover sx={{ bgcolor: loan.status === 'settled' ? '#f9fbe7' : 'inherit' }}>
                                            <TableCell sx={{ p: 0 }}>
                                                {(loan.transactions || []).length > 0 && (
                                                    <IconButton size="small" onClick={() => setExpandedId(isExpanded ? null : loan.id)}>
                                                        {isExpanded ? <KeyboardArrowUp fontSize="small" /> : <KeyboardArrowDown fontSize="small" />}
                                                    </IconButton>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" fontFamily="monospace" fontSize={12}>{loan.loanNumber}</Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip
                                                    size="small"
                                                    label={loan.type === 'given' ? 'Given' : 'Received'}
                                                    icon={loan.type === 'given' ? <CallMade fontSize="small" /> : <CallReceived fontSize="small" />}
                                                    sx={{
                                                        bgcolor: loan.type === 'given' ? '#e3f2fd' : '#e8f5e9',
                                                        color: loan.type === 'given' ? '#1565c0' : '#2e7d32',
                                                        fontWeight: 600
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell>
                                                <Typography variant="body2" fontWeight={600}>{loan.partyName}</Typography>
                                                {loan.partyMobile && <Typography variant="caption" color="text.secondary">{loan.partyMobile}</Typography>}
                                                {loan.notes && <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>{loan.notes}</Typography>}
                                            </TableCell>
                                            <TableCell>{loan.loanDate}</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 600 }}>{fmt(loan.principalAmount)}</TableCell>
                                            <TableCell align="right">
                                                <Typography fontWeight={700} color={Number(loan.balanceAmount) > 0 ? 'error.main' : 'text.disabled'}>
                                                    {fmt(loan.balanceAmount)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right" sx={{ color: '#2e7d32', fontWeight: 600 }}>{fmt(repaid)}</TableCell>
                                            <TableCell>
                                                <Chip
                                                    size="small"
                                                    label={loan.status === 'settled' ? 'Settled' : 'Active'}
                                                    color={loan.status === 'settled' ? 'success' : 'warning'}
                                                    variant={loan.status === 'settled' ? 'outlined' : 'filled'}
                                                />
                                            </TableCell>
                                            <TableCell align="center">
                                                <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                                    {loan.status === 'active' && (
                                                        <Tooltip title="Record repayment">
                                                            <Button size="small" variant="outlined" color="success"
                                                                sx={{ textTransform: 'none', minWidth: 'unset', px: 1, fontSize: '0.72rem' }}
                                                                onClick={() => setRepayDialog({ open: true, loan })}>
                                                                Repay
                                                            </Button>
                                                        </Tooltip>
                                                    )}
                                                    <Tooltip title="Delete loan">
                                                        <IconButton size="small" color="error" onClick={() => handleDelete(loan.id)}>
                                                            <Delete fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </Box>
                                            </TableCell>
                                        </TableRow>

                                        {/* Repayment history rows */}
                                        <TableRow>
                                            <TableCell colSpan={10} sx={{ p: 0, border: 0 }}>
                                                <Collapse in={isExpanded} unmountOnExit>
                                                    <Box sx={{ bgcolor: '#fafafa', px: 4, py: 1.5 }}>
                                                        <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                                                            REPAYMENT HISTORY
                                                        </Typography>
                                                        <Table size="small">
                                                            <TableHead>
                                                                <TableRow>
                                                                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Date</TableCell>
                                                                    <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Amount</TableCell>
                                                                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Notes</TableCell>
                                                                    <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Recorded By</TableCell>
                                                                    <TableCell width={40} />
                                                                </TableRow>
                                                            </TableHead>
                                                            <TableBody>
                                                                {(loan.transactions || []).map(txn => (
                                                                    <TableRow key={txn.id}>
                                                                        <TableCell sx={{ fontSize: '0.8rem' }}>{txn.transactionDate}</TableCell>
                                                                        <TableCell align="right" sx={{ fontWeight: 700, color: '#2e7d32', fontSize: '0.8rem' }}>{fmt(txn.amount)}</TableCell>
                                                                        <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{txn.notes || '—'}</TableCell>
                                                                        <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{txn.recordedBy || '—'}</TableCell>
                                                                        <TableCell>
                                                                            <Tooltip title="Delete repayment">
                                                                                <IconButton size="small" color="error"
                                                                                    onClick={() => handleDeleteRepayment(loan, txn.id)}>
                                                                                    <Delete sx={{ fontSize: 14 }} />
                                                                                </IconButton>
                                                                            </Tooltip>
                                                                        </TableCell>
                                                                    </TableRow>
                                                                ))}
                                                            </TableBody>
                                                        </Table>
                                                    </Box>
                                                </Collapse>
                                            </TableCell>
                                        </TableRow>
                                    </React.Fragment>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Add Loan Dialog */}
            <AddLoanDialog open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); fetchLoans(); setSuccessMsg('Loan added.'); }} />

            {/* Repay Dialog */}
            <RepayDialog
                open={repayDialog.open}
                loan={repayDialog.loan}
                onClose={() => setRepayDialog({ open: false, loan: null })}
                onSaved={() => { setRepayDialog({ open: false, loan: null }); fetchLoans(); setSuccessMsg('Repayment recorded.'); }}
            />
        </Box>
    );
};

const AddLoanDialog = ({ open, onClose, onSaved }) => {
    const [form, setForm] = useState({ type: 'given', partyName: '', partyMobile: '', principalAmount: '', loanDate: moment().format('DD-MM-YYYY'), notes: '' });
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleSave = async () => {
        if (!form.partyName || !form.principalAmount || !form.loanDate) {
            setError('Party name, amount and date are required.');
            return;
        }
        setSaving(true);
        setError('');
        try {
            await axios.post('/api/loans', form, { headers: headers() });
            setForm({ type: 'given', partyName: '', partyMobile: '', principalAmount: '', loanDate: moment().format('DD-MM-YYYY'), notes: '' });
            onSaved();
        } catch (err) {
            setError(err?.response?.data?.message || 'Failed to save.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle fontWeight={700}>Add Loan</DialogTitle>
            <DialogContent>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                    <ToggleButtonGroup size="small" exclusive value={form.type} onChange={(_, v) => v && setForm(f => ({ ...f, type: v }))}>
                        <ToggleButton value="given" sx={{ flex: 1 }}>
                            <CallMade fontSize="small" sx={{ mr: 1 }} /> I Gave (Lent Out)
                        </ToggleButton>
                        <ToggleButton value="received" sx={{ flex: 1 }}>
                            <CallReceived fontSize="small" sx={{ mr: 1 }} /> I Received (Borrowed)
                        </ToggleButton>
                    </ToggleButtonGroup>

                    <TextField label="Party Name *" size="small" value={form.partyName}
                        onChange={e => setForm(f => ({ ...f, partyName: e.target.value }))} />
                    <TextField label="Mobile" size="small" value={form.partyMobile}
                        onChange={e => setForm(f => ({ ...f, partyMobile: e.target.value }))} />
                    <TextField label="Amount (₹) *" size="small" type="number" value={form.principalAmount}
                        onChange={e => setForm(f => ({ ...f, principalAmount: e.target.value }))} />
                    <TextField label="Loan Date *" size="small" value={form.loanDate}
                        onChange={e => setForm(f => ({ ...f, loanDate: e.target.value }))}
                        helperText="Format: DD-MM-YYYY" />
                    <TextField label="Notes" size="small" multiline rows={2} value={form.notes}
                        onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave} variant="contained" disabled={saving}>
                    {saving ? 'Saving…' : 'Save Loan'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

const RepayDialog = ({ open, loan, onClose, onSaved }) => {
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(moment().format('DD-MM-YYYY'));
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => { if (open) { setAmount(''); setDate(moment().format('DD-MM-YYYY')); setNotes(''); setError(''); } }, [open]);

    const handleSave = async () => {
        if (!amount || Number(amount) <= 0) { setError('Enter a valid amount.'); return; }
        setSaving(true);
        setError('');
        try {
            await axios.post(`/api/loans/${loan.id}/repayments`, { amount: Number(amount), transactionDate: date, notes }, { headers: headers() });
            onSaved();
        } catch (err) {
            setError(err?.response?.data?.message || 'Failed to record.');
        } finally {
            setSaving(false);
        }
    };

    if (!loan) return null;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle fontWeight={700}>Record Repayment</DialogTitle>
            <DialogContent>
                <Box sx={{ mb: 2, p: 1.5, bgcolor: '#f5f5f5', borderRadius: 1 }}>
                    <Typography variant="body2"><strong>{loan.partyName}</strong> — {loan.type === 'given' ? 'Loan Given' : 'Loan Received'}</Typography>
                    <Typography variant="body2" color="error.main" fontWeight={700}>Outstanding: {fmt(loan.balanceAmount)}</Typography>
                </Box>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField label="Amount (₹) *" size="small" type="number" value={amount}
                        onChange={e => setAmount(e.target.value)} autoFocus />
                    <TextField label="Date *" size="small" value={date}
                        onChange={e => setDate(e.target.value)} helperText="Format: DD-MM-YYYY" />
                    <TextField label="Notes" size="small" value={notes}
                        onChange={e => setNotes(e.target.value)} />
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave} variant="contained" color="success" disabled={saving}>
                    {saving ? 'Saving…' : 'Record Repayment'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default Loans;
