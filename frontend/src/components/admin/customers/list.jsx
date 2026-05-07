import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { CustomerStatement } from './CustomerStatement';
import { useNavigate } from 'react-router-dom';
import { 
    Box, Button, Card, CardContent, Table, TableBody, TableCell, TableContainer, 
    TableHead, TableRow, TextField, Dialog, DialogTitle, DialogContent, DialogActions, 
    Typography, IconButton, Chip, Tooltip, Grid, Paper, Tabs, Tab, Alert,
    FormControl, InputLabel, Select, MenuItem, CircularProgress, Autocomplete,
    InputAdornment, TablePagination, Collapse, Switch, FormControlLabel,
    List, ListItem, ListItemText, ListItemSecondaryAction, Badge
} from '@mui/material';
import {
    Delete, Visibility, Refresh, Add, Receipt, People, Close,
    ShoppingCart, Search, Download, CheckCircle, Edit,
    KeyboardArrowDown, KeyboardArrowUp, PersonAdd, Warning,
    History, Phone, Email, AccountBalance, TipsAndUpdates, Print, WhatsApp
} from '@mui/icons-material';
import axios from 'axios';
import moment from 'moment';
import pdfMake from 'pdfmake/build/pdfmake';
import { generatePdfDefinition } from '../orders/helper';
import { sendInvoiceViaWhatsApp } from '../../../utils/whatsapp';

// Load pdfMake fonts safely
try {
    const vfsFonts = require('pdfmake/build/vfs_fonts');
    if (vfsFonts?.pdfMake?.vfs) {
        pdfMake.vfs = vfsFonts.pdfMake.vfs;
    } else if (vfsFonts?.vfs) {
        pdfMake.vfs = vfsFonts.vfs;
    }
} catch (e) {
    console.warn('pdfMake fonts not loaded:', e);
}

// ─── Customer Ledger Dialog (Tally-style) ─────────────────────────
const CustomerLedgerDialog = ({ open, customer, onClose, onDownload, onPrint, onReceipt, onSale }) => {
    if (!customer) return null;
    const c = customer;

    const ledgerEntries = [];

    if (c.openingBalance && Number(c.openingBalance) !== 0) {
        ledgerEntries.push({
            id: 'opening', date: null, sortKey: '0000-00-00T00:00:00',
            particulars: 'Opening Balance', refNo: '-',
            debit: Number(c.openingBalance) > 0 ? Number(c.openingBalance) : 0,
            credit: Number(c.openingBalance) < 0 ? Math.abs(Number(c.openingBalance)) : 0,
            type: 'opening'
        });
    }

    (c.orders || []).forEach(o => {
        const d = o.orderDate ? moment(o.orderDate, ['DD-MM-YYYY', 'YYYY-MM-DD']) : moment(o.createdAt);
        const dateStr = d.isValid() ? d.format('DD/MM/YYYY') : '-';
        const sortStr = d.isValid() ? d.toISOString() : '9999-12-31T23:59:59';
        ledgerEntries.push({
            id: o.id, date: dateStr, sortKey: sortStr,
            particulars: 'Invoice',
            refNo: o.orderNumber || '-',
            debit: Number(o.total) || 0, credit: 0,
            type: 'invoice', raw: o
        });
    });

    (c.payments || []).forEach(p => {
        const d = p.paymentDate ? moment(p.paymentDate, ['DD-MM-YYYY', 'YYYY-MM-DD']) : moment(p.createdAt);
        ledgerEntries.push({
            id: p.id,
            date: d.isValid() ? d.format('DD/MM/YYYY') : '-',
            sortKey: d.isValid() ? d.toISOString() : '9999-12-31T23:59:59',
            particulars: 'Receipt' + (p.notes ? ` — ${p.notes}` : ''),
            refNo: p.paymentNumber || '-',
            debit: 0, credit: Number(p.amount) || 0,
            type: 'receipt', raw: p
        });
    });

    ledgerEntries.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

    let runBal = 0;
    ledgerEntries.forEach(e => { runBal += e.debit - e.credit; e.balance = runBal; });

    const totalDebit = ledgerEntries.reduce((sum, e) => sum + e.debit, 0);
    const totalCredit = ledgerEntries.reduce((sum, e) => sum + e.credit, 0);
    const closingBal = totalDebit - totalCredit;
    const fmt = v => `₹${Math.abs(v || 0).toLocaleString('en-IN')}`;

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth
            PaperProps={{ sx: { borderRadius: '4px', overflow: 'hidden', border: '2px solid #1a237e' } }}>
            <Box sx={{ bgcolor: '#0d1b4a', color: '#fff', px: 2.5, py: 1.2, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: 0.5, fontSize: '1.1rem' }}>{c.name}</Typography>
                    <Typography variant="caption" sx={{ opacity: 0.7, fontSize: '0.72rem' }}>
                        {[c.mobile, c.gstin && `GSTIN: ${c.gstin}`, 'Customer Ledger'].filter(Boolean).join(' | ')}
                    </Typography>
                </Box>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                    <Box sx={{ textAlign: 'right' }}>
                        <Typography variant="caption" sx={{ opacity: 0.6 }}>Closing Balance</Typography>
                        <Typography variant="body1" sx={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '1rem' }}>
                            {fmt(closingBal)} {closingBal >= 0 ? 'Dr' : 'Cr'}
                        </Typography>
                    </Box>
                    <IconButton onClick={onClose} sx={{ color: '#fff' }}><Close /></IconButton>
                </Box>
            </Box>

            <DialogContent sx={{ p: 0 }}>
                <TableContainer sx={{ maxHeight: 420 }}>
                    <Table size="small" stickyHeader sx={{
                        '& td, & th': { borderRight: '1px solid #e0e0e0', py: 0.5, px: 1, fontSize: '0.82rem', fontFamily: "'Roboto Mono', monospace" },
                        '& th': { bgcolor: '#e8eaf6', fontWeight: 700, color: '#1a237e', borderBottom: '2px solid #1a237e', fontSize: '0.78rem' },
                        '& td:last-child, & th:last-child': { borderRight: 'none' }
                    }}>
                        <TableHead>
                            <TableRow>
                                <TableCell width={85}>Date</TableCell>
                                <TableCell>Particulars</TableCell>
                                <TableCell width={110}>Vch No.</TableCell>
                                <TableCell align="right" width={100}>Debit</TableCell>
                                <TableCell align="right" width={100}>Credit</TableCell>
                                <TableCell align="right" width={110}>Balance</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {ledgerEntries.length === 0 ? (
                                <TableRow><TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary', fontFamily: 'Roboto' }}>No transactions yet</TableCell></TableRow>
                            ) : (
                                ledgerEntries.map(e => (
                                    <TableRow key={`${e.type}-${e.id}`} hover sx={{
                                        bgcolor: e.type === 'opening' ? '#fffde7' : e.type === 'receipt' ? '#f1f8e9' : '#fff',
                                    }}>
                                        <TableCell sx={{ whiteSpace: 'nowrap' }}>{e.date || ''}</TableCell>
                                        <TableCell sx={{ fontFamily: 'Roboto' }}>
                                            <Typography variant="body2" sx={{ fontWeight: e.type === 'opening' ? 700 : 500, fontSize: '0.82rem' }}>
                                                {e.particulars}
                                            </Typography>
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
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                        {ledgerEntries.length > 0 && (
                            <TableBody>
                                <TableRow sx={{ '& td': { borderTop: '2px solid #1a237e', bgcolor: '#e8eaf6', fontWeight: 700, py: 0.8 } }}>
                                    <TableCell colSpan={3} sx={{ color: '#1a237e', fontSize: '0.82rem' }}>TOTAL</TableCell>
                                    <TableCell align="right" sx={{ color: '#c62828' }}>{fmt(totalDebit)}</TableCell>
                                    <TableCell align="right" sx={{ color: '#2e7d32' }}>{fmt(totalCredit)}</TableCell>
                                    <TableCell align="right" sx={{ color: '#1a237e' }}>{fmt(closingBal)} {closingBal >= 0 ? 'Dr' : 'Cr'}</TableCell>
                                </TableRow>
                            </TableBody>
                        )}
                    </Table>
                </TableContainer>
            </DialogContent>

            <DialogActions sx={{ bgcolor: '#f5f5f5', borderTop: '1px solid #ddd', px: 2, py: 0.8, gap: 1 }}>
                <Button onClick={() => onDownload(c, ledgerEntries, totalDebit, totalCredit, closingBal)} startIcon={<Download />} variant="outlined" size="small" sx={{ textTransform: 'none' }}>
                    Download
                </Button>
                <Button onClick={() => onPrint(c, ledgerEntries, totalDebit, totalCredit, closingBal)} startIcon={<Print />} variant="outlined" size="small" sx={{ textTransform: 'none', mr: 'auto' }}>
                    Print
                </Button>
                <Button onClick={() => onReceipt(c)} startIcon={<Receipt />} variant="contained" color="success" size="small" sx={{ textTransform: 'none' }}>
                    Receive Payment
                </Button>
                <Button onClick={() => onSale(c)} startIcon={<ShoppingCart />} variant="contained" size="small" sx={{ textTransform: 'none' }}>
                    New Sale
                </Button>
            </DialogActions>
        </Dialog>
    );
};

export const ListCustomers = () => {
    const navigate = useNavigate();
    const [customers, setCustomers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [detailsDialog, setDetailsDialog] = useState({ open: false, customer: null, tab: 0 });
    const [statementCustomer, setStatementCustomer] = useState(null);
    const [ledgerDialog, setLedgerDialog] = useState({ open: false, customer: null });
    
    // Search and Filter
    const [searchTerm, setSearchTerm] = useState('');
    const [balanceFilter, setBalanceFilter] = useState('all');
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(15);
    
    // Quick Entry Mode
    const [activeTab, setActiveTab] = useState(0);
    const [successMessage, setSuccessMessage] = useState('');
    const [saving, setSaving] = useState(false);
    
    // Quick Add Customer
    const [newCustomer, setNewCustomer] = useState({ name: '', mobile: '', email: '', address: '', gstin: '', openingBalance: 0 });
    const customerNameRef = useRef(null);
    const [duplicateWarning, setDuplicateWarning] = useState('');
    
    // Quick Receipt (Payment from customer)
    const [selectedCustomer, setSelectedCustomer] = useState(null);
    const [receiptAmount, setReceiptAmount] = useState('');
    const [receiptDate, setReceiptDate] = useState(moment().format('YYYY-MM-DD'));
    const [receiptNotes, setReceiptNotes] = useState('');
    const [createNewCustomer, setCreateNewCustomer] = useState(false);
    const [newCustomerName, setNewCustomerName] = useState('');
    const [newCustomerMobile, setNewCustomerMobile] = useState('');

    // Inline name editing
    const [editingName, setEditingName] = useState(null); // { id, value }

    const handleInlineNameSave = async (id, newName) => {
        const trimmed = newName.trim();
        setEditingName(null);
        const original = customers.find(c => c.id === id);
        if (!trimmed || trimmed === original?.name) return;
        try {
            const token = localStorage.getItem('token');
            await axios.put(`/api/customers/${id}`, { name: trimmed }, { headers: { Authorization: `Bearer ${token}` } });
            setCustomers(prev => prev.map(c => c.id === id ? { ...c, name: trimmed } : c));
        } catch (e) {
            alert('Failed to rename: ' + (e.response?.data?.message || e.message));
        }
    };

    // Expanded rows
    const [expandedOrder, setExpandedOrder] = useState(null);
    
    // Customer notes
    const [customerNotes, setCustomerNotes] = useState('');
    const [savingNotes, setSavingNotes] = useState(false);
    
    // Recent activity
    const [recentReceipts, setRecentReceipts] = useState([]);
    
    // Print/View state
    const [printingInvoice, setPrintingInvoice] = useState(null);
    const [viewingInvoice, setViewingInvoice] = useState(null);
    const [invoicePreviewUrl, setInvoicePreviewUrl] = useState(null);
    const [invoicePreviewOpen, setInvoicePreviewOpen] = useState(false);

    useEffect(() => {
        fetchCustomers();
        fetchRecentReceipts();
    }, []);

    const fetchCustomers = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem('token');
            const { data } = await axios.get('/api/customers/with-balance', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setCustomers(data.data?.rows || []);
        } catch (error) {
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchRecentReceipts = async () => {
        try {
            const token = localStorage.getItem('token');
            const { data } = await axios.get('/api/payments?partyType=customer&limit=5', {
                headers: { Authorization: `Bearer ${token}` }
            });
            setRecentReceipts(data.data?.rows || []);
        } catch (error) {
            console.error('Error fetching recent receipts:', error);
        }
    };

    const fetchCustomerDetails = async (customerId, openLedger = false) => {
        try {
            const token = localStorage.getItem('token');
            const { data } = await axios.get(`/api/customers/${customerId}/transactions`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setExpandedOrder(null);
            setCustomerNotes(data.data?.notes || '');
            if (openLedger) {
                setLedgerDialog({ open: true, customer: data.data });
            } else {
                setDetailsDialog({ open: true, customer: data.data, tab: 0 });
            }
        } catch (error) {
            alert('Error fetching details');
        }
    };

    // Fetch full order details and generate PDF
    const fetchOrderAndGeneratePdf = async (orderId) => {
        const token = localStorage.getItem('token');
        const { data } = await axios.get(`/api/orders/${orderId}`, {
            headers: { Authorization: `Bearer ${token}` }
        });
        return data.data || data;
    };

    // Print Invoice function
    const handlePrintInvoice = async (order) => {
        setPrintingInvoice(order.id);
        try {
            const fullOrder = await fetchOrderAndGeneratePdf(order.id);
            const pdfDefinition = generatePdfDefinition(fullOrder);
            pdfMake.createPdf(pdfDefinition).print();
        } catch (error) {
            console.error('Error printing invoice:', error);
            alert('Failed to print invoice. Please try again.');
        } finally {
            setPrintingInvoice(null);
        }
    };

    // View Invoice as PDF in modal
    const handleViewInvoice = async (order) => {
        setViewingInvoice(order.id);
        try {
            const fullOrder = await fetchOrderAndGeneratePdf(order.id);
            const pdfDefinition = generatePdfDefinition(fullOrder);
            pdfMake.createPdf(pdfDefinition).getBlob((blob) => {
                const url = URL.createObjectURL(blob);
                setInvoicePreviewUrl(url);
                setInvoicePreviewOpen(true);
            });
        } catch (error) {
            console.error('Error viewing PDF:', error);
            alert('Failed to load invoice preview. Please try again.');
        } finally {
            setViewingInvoice(null);
        }
    };

    // Close invoice preview
    const handleCloseInvoicePreview = () => {
        setInvoicePreviewOpen(false);
        if (invoicePreviewUrl) {
            URL.revokeObjectURL(invoicePreviewUrl);
            setInvoicePreviewUrl(null);
        }
    };

    // Check for duplicate customer name/mobile
    const checkDuplicate = useCallback((name, mobile) => {
        if (!name.trim() && !mobile.trim()) {
            setDuplicateWarning('');
            return;
        }
        
        let warning = '';
        if (name.trim()) {
            const nameMatch = customers.find(c => 
                c.name.toLowerCase().trim() === name.toLowerCase().trim()
            );
            if (nameMatch) {
                warning = `⚠️ "${nameMatch.name}" already exists (Balance: ₹${nameMatch.balance?.toLocaleString('en-IN')})`;
            }
        }
        
        if (mobile.trim() && mobile.length >= 10) {
            const mobileMatch = customers.find(c => 
                c.mobile && c.mobile === mobile.trim()
            );
            if (mobileMatch && !warning) {
                warning = `⚠️ Mobile ${mobile} belongs to "${mobileMatch.name}"`;
            }
        }
        
        setDuplicateWarning(warning);
    }, [customers]);

    // Filtered customers
    const filteredCustomers = useMemo(() => {
        return customers.filter(c => {
            const matchesSearch = !searchTerm || 
                c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.mobile?.includes(searchTerm) ||
                c.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                c.gstin?.toLowerCase().includes(searchTerm.toLowerCase());
            const matchesBalance = balanceFilter === 'all' || 
                (balanceFilter === 'receivable' && c.balance > 0) ||
                (balanceFilter === 'advance' && c.balance < 0) ||
                (balanceFilter === 'clear' && c.balance === 0);
            return matchesSearch && matchesBalance;
        });
    }, [customers, searchTerm, balanceFilter]);

    const paginatedCustomers = filteredCustomers.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

    // Summary stats
    const totalReceivable = customers.reduce((sum, c) => sum + Math.max(0, c.balance || 0), 0);
    const totalAdvance = customers.reduce((sum, c) => sum + Math.abs(Math.min(0, c.balance || 0)), 0);
    const customersWithDue = customers.filter(c => c.balance > 0).length;

    const showSuccess = (msg) => {
        setSuccessMessage(msg);
        setTimeout(() => setSuccessMessage(''), 4000);
    };

    // ========== SMART ADD CUSTOMER ==========
    const handleAddCustomer = async () => {
        if (!newCustomer.name.trim()) {
            alert('Customer name is required');
            return;
        }
        
        // Check for exact duplicate
        const exactMatch = customers.find(c => 
            c.name.toLowerCase().trim() === newCustomer.name.toLowerCase().trim()
        );
        if (exactMatch) {
            if (!window.confirm(`"${exactMatch.name}" already exists. Create anyway?`)) {
                return;
            }
        }
        
        // Check mobile duplicate
        if (newCustomer.mobile && newCustomer.mobile.length >= 10) {
            const mobileMatch = customers.find(c => c.mobile === newCustomer.mobile);
            if (mobileMatch) {
                if (!window.confirm(`Mobile ${newCustomer.mobile} belongs to "${mobileMatch.name}". Create anyway?`)) {
                    return;
                }
            }
        }
        
        setSaving(true);
        try {
            const token = localStorage.getItem('token');
            await axios.post('/api/customers', {
                name: newCustomer.name.trim(),
                mobile: newCustomer.mobile?.trim() || '',
                email: newCustomer.email?.trim() || '',
                address: newCustomer.address?.trim() || '',
                gstin: newCustomer.gstin?.trim() || '',
                openingBalance: parseFloat(newCustomer.openingBalance) || 0
            }, { headers: { Authorization: `Bearer ${token}` } });
            
            showSuccess(`✓ Added: ${newCustomer.name}${newCustomer.mobile ? ` (${newCustomer.mobile})` : ''}`);
            setNewCustomer({ name: '', mobile: '', email: '', address: '', gstin: '', openingBalance: 0 });
            setDuplicateWarning('');
            fetchCustomers();
            customerNameRef.current?.focus();
        } catch (error) {
            alert('Error: ' + (error.response?.data?.message || error.message));
        } finally {
            setSaving(false);
        }
    };

    // ========== SMART RECEIPT (Payment from Customer) ==========
    const handleQuickReceipt = async () => {
        let customerId = selectedCustomer?.id;
        let customerName = selectedCustomer?.name;
        
        // Create new customer if needed
        if (createNewCustomer && newCustomerName.trim()) {
            try {
                const token = localStorage.getItem('token');
                const { data } = await axios.post('/api/customers', {
                    name: newCustomerName.trim(),
                    mobile: newCustomerMobile?.trim() || '',
                    email: '',
                    address: '',
                    gstin: '',
                    openingBalance: 0
                }, { headers: { Authorization: `Bearer ${token}` } });
                customerId = data.data.id;
                customerName = newCustomerName.trim();
            } catch (error) {
                alert('Error creating customer: ' + (error.response?.data?.message || error.message));
                return;
            }
        }
        
        if (!customerId && !customerName) {
            alert('Select or create a customer');
            return;
        }
        if (!receiptAmount || parseFloat(receiptAmount) <= 0) {
            alert('Enter valid amount');
            return;
        }
        
        setSaving(true);
        try {
            const token = localStorage.getItem('token');
            await axios.post('/api/payments', {
                partyType: 'customer',
                partyId: customerId,
                partyName: customerName,
                amount: parseFloat(receiptAmount),
                paymentDate: moment(receiptDate).format('DD-MM-YYYY'),
                referenceType: 'advance',
                notes: receiptNotes
            }, { headers: { Authorization: `Bearer ${token}` } });
            
            showSuccess(`✓ Received ₹${parseFloat(receiptAmount).toLocaleString('en-IN')} from ${customerName}`);
            setSelectedCustomer(null);
            setReceiptAmount('');
            setReceiptNotes('');
            setCreateNewCustomer(false);
            setNewCustomerName('');
            setNewCustomerMobile('');
            fetchCustomers();
            fetchRecentReceipts();
        } catch (error) {
            alert('Error: ' + (error.response?.data?.message || error.message));
        } finally {
            setSaving(false);
        }
    };

    // Quick receipt from table
    const handleQuickReceiptFromTable = (customer) => {
        setActiveTab(1);
        setSelectedCustomer(customer);
        setReceiptAmount(customer.balance > 0 ? customer.balance.toString() : '');
    };

    // Navigate to create order
    const handleCreateSale = (customer) => {
        navigate('/orders/create', { state: { customer } });
    };

    // Delete
    const handleDelete = async (id, name) => {
        if (!window.confirm(`Delete "${name}"? This will fail if they have transactions.`)) return;
        try {
            const token = localStorage.getItem('token');
            await axios.delete(`/api/customers/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            showSuccess(`Deleted: ${name}`);
            fetchCustomers();
        } catch (error) {
            alert('Error: ' + (error.response?.data?.message || error.message));
        }
    };

    // Customer ledger download (CSV)
    const handleLedgerDownload = (c, ledgerEntries, totalDebit, totalCredit, closingBal) => {
        const fmt = v => Math.abs(v || 0).toFixed(2);
        const header = [`Customer Ledger: ${c.name}`, c.mobile || '', c.gstin ? `GSTIN: ${c.gstin}` : '', `Generated: ${moment().format('DD/MM/YYYY')}`].filter(Boolean).join(' | ');
        const cols = ['Date', 'Particulars', 'Vch No.', 'Debit', 'Credit', 'Balance'];
        const rows = ledgerEntries.map(e => [e.date || '', e.particulars, e.refNo, fmt(e.debit), fmt(e.credit), `${fmt(e.balance)} ${e.balance >= 0 ? 'Dr' : 'Cr'}`]);
        const totalsRow = ['TOTAL', '', '', fmt(totalDebit), fmt(totalCredit), `${fmt(closingBal)} ${closingBal >= 0 ? 'Dr' : 'Cr'}`];
        const csv = [[header], cols, ...rows, totalsRow].map(r => r.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${c.name.replace(/\s+/g, '_')}_ledger_${moment().format('YYYY-MM-DD')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // Customer ledger print
    const handleLedgerPrint = (c, ledgerEntries, totalDebit, totalCredit, closingBal) => {
        const fmt = v => `₹${Math.abs(v || 0).toLocaleString('en-IN')}`;
        const rows = ledgerEntries.map(e => `
            <tr style="background:${e.type === 'opening' ? '#fffde7' : e.type === 'receipt' ? '#f1f8e9' : '#fff'}">
                <td>${e.date || ''}</td>
                <td>${e.particulars}</td>
                <td>${e.refNo}</td>
                <td style="text-align:right;color:#c62828">${e.debit > 0 ? fmt(e.debit) : ''}</td>
                <td style="text-align:right;color:#2e7d32">${e.credit > 0 ? fmt(e.credit) : ''}</td>
                <td style="text-align:right;font-weight:700">${fmt(e.balance)} ${e.balance >= 0 ? 'Dr' : 'Cr'}</td>
            </tr>`).join('');
        const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${c.name} — Ledger</title>
            <style>
                body { font-family: 'Roboto Mono', monospace; font-size: 12px; margin: 20px; color: #222; }
                h2 { color: #0d1b4a; margin-bottom: 2px; }
                .meta { color: #666; font-size: 11px; margin-bottom: 16px; }
                table { width: 100%; border-collapse: collapse; }
                th { background: #e8eaf6; color: #1a237e; border-bottom: 2px solid #1a237e; padding: 6px 8px; text-align: left; font-size: 11px; }
                td { padding: 4px 8px; border-bottom: 1px solid #e0e0e0; }
                .total-row td { border-top: 2px solid #1a237e; background: #e8eaf6; font-weight: 700; color: #1a237e; }
                .closing { margin-top: 12px; text-align: right; font-size: 13px; font-weight: 700; color: #0d1b4a; }
                @media print { body { margin: 10px; } }
            </style></head><body>
            <h2>${c.name}</h2>
            <div class="meta">${[c.mobile, c.gstin && `GSTIN: ${c.gstin}`, `Printed: ${moment().format('DD/MM/YYYY hh:mm A')}`].filter(Boolean).join(' | ')}</div>
            <table>
                <thead><tr><th>Date</th><th>Particulars</th><th>Vch No.</th><th style="text-align:right">Debit</th><th style="text-align:right">Credit</th><th style="text-align:right">Balance</th></tr></thead>
                <tbody>${rows}</tbody>
                <tfoot><tr class="total-row"><td colspan="3">TOTAL</td><td style="text-align:right;color:#c62828">${fmt(totalDebit)}</td><td style="text-align:right;color:#2e7d32">${fmt(totalCredit)}</td><td style="text-align:right">${fmt(closingBal)} ${closingBal >= 0 ? 'Dr' : 'Cr'}</td></tr></tfoot>
            </table>
            <div class="closing">Closing Balance: ${fmt(closingBal)} ${closingBal >= 0 ? 'Dr' : 'Cr'}</div>
            <script>window.onload = () => { window.print(); window.onafterprint = () => window.close(); }<\/script>
            </body></html>`;
        const w = window.open('', '_blank');
        w.document.write(html);
        w.document.close();
    };

    // Export
    const handleExport = () => {
        const headers = ['Name', 'Mobile', 'Email', 'GSTIN', 'Sales', 'Received', 'Balance'];
        const rows = filteredCustomers.map(c => [
            c.name,
            c.mobile || '',
            c.email || '',
            c.gstin || '',
            c.totalDebit || 0,
            c.totalCredit || 0,
            c.balance || 0
        ]);
        const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `customers_${moment().format('YYYY-MM-DD')}.csv`;
        a.click();
    };

    return (
        <Box sx={{ p: 2, bgcolor: '#f5f5f5', minHeight: '100vh' }}>
            {/* Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Typography variant="h5" sx={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 1 }}>
                    <People color="primary" /> Customer Ledger
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button size="small" variant="contained" color="success" startIcon={<ShoppingCart />} onClick={() => navigate('/orders/create')}>
                        New Sale
                    </Button>
                    <Button size="small" startIcon={<Download />} onClick={handleExport}>Export</Button>
                    <Button size="small" startIcon={<Refresh />} onClick={() => { fetchCustomers(); fetchRecentReceipts(); }}>Refresh</Button>
                </Box>
            </Box>

            {/* Summary Cards */}
            <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6} sm={3}>
                    <Card sx={{ bgcolor: '#e8f5e9', cursor: 'pointer' }} onClick={() => setBalanceFilter('receivable')}>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption" color="text.secondary">Total Receivable</Typography>
                            <Typography variant="h6" sx={{ fontWeight: 700, color: 'success.dark' }}>
                                ₹{totalReceivable.toLocaleString('en-IN')}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">{customersWithDue} customers</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Card sx={{ bgcolor: '#fff3e0', cursor: 'pointer' }} onClick={() => setBalanceFilter('advance')}>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption" color="text.secondary">Advance Received</Typography>
                            <Typography variant="h6" sx={{ fontWeight: 700, color: 'warning.dark' }}>
                                ₹{totalAdvance.toLocaleString('en-IN')}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Card sx={{ cursor: 'pointer' }} onClick={() => setBalanceFilter('all')}>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption" color="text.secondary">Total Customers</Typography>
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>{customers.length}</Typography>
                        </CardContent>
                    </Card>
                </Grid>
                <Grid item xs={6} sm={3}>
                    <Card sx={{ bgcolor: '#e3f2fd' }}>
                        <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
                            <Typography variant="caption" color="text.secondary">Net Position</Typography>
                            <Typography variant="h6" sx={{ fontWeight: 700, color: totalReceivable - totalAdvance > 0 ? 'success.main' : 'warning.main' }}>
                                ₹{Math.abs(totalReceivable - totalAdvance).toLocaleString('en-IN')}
                                {totalReceivable - totalAdvance > 0 ? ' ↑' : ' ↓'}
                            </Typography>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>

            {/* Success Message */}
            {successMessage && (
                <Alert severity="success" icon={<CheckCircle />} sx={{ mb: 2, py: 0.5 }} onClose={() => setSuccessMessage('')}>
                    {successMessage}
                </Alert>
            )}

            {/* Quick Entry Tabs */}
            <Paper sx={{ mb: 2 }}>
                <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)} sx={{ borderBottom: 1, borderColor: 'divider' }}>
                    <Tab icon={<PersonAdd />} label="Add Customer" iconPosition="start" sx={{ minHeight: 48 }} data-testid="tab-add-customer" />
                    <Tab icon={<Badge badgeContent={customersWithDue} color="success"><Receipt /></Badge>} label="Receive Payment" iconPosition="start" sx={{ minHeight: 48 }} data-testid="tab-receive-payment" />
                    <Tab icon={<Badge badgeContent={customers.filter(c => c.balance < 0).length} color="warning"><AccountBalance /></Badge>} label="Advances" iconPosition="start" sx={{ minHeight: 48 }} data-testid="tab-advances" />
                    <Tab icon={<History />} label="Recent" iconPosition="start" sx={{ minHeight: 48 }} data-testid="tab-recent" />
                </Tabs>

                <Box sx={{ p: 2 }}>
                    {/* Tab 0: Add Customer */}
                    {activeTab === 0 && (
                        <Box>
                            <Grid container spacing={2} alignItems="center">
                                <Grid item xs={12} sm={3}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Customer Name *"
                                        value={newCustomer.name}
                                        onChange={(e) => {
                                            setNewCustomer({ ...newCustomer, name: e.target.value });
                                            checkDuplicate(e.target.value, newCustomer.mobile);
                                        }}
                                        inputRef={customerNameRef}
                                        onKeyDown={(e) => e.key === 'Enter' && handleAddCustomer()}
                                        error={!!duplicateWarning}
                                    />
                                </Grid>
                                <Grid item xs={6} sm={2}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Mobile"
                                        value={newCustomer.mobile}
                                        onChange={(e) => {
                                            setNewCustomer({ ...newCustomer, mobile: e.target.value });
                                            checkDuplicate(newCustomer.name, e.target.value);
                                        }}
                                        InputProps={{ startAdornment: <InputAdornment position="start"><Phone fontSize="small" /></InputAdornment> }}
                                    />
                                </Grid>
                                <Grid item xs={6} sm={2}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Email"
                                        value={newCustomer.email}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                                    />
                                </Grid>
                                <Grid item xs={6} sm={2}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Opening Balance"
                                        type="number"
                                        value={newCustomer.openingBalance}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, openingBalance: e.target.value })}
                                        InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                                    />
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <Button
                                        fullWidth
                                        variant="contained"
                                        onClick={handleAddCustomer}
                                        disabled={saving}
                                        startIcon={saving ? <CircularProgress size={16} /> : <Add />}
                                    >
                                        Add Customer
                                    </Button>
                                </Grid>
                            </Grid>
                            <Grid container spacing={2} sx={{ mt: 0.5 }}>
                                <Grid item xs={6} sm={3}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Address"
                                        value={newCustomer.address}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, address: e.target.value })}
                                        placeholder="Optional"
                                    />
                                </Grid>
                                <Grid item xs={6} sm={3}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="GSTIN"
                                        value={newCustomer.gstin}
                                        onChange={(e) => setNewCustomer({ ...newCustomer, gstin: e.target.value.toUpperCase() })}
                                        placeholder="Optional"
                                    />
                                </Grid>
                            </Grid>
                            {duplicateWarning && (
                                <Alert severity="warning" sx={{ mt: 1, py: 0 }} icon={<Warning />}>
                                    {duplicateWarning}
                                </Alert>
                            )}
                        </Box>
                    )}

                    {/* Tab 1: Receive Payment */}
                    {activeTab === 1 && (
                        <Box>
                            <Grid container spacing={2} alignItems="center">
                                <Grid item xs={12} sm={4}>
                                    {!createNewCustomer ? (
                                        <Autocomplete
                                            size="small"
                                            options={customers.sort((a, b) => (b.balance || 0) - (a.balance || 0))}
                                            getOptionLabel={(o) => o.name || ''}
                                            value={selectedCustomer}
                                            onChange={(e, v) => {
                                                setSelectedCustomer(v);
                                                if (v && v.balance > 0) setReceiptAmount(v.balance.toString());
                                            }}
                                            renderInput={(params) => <TextField {...params} label="Select Customer *" />}
                                            renderOption={(props, option) => (
                                                <li {...props}>
                                                    <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                                        <Box>
                                                            <Typography variant="body2">{option.name}</Typography>
                                                            {option.mobile && <Typography variant="caption" color="text.secondary">{option.mobile}</Typography>}
                                                        </Box>
                                                        <Chip 
                                                            label={`₹${Math.abs(option.balance || 0).toLocaleString('en-IN')}`} 
                                                            size="small" 
                                                            color={option.balance > 0 ? 'success' : option.balance < 0 ? 'warning' : 'default'}
                                                            sx={{ height: 20, fontSize: '0.7rem' }} 
                                                        />
                                                    </Box>
                                                </li>
                                            )}
                                        />
                                    ) : (
                                        <Box sx={{ display: 'flex', gap: 1 }}>
                                            <TextField
                                                size="small"
                                                label="New Customer Name *"
                                                value={newCustomerName}
                                                onChange={(e) => setNewCustomerName(e.target.value)}
                                                sx={{ flex: 1 }}
                                            />
                                            <TextField
                                                size="small"
                                                label="Mobile"
                                                value={newCustomerMobile}
                                                onChange={(e) => setNewCustomerMobile(e.target.value)}
                                                sx={{ width: 130 }}
                                            />
                                        </Box>
                                    )}
                                </Grid>
                                <Grid item xs={6} sm={2}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Amount *"
                                        type="number"
                                        value={receiptAmount}
                                        onChange={(e) => setReceiptAmount(e.target.value)}
                                        InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                                    />
                                </Grid>
                                <Grid item xs={6} sm={2}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        type="date"
                                        label="Date"
                                        value={receiptDate}
                                        onChange={(e) => setReceiptDate(e.target.value)}
                                        InputLabelProps={{ shrink: true }}
                                    />
                                </Grid>
                                <Grid item xs={8} sm={2}>
                                    <TextField
                                        fullWidth
                                        size="small"
                                        label="Notes"
                                        value={receiptNotes}
                                        onChange={(e) => setReceiptNotes(e.target.value)}
                                        placeholder="Optional"
                                    />
                                </Grid>
                                <Grid item xs={4} sm={2}>
                                    <Button
                                        fullWidth
                                        variant="contained"
                                        color="success"
                                        onClick={handleQuickReceipt}
                                        disabled={saving}
                                        startIcon={saving ? <CircularProgress size={16} /> : <Receipt />}
                                    >
                                        Receive
                                    </Button>
                                </Grid>
                            </Grid>
                            <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 2 }}>
                                <FormControlLabel
                                    control={<Switch size="small" checked={createNewCustomer} onChange={(e) => {
                                        setCreateNewCustomer(e.target.checked);
                                        if (e.target.checked) setSelectedCustomer(null);
                                    }} />}
                                    label={<Typography variant="body2">Create new customer</Typography>}
                                />
                                {selectedCustomer && selectedCustomer.balance > 0 && (
                                    <Alert severity="success" sx={{ py: 0, flex: 1 }}>
                                        <strong>Due: ₹{selectedCustomer.balance?.toLocaleString('en-IN')}</strong>
                                        <Button size="small" sx={{ ml: 2 }} onClick={() => setReceiptAmount(selectedCustomer.balance.toString())}>
                                            Receive Full
                                        </Button>
                                    </Alert>
                                )}
                                {selectedCustomer && selectedCustomer.balance < 0 && (
                                    <Alert severity="warning" sx={{ py: 0, flex: 1 }}>
                                        <strong>Advance: ₹{Math.abs(selectedCustomer.balance)?.toLocaleString('en-IN')}</strong> (already paid extra)
                                    </Alert>
                                )}
                            </Box>
                        </Box>
                    )}

                    {/* Tab 3: Recent Activity */}
                    {activeTab === 3 && (
                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>Recent Customer Receipts</Typography>
                            {recentReceipts.length === 0 ? (
                                <Typography color="text.secondary">No recent receipts</Typography>
                            ) : (
                                <List dense>
                                    {recentReceipts.map((p) => (
                                        <ListItem key={p.id} sx={{ bgcolor: 'white', mb: 0.5, borderRadius: 1 }}>
                                            <ListItemText
                                                primary={p.partyName}
                                                secondary={`${p.paymentDate ? moment(p.paymentDate, 'DD-MM-YYYY').format('DD/MM/YY') : '-'} • ${p.notes || 'No notes'}`}
                                            />
                                            <ListItemSecondaryAction>
                                                <Chip label={`₹${(p.amount || 0).toLocaleString('en-IN')}`} color="success" size="small" />
                                            </ListItemSecondaryAction>
                                        </ListItem>
                                    ))}
                                </List>
                            )}
                        </Box>
                    )}

                    {/* Tab 2: Advances */}
                    {activeTab === 2 && (
                        <Box>
                            <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                                <AccountBalance color="warning" fontSize="small" />
                                Customers with Advance Balance
                            </Typography>
                            {customers.filter(c => c.balance < 0).length === 0 ? (
                                <Alert severity="info" sx={{ mt: 1 }}>
                                    No customers have advance payments. When a customer pays more than their due amount, it shows here as advance.
                                </Alert>
                            ) : (
                                <TableContainer sx={{ maxHeight: 300 }}>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow sx={{ '& th': { bgcolor: '#fff3e0', fontWeight: 600 } }}>
                                                <TableCell>Customer</TableCell>
                                                <TableCell>Mobile</TableCell>
                                                <TableCell align="right">Advance Amount</TableCell>
                                                <TableCell align="center">Action</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {customers.filter(c => c.balance < 0).map((customer) => (
                                                <TableRow key={customer.id} hover>
                                                    <TableCell>
                                                        <Typography variant="body2" fontWeight={500}>{customer.name}</Typography>
                                                    </TableCell>
                                                    <TableCell>{customer.mobile || '-'}</TableCell>
                                                    <TableCell align="right">
                                                        <Chip 
                                                            label={`₹${Math.abs(customer.balance).toLocaleString('en-IN')}`} 
                                                            color="warning" 
                                                            size="small"
                                                            sx={{ fontWeight: 600 }}
                                                        />
                                                    </TableCell>
                                                    <TableCell align="center">
                                                        <Tooltip title="Create Sale (use advance)">
                                                            <Button 
                                                                size="small" 
                                                                variant="outlined" 
                                                                color="success"
                                                                onClick={() => handleCreateSale(customer)}
                                                                startIcon={<ShoppingCart />}
                                                            >
                                                                Use Advance
                                                            </Button>
                                                        </Tooltip>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}
                            <Alert severity="info" sx={{ mt: 2 }} icon={<TipsAndUpdates />}>
                                <strong>Tip:</strong> Advance amounts are automatically adjusted when you create a new sale for the customer.
                            </Alert>
                        </Box>
                    )}
                </Box>
            </Paper>

            {/* Search and Filter */}
            <Paper sx={{ p: 1.5, mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                <TextField
                    size="small"
                    placeholder="Search name, mobile, email, GSTIN..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    InputProps={{ startAdornment: <InputAdornment position="start"><Search /></InputAdornment> }}
                    sx={{ width: 300 }}
                />
                <FormControl size="small" sx={{ minWidth: 150 }}>
                    <InputLabel>Balance Filter</InputLabel>
                    <Select value={balanceFilter} label="Balance Filter" onChange={(e) => setBalanceFilter(e.target.value)}>
                        <MenuItem value="all">All ({customers.length})</MenuItem>
                        <MenuItem value="receivable">Receivable ({customersWithDue})</MenuItem>
                        <MenuItem value="advance">Advance ({customers.filter(c => c.balance < 0).length})</MenuItem>
                        <MenuItem value="clear">Clear ({customers.filter(c => c.balance === 0).length})</MenuItem>
                    </Select>
                </FormControl>
                <Typography variant="body2" color="text.secondary">
                    Showing {filteredCustomers.length} of {customers.length}
                </Typography>
            </Paper>

            {/* Customers Table */}
            <Paper>
                <TableContainer sx={{ maxHeight: 450 }}>
                    <Table size="small" stickyHeader>
                        <TableHead>
                            <TableRow sx={{ '& th': { bgcolor: '#f5f5f5', fontWeight: 600 } }}>
                                <TableCell>Customer</TableCell>
                                <TableCell>Contact</TableCell>
                                <TableCell align="right">Sales</TableCell>
                                <TableCell align="right">Received</TableCell>
                                <TableCell align="right">Balance</TableCell>
                                <TableCell align="center" sx={{ width: 220 }}>Quick Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                                        <CircularProgress size={28} />
                                    </TableCell>
                                </TableRow>
                            ) : paginatedCustomers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} align="center" sx={{ py: 4 }}>
                                        <Typography color="text.secondary">No customers found</Typography>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                paginatedCustomers.map((customer) => (
                                    <TableRow key={customer.id} hover>
                                        <TableCell>
                                            {editingName?.id === customer.id ? (
                                                <TextField
                                                    size="small"
                                                    autoFocus
                                                    value={editingName.value}
                                                    onChange={e => setEditingName({ id: customer.id, value: e.target.value })}
                                                    onBlur={() => handleInlineNameSave(customer.id, editingName.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') handleInlineNameSave(customer.id, editingName.value);
                                                        if (e.key === 'Escape') setEditingName(null);
                                                    }}
                                                    sx={{ width: 160 }}
                                                    inputProps={{ style: { fontWeight: 500, fontSize: '0.875rem' } }}
                                                />
                                            ) : (
                                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, cursor: 'pointer' }}
                                                    onClick={() => setEditingName({ id: customer.id, value: customer.name })}>
                                                    <Typography variant="body2" sx={{ fontWeight: 500 }}>{customer.name}</Typography>
                                                    <Edit sx={{ fontSize: 13, color: 'text.disabled', opacity: 0, '.MuiTableRow-root:hover &': { opacity: 1 } }} />
                                                </Box>
                                            )}
                                            {customer.gstin && <Typography variant="caption" color="text.secondary">{customer.gstin}</Typography>}
                                        </TableCell>
                                        <TableCell>
                                            {customer.mobile && (
                                                <Typography variant="body2" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                    <Phone fontSize="small" sx={{ fontSize: 14, color: 'text.secondary' }} />
                                                    {customer.mobile}
                                                </Typography>
                                            )}
                                            {customer.email && (
                                                <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                    <Email fontSize="small" sx={{ fontSize: 12 }} />
                                                    {customer.email}
                                                </Typography>
                                            )}
                                            {!customer.mobile && !customer.email && '-'}
                                        </TableCell>
                                        <TableCell align="right">
                                            <Typography sx={{ color: 'primary.main', fontWeight: 500 }}>
                                                ₹{(customer.totalDebit || 0).toLocaleString('en-IN')}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Typography sx={{ color: 'success.main', fontWeight: 500 }}>
                                                ₹{(customer.totalCredit || 0).toLocaleString('en-IN')}
                                            </Typography>
                                        </TableCell>
                                        <TableCell align="right">
                                            <Chip
                                                label={`${customer.balance < 0 ? '-' : ''}₹${Math.abs(customer.balance || 0).toLocaleString('en-IN')}`}
                                                color={customer.balance > 0 ? 'success' : customer.balance < 0 ? 'warning' : 'default'}
                                                size="small"
                                                sx={{ fontWeight: 600, minWidth: 80 }}
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                                <Tooltip title="New Sale">
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        color="primary"
                                                        onClick={() => handleCreateSale(customer)}
                                                        sx={{ minWidth: 40, px: 1 }}
                                                        data-testid={`quick-sale-${customer.id}`}
                                                    >
                                                        <ShoppingCart fontSize="small" />
                                                    </Button>
                                                </Tooltip>
                                                <Tooltip title="Receive Payment">
                                                    <Button
                                                        size="small"
                                                        variant="outlined"
                                                        color="success"
                                                        onClick={() => handleQuickReceiptFromTable(customer)}
                                                        sx={{ minWidth: 40, px: 1 }}
                                                    >
                                                        <Receipt fontSize="small" />
                                                    </Button>
                                                </Tooltip>
                                                <Tooltip title="View Ledger">
                                                    <Button
                                                        size="small"
                                                        variant="contained"
                                                        onClick={() => fetchCustomerDetails(customer.id, true)}
                                                        sx={{ minWidth: 40, px: 1 }}
                                                    >
                                                        <Visibility fontSize="small" />
                                                    </Button>
                                                </Tooltip>
                                                <Tooltip title="Detailed Statement">
                                                    <IconButton size="small" onClick={() => fetchCustomerDetails(customer.id)}>
                                                        <AccountBalance fontSize="small" color="primary" />
                                                    </IconButton>
                                                </Tooltip>
                                                <Tooltip title="Delete">
                                                    <IconButton size="small" onClick={() => handleDelete(customer.id, customer.name)}>
                                                        <Delete fontSize="small" color="error" />
                                                    </IconButton>
                                                </Tooltip>
                                            </Box>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
                <TablePagination
                    component="div"
                    count={filteredCustomers.length}
                    page={page}
                    onPageChange={(e, p) => setPage(p)}
                    rowsPerPage={rowsPerPage}
                    onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value)); setPage(0); }}
                    rowsPerPageOptions={[10, 15, 25, 50]}
                />
            </Paper>

            {/* Details Dialog */}
            <Dialog open={detailsDialog.open} onClose={() => setDetailsDialog({ open: false, customer: null, tab: 0 })} maxWidth="md" fullWidth>
                {detailsDialog.customer && (
                    <>
                        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
                            <Box>
                                <Typography variant="h6">{detailsDialog.customer.name}</Typography>
                                <Box sx={{ display: 'flex', gap: 2 }}>
                                    {detailsDialog.customer.mobile && (
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <Phone fontSize="small" sx={{ fontSize: 14 }} /> {detailsDialog.customer.mobile}
                                        </Typography>
                                    )}
                                    {detailsDialog.customer.email && (
                                        <Typography variant="caption" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                            <Email fontSize="small" sx={{ fontSize: 14 }} /> {detailsDialog.customer.email}
                                        </Typography>
                                    )}
                                </Box>
                            </Box>
                            <IconButton onClick={() => setDetailsDialog({ open: false, customer: null, tab: 0 })}>
                                <Close />
                            </IconButton>
                        </DialogTitle>
                        <DialogContent>
                            <Grid container spacing={2} sx={{ mb: 2 }}>
                                <Grid item xs={3}>
                                    <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: '#e3f2fd' }}>
                                        <Typography variant="caption">Opening</Typography>
                                        <Typography variant="h6">₹{(detailsDialog.customer.openingBalance || 0).toLocaleString('en-IN')}</Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={3}>
                                    <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: '#e8f5e9' }}>
                                        <Typography variant="caption">Total Sales</Typography>
                                        <Typography variant="h6">₹{(detailsDialog.customer.totalDebit || 0).toLocaleString('en-IN')}</Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={3}>
                                    <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: '#fff3e0' }}>
                                        <Typography variant="caption">Received</Typography>
                                        <Typography variant="h6">₹{(detailsDialog.customer.totalCredit || 0).toLocaleString('en-IN')}</Typography>
                                    </Paper>
                                </Grid>
                                <Grid item xs={3}>
                                    <Paper sx={{ p: 1.5, textAlign: 'center', bgcolor: detailsDialog.customer.balance > 0 ? '#e8f5e9' : '#fff3e0' }}>
                                        <Typography variant="caption">Balance</Typography>
                                        <Typography variant="h6" sx={{ color: detailsDialog.customer.balance > 0 ? 'success.dark' : 'warning.dark' }}>
                                            ₹{Math.abs(detailsDialog.customer.balance || 0).toLocaleString('en-IN')}
                                            {detailsDialog.customer.balance > 0 ? ' (Due)' : detailsDialog.customer.balance < 0 ? ' (Adv)' : ''}
                                        </Typography>
                                        <Typography variant="caption" sx={{ fontSize: 9, color: 'text.disabled' }}>
                                            Opening + Invoices - Receipts
                                        </Typography>
                                    </Paper>
                                </Grid>
                            </Grid>

                            <Tabs value={detailsDialog.tab} onChange={(e, v) => setDetailsDialog({ ...detailsDialog, tab: v })}>
                                <Tab label={`Invoices (${detailsDialog.customer.orders?.length || 0})`} />
                                <Tab label={`Receipts (${detailsDialog.customer.payments?.length || 0})`} />
                                <Tab label="Allocate" />
                                <Tab label={`Toggle History (${detailsDialog.customer.toggleHistory?.length || 0})`} data-testid="customer-toggle-history-tab" />
                                <Tab label="Notes" data-testid="customer-notes-tab" />
                            </Tabs>

                            {detailsDialog.tab === 0 && (
                                <TableContainer sx={{ maxHeight: 300, mt: 1 }}>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow sx={{ '& th': { bgcolor: '#e8f5e9' } }}>
                                                <TableCell width={40}></TableCell>
                                                <TableCell>Invoice #</TableCell>
                                                <TableCell>Date</TableCell>
                                                <TableCell align="right">Total</TableCell>
                                                <TableCell align="right">Paid</TableCell>
                                                <TableCell align="right">Due</TableCell>
                                                <TableCell>Status</TableCell>
                                                <TableCell align="center">Actions</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {detailsDialog.customer.orders?.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={8} align="center" sx={{ py: 2 }}>No invoices yet</TableCell>
                                                </TableRow>
                                            ) : (
                                                detailsDialog.customer.orders?.map((o) => (
                                                    <React.Fragment key={o.id}>
                                                        <TableRow hover>
                                                            <TableCell onClick={() => setExpandedOrder(expandedOrder === o.id ? null : o.id)} sx={{ cursor: 'pointer' }}>
                                                                <IconButton size="small">
                                                                    {expandedOrder === o.id ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                                                                </IconButton>
                                                            </TableCell>
                                                            <TableCell sx={{ fontWeight: 500 }}>{o.orderNumber}</TableCell>
                                                            <TableCell>{o.orderDate ? moment(o.orderDate, ['DD-MM-YYYY', 'YYYY-MM-DD']).format('DD/MM/YY') : '-'}</TableCell>
                                                            <TableCell align="right" sx={{ fontWeight: 600 }}>₹{(o.total || 0).toLocaleString('en-IN')}</TableCell>
                                                            <TableCell align="right" sx={{ color: 'success.main' }}>₹{(o.derivedPaid || o.paidAmount || 0).toLocaleString('en-IN')}</TableCell>
                                                            <TableCell align="right" sx={{ color: 'error.main' }}>₹{(o.derivedDue !== undefined ? o.derivedDue : o.dueAmount || 0).toLocaleString('en-IN')}</TableCell>
                                                            <TableCell><Chip label={o.derivedStatus || o.paymentStatus} size="small" color={(o.derivedStatus || o.paymentStatus) === 'paid' ? 'success' : 'warning'} /></TableCell>
                                                            <TableCell align="center">
                                                                <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'center' }}>
                                                                    <Tooltip title="View Invoice">
                                                                        <IconButton 
                                                                            size="small" 
                                                                            color="primary"
                                                                            onClick={() => handleViewInvoice(o)}
                                                                            disabled={viewingInvoice === o.id}
                                                                            data-testid={`view-invoice-${o.id}`}
                                                                        >
                                                                            {viewingInvoice === o.id ? <CircularProgress size={18} /> : <Visibility fontSize="small" />}
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                    <Tooltip title="Print Invoice">
                                                                        <IconButton 
                                                                            size="small" 
                                                                            color="secondary"
                                                                            onClick={() => handlePrintInvoice(o)}
                                                                            disabled={printingInvoice === o.id}
                                                                            data-testid={`print-invoice-${o.id}`}
                                                                        >
                                                                            {printingInvoice === o.id ? <CircularProgress size={18} /> : <Print fontSize="small" />}
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                    <Tooltip title="Send via WhatsApp">
                                                                        <IconButton
                                                                            size="small"
                                                                            sx={{ color: '#25D366' }}
                                                                            onClick={async () => {
                                                                                try {
                                                                                    const fullOrder = await fetchOrderAndGeneratePdf(o.id);
                                                                                    sendInvoiceViaWhatsApp(detailsDialog.customer?.mobile || fullOrder.customerMobile, fullOrder);
                                                                                } catch (err) {
                                                                                    sendInvoiceViaWhatsApp(detailsDialog.customer?.mobile, o);
                                                                                }
                                                                            }}
                                                                            data-testid={`whatsapp-invoice-${o.id}`}
                                                                        >
                                                                            <WhatsApp fontSize="small" />
                                                                        </IconButton>
                                                                    </Tooltip>
                                                                </Box>
                                                            </TableCell>
                                                        </TableRow>
                                                        {expandedOrder === o.id && (
                                                            <TableRow>
                                                                <TableCell colSpan={8} sx={{ bgcolor: '#fafafa', py: 0 }}>
                                                                    <Collapse in={true}>
                                                                        <Box sx={{ p: 1.5 }}>
                                                                            <Typography variant="caption" sx={{ fontWeight: 600, color: '#1976d2' }}>
                                                                                Customer ID linked: {o.customerId ? '✓ Yes' : '✗ No (legacy)'}
                                                                            </Typography>
                                                                        </Box>
                                                                    </Collapse>
                                                                </TableCell>
                                                            </TableRow>
                                                        )}
                                                    </React.Fragment>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}

                            {detailsDialog.tab === 1 && (
                                <TableContainer sx={{ maxHeight: 300, mt: 1 }}>
                                    <Table size="small">
                                        <TableHead>
                                            <TableRow sx={{ '& th': { bgcolor: '#fff3e0' } }}>
                                                <TableCell>Receipt #</TableCell>
                                                <TableCell>Date</TableCell>
                                                <TableCell align="right">Amount</TableCell>
                                                <TableCell align="right">Allocated</TableCell>
                                                <TableCell align="right">Unallocated</TableCell>
                                                <TableCell>Notes</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {detailsDialog.customer.payments?.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={6} align="center" sx={{ py: 2 }}>No receipts yet</TableCell>
                                                </TableRow>
                                            ) : (
                                                detailsDialog.customer.payments?.map((p) => (
                                                    <TableRow key={p.id} hover>
                                                        <TableCell>{p.paymentNumber}</TableCell>
                                                        <TableCell>{p.paymentDate ? moment(p.paymentDate, ['DD-MM-YYYY', 'YYYY-MM-DD']).format('DD/MM/YY') : '-'}</TableCell>
                                                        <TableCell align="right" sx={{ fontWeight: 600, color: 'success.main' }}>₹{(p.amount || 0).toLocaleString('en-IN')}</TableCell>
                                                        <TableCell align="right" sx={{ color: 'text.secondary' }}>₹{(p.allocatedAmount || 0).toLocaleString('en-IN')}</TableCell>
                                                        <TableCell align="right" sx={{ fontWeight: 600, color: (p.unallocatedAmount || 0) > 0 ? 'warning.main' : 'text.disabled' }}>
                                                            ₹{(p.unallocatedAmount || 0).toLocaleString('en-IN')}
                                                            {(p.unallocatedAmount || 0) > 0 && (
                                                                <Chip label="On Account" size="small" variant="outlined" color="warning" sx={{ ml: 0.5, height: 18, fontSize: 10 }} />
                                                            )}
                                                        </TableCell>
                                                        <TableCell>{p.notes || '-'}</TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}

                            {/* Tab 2: Receipt Allocation (Tally-style bill-wise reconciliation) */}
                            {detailsDialog.tab === 2 && (
                                <Box sx={{ mt: 1 }}>
                                    {(() => {
                                        const unallocatedPayments = (detailsDialog.customer.payments || []).filter(p => (p.unallocatedAmount || 0) > 0);
                                        const unpaidOrders = (detailsDialog.customer.orders || []).filter(o => (o.derivedDue !== undefined ? o.derivedDue : o.dueAmount || 0) > 0);
                                        
                                        if (unallocatedPayments.length === 0) {
                                            return (
                                                <Box sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
                                                    <Typography variant="body2">No unallocated receipts to allocate.</Typography>
                                                    <Typography variant="caption">Record a payment first, then allocate it against invoices here.</Typography>
                                                </Box>
                                            );
                                        }
                                        if (unpaidOrders.length === 0) {
                                            return (
                                                <Box sx={{ textAlign: 'center', py: 3, color: 'text.secondary' }}>
                                                    <Typography variant="body2">No unpaid invoices to allocate against.</Typography>
                                                </Box>
                                            );
                                        }

                                        return (
                                            <Box>
                                                <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
                                                    Select a receipt and allocate against invoice(s). This is a manual, user-authorized action.
                                                </Typography>
                                                {unallocatedPayments.map(p => (
                                                    <Paper key={p.id} variant="outlined" sx={{ p: 1.5, mb: 1 }}>
                                                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                                                            <Typography variant="subtitle2">
                                                                {p.paymentNumber} — ₹{Number(p.amount).toLocaleString('en-IN')}
                                                            </Typography>
                                                            <Chip 
                                                                label={`₹${Number(p.unallocatedAmount).toLocaleString('en-IN')} available`} 
                                                                size="small" 
                                                                color="warning" 
                                                                variant="outlined"
                                                            />
                                                        </Box>
                                                        {unpaidOrders.map(o => {
                                                            const due = o.derivedDue !== undefined ? o.derivedDue : o.dueAmount || 0;
                                                            return (
                                                                <Box key={o.id} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, pl: 1 }}>
                                                                    <Typography variant="body2" sx={{ minWidth: 140 }}>{o.orderNumber}</Typography>
                                                                    <Typography variant="caption" color="error">Due: ₹{Number(due).toLocaleString('en-IN')}</Typography>
                                                                    <Button 
                                                                        size="small" 
                                                                        variant="outlined"
                                                                        color="success"
                                                                        data-testid={`allocate-${p.id}-${o.id}`}
                                                                        onClick={async () => {
                                                                            const allocAmt = Math.min(Number(p.unallocatedAmount), Number(due));
                                                                            if (allocAmt <= 0) return;
                                                                            if (!window.confirm(`Allocate ₹${allocAmt.toLocaleString('en-IN')} from ${p.paymentNumber} to ${o.orderNumber}?`)) return;
                                                                            try {
                                                                                const res = await fetch(`${process.env.REACT_APP_BACKEND_URL}/api/receipts/allocate`, {
                                                                                    method: 'POST',
                                                                                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                                                                                    body: JSON.stringify({ paymentId: p.id, allocations: [{ orderId: o.id, amount: allocAmt }], changedBy: localStorage.getItem('username') || 'admin' })
                                                                                });
                                                                                const data = await res.json();
                                                                                if (data.status === 200) {
                                                                                    alert('Allocated successfully');
                                                                                    fetchCustomerDetails(detailsDialog.customer.id);
                                                                                } else {
                                                                                    alert(data.message || 'Allocation failed');
                                                                                }
                                                                            } catch (err) {
                                                                                alert('Error: ' + err.message);
                                                                            }
                                                                        }}
                                                                        sx={{ minWidth: 80, fontSize: 11, py: 0.25 }}
                                                                    >
                                                                        Allocate ₹{Math.min(Number(p.unallocatedAmount), Number(due)).toLocaleString('en-IN')}
                                                                    </Button>
                                                                </Box>
                                                            );
                                                        })}
                                                    </Paper>
                                                ))}
                                            </Box>
                                        );
                                    })()}
                                </Box>
                            )}

                            {/* Tab 3: Toggle History */}
                            {detailsDialog.tab === 3 && (
                                <TableContainer sx={{ maxHeight: 350, mt: 1 }}>
                                    <Table size="small" stickyHeader>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sx={{ fontWeight: 'bold', fontSize: 12 }}>Date</TableCell>
                                                <TableCell sx={{ fontWeight: 'bold', fontSize: 12 }}>Order #</TableCell>
                                                <TableCell sx={{ fontWeight: 'bold', fontSize: 12 }}>Changed By</TableCell>
                                                <TableCell sx={{ fontWeight: 'bold', fontSize: 12 }}>From</TableCell>
                                                <TableCell sx={{ fontWeight: 'bold', fontSize: 12 }}>To</TableCell>
                                                <TableCell sx={{ fontWeight: 'bold', fontSize: 12 }}>Details</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {(detailsDialog.customer.toggleHistory || []).length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={6} align="center" sx={{ color: 'text.secondary', py: 4 }}>
                                                        No toggle history found for this customer's orders
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                detailsDialog.customer.toggleHistory.map((t, idx) => (
                                                    <TableRow key={idx} sx={{ 
                                                        bgcolor: (!t.userName || t.userName.trim() === '') ? '#fff3e0' : '#e8f5e9'
                                                    }}>
                                                        <TableCell sx={{ fontSize: 11 }}>
                                                            {new Date(t.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                                                            <br/>
                                                            <span style={{ color: '#999', fontSize: 10 }}>
                                                                {new Date(t.createdAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                                                            </span>
                                                        </TableCell>
                                                        <TableCell sx={{ fontSize: 11, fontFamily: 'monospace' }}>{t.orderNumber || '—'}</TableCell>
                                                        <TableCell sx={{ fontSize: 11 }}>
                                                            <span style={{ 
                                                                fontWeight: 600,
                                                                color: (!t.userName || t.userName.trim() === '') ? '#e65100' : '#2e7d32'
                                                            }}>
                                                                {t.userName && t.userName.trim() ? t.userName : 'SYSTEM (auto)'}
                                                            </span>
                                                            {t.userRole && <span style={{ fontSize: 9, color: '#999', display: 'block' }}>{t.userRole}</span>}
                                                        </TableCell>
                                                        <TableCell sx={{ fontSize: 11 }}>
                                                            <span style={{ color: '#d32f2f' }}>{t.fromStatus || '—'}</span>
                                                        </TableCell>
                                                        <TableCell sx={{ fontSize: 11 }}>
                                                            <span style={{ color: '#2e7d32' }}>{t.toStatus || '—'}</span>
                                                        </TableCell>
                                                        <TableCell sx={{ fontSize: 10, color: 'text.secondary', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                            {t.description || '—'}
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            )}

                            {/* Tab 4: Customer Notes */}
                            {detailsDialog.tab === 4 && (
                                <Box sx={{ mt: 2 }}>
                                    <Typography variant="subtitle2" sx={{ mb: 1, color: 'text.secondary' }}>
                                        Track dues, payment promises, or any notes for this customer.
                                    </Typography>
                                    <TextField
                                        data-testid="customer-notes-input"
                                        multiline
                                        rows={8}
                                        fullWidth
                                        variant="outlined"
                                        placeholder="e.g., 15 Mar - ₹40,000 due, promised to pay by 20 Mar&#10;10 Mar - Delivered 50 bags, partial payment received..."
                                        value={customerNotes}
                                        onChange={(e) => setCustomerNotes(e.target.value)}
                                        sx={{ mb: 2, '& .MuiOutlinedInput-root': { fontSize: 14 } }}
                                    />
                                    <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 1 }}>
                                        <Button
                                            data-testid="save-customer-notes-btn"
                                            variant="contained"
                                            color="primary"
                                            disabled={savingNotes}
                                            onClick={async () => {
                                                setSavingNotes(true);
                                                try {
                                                    const token = localStorage.getItem('token');
                                                    await axios.put(`/api/customers/${detailsDialog.customer.id}`, 
                                                        { notes: customerNotes },
                                                        { headers: { Authorization: `Bearer ${token}` } }
                                                    );
                                                    setDetailsDialog(prev => ({
                                                        ...prev,
                                                        customer: { ...prev.customer, notes: customerNotes }
                                                    }));
                                                    alert('Notes saved!');
                                                } catch (err) {
                                                    alert('Failed to save notes: ' + (err.response?.data?.message || err.message));
                                                } finally {
                                                    setSavingNotes(false);
                                                }
                                            }}
                                        >
                                            {savingNotes ? 'Saving...' : 'Save Notes'}
                                        </Button>
                                    </Box>
                                </Box>
                            )}
                        </DialogContent>
                        <DialogActions>
                            <Button onClick={() => handleCreateSale(detailsDialog.customer)} startIcon={<ShoppingCart />} color="primary">
                                Create Sale
                            </Button>
                            <Button onClick={() => handleQuickReceiptFromTable(detailsDialog.customer)} startIcon={<Receipt />} color="success">
                                Receive Payment
                            </Button>
                        </DialogActions>
                    </>
                )}
            </Dialog>

            {/* Invoice Preview Dialog */}
            <Dialog 
                open={invoicePreviewOpen} 
                onClose={handleCloseInvoicePreview} 
                maxWidth="md" 
                fullWidth
                PaperProps={{ sx: { height: '90vh' } }}
            >
                <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
                    <Typography variant="h6">Invoice Preview</Typography>
                    <Box sx={{ display: 'flex', gap: 1 }}>
                        <Button
                            size="small"
                            variant="contained"
                            startIcon={<Print />}
                            onClick={() => {
                                if (invoicePreviewUrl) {
                                    const iframe = document.createElement('iframe');
                                    iframe.style.display = 'none';
                                    iframe.src = invoicePreviewUrl;
                                    document.body.appendChild(iframe);
                                    iframe.onload = () => {
                                        iframe.contentWindow.print();
                                        setTimeout(() => document.body.removeChild(iframe), 1000);
                                    };
                                }
                            }}
                        >
                            Print
                        </Button>
                        <IconButton onClick={handleCloseInvoicePreview}>
                            <Close />
                        </IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ p: 0, display: 'flex', flexDirection: 'column' }}>
                    {invoicePreviewUrl ? (
                        <iframe
                            src={invoicePreviewUrl}
                            title="Invoice Preview"
                            style={{ 
                                width: '100%', 
                                height: '100%', 
                                border: 'none',
                                flexGrow: 1
                            }}
                        />
                    ) : (
                        <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                            <CircularProgress />
                        </Box>
                    )}
                </DialogContent>
            </Dialog>

            {/* Customer Tally-style Ledger Dialog */}
            <CustomerLedgerDialog
                open={ledgerDialog.open}
                customer={ledgerDialog.customer}
                onClose={() => setLedgerDialog({ open: false, customer: null })}
                onDownload={handleLedgerDownload}
                onPrint={handleLedgerPrint}
                onReceipt={(c) => { setLedgerDialog({ open: false, customer: null }); handleQuickReceiptFromTable(c); }}
                onSale={(c) => { setLedgerDialog({ open: false, customer: null }); handleCreateSale(c); }}
            />

            {/* Customer Ledger Statement (date-range PDF) */}
            <CustomerStatement
                customer={statementCustomer}
                open={!!statementCustomer}
                onClose={() => setStatementCustomer(null)}
            />
        </Box>
    );
};

export default ListCustomers;
