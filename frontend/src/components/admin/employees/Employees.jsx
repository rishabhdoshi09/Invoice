import React, { useState, useEffect, useCallback } from 'react';
import {
    Box, Button, Card, CardContent, Typography, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Paper, Chip, TextField, Dialog,
    DialogTitle, DialogContent, DialogActions, IconButton, Tooltip, Alert,
    InputAdornment, CircularProgress, Collapse, Tabs, Tab, Switch, FormControlLabel,
    Divider
} from '@mui/material';
import {
    Add, Delete, KeyboardArrowDown, KeyboardArrowUp, Search, Refresh,
    Edit, EventBusy, Payment, ChevronLeft, ChevronRight, AccountBalanceWallet
} from '@mui/icons-material';
import axios from 'axios';
import moment from 'moment';

const fmt = v => `₹${Math.abs(Number(v) || 0).toLocaleString('en-IN')}`;
const token = () => localStorage.getItem('token');
const headers = () => ({ Authorization: `Bearer ${token()}` });
const statusColor = (s) => s === 'paid' ? 'success' : s === 'partial' ? 'warning' : 'error';

export const Employees = () => {
    const [tab, setTab] = useState('employees');
    return (
        <Box sx={{ maxWidth: 1200, mx: 'auto', px: 2, py: 3 }}>
            <Box sx={{ mb: 2 }}>
                <Typography variant="h5" fontWeight={700}>Employees & Salary</Typography>
                <Typography variant="body2" color="text.secondary">
                    Manage employees, mark leaves, record advances, and track salary paid / due each month
                </Typography>
            </Box>
            <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 2 }}>
                <Tab value="employees" label="Employees" />
                <Tab value="salary" label="Salary" />
            </Tabs>
            {tab === 'employees' ? <EmployeesTab /> : <SalaryTab />}
        </Box>
    );
};

// ── Employees Tab ─────────────────────────────────────────────────────────────
const EmployeesTab = () => {
    const [employees, setEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const [includeInactive, setIncludeInactive] = useState(false);
    const [search, setSearch] = useState('');
    const [addOpen, setAddOpen] = useState(false);
    const [editEmployee, setEditEmployee] = useState(null);
    const [leaveDialog, setLeaveDialog] = useState({ open: false, employee: null });
    const [expandedId, setExpandedId] = useState(null);
    const [leavesByEmployee, setLeavesByEmployee] = useState({});
    const [successMsg, setSuccessMsg] = useState('');

    const fetchEmployees = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/employees?includeInactive=${includeInactive}`, { headers: headers() });
            setEmployees(res.data?.data || []);
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, [includeInactive]);

    useEffect(() => { fetchEmployees(); }, [fetchEmployees]);

    const fetchLeaves = async (employeeId) => {
        try {
            const month = moment().month() + 1;
            const year = moment().year();
            const res = await axios.get(`/api/employees/${employeeId}/leaves?month=${month}&year=${year}`, { headers: headers() });
            setLeavesByEmployee(prev => ({ ...prev, [employeeId]: res.data?.data || [] }));
        } catch (err) { console.error(err); }
    };

    const toggleExpand = (emp) => {
        if (expandedId === emp.id) { setExpandedId(null); }
        else { setExpandedId(emp.id); fetchLeaves(emp.id); }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Remove this employee?')) return;
        try {
            await axios.delete(`/api/employees/${id}`, { headers: headers() });
            setSuccessMsg('Employee removed.'); fetchEmployees();
        } catch (err) { alert(err?.response?.data?.message || 'Failed.'); }
    };

    const handleDeleteLeave = async (empId, leaveId) => {
        if (!window.confirm('Remove this leave record?')) return;
        try {
            await axios.delete(`/api/employees/${empId}/leaves/${leaveId}`, { headers: headers() });
            fetchLeaves(empId);
        } catch (err) { alert(err?.response?.data?.message || 'Failed.'); }
    };

    const filtered = employees.filter(e => e.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 1 }}>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <TextField size="small" placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)}
                        InputProps={{ startAdornment: <InputAdornment position="start"><Search fontSize="small" /></InputAdornment> }}
                        sx={{ width: 220 }} />
                    <FormControlLabel
                        control={<Switch size="small" checked={includeInactive} onChange={e => setIncludeInactive(e.target.checked)} />}
                        label="Show inactive" />
                    <IconButton size="small" onClick={fetchEmployees}><Refresh fontSize="small" /></IconButton>
                </Box>
                <Button variant="contained" startIcon={<Add />} onClick={() => setAddOpen(true)}>Add Employee</Button>
            </Box>

            {successMsg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMsg('')}>{successMsg}</Alert>}

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
            ) : filtered.length === 0 ? (
                <Alert severity="info">No employees found.</Alert>
            ) : (
                <TableContainer component={Paper}>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ '& th': { bgcolor: '#f5f5f5', fontWeight: 700 } }}>
                                <TableCell width={32} />
                                <TableCell>Name</TableCell>
                                <TableCell>Mobile</TableCell>
                                <TableCell align="right">Monthly Salary</TableCell>
                                <TableCell>Joined</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell align="center">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {filtered.map(emp => {
                                const isExpanded = expandedId === emp.id;
                                const leaves = leavesByEmployee[emp.id] || [];
                                return (
                                    <React.Fragment key={emp.id}>
                                        <TableRow hover sx={{ bgcolor: !emp.isActive ? '#f5f5f5' : 'inherit' }}>
                                            <TableCell sx={{ p: 0 }}>
                                                <IconButton size="small" onClick={() => toggleExpand(emp)}>
                                                    {isExpanded ? <KeyboardArrowUp fontSize="small" /> : <KeyboardArrowDown fontSize="small" />}
                                                </IconButton>
                                            </TableCell>
                                            <TableCell><Typography fontWeight={600}>{emp.name}</Typography></TableCell>
                                            <TableCell>{emp.mobile || '—'}</TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 600 }}>{fmt(emp.monthlySalary)}</TableCell>
                                            <TableCell>{emp.joinDate || '—'}</TableCell>
                                            <TableCell>
                                                <Chip size="small" label={emp.isActive ? 'Active' : 'Inactive'} color={emp.isActive ? 'success' : 'default'} />
                                            </TableCell>
                                            <TableCell align="center">
                                                <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                                    <Tooltip title="Mark leave">
                                                        <IconButton size="small" color="warning" onClick={() => setLeaveDialog({ open: true, employee: emp })}>
                                                            <EventBusy fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="Edit">
                                                        <IconButton size="small" onClick={() => setEditEmployee(emp)}>
                                                            <Edit fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="Remove">
                                                        <IconButton size="small" color="error" onClick={() => handleDelete(emp.id)}>
                                                            <Delete fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                </Box>
                                            </TableCell>
                                        </TableRow>
                                        <TableRow>
                                            <TableCell colSpan={7} sx={{ p: 0, border: 0 }}>
                                                <Collapse in={isExpanded} unmountOnExit>
                                                    <Box sx={{ bgcolor: '#fafafa', px: 4, py: 1.5 }}>
                                                        <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ mb: 1, display: 'block' }}>
                                                            LEAVES THIS MONTH ({moment().format('MMMM YYYY')}) — Sundays are always paid
                                                        </Typography>
                                                        {leaves.length === 0 ? (
                                                            <Typography variant="body2" color="text.secondary">No leaves marked this month.</Typography>
                                                        ) : (
                                                            <Table size="small">
                                                                <TableHead>
                                                                    <TableRow>
                                                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Date</TableCell>
                                                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Reason</TableCell>
                                                                        <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Recorded By</TableCell>
                                                                        <TableCell width={40} />
                                                                    </TableRow>
                                                                </TableHead>
                                                                <TableBody>
                                                                    {leaves.map(l => (
                                                                        <TableRow key={l.id}>
                                                                            <TableCell sx={{ fontSize: '0.8rem' }}>{l.leaveDate}</TableCell>
                                                                            <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{l.reason || '—'}</TableCell>
                                                                            <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{l.recordedBy || '—'}</TableCell>
                                                                            <TableCell>
                                                                                <Tooltip title="Remove leave">
                                                                                    <IconButton size="small" color="error" onClick={() => handleDeleteLeave(emp.id, l.id)}>
                                                                                        <Delete sx={{ fontSize: 14 }} />
                                                                                    </IconButton>
                                                                                </Tooltip>
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    ))}
                                                                </TableBody>
                                                            </Table>
                                                        )}
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

            <AddEditEmployeeDialog
                open={addOpen || !!editEmployee} employee={editEmployee}
                onClose={() => { setAddOpen(false); setEditEmployee(null); }}
                onSaved={() => {
                    setAddOpen(false); setEditEmployee(null); fetchEmployees();
                    setSuccessMsg(editEmployee ? 'Employee updated.' : 'Employee added.');
                }}
            />
            <MarkLeaveDialog
                open={leaveDialog.open} employee={leaveDialog.employee}
                onClose={() => setLeaveDialog({ open: false, employee: null })}
                onSaved={() => {
                    const emp = leaveDialog.employee;
                    setLeaveDialog({ open: false, employee: null });
                    setSuccessMsg('Leave marked.');
                    if (emp) { setExpandedId(emp.id); fetchLeaves(emp.id); }
                }}
            />
        </Box>
    );
};

const AddEditEmployeeDialog = ({ open, employee, onClose, onSaved }) => {
    const emptyForm = { name: '', mobile: '', monthlySalary: '', joinDate: moment().format('DD-MM-YYYY'), notes: '' };
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) {
            setError('');
            setForm(employee ? {
                name: employee.name || '', mobile: employee.mobile || '',
                monthlySalary: employee.monthlySalary || '',
                joinDate: employee.joinDate || moment().format('DD-MM-YYYY'),
                notes: employee.notes || ''
            } : emptyForm);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, employee]);

    const handleSave = async () => {
        if (!form.name.trim() || !form.monthlySalary || Number(form.monthlySalary) <= 0) {
            setError('Name and a positive monthly salary are required.'); return;
        }
        setSaving(true); setError('');
        try {
            if (employee) await axios.put(`/api/employees/${employee.id}`, form, { headers: headers() });
            else await axios.post('/api/employees', form, { headers: headers() });
            onSaved();
        } catch (err) { setError(err?.response?.data?.message || 'Failed to save.'); }
        finally { setSaving(false); }
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
            <DialogTitle fontWeight={700}>{employee ? 'Edit Employee' : 'Add Employee'}</DialogTitle>
            <DialogContent>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 1 }}>
                    <TextField label="Name *" size="small" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                    <TextField label="Mobile" size="small" value={form.mobile} onChange={e => setForm(f => ({ ...f, mobile: e.target.value }))} />
                    <TextField label="Monthly Salary (₹) *" size="small" type="number" value={form.monthlySalary} onChange={e => setForm(f => ({ ...f, monthlySalary: e.target.value }))} />
                    <TextField label="Join Date" size="small" value={form.joinDate} onChange={e => setForm(f => ({ ...f, joinDate: e.target.value }))} helperText="Format: DD-MM-YYYY" />
                    <TextField label="Notes" size="small" multiline rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave} variant="contained" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </DialogActions>
        </Dialog>
    );
};

const MarkLeaveDialog = ({ open, employee, onClose, onSaved }) => {
    const [leaveDate, setLeaveDate] = useState(moment().format('DD-MM-YYYY'));
    const [reason, setReason] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => { if (open) { setLeaveDate(moment().format('DD-MM-YYYY')); setReason(''); setError(''); } }, [open]);

    const handleSave = async () => {
        if (!leaveDate) { setError('Pick a date.'); return; }
        setSaving(true); setError('');
        try {
            await axios.post(`/api/employees/${employee.id}/leaves`, { leaveDate, reason }, { headers: headers() });
            onSaved();
        } catch (err) { setError(err?.response?.data?.message || 'Failed.'); }
        finally { setSaving(false); }
    };

    if (!employee) return null;
    const isSunday = moment(leaveDate, ['DD-MM-YYYY', 'YYYY-MM-DD']).day() === 0;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle fontWeight={700}>Mark Leave — {employee.name}</DialogTitle>
            <DialogContent>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                {isSunday && <Alert severity="info" sx={{ mb: 2 }}>Sunday — Sundays are always paid; marking it won't cut salary.</Alert>}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField label="Leave Date *" size="small" value={leaveDate}
                        onChange={e => setLeaveDate(e.target.value)} helperText="Format: DD-MM-YYYY" autoFocus />
                    <TextField label="Reason" size="small" value={reason} onChange={e => setReason(e.target.value)} />
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave} variant="contained" color="warning" disabled={saving}>{saving ? 'Saving…' : 'Mark Leave'}</Button>
            </DialogActions>
        </Dialog>
    );
};

// ── Salary Tab ────────────────────────────────────────────────────────────────
const SalaryTab = () => {
    const [cursor, setCursor] = useState(moment());
    const [rows, setRows] = useState([]);
    const [summary, setSummary] = useState({});
    const [loading, setLoading] = useState(true);
    const [payDialog, setPayDialog] = useState({ open: false, row: null });
    const [advanceDialog, setAdvanceDialog] = useState({ open: false, row: null });
    const [leaveDialog, setLeaveDialog] = useState({ open: false, employee: null });
    const [expandedId, setExpandedId] = useState(null);
    const [detailById, setDetailById] = useState({});
    const [successMsg, setSuccessMsg] = useState('');

    const month = cursor.month() + 1;
    const year = cursor.year();

    const fetchSalary = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get(`/api/salary?month=${month}&year=${year}`, { headers: headers() });
            setRows(res.data?.data?.rows || []);
            setSummary(res.data?.data?.summary || {});
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    }, [month, year]);

    useEffect(() => { fetchSalary(); }, [fetchSalary]);

    const fetchDetail = async (salaryId) => {
        try {
            const res = await axios.get(`/api/salary/${salaryId}`, { headers: headers() });
            setDetailById(prev => ({ ...prev, [salaryId]: res.data?.data || {} }));
        } catch (err) { console.error(err); }
    };

    const toggleExpand = (row) => {
        if (expandedId === row.id) { setExpandedId(null); }
        else { setExpandedId(row.id); fetchDetail(row.id); }
    };

    const handleReversePayment = async (row, paymentId) => {
        if (!window.confirm('Reverse this salary payment?')) return;
        try {
            await axios.delete(`/api/salary/payments/${paymentId}`, { headers: headers() });
            fetchSalary(); fetchDetail(row.id);
        } catch (err) { alert(err?.response?.data?.message || 'Failed.'); }
    };

    const handleDeleteAdvance = async (row, advanceId) => {
        if (!window.confirm('Remove this advance entry?')) return;
        try {
            await axios.delete(`/api/employees/${row.employeeId}/advances/${advanceId}`, { headers: headers() });
            fetchSalary(); fetchDetail(row.id);
        } catch (err) { alert(err?.response?.data?.message || 'Failed.'); }
    };

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <IconButton size="small" onClick={() => setCursor(c => c.clone().subtract(1, 'month'))}><ChevronLeft /></IconButton>
                    <Typography variant="h6" fontWeight={700} sx={{ minWidth: 160, textAlign: 'center' }}>{cursor.format('MMMM YYYY')}</Typography>
                    <IconButton size="small" onClick={() => setCursor(c => c.clone().add(1, 'month'))}><ChevronRight /></IconButton>
                </Box>
                <IconButton size="small" onClick={fetchSalary}><Refresh fontSize="small" /></IconButton>
            </Box>

            {successMsg && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccessMsg('')}>{successMsg}</Alert>}

            {/* Summary cards */}
            <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, mb: 3 }}>
                <Card sx={{ borderLeft: '4px solid #6a1b9a', bgcolor: '#f3e5f5' }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Typography variant="caption" color="text.secondary">Total Net Salary</Typography>
                        <Typography variant="h6" fontWeight={700} color="#6a1b9a">{fmt(summary.totalNetSalary)}</Typography>
                    </CardContent>
                </Card>
                <Card sx={{ borderLeft: '4px solid #1565c0', bgcolor: '#e3f2fd' }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Typography variant="caption" color="text.secondary">Total Advance Given</Typography>
                        <Typography variant="h6" fontWeight={700} color="#1565c0">{fmt(summary.totalAdvance)}</Typography>
                    </CardContent>
                </Card>
                <Card sx={{ borderLeft: '4px solid #2e7d32', bgcolor: '#e8f5e9' }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Typography variant="caption" color="text.secondary">Total Cash Paid</Typography>
                        <Typography variant="h6" fontWeight={700} color="#2e7d32">{fmt(summary.totalPaid)}</Typography>
                    </CardContent>
                </Card>
                <Card sx={{ borderLeft: '4px solid #c62828', bgcolor: '#ffebee' }}>
                    <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                        <Typography variant="caption" color="text.secondary">Total Due</Typography>
                        <Typography variant="h6" fontWeight={700} color="#c62828">{fmt(summary.totalDue)}</Typography>
                    </CardContent>
                </Card>
            </Box>

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}><CircularProgress /></Box>
            ) : rows.length === 0 ? (
                <Alert severity="info">No active employees.</Alert>
            ) : (
                <TableContainer component={Paper}>
                    <Table size="small">
                        <TableHead>
                            <TableRow sx={{ '& th': { bgcolor: '#f5f5f5', fontWeight: 700 } }}>
                                <TableCell width={32} />
                                <TableCell>Employee</TableCell>
                                <TableCell align="right">Monthly Salary</TableCell>
                                <TableCell align="center">Days</TableCell>
                                <TableCell align="center">Day Offs</TableCell>
                                <TableCell align="right">Net Salary</TableCell>
                                <TableCell align="right">Advance</TableCell>
                                <TableCell align="right">Cash Paid</TableCell>
                                <TableCell align="right">Due</TableCell>
                                <TableCell>Status</TableCell>
                                <TableCell align="center">Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {rows.map(row => {
                                const isExpanded = expandedId === row.id;
                                const detail = detailById[row.id] || {};
                                const payments = detail.payments || [];
                                const advances = detail.advances || [];
                                return (
                                    <React.Fragment key={row.id}>
                                        <TableRow hover>
                                            <TableCell sx={{ p: 0 }}>
                                                <IconButton size="small" onClick={() => toggleExpand(row)}>
                                                    {isExpanded ? <KeyboardArrowUp fontSize="small" /> : <KeyboardArrowDown fontSize="small" />}
                                                </IconButton>
                                            </TableCell>
                                            <TableCell><Typography fontWeight={600}>{row.employeeName}</Typography></TableCell>
                                            <TableCell align="right">
                                                <Typography variant="body2">{fmt(row.monthlySalary)}</Typography>
                                                {row.dailyRate > 0 && (
                                                    <Typography variant="caption" color="text.secondary">
                                                        ₹{row.dailyRate.toFixed(0)}/day
                                                    </Typography>
                                                )}
                                            </TableCell>
                                            <TableCell align="center">
                                                {row.preJoinDays > 0 ? (
                                                    <Tooltip title={`Joined ${row.joinDate} — payable for ${row.daysInMonth - row.preJoinDays} of ${row.daysInMonth} days`}>
                                                        <Box>
                                                            <Typography variant="body2" fontWeight={600}>{row.daysInMonth - row.preJoinDays}</Typography>
                                                            <Typography variant="caption" color="text.secondary">of {row.daysInMonth}</Typography>
                                                        </Box>
                                                    </Tooltip>
                                                ) : row.daysInMonth}
                                            </TableCell>
                                            <TableCell align="center">
                                                {row.leaveDays > 0 ? (
                                                    <Tooltip title={`-${fmt(row.leaveDeduction)} deducted`}>
                                                        <Chip size="small" color="warning" label={`${row.leaveDays} day${row.leaveDays > 1 ? 's' : ''}`} />
                                                    </Tooltip>
                                                ) : <Typography variant="body2" color="text.secondary">0</Typography>}
                                            </TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 700 }}>{fmt(row.netSalary)}</TableCell>
                                            <TableCell align="right">
                                                {row.advanceDeduction > 0 ? (
                                                    <Typography fontWeight={600} color="#1565c0">{fmt(row.advanceDeduction)}</Typography>
                                                ) : <Typography variant="body2" color="text.secondary">₹0</Typography>}
                                            </TableCell>
                                            <TableCell align="right" sx={{ color: '#2e7d32' }}>{fmt(row.paidAmount)}</TableCell>
                                            <TableCell align="right">
                                                <Typography fontWeight={700} color={row.dueAmount > 0 ? 'error.main' : 'text.disabled'}>
                                                    {fmt(row.dueAmount)}
                                                </Typography>
                                            </TableCell>
                                            <TableCell>
                                                <Chip size="small" label={row.status.toUpperCase()} color={statusColor(row.status)} />
                                            </TableCell>
                                            <TableCell align="center">
                                                <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center', flexWrap: 'wrap' }}>
                                                    <Tooltip title="Record advance given">
                                                        <IconButton size="small" color="primary"
                                                            onClick={() => setAdvanceDialog({ open: true, row })}>
                                                            <AccountBalanceWallet fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    <Tooltip title="Mark day off">
                                                        <IconButton size="small" color="warning"
                                                            onClick={() => setLeaveDialog({ open: true, employee: { id: row.employeeId, name: row.employeeName } })}>
                                                            <EventBusy fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    {row.dueAmount > 0 && (
                                                        <Tooltip title="Pay salary">
                                                            <Button size="small" variant="outlined" color="success" startIcon={<Payment fontSize="small" />}
                                                                sx={{ textTransform: 'none', fontSize: '0.72rem' }}
                                                                onClick={() => setPayDialog({ open: true, row })}>
                                                                Pay
                                                            </Button>
                                                        </Tooltip>
                                                    )}
                                                </Box>
                                            </TableCell>
                                        </TableRow>

                                        {/* Expandable detail row */}
                                        <TableRow>
                                            <TableCell colSpan={11} sx={{ p: 0, border: 0 }}>
                                                <Collapse in={isExpanded} unmountOnExit>
                                                    <Box sx={{ bgcolor: '#fafafa', px: 4, py: 2, display: 'flex', gap: 4, flexWrap: 'wrap' }}>

                                                        {/* Salary Breakdown */}
                                                        <Box sx={{ minWidth: 220 }}>
                                                            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                                                                SALARY BREAKDOWN
                                                            </Typography>
                                                            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
                                                                    <Typography variant="body2" color="text.secondary">Monthly Salary</Typography>
                                                                    <Typography variant="body2" fontWeight={600}>{fmt(row.monthlySalary)}</Typography>
                                                                </Box>
                                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
                                                                    <Typography variant="body2" color="text.secondary">Days in Month</Typography>
                                                                    <Typography variant="body2">{row.daysInMonth} days</Typography>
                                                                </Box>
                                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
                                                                    <Typography variant="body2" color="text.secondary">Daily Rate</Typography>
                                                                    <Typography variant="body2">₹{(row.dailyRate || 0).toFixed(2)}/day</Typography>
                                                                </Box>
                                                                {row.preJoinDays > 0 && (
                                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
                                                                        <Typography variant="body2" color="text.secondary">Before joining ({row.joinDate})</Typography>
                                                                        <Typography variant="body2" color="warning.main">
                                                                            {row.preJoinDays} day{row.preJoinDays !== 1 ? 's' : ''} (−{fmt(row.preJoinDeduction || 0)})
                                                                        </Typography>
                                                                    </Box>
                                                                )}
                                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
                                                                    <Typography variant="body2" color="text.secondary">Day Offs (non-Sunday)</Typography>
                                                                    <Typography variant="body2" color={row.leaveDays > 0 ? 'warning.main' : 'text.secondary'}>
                                                                        {row.leaveDays} day{row.leaveDays !== 1 ? 's' : ''} (−{fmt(row.leaveDeduction || 0)})
                                                                    </Typography>
                                                                </Box>
                                                                <Divider sx={{ my: 0.5 }} />
                                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
                                                                    <Typography variant="body2" fontWeight={700}>Net Salary</Typography>
                                                                    <Typography variant="body2" fontWeight={700}>{fmt(row.netSalary)}</Typography>
                                                                </Box>
                                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
                                                                    <Typography variant="body2" color="#1565c0">Advance Deduction</Typography>
                                                                    <Typography variant="body2" color="#1565c0">−{fmt(row.advanceDeduction)}</Typography>
                                                                </Box>
                                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
                                                                    <Typography variant="body2" color="#2e7d32">Cash Paid</Typography>
                                                                    <Typography variant="body2" color="#2e7d32">−{fmt(row.paidAmount)}</Typography>
                                                                </Box>
                                                                <Divider sx={{ my: 0.5 }} />
                                                                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 3 }}>
                                                                    <Typography variant="body2" fontWeight={700} color={row.dueAmount > 0 ? 'error.main' : 'success.main'}>
                                                                        {row.dueAmount > 0 ? 'Due' : 'Fully Settled'}
                                                                    </Typography>
                                                                    <Typography variant="body2" fontWeight={700} color={row.dueAmount > 0 ? 'error.main' : 'success.main'}>
                                                                        {fmt(row.dueAmount)}
                                                                    </Typography>
                                                                </Box>
                                                            </Box>
                                                        </Box>

                                                        {/* Advances */}
                                                        <Box sx={{ flex: 1, minWidth: 220 }}>
                                                            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                                                                ADVANCES GIVEN THIS MONTH
                                                            </Typography>
                                                            {advances.length === 0 ? (
                                                                <Typography variant="body2" color="text.secondary">No advance recorded.</Typography>
                                                            ) : (
                                                                <Table size="small">
                                                                    <TableHead>
                                                                        <TableRow>
                                                                            <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Date</TableCell>
                                                                            <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Amount</TableCell>
                                                                            <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Notes</TableCell>
                                                                            <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>By</TableCell>
                                                                            <TableCell width={36} />
                                                                        </TableRow>
                                                                    </TableHead>
                                                                    <TableBody>
                                                                        {advances.map(a => (
                                                                            <TableRow key={a.id}>
                                                                                <TableCell sx={{ fontSize: '0.8rem' }}>{a.advanceDate || '—'}</TableCell>
                                                                                <TableCell align="right" sx={{ fontWeight: 700, color: '#1565c0', fontSize: '0.8rem' }}>{fmt(a.amount)}</TableCell>
                                                                                <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{a.notes || '—'}</TableCell>
                                                                                <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{a.recordedBy || '—'}</TableCell>
                                                                                <TableCell>
                                                                                    <Tooltip title="Remove advance">
                                                                                        <IconButton size="small" color="error" onClick={() => handleDeleteAdvance(row, a.id)}>
                                                                                            <Delete sx={{ fontSize: 14 }} />
                                                                                        </IconButton>
                                                                                    </Tooltip>
                                                                                </TableCell>
                                                                            </TableRow>
                                                                        ))}
                                                                    </TableBody>
                                                                </Table>
                                                            )}
                                                        </Box>

                                                        {/* Payment History */}
                                                        <Box sx={{ flex: 1, minWidth: 220 }}>
                                                            <Typography variant="caption" fontWeight={700} color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                                                                CASH PAYMENT HISTORY
                                                            </Typography>
                                                            {payments.length === 0 ? (
                                                                <Typography variant="body2" color="text.secondary">No payments recorded.</Typography>
                                                            ) : (
                                                                <Table size="small">
                                                                    <TableHead>
                                                                        <TableRow>
                                                                            <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Date</TableCell>
                                                                            <TableCell align="right" sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Amount</TableCell>
                                                                            <TableCell sx={{ fontWeight: 700, fontSize: '0.75rem' }}>Notes</TableCell>
                                                                            <TableCell width={36} />
                                                                        </TableRow>
                                                                    </TableHead>
                                                                    <TableBody>
                                                                        {payments.map(p => (
                                                                            <TableRow key={p.id}>
                                                                                <TableCell sx={{ fontSize: '0.8rem' }}>{p.paymentDate}</TableCell>
                                                                                <TableCell align="right" sx={{ fontWeight: 700, color: '#2e7d32', fontSize: '0.8rem' }}>{fmt(p.amount)}</TableCell>
                                                                                <TableCell sx={{ fontSize: '0.8rem', color: 'text.secondary' }}>{p.notes || '—'}</TableCell>
                                                                                <TableCell>
                                                                                    <Tooltip title="Reverse payment">
                                                                                        <IconButton size="small" color="error" onClick={() => handleReversePayment(row, p.id)}>
                                                                                            <Delete sx={{ fontSize: 14 }} />
                                                                                        </IconButton>
                                                                                    </Tooltip>
                                                                                </TableCell>
                                                                            </TableRow>
                                                                        ))}
                                                                    </TableBody>
                                                                </Table>
                                                            )}
                                                        </Box>
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

            <PaySalaryDialog
                open={payDialog.open} row={payDialog.row}
                onClose={() => setPayDialog({ open: false, row: null })}
                onSaved={() => {
                    const row = payDialog.row;
                    setPayDialog({ open: false, row: null });
                    setSuccessMsg('Payment recorded.');
                    fetchSalary();
                    if (row && expandedId === row.id) fetchDetail(row.id);
                }}
            />

            <RecordAdvanceDialog
                open={advanceDialog.open} row={advanceDialog.row} month={month} year={year}
                onClose={() => setAdvanceDialog({ open: false, row: null })}
                onSaved={() => {
                    const row = advanceDialog.row;
                    setAdvanceDialog({ open: false, row: null });
                    setSuccessMsg('Advance recorded.');
                    fetchSalary();
                    if (row && expandedId === row.id) fetchDetail(row.id);
                }}
            />

            <MarkLeaveDialog
                open={leaveDialog.open} employee={leaveDialog.employee}
                onClose={() => setLeaveDialog({ open: false, employee: null })}
                onSaved={() => {
                    setLeaveDialog({ open: false, employee: null });
                    setSuccessMsg('Day off marked.');
                    fetchSalary();
                }}
            />
        </Box>
    );
};

const RecordAdvanceDialog = ({ open, row, month, year, onClose, onSaved }) => {
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(moment().format('DD-MM-YYYY'));
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) { setAmount(''); setDate(moment().format('DD-MM-YYYY')); setNotes(''); setError(''); }
    }, [open]);

    const handleSave = async () => {
        if (!amount || Number(amount) <= 0) { setError('Enter a valid amount.'); return; }
        setSaving(true); setError('');
        try {
            await axios.post(`/api/employees/${row.employeeId}/advances`, {
                amount: Number(amount),
                advanceDate: date,
                month,
                year,
                notes
            }, { headers: headers() });
            onSaved();
        } catch (err) { setError(err?.response?.data?.message || 'Failed to record advance.'); }
        finally { setSaving(false); }
    };

    if (!row) return null;
    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle fontWeight={700}>Record Advance — {row.employeeName}</DialogTitle>
            <DialogContent>
                <Box sx={{ mb: 2, p: 1.5, bgcolor: '#e3f2fd', borderRadius: 1 }}>
                    <Typography variant="body2">
                        Net Salary: <strong>{fmt(row.netSalary)}</strong> &nbsp;|&nbsp;
                        Already advanced: <strong>{fmt(row.advanceDeduction)}</strong>
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                        Advance will be deducted automatically from this month's due amount.
                    </Typography>
                </Box>
                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField label="Amount (₹) *" size="small" type="number" value={amount}
                        onChange={e => setAmount(e.target.value)} autoFocus />
                    <TextField label="Date *" size="small" value={date}
                        onChange={e => setDate(e.target.value)} helperText="Format: DD-MM-YYYY" />
                    <TextField label="Notes" size="small" value={notes}
                        onChange={e => setNotes(e.target.value)} placeholder="e.g. Emergency advance" />
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave} variant="contained" color="primary" disabled={saving}>
                    {saving ? 'Saving…' : 'Record Advance'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

const PaySalaryDialog = ({ open, row, onClose, onSaved }) => {
    const [amount, setAmount] = useState('');
    const [date, setDate] = useState(moment().format('DD-MM-YYYY'));
    const [notes, setNotes] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (open) { setAmount(''); setDate(moment().format('DD-MM-YYYY')); setNotes(''); setError(''); }
    }, [open]);

    const handleSave = async () => {
        if (!amount || Number(amount) <= 0) { setError('Enter a valid amount.'); return; }
        setSaving(true); setError('');
        try {
            await axios.post(`/api/salary/${row.id}/pay`, { amount: Number(amount), paymentDate: date, notes }, { headers: headers() });
            onSaved();
        } catch (err) { setError(err?.response?.data?.message || 'Failed.'); }
        finally { setSaving(false); }
    };

    if (!row) return null;
    return (
        <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
            <DialogTitle fontWeight={700}>Pay Salary — {row.employeeName}</DialogTitle>
            <DialogContent>
                {/* Full salary breakdown so user can see exactly how due was arrived at */}
                <Box sx={{ mb: 2, p: 1.5, bgcolor: '#f5f5f5', borderRadius: 1, display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" color="text.secondary">Monthly Salary</Typography>
                        <Typography variant="body2">{fmt(row.monthlySalary)}</Typography>
                    </Box>
                    {row.preJoinDays > 0 && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2" color="text.secondary">Before joining ({row.joinDate}) — {row.preJoinDays} days</Typography>
                            <Typography variant="body2" color="warning.main">−{fmt(row.preJoinDeduction)}</Typography>
                        </Box>
                    )}
                    {row.leaveDays > 0 && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2" color="text.secondary">{row.leaveDays} day off deduction</Typography>
                            <Typography variant="body2" color="warning.main">−{fmt(row.leaveDeduction)}</Typography>
                        </Box>
                    )}
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" fontWeight={600}>Net Salary</Typography>
                        <Typography variant="body2" fontWeight={600}>{fmt(row.netSalary)}</Typography>
                    </Box>
                    {row.advanceDeduction > 0 && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2" color="#1565c0">Advance given</Typography>
                            <Typography variant="body2" color="#1565c0">−{fmt(row.advanceDeduction)}</Typography>
                        </Box>
                    )}
                    {row.paidAmount > 0 && (
                        <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                            <Typography variant="body2" color="#2e7d32">Already paid</Typography>
                            <Typography variant="body2" color="#2e7d32">−{fmt(row.paidAmount)}</Typography>
                        </Box>
                    )}
                    <Divider sx={{ my: 0.5 }} />
                    <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="body2" fontWeight={700} color="error.main">Due Now</Typography>
                        <Typography variant="body2" fontWeight={700} color="error.main">{fmt(row.dueAmount)}</Typography>
                    </Box>
                </Box>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <TextField label="Amount (₹) *" size="small" type="number" value={amount}
                        onChange={e => setAmount(e.target.value)} autoFocus
                        InputProps={{ endAdornment: <InputAdornment position="end">
                            <Button size="small" sx={{ textTransform: 'none' }} onClick={() => setAmount(String(row.dueAmount))}>Full</Button>
                        </InputAdornment> }} />
                    <TextField label="Date *" size="small" value={date}
                        onChange={e => setDate(e.target.value)} helperText="Format: DD-MM-YYYY" />
                    <TextField label="Notes" size="small" value={notes} onChange={e => setNotes(e.target.value)} />
                </Box>
            </DialogContent>
            <DialogActions>
                <Button onClick={onClose}>Cancel</Button>
                <Button onClick={handleSave} variant="contained" color="success" disabled={saving}>
                    {saving ? 'Saving…' : 'Record Payment'}
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export default Employees;
