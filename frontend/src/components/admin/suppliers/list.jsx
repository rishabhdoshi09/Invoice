import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { 
    Box, Button, Card, CardContent, Table, TableBody, TableCell, TableContainer, 
    TableHead, TableRow, TextField, Dialog, DialogContent, DialogActions, 
    Typography, IconButton, Chip, Tooltip, Grid, Paper, Alert,
    FormControl, InputLabel, Select, MenuItem, CircularProgress, Autocomplete,
    InputAdornment, TablePagination, Collapse, Switch, FormControlLabel,
    List, ListItem, ListItemText, ListItemSecondaryAction
} from '@mui/material';
import { 
    Delete, Visibility, Refresh, Add, Payment, Close,
    Search, Download, AccountBalance, ShoppingBag, CheckCircle,
    KeyboardArrowDown, Save
} from '@mui/icons-material';
import axios from 'axios';
import moment from 'moment';

// ─── Compact inline entry bar ────────────────────────────────────
const QuickEntryBar = ({ mode, setMode, suppliers, onDone, prefilledSupplier }) => {
    // Shared
    const [saving, setSaving] = useState(false);
    const firstRef = useRef(null);

    // Add Supplier fields
    const [sName, setSName] = useState('');
    const [sMobile, setSMobile] = useState('');
    const [sGstin, setSGstin] = useState('');
    const [sOpening, setSOpening] = useState('');
    const [dupWarn, setDupWarn] = useState('');

    // Payment fields
    const [paySup, setPaySup] = useState(null);
    const [payAmt, setPayAmt] = useState('');
    const [payDate, setPayDate] = useState(moment().format('YYYY-MM-DD'));
    const [payNotes, setPayNotes] = useState('');

    // Purchase fields
    const [purSup, setPurSup] = useState(null);
    const [purBill, setPurBill] = useState('');
    const [purDate, setPurDate] = useState(moment().format('YYYY-MM-DD'));
    const [purItems, setPurItems] = useState([{ name: '', qty: '', price: '', total: 0 }]);
    const [purPaid, setPurPaid] = useState(false);

    useEffect(() => {
        setTimeout(() => firstRef.current?.focus(), 100);
    }, [mode]);

    // Auto-fill supplier when prefilledSupplier changes
    useEffect(() => {
        if (prefilledSupplier) {
            if (mode === 'payment') {
                setPaySup(prefilledSupplier);
                if (prefilledSupplier.balance > 0) setPayAmt(prefilledSupplier.balance.toString());
            }
            if (mode === 'purchase') {
                setPurSup(prefilledSupplier);
            }
        }
    }, [prefilledSupplier, mode]);

    // Duplicate check
    const checkDup = useCallback((name) => {
        if (!name.trim()) { setDupWarn(''); return; }
        const hit = suppliers.find(s => s.name.toLowerCase().trim() === name.toLowerCase().trim());
        setDupWarn(hit ? `"${hit.name}" already exists (bal: ₹${(hit.balance || 0).toLocaleString('en-IN')})` : '');
    }, [suppliers]);

    const token = localStorage.getItem('token');
    const headers = { Authorization: `Bearer ${token}` };

    // ── Add Supplier ──
    const submitSupplier = async () => {
        if (!sName.trim()) return;
        const exact = suppliers.find(s => s.name.toLowerCase().trim() === sName.toLowerCase().trim());
        if (exact && !window.confirm(`"${exact.name}" already exists. Create anyway?`)) return;
        setSaving(true);
        try {
            await axios.post('/api/suppliers', {
                name: sName.trim(), mobile: sMobile.trim(), gstin: sGstin.trim(),
                openingBalance: parseFloat(sOpening) || 0
            }, { headers });
            setSName(''); setSMobile(''); setSGstin(''); setSOpening(''); setDupWarn('');
            onDone(`Added: ${sName.trim()}`);
            firstRef.current?.focus();
        } catch (e) { alert(e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    // ── Payment ──
    const submitPayment = async () => {
        if (!paySup) return alert('Select a supplier');
        if (!payAmt || parseFloat(payAmt) <= 0) return alert('Enter valid amount');
        setSaving(true);
        try {
            await axios.post('/api/payments', {
                partyType: 'supplier', partyId: paySup.id, partyName: paySup.name,
                amount: parseFloat(payAmt),
                paymentDate: moment(payDate).format('DD-MM-YYYY'),
                referenceType: 'advance', notes: payNotes
            }, { headers });
            const name = paySup.name;
            setPayAmt(''); setPayNotes('');
            onDone(`Paid ₹${parseFloat(payAmt).toLocaleString('en-IN')} → ${name}`);
        } catch (e) { alert(e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    // ── Purchase ──
    const updateItem = (i, f, v) => {
        const items = [...purItems];
        items[i][f] = v;
        items[i].total = (parseFloat(items[i].qty) || 0) * (parseFloat(items[i].price) || 0);
        setPurItems(items);
    };
    const addRow = () => setPurItems([...purItems, { name: '', qty: '', price: '', total: 0 }]);
    const removeRow = (i) => purItems.length > 1 && setPurItems(purItems.filter((_, j) => j !== i));
    const purTotal = purItems.reduce((s, i) => s + (i.total || 0), 0);

    const submitPurchase = async () => {
        if (!purSup) return alert('Select a supplier');
        const valid = purItems.filter(i => i.name && i.qty && i.price);
        if (!valid.length) return alert('Add at least one item');
        setSaving(true);
        try {
            await axios.post('/api/purchases', {
                supplierId: purSup.id, billNumber: purBill,
                billDate: moment(purDate).format('DD-MM-YYYY'),
                paymentStatus: purPaid ? 'paid' : 'unpaid',
                paidAmount: purPaid ? purTotal : 0,
                subTotal: purTotal, tax: 0, taxPercent: 0, total: purTotal,
                purchaseItems: valid.map(i => ({
                    name: i.name, quantity: parseFloat(i.qty),
                    price: parseFloat(i.price), totalPrice: i.total
                }))
            }, { headers });
            const name = purSup.name;
            setPurBill(''); setPurItems([{ name: '', qty: '', price: '', total: 0 }]); setPurPaid(false);
            onDone(`Purchase ₹${purTotal.toLocaleString('en-IN')} from ${name}`);
        } catch (e) { alert(e.response?.data?.message || e.message); }
        finally { setSaving(false); }
    };

    // Sorted suppliers for autocomplete — those with balance first
    const sortedSuppliers = useMemo(() =>
        [...suppliers].sort((a, b) => (Math.abs(b.balance || 0)) - (Math.abs(a.balance || 0))),
    [suppliers]);

    const modeButtons = [
        { key: 'supplier', label: '+ Supplier', icon: <Add fontSize="small" />, color: 'primary' },
        { key: 'payment', label: '+ Payment', icon: <Payment fontSize="small" />, color: 'success' },
        { key: 'purchase', label: '+ Purchase', icon: <ShoppingBag fontSize="small" />, color: 'warning' },
    ];

    return (
        <Paper data-testid="quick-entry-bar" sx={{ mb: 2, overflow: 'hidden', border: '1px solid #e0e0e0' }}>
            {/* Mode selector row */}
            <Box sx={{ display: 'flex', gap: 0, borderBottom: mode ? '1px solid #e0e0e0' : 'none' }}>
                {modeButtons.map(m => (
                    <Button
                        key={m.key}
                        data-testid={`entry-mode-${m.key}`}
                        size="small"
                        variant={mode === m.key ? 'contained' : 'text'}
                        color={m.color}
                        startIcon={m.icon}
                        onClick={() => setMode(mode === m.key ? null : m.key)}
                        sx={{ borderRadius: 0, px: 2, py: 1, fontWeight: mode === m.key ? 700 : 400, textTransform: 'none', fontSize: '0.85rem' }}
                    >
                        {m.label}
                    </Button>
                ))}
            </Box>

            {/* ── Add Supplier Form ── */}
            {mode === 'supplier' && (
                <Box sx={{ p: 1.5, display: 'flex', gap: 1.5, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <TextField
                        inputRef={firstRef}
                        data-testid="supplier-name-input"
                        size="small" label="Name *" value={sName}
                        onChange={(e) => { setSName(e.target.value); checkDup(e.target.value); }}
                        onKeyDown={e => e.key === 'Enter' && submitSupplier()}
                        error={!!dupWarn} sx={{ width: 200 }}
                    />
                    <TextField data-testid="supplier-mobile-input" size="small" label="Mobile" value={sMobile} onChange={e => setSMobile(e.target.value)} sx={{ width: 130 }} />
                    <TextField data-testid="supplier-gstin-input" size="small" label="GSTIN" value={sGstin} onChange={e => setSGstin(e.target.value.toUpperCase())} sx={{ width: 170 }} />
                    <TextField
                        data-testid="supplier-opening-input"
                        size="small" label="Opening Bal" type="number" value={sOpening}
                        onChange={e => setSOpening(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && submitSupplier()}
                        InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                        sx={{ width: 140 }}
                    />
                    <Button data-testid="submit-supplier-btn" variant="contained" onClick={submitSupplier} disabled={saving || !sName.trim()} size="small" sx={{ height: 40, minWidth: 90 }}>
                        {saving ? <CircularProgress size={18} /> : 'Save'}
                    </Button>
                    {dupWarn && <Typography variant="caption" color="warning.main" sx={{ width: '100%', mt: -0.5 }}>{dupWarn}</Typography>}
                </Box>
            )}

            {/* ── Quick Payment Form ── */}
            {mode === 'payment' && (
                <Box sx={{ p: 1.5, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
                    <Autocomplete
                        data-testid="payment-supplier-select"
                        size="small" options={sortedSuppliers}
                        getOptionLabel={o => o.name || ''}
                        isOptionEqualToValue={(opt, val) => opt.id === val.id}
                        value={paySup}
                        onChange={(_, v) => { setPaySup(v); if (v?.balance > 0) setPayAmt(v.balance.toString()); }}
                        sx={{ width: 240 }}
                        renderInput={p => <TextField {...p} inputRef={firstRef} label="Supplier *" />}
                        renderOption={(props, opt) => (
                            <li {...props} key={opt.id}>
                                <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                    <span>{opt.name}</span>
                                    <Chip label={`₹${Math.abs(opt.balance || 0).toLocaleString('en-IN')}`}
                                        size="small" color={opt.balance > 0 ? 'error' : opt.balance < 0 ? 'success' : 'default'}
                                        sx={{ height: 20, fontSize: '0.7rem' }} />
                                </Box>
                            </li>
                        )}
                    />
                    <TextField
                        data-testid="payment-amount-input"
                        size="small" label="Amount *" type="number" value={payAmt}
                        onChange={e => setPayAmt(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && submitPayment()}
                        InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                        sx={{ width: 140 }}
                    />
                    <TextField data-testid="payment-date-input" size="small" type="date" label="Date" value={payDate} onChange={e => setPayDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 150 }} />
                    <TextField data-testid="payment-notes-input" size="small" label="Notes" value={payNotes} onChange={e => setPayNotes(e.target.value)} placeholder="Optional" sx={{ width: 150 }} />
                    <Button data-testid="submit-payment-btn" variant="contained" color="success" onClick={submitPayment} disabled={saving} size="small" sx={{ height: 40, minWidth: 80 }}>
                        {saving ? <CircularProgress size={18} /> : 'Pay'}
                    </Button>
                    {paySup?.balance > 0 && (
                        <Chip label={`Due: ₹${paySup.balance.toLocaleString('en-IN')}`} color="error" size="small"
                            onClick={() => setPayAmt(paySup.balance.toString())} sx={{ cursor: 'pointer' }} />
                    )}
                    {paySup?.balance < 0 && (
                        <Chip label={`Advance: ₹${Math.abs(paySup.balance).toLocaleString('en-IN')}`} color="success" size="small" />
                    )}
                </Box>
            )}

            {/* ── Quick Purchase Form ── */}
            {mode === 'purchase' && (
                <Box sx={{ p: 1.5 }}>
                    <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center', mb: 1.5, flexWrap: 'wrap' }}>
                        <Autocomplete
                            data-testid="purchase-supplier-select"
                            size="small" options={sortedSuppliers}
                            getOptionLabel={o => o.name || ''}
                            isOptionEqualToValue={(opt, val) => opt.id === val.id}
                            value={purSup} onChange={(_, v) => setPurSup(v)}
                            sx={{ width: 220 }}
                            renderInput={p => <TextField {...p} inputRef={firstRef} label="Supplier *" />}
                            renderOption={(props, opt) => (
                                <li {...props} key={opt.id}>
                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                                        <span>{opt.name}</span>
                                        {opt.balance !== 0 && <Chip label={`₹${Math.abs(opt.balance || 0).toLocaleString('en-IN')}`} size="small" color={opt.balance > 0 ? 'error' : 'success'} sx={{ height: 20 }} />}
                                    </Box>
                                </li>
                            )}
                        />
                        <TextField data-testid="purchase-bill-input" size="small" label="Bill #" value={purBill} onChange={e => setPurBill(e.target.value)} sx={{ width: 110 }} placeholder="Auto" />
                        <TextField data-testid="purchase-date-input" size="small" type="date" label="Date" value={purDate} onChange={e => setPurDate(e.target.value)} InputLabelProps={{ shrink: true }} sx={{ width: 150 }} />
                        <FormControlLabel control={<Switch checked={purPaid} onChange={e => setPurPaid(e.target.checked)} size="small" />} label={<Typography variant="body2">{purPaid ? 'Paid' : 'Credit'}</Typography>} />
                        <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="h6" data-testid="purchase-total-display" sx={{ fontWeight: 700, fontFamily: 'monospace', color: purPaid ? 'success.main' : 'warning.dark' }}>
                                ₹{purTotal.toLocaleString('en-IN')}
                            </Typography>
                            <Button data-testid="submit-purchase-btn" variant="contained" color="warning" onClick={submitPurchase} disabled={saving} size="small" startIcon={saving ? <CircularProgress size={16} /> : <Save />} sx={{ height: 36 }}>
                                Save
                            </Button>
                        </Box>
                    </Box>
                    {/* Items table */}
                    <TableContainer sx={{ border: '1px solid #e0e0e0', borderRadius: 1, maxHeight: 180 }}>
                        <Table size="small">
                            <TableHead>
                                <TableRow sx={{ '& th': { bgcolor: '#fafafa', py: 0.5, fontSize: '0.78rem', fontWeight: 600 } }}>
                                    <TableCell sx={{ width: 30 }}>#</TableCell>
                                    <TableCell>Item Name</TableCell>
                                    <TableCell sx={{ width: 80 }}>Qty</TableCell>
                                    <TableCell sx={{ width: 100 }}>Price</TableCell>
                                    <TableCell sx={{ width: 100 }}>Total</TableCell>
                                    <TableCell sx={{ width: 36 }}></TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {purItems.map((item, idx) => (
                                    <TableRow key={idx} sx={{ '& td': { py: 0.2 } }}>
                                        <TableCell>{idx + 1}</TableCell>
                                        <TableCell>
                                            <TextField fullWidth size="small" variant="standard" placeholder="Item" value={item.name}
                                                onChange={e => updateItem(idx, 'name', e.target.value)}
                                                inputProps={{ style: { fontSize: '0.85rem' } }} />
                                        </TableCell>
                                        <TableCell>
                                            <TextField fullWidth size="small" variant="standard" type="number" value={item.qty}
                                                onChange={e => updateItem(idx, 'qty', e.target.value)}
                                                inputProps={{ style: { textAlign: 'right', fontSize: '0.85rem' } }} />
                                        </TableCell>
                                        <TableCell>
                                            <TextField fullWidth size="small" variant="standard" type="number" value={item.price}
                                                onChange={e => updateItem(idx, 'price', e.target.value)}
                                                onKeyDown={e => {
                                                    if (e.key === 'Enter' && idx === purItems.length - 1 && item.name && item.qty && item.price) addRow();
                                                }}
                                                inputProps={{ style: { textAlign: 'right', fontSize: '0.85rem' } }} />
                                        </TableCell>
                                        <TableCell sx={{ fontWeight: 600, fontSize: '0.85rem', fontFamily: 'monospace' }}>
                                            {item.total > 0 ? `₹${item.total.toLocaleString('en-IN')}` : ''}
                                        </TableCell>
                                        <TableCell>
                                            {purItems.length > 1 && (
                                                <IconButton size="small" onClick={() => removeRow(idx)} sx={{ p: 0.2 }}>
                                                    <Delete fontSize="small" color="error" />
                                                </IconButton>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                    <Button size="small" startIcon={<Add />} onClick={addRow} sx={{ mt: 0.5, textTransform: 'none', fontSize: '0.8rem' }}>Add row (Enter)</Button>
                </Box>
            )}
        </Paper>
    );
};

// ─── Supplier Ledger Dialog (Tally-style) ──────────────────────────
const SupplierLedgerDialog = ({ open, supplier, onClose, onDeletePurchase, onDeletePayment, onPayment, onPurchase }) => {
    const [expandedId, setExpandedId] = useState(null);
    
    if (!supplier) return null;
    const s = supplier;

    // Build unified ledger entries sorted by date (oldest first like Tally)
    const ledgerEntries = [];

    // Opening balance
    if (s.openingBalance && Number(s.openingBalance) !== 0) {
        ledgerEntries.push({
            id: 'opening', date: null, sortKey: '0000-00-00T00:00:00',
            particulars: 'Opening Balance', refNo: '-',
            debit: Number(s.openingBalance) > 0 ? Number(s.openingBalance) : 0,
            credit: Number(s.openingBalance) < 0 ? Math.abs(Number(s.openingBalance)) : 0,
            type: 'opening'
        });
    }

    // Purchases → Debit (and credit if paid at purchase time)
    (s.purchases || []).forEach(p => {
        const d = p.billDate ? moment(p.billDate, ['DD-MM-YYYY', 'YYYY-MM-DD']) : moment(p.createdAt);
        const dateStr = d.isValid() ? d.format('DD/MM/YYYY') : '-';
        const sortStr = d.isValid() ? d.toISOString() : '9999-12-31T23:59:59';
        ledgerEntries.push({
            id: p.id,
            date: dateStr, sortKey: sortStr,
            particulars: 'Purchase',
            refNo: p.billNumber || '-',
            debit: Number(p.total) || 0, credit: 0,
            type: 'purchase', raw: p
        });
        // If purchase was paid at creation, show credit entry for the paid amount
        if (p.paymentStatus === 'paid' && Number(p.paidAmount) > 0) {
            ledgerEntries.push({
                id: `${p.id}-paid`,
                date: dateStr, sortKey: sortStr + 'Z', // sort just after the purchase
                particulars: `Paid against ${p.billNumber || 'Purchase'}`,
                refNo: p.billNumber || '-',
                debit: 0, credit: Number(p.paidAmount),
                type: 'bill-payment', raw: p
            });
        }
    });

    // Payments → Credit
    (s.payments || []).forEach(p => {
        const d = p.paymentDate ? moment(p.paymentDate, ['DD-MM-YYYY', 'YYYY-MM-DD']) : moment(p.createdAt);
        ledgerEntries.push({
            id: p.id,
            date: d.isValid() ? d.format('DD/MM/YYYY') : '-',
            sortKey: d.isValid() ? d.toISOString() : '9999-12-31T23:59:59',
            particulars: 'Payment' + (p.notes ? ` — ${p.notes}` : ''),
            refNo: p.paymentNumber || '-',
            debit: 0, credit: Number(p.amount) || 0,
            type: 'payment', raw: p
        });
    });

    // Sort chronologically (oldest first, opening always first)
    ledgerEntries.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    // Running balance
    let runBal = 0;
    ledgerEntries.forEach(e => { runBal += e.debit - e.credit; e.balance = runBal; });

    const totalDebit = ledgerEntries.reduce((sum, e) => sum + e.debit, 0);
    const totalCredit = ledgerEntries.reduce((sum, e) => sum + e.credit, 0);
    const closingBal = totalDebit - totalCredit;
    const fmt = v => v != null && v !== 0 ? `₹${Math.abs(v).toLocaleString('en-IN', { minimumFractionDigits: 0 })}` : '₹0';

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth data-testid="supplier-ledger-dialog"
            PaperProps={{ sx: { borderRadius: '4px', overflow: 'hidden', border: '2px solid #1a237e' } }}>
            
            {/* Header — dark blue like Tally */}
            <Box sx={{ bgcolor: '#0d1b4a', color: '#fff', px: 2.5, py: 1.2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Typography data-testid="ledger-supplier-name" variant="h6" sx={{ fontWeight: 700, letterSpacing: 0.5, fontSize: '1.1rem' }}>
                        {s.name}
                    </Typography>
                    <Typography variant="caption" sx={{ opacity: 0.7, fontSize: '0.72rem' }}>
                        {[s.mobile, s.gstin && `GSTIN: ${s.gstin}`, 'Supplier Ledger'].filter(Boolean).join(' | ')}
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="caption" sx={{ opacity: 0.6 }}>Closing Balance</Typography>
                        <Typography data-testid="ledger-closing-balance" variant="body1" sx={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '1rem' }}>
                            {fmt(closingBal)} {closingBal >= 0 ? 'Dr' : 'Cr'}
                        </Typography>
                    </Box>
                    <IconButton onClick={onClose} sx={{ color: '#fff' }} data-testid="close-ledger-dialog">
                        <Close />
                    </IconButton>
                </Box>
            </Box>

            <DialogContent sx={{ p: 0 }}>
                <TableContainer sx={{ maxHeight: 420 }}>
                    <Table size="small" stickyHeader data-testid="ledger-table" sx={{
                        '& td, & th': { borderRight: '1px solid #e0e0e0', py: 0.5, px: 1, fontSize: '0.82rem', fontFamily: "'Roboto Mono', monospace" },
                        '& th': { bgcolor: '#e8eaf6', fontWeight: 700, color: '#1a237e', borderBottom: '2px solid #1a237e', fontSize: '0.78rem' },
                        '& td:last-child, & th:last-child': { borderRight: 'none' }
                    }}>
                        <TableHead>
                            <TableRow>
                                <TableCell width={85}>Date</TableCell>
                                <TableCell>Particulars</TableCell>
                                <TableCell width={90}>Vch No.</TableCell>
                                <TableCell align="right" width={100}>Debit</TableCell>
                                <TableCell align="right" width={100}>Credit</TableCell>
                                <TableCell align="right" width={110}>Balance</TableCell>
                                <TableCell align="center" width={40} sx={{ fontFamily: 'inherit' }}></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {ledgerEntries.length === 0 ? (
                                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary', fontFamily: 'Roboto' }}>No transactions yet</TableCell></TableRow>
                            ) : (
                                ledgerEntries.map(e => (
                                    <React.Fragment key={`${e.type}-${e.id}`}>
                                        <TableRow
                                            data-testid={`ledger-row-${e.type}-${e.id}`}
                                            hover
                                            sx={{
                                                bgcolor: e.type === 'opening' ? '#fffde7' : e.type === 'payment' ? '#f1f8e9' : '#fff',
                                                cursor: e.type === 'purchase' ? 'pointer' : 'default',
                                                '&:hover': { bgcolor: e.type === 'purchase' ? '#e3f2fd' : e.type === 'payment' ? '#dcedc8' : '#fff9c4' }
                                            }}
                                            onClick={() => e.type === 'purchase' && setExpandedId(expandedId === e.id ? null : e.id)}
                                        >
                                            <TableCell sx={{ whiteSpace: 'nowrap' }}>{e.date || ''}</TableCell>
                                            <TableCell sx={{ fontFamily: 'Roboto' }}>
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.3 }}>
                                                    {e.type === 'purchase' && (
                                                        <KeyboardArrowDown sx={{ fontSize: 16, transform: expandedId === e.id ? 'rotate(180deg)' : 'none', transition: '0.2s', color: '#999' }} />
                                                    )}
                                                    <Typography variant="body2" sx={{ fontWeight: e.type === 'opening' ? 700 : 500, fontSize: '0.82rem' }}>
                                                        {e.particulars}
                                                    </Typography>
                                                </Box>
                                            </TableCell>
                                            <TableCell sx={{ color: '#666', fontSize: '0.75rem' }}>{e.refNo}</TableCell>
                                            <TableCell align="right" sx={{ color: e.debit > 0 ? '#c62828' : 'transparent', fontWeight: 600 }}>
                                                {e.debit > 0 ? fmt(e.debit) : ''}
                                            </TableCell>
                                            <TableCell align="right" sx={{ color: e.credit > 0 ? '#2e7d32' : 'transparent', fontWeight: 600 }}>
                                                {e.credit > 0 ? fmt(e.credit) : ''}
                                            </TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 700 }}>
                                                {fmt(e.balance)} {e.balance >= 0 ? 'Dr' : 'Cr'}
                                            </TableCell>
                                            <TableCell align="center" onClick={ev => ev.stopPropagation()}>
                                                {e.type === 'purchase' && (
                                                    <Tooltip title="Delete purchase"><IconButton data-testid={`delete-purchase-${e.id}`} size="small" onClick={() => onDeletePurchase(e.id)} sx={{ p: 0.2 }}>
                                                        <Delete sx={{ fontSize: 15, color: '#e57373' }} />
                                                    </IconButton></Tooltip>
                                                )}
                                                {e.type === 'payment' && (
                                                    <Tooltip title="Delete payment"><IconButton data-testid={`delete-payment-${e.id}`} size="small" onClick={() => onDeletePayment(e.id)} sx={{ p: 0.2 }}>
                                                        <Delete sx={{ fontSize: 15, color: '#e57373' }} />
                                                    </IconButton></Tooltip>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                        {/* Expanded purchase items */}
                                        {e.type === 'purchase' && expandedId === e.id && e.raw?.purchaseItems?.length > 0 && (
                                            <TableRow>
                                                <TableCell colSpan={7} sx={{ bgcolor: '#f5f5f5', py: 0, borderBottom: '1px solid #ccc' }}>
                                                    <Collapse in={true}>
                                                        <Box sx={{ pl: 4, py: 0.6 }}>
                                                            {e.raw.purchaseItems.map((item, idx) => (
                                                                <Typography key={idx} variant="body2" sx={{ fontSize: '0.78rem', color: '#555', lineHeight: 1.6, fontFamily: 'Roboto' }}>
                                                                    {item.name} — {item.quantity} x ₹{item.price} = <strong>₹{(item.totalPrice || 0).toLocaleString('en-IN')}</strong>
                                                                </Typography>
                                                            ))}
                                                        </Box>
                                                    </Collapse>
                                                </TableCell>
                                            </TableRow>
                                        )}
                                    </React.Fragment>
                                ))
                            )}
                        </TableBody>
                        {/* Totals row */}
                        {ledgerEntries.length > 0 && (
                            <TableBody>
                                <TableRow sx={{ '& td': { borderTop: '2px solid #1a237e', bgcolor: '#e8eaf6', fontWeight: 700, py: 0.8 } }}>
                                    <TableCell colSpan={3} sx={{ color: '#1a237e', fontSize: '0.82rem' }}>TOTAL</TableCell>
                                    <TableCell align="right" sx={{ color: '#c62828' }}>{fmt(totalDebit)}</TableCell>
                                    <TableCell align="right" sx={{ color: '#2e7d32' }}>{fmt(totalCredit)}</TableCell>
                                    <TableCell align="right" sx={{ color: '#1a237e' }}>
                                        {fmt(closingBal)} {closingBal >= 0 ? 'Dr' : 'Cr'}
                                    </TableCell>
                                    <TableCell></TableCell>
                                </TableRow>
                            </TableBody>
                        )}
                    </Table>
                </TableContainer>
            </DialogContent>

            <DialogActions sx={{ bgcolor: '#f5f5f5', borderTop: '1px solid #ddd', px: 2, py: 0.8, gap: 1 }}>
                <Button data-testid="ledger-make-payment" onClick={() => onPayment(s)} startIcon={<Payment />} variant="contained" color="success" size="small" sx={{ textTransform: 'none' }}>
                    Make Payment
                </Button>
                <Button data-testid="ledger-add-purchase" onClick={() => onPurchase(s)} startIcon={<ShoppingBag />} variant="contained" size="small" sx={{ textTransform: 'none' }}>
                    Add Purchase
                </Button>
            </DialogActions>
        </Dialog>
    );
};

// ─── Main Component ─────────────────────────────────────────────
export const ListSuppliers = () => {
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [detailsDialog, setDetailsDialog] = useState({ open: false, supplier: null });
    const [searchTerm, setSearchTerm] = useState('');
    const [balanceFilter, setBalanceFilter] = useState('all');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(15);
    const [entryMode, setEntryMode] = useState(null);
    const [successMsg, setSuccessMsg] = useState('');
    const [prefilledSupplier, setPrefilledSupplier] = useState(null);
    useEffect(() => { fetchSuppliers(); }, []);

    const fetchSuppliers = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const { data } = await axios.get('/api/suppliers/with-balance', { headers: { Authorization: `Bearer ${token}` } });
            setSuppliers(data.data?.rows || []);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    };

    const fetchSupplierDetails = async (supplierId) => {
        try {
            const token = localStorage.getItem('token');
            const { data } = await axios.get(`/api/suppliers/${supplierId}/transactions`, { headers: { Authorization: `Bearer ${token}` } });
            setDetailsDialog({ open: true, supplier: data.data });
        } catch (e) { alert('Error fetching details'); }
    };

    const handleEntryDone = (msg) => {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(''), 3500);
        fetchSuppliers();
    };

    // ── Delete handlers ──
    const handleDeleteSupplier = async (id, name) => {
        if (!window.confirm(`Delete "${name}"? Fails if they have transactions.`)) return;
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`/api/suppliers/${id}`, { headers: { Authorization: `Bearer ${token}` } });
            handleEntryDone(`Deleted: ${name}`);
        } catch (e) { alert(e.response?.data?.message || e.message); }
    };

    const handleDeletePurchase = async (purchaseId) => {
        if (!window.confirm('Delete this purchase bill?')) return;
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`/api/purchases/${purchaseId}`, { headers: { Authorization: `Bearer ${token}` } });
            if (detailsDialog.supplier?.id) fetchSupplierDetails(detailsDialog.supplier.id);
            fetchSuppliers();
        } catch (e) { alert(e.response?.data?.message || e.message); }
    };

    const handleDeletePayment = async (paymentId) => {
        if (!window.confirm('Delete this payment?')) return;
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`/api/payments/${paymentId}`, { headers: { Authorization: `Bearer ${token}` } });
            if (detailsDialog.supplier?.id) fetchSupplierDetails(detailsDialog.supplier.id);
            fetchSuppliers();
        } catch (e) { alert(e.response?.data?.message || e.message); }
    };

    // Quick actions from table → open entry bar pre-filled
    const handlePayFromTable = (supplier) => {
        setPrefilledSupplier(supplier);
        setEntryMode('payment');
    };

    const handlePurchaseFromTable = (supplier) => {
        setPrefilledSupplier(supplier);
        setEntryMode('purchase');
    };

    // Export
    const handleExport = () => {
        const headers = ['Name', 'Mobile', 'GSTIN', 'Purchases', 'Paid', 'Balance'];
        const rows = filteredSuppliers.map(s => [s.name, s.mobile || '', s.gstin || '', s.totalDebit || 0, s.totalCredit || 0, s.balance || 0]);
        const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `suppliers_${moment().format('YYYY-MM-DD')}.csv`; a.click();
    };

    // Filters
    const filteredSuppliers = useMemo(() => {
        return suppliers.filter(s => {
            const matchSearch = !searchTerm || s.name?.toLowerCase().includes(searchTerm.toLowerCase()) || s.mobile?.includes(searchTerm) || s.gstin?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchBal = balanceFilter === 'all' || (balanceFilter === 'due' && s.balance > 0) || (balanceFilter === 'advance' && s.balance < 0) || (balanceFilter === 'clear' && s.balance === 0);
            return matchSearch && matchBal;
        });
    }, [suppliers, searchTerm, balanceFilter]);

    const paginatedSuppliers = filteredSuppliers.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

    // Summary
    const totalDue = suppliers.reduce((s, x) => s + Math.max(0, x.balance || 0), 0);
    const totalAdvance = suppliers.reduce((s, x) => s + Math.abs(Math.min(0, x.balance || 0)), 0);
    const suppliersWithDue = suppliers.filter(s => s.balance > 0).length;

    return (
        <Box data-testid="supplier-ledger-page" sx={{ p: 2, bgcolor: '#f8f9fa', minHeight: '100vh' }}>
            {/* Header row */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
                <Typography variant="h5" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1, color: '#1a237e' }}>
                    <AccountBalance /> Supplier Ledger
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button data-testid="export-btn" size="small" startIcon={<Download />} onClick={handleExport} sx={{ textTransform: 'none' }}>Export</Button>
                    <Button data-testid="refresh-btn" size="small" startIcon={<Refresh />} onClick={fetchSuppliers} sx={{ textTransform: 'none' }}>Refresh</Button>
                </Box>
            </Box>

            {/* Summary strip */}
            <Grid container spacing={1.5} sx={{ mb: 1.5 }}>
                {[
                    { label: 'Total Payable', value: `₹${totalDue.toLocaleString('en-IN')}`, sub: `${suppliersWithDue} suppliers`, color: '#ff6f00', bg: '#fff8e1', filter: 'due' },
                    { label: 'Advance Given', value: `₹${totalAdvance.toLocaleString('en-IN')}`, sub: '', color: '#2e7d32', bg: '#e8f5e9', filter: 'advance' },
                    { label: 'Total', value: suppliers.length, sub: 'suppliers', color: '#333', bg: '#fff', filter: 'all' },
                    { label: 'Net', value: `₹${Math.abs(totalDue - totalAdvance).toLocaleString('en-IN')}`, sub: totalDue >= totalAdvance ? 'payable' : 'receivable', color: totalDue >= totalAdvance ? '#c62828' : '#2e7d32', bg: '#f3f4f6', filter: 'all' },
                ].map((c, i) => (
                    <Grid item xs={6} sm={3} key={i}>
                        <Card data-testid={`summary-${c.filter}-${i}`} sx={{ bgcolor: c.bg, cursor: 'pointer', border: balanceFilter === c.filter ? '2px solid #1a237e' : '1px solid #e0e0e0' }} onClick={() => setBalanceFilter(c.filter)}>
                            <CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}>
                                <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.7rem' }}>{c.label}</Typography>
                                <Typography variant="h6" sx={{ fontWeight: 700, color: c.color, fontFamily: 'monospace', fontSize: '1.1rem' }}>{c.value}</Typography>
                                {c.sub && <Typography variant="caption" color="text.secondary">{c.sub}</Typography>}
                            </CardContent>
                        </Card>
                    </Grid>
                ))}
            </Grid>

            {/* Success notification */}
            {successMsg && (
                <Alert data-testid="success-alert" severity="success" icon={<CheckCircle />} sx={{ mb: 1.5, py: 0.3 }} onClose={() => setSuccessMsg('')}>
                    {successMsg}
                </Alert>
            )}

            {/* Quick Entry Bar */}
            <QuickEntryBar mode={entryMode} setMode={(m) => { setEntryMode(m); if (!m) setPrefilledSupplier(null); }} suppliers={suppliers} onDone={handleEntryDone} prefilledSupplier={prefilledSupplier} />

            {/* Search + Filter */}
            <Paper sx={{ p: 1, mb: 1.5, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap', border: '1px solid #e0e0e0' }}>
                <TextField
                    data-testid="supplier-search"
                    size="small" placeholder="Search name, mobile, GSTIN..." value={searchTerm}
                    onChange={e => { setSearchTerm(e.target.value); setPage(0); }}
                    InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }}
                    sx={{ width: 260 }}
                />
                <FormControl size="small" sx={{ minWidth: 130 }}>
                    <InputLabel>Filter</InputLabel>
                    <Select data-testid="balance-filter" value={balanceFilter} label="Filter" onChange={e => { setBalanceFilter(e.target.value); setPage(0); }}>
                        <MenuItem value="all">All ({suppliers.length})</MenuItem>
                        <MenuItem value="due">Due ({suppliersWithDue})</MenuItem>
                        <MenuItem value="advance">Advance ({suppliers.filter(s => s.balance < 0).length})</MenuItem>
                        <MenuItem value="clear">Clear ({suppliers.filter(s => s.balance === 0).length})</MenuItem>
                    </Select>
                </FormControl>
                <Typography variant="caption" color="text.secondary">{filteredSuppliers.length} of {suppliers.length}</Typography>
            </Paper>

            {/* Suppliers Table */}
            <Paper sx={{ border: '1px solid #e0e0e0' }}>
                <TableContainer sx={{ maxHeight: 420 }}>
                    <Table size="small" stickyHeader data-testid="suppliers-table">
                        <TableHead>
                            <TableRow sx={{ '& th': { bgcolor: '#f5f5f5', fontWeight: 600, fontSize: '0.8rem', py: 0.8 } }}>
                                <TableCell>Supplier</TableCell>
                                <TableCell>Contact</TableCell>
                                <TableCell align="right">Purchases (Dr)</TableCell>
                                <TableCell align="right">Paid (Cr)</TableCell>
                                <TableCell align="right">Balance</TableCell>
                                <TableCell align="center" sx={{ width: 160 }}>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4 }}><CircularProgress size={24} /></TableCell></TableRow>
                            ) : paginatedSuppliers.length === 0 ? (
                                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>No suppliers found</TableCell></TableRow>
                            ) : paginatedSuppliers.map(sup => (
                                <TableRow key={sup.id} hover data-testid={`supplier-row-${sup.id}`} sx={{ '& td': { py: 0.6 } }}>
                                    <TableCell>
                                        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{sup.name}</Typography>
                                        {sup.gstin && <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.68rem' }}>{sup.gstin}</Typography>}
                                    </TableCell>
                                    <TableCell><Typography variant="body2" sx={{ fontSize: '0.83rem' }}>{sup.mobile || '-'}</Typography></TableCell>
                                    <TableCell align="right">
                                        <Typography sx={{ color: '#c62828', fontWeight: 500, fontFamily: 'monospace', fontSize: '0.85rem' }}>
                                            ₹{(sup.totalDebit || 0).toLocaleString('en-IN')}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Typography sx={{ color: '#2e7d32', fontWeight: 500, fontFamily: 'monospace', fontSize: '0.85rem' }}>
                                            ₹{(sup.totalCredit || 0).toLocaleString('en-IN')}
                                        </Typography>
                                    </TableCell>
                                    <TableCell align="right">
                                        <Chip
                                            data-testid={`balance-chip-${sup.id}`}
                                            label={`${sup.balance < 0 ? '-' : ''}₹${Math.abs(sup.balance || 0).toLocaleString('en-IN')}`}
                                            color={sup.balance > 0 ? 'error' : sup.balance < 0 ? 'success' : 'default'}
                                            size="small" sx={{ fontWeight: 600, minWidth: 70, fontFamily: 'monospace', fontSize: '0.8rem' }}
                                        />
                                    </TableCell>
                                    <TableCell align="center">
                                        <Box sx={{ display: 'flex', gap: 0.3, justifyContent: 'center' }}>
                                            <Tooltip title="View Ledger">
                                                <IconButton data-testid={`view-supplier-${sup.id}`} size="small" onClick={() => fetchSupplierDetails(sup.id)} sx={{ color: '#1a237e' }}>
                                                    <Visibility fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Quick Pay">
                                                <IconButton data-testid={`pay-supplier-${sup.id}`} size="small" onClick={() => handlePayFromTable(sup)} sx={{ color: '#2e7d32' }}>
                                                    <Payment fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Add Purchase">
                                                <IconButton data-testid={`purchase-supplier-${sup.id}`} size="small" onClick={() => handlePurchaseFromTable(sup)}>
                                                    <ShoppingBag fontSize="small" />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="Delete Supplier">
                                                <IconButton data-testid={`delete-supplier-${sup.id}`} size="small" onClick={() => handleDeleteSupplier(sup.id, sup.name)}>
                                                    <Delete fontSize="small" sx={{ color: '#e57373' }} />
                                                </IconButton>
                                            </Tooltip>
                                        </Box>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
                <TablePagination
                    data-testid="supplier-pagination"
                    component="div" count={filteredSuppliers.length} page={page}
                    onPageChange={(_, p) => setPage(p)}
                    rowsPerPage={rowsPerPage}
                    onRowsPerPageChange={e => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
                    rowsPerPageOptions={[10, 15, 25, 50]}
                />
            </Paper>

            {/* Supplier Ledger Dialog */}
            <SupplierLedgerDialog
                open={detailsDialog.open}
                supplier={detailsDialog.supplier}
                onClose={() => setDetailsDialog({ open: false, supplier: null })}
                onDeletePurchase={handleDeletePurchase}
                onDeletePayment={handleDeletePayment}
                onPayment={(s) => { setDetailsDialog({ open: false, supplier: null }); setPrefilledSupplier(s); setEntryMode('payment'); }}
                onPurchase={(s) => { setDetailsDialog({ open: false, supplier: null }); setPrefilledSupplier(s); setEntryMode('purchase'); }}
            />
        </Box>
    );
};

export default ListSuppliers;
