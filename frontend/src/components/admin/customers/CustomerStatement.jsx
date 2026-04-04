import { useState } from 'react';
import {
    Dialog, DialogTitle, DialogContent, DialogActions,
    Button, Box, Typography, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Paper, TextField,
    CircularProgress, Alert, Chip, Divider, Grid
} from '@mui/material';
import { PictureAsPdf, Close } from '@mui/icons-material';
import pdfMake from 'pdfmake/build/pdfmake';
import pdfFonts from 'pdfmake/build/vfs_fonts';
pdfMake.vfs = pdfFonts.pdfMake ? pdfFonts.pdfMake.vfs : pdfFonts;

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';

export const CustomerStatement = ({ customer, open, onClose }) => {
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const todayStr = today.toISOString().slice(0, 10);

    const [from, setFrom] = useState(firstOfMonth);
    const [to, setTo]     = useState(todayStr);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError]     = useState(null);

    const fetchStatement = async () => {
        if (!customer?.id) return;
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem('token');
            const res = await fetch(`/api/customers/${customer.id}/statement?from=${from}&to=${to}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const json = await res.json();
            if (!res.ok) throw new Error(json.message || 'Failed to load statement');
            setData(json.data);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    };

    const downloadPDF = () => {
        if (!data) return;

        const tableBody = [
            [
                { text: 'Date',       style: 'tableHeader' },
                { text: 'Type',       style: 'tableHeader' },
                { text: 'Reference',  style: 'tableHeader' },
                { text: 'Debit (₹)', style: 'tableHeader', alignment: 'right' },
                { text: 'Credit (₹)',style: 'tableHeader', alignment: 'right' },
                { text: 'Balance (₹)',style: 'tableHeader', alignment: 'right' },
            ],
            // Opening balance row
            [
                { text: fmtDate(data.period.from), color: '#555' },
                { text: 'Opening Balance', italics: true, color: '#555' },
                { text: '', color: '#555' },
                { text: '', alignment: 'right' },
                { text: '', alignment: 'right' },
                { text: fmt(data.openingBalance), alignment: 'right', bold: true },
            ],
            ...data.transactions.map(t => ([
                fmtDate(t.date),
                { text: t.type, color: t.type === 'Invoice' ? '#1565C0' : '#2E7D32' },
                t.reference || '',
                { text: t.debit  > 0 ? fmt(t.debit)  : '', alignment: 'right', color: '#C62828' },
                { text: t.credit > 0 ? fmt(t.credit) : '', alignment: 'right', color: '#2E7D32' },
                { text: fmt(t.balance), alignment: 'right', bold: true,
                  color: t.balance > 0 ? '#C62828' : '#2E7D32' },
            ])),
            // Closing row
            [
                { text: fmtDate(data.period.to), color: '#555' },
                { text: 'Closing Balance', italics: true, bold: true },
                { text: '' },
                { text: '', alignment: 'right' },
                { text: '', alignment: 'right' },
                { text: fmt(data.closingBalance), alignment: 'right', bold: true,
                  color: data.closingBalance > 0 ? '#C62828' : '#2E7D32' },
            ]
        ];

        const docDef = {
            pageSize: 'A4',
            pageMargins: [30, 40, 30, 40],
            content: [
                { text: 'RISHABH STEEL CENTRE', style: 'companyName' },
                { text: 'Specialist in: Wholesale in Utensils and All Items', style: 'companySubtitle' },
                { text: 'A-22, Sujata Shopping Centre, Navghar Road, Bhayandar (E), Dist. Thane - 401 105', style: 'companyAddress' },
                { text: 'Mobile: 9322674294 | 9137248501 | 9987798562', style: 'companyAddress' },
                { canvas: [{ type: 'line', x1: 0, y1: 4, x2: 535, y2: 4, lineWidth: 1 }] },
                { text: 'CUSTOMER LEDGER STATEMENT', style: 'reportTitle', margin: [0, 10, 0, 6] },
                {
                    columns: [
                        [
                            { text: `Customer: ${data.customer.name}`, bold: true, fontSize: 11 },
                            data.customer.mobile ? { text: `Mobile: ${data.customer.mobile}`, fontSize: 9, color: '#555' } : {},
                            data.customer.gstin  ? { text: `GSTIN: ${data.customer.gstin}`,   fontSize: 9, color: '#555' } : {},
                        ],
                        [
                            { text: `Period: ${fmtDate(data.period.from)} to ${fmtDate(data.period.to)}`, fontSize: 9, alignment: 'right', color: '#555' },
                            { text: `Total Invoiced: ₹${fmt(data.totalInvoiced)}`,   fontSize: 9, alignment: 'right' },
                            { text: `Total Received: ₹${fmt(data.totalPaid)}`,       fontSize: 9, alignment: 'right' },
                            { text: `Balance Due: ₹${fmt(data.closingBalance)}`,     fontSize: 10, alignment: 'right', bold: true,
                              color: data.closingBalance > 0 ? '#C62828' : '#2E7D32' },
                        ]
                    ],
                    margin: [0, 0, 0, 10]
                },
                {
                    table: { headerRows: 1, widths: ['auto', 'auto', '*', 70, 70, 75], body: tableBody },
                    layout: {
                        hLineColor: (i) => i === 0 || i === 1 ? '#1565C0' : '#ddd',
                        vLineColor: () => '#eee',
                        fillColor: (i) => i === 0 ? '#E3F2FD' : i % 2 === 0 ? '#FAFAFA' : null,
                    }
                },
                { text: `Generated on ${new Date().toLocaleString('en-IN')}`, fontSize: 8, color: '#aaa', margin: [0, 10, 0, 0], alignment: 'right' }
            ],
            styles: {
                companyName:     { fontSize: 16, bold: true, alignment: 'center', color: '#1565C0' },
                companySubtitle: { fontSize: 9,  alignment: 'center', color: '#555', margin: [0, 2, 0, 2] },
                companyAddress:  { fontSize: 8,  alignment: 'center', color: '#777' },
                reportTitle:     { fontSize: 13, bold: true, alignment: 'center', color: '#1565C0' },
                tableHeader:     { bold: true, fontSize: 9, color: '#1565C0' },
            },
            defaultStyle: { fontSize: 9, font: 'Roboto' }
        };

        pdfMake.createPdf(docDef).download(
            `statement_${data.customer.name.replace(/\s+/g, '_')}_${from}_${to}.pdf`
        );
    };

    const handleClose = () => { setData(null); setError(null); onClose(); };

    return (
        <Dialog open={open} onClose={handleClose} maxWidth="lg" fullWidth>
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                    <Typography variant="h6" fontWeight={700}>Customer Ledger Statement</Typography>
                    {customer && <Typography variant="body2" color="text.secondary">{customer.name}</Typography>}
                </Box>
                <Button onClick={handleClose} size="small" startIcon={<Close />}>Close</Button>
            </DialogTitle>

            <DialogContent dividers>
                {/* Date range picker */}
                <Box sx={{ display: 'flex', gap: 2, mb: 2, alignItems: 'center', flexWrap: 'wrap' }}>
                    <TextField label="From" type="date" size="small" value={from}
                        onChange={e => setFrom(e.target.value)} InputLabelProps={{ shrink: true }} />
                    <TextField label="To"   type="date" size="small" value={to}
                        onChange={e => setTo(e.target.value)}   InputLabelProps={{ shrink: true }} />
                    <Button variant="contained" onClick={fetchStatement} disabled={loading}
                        startIcon={loading ? <CircularProgress size={16} color="inherit" /> : null}>
                        {loading ? 'Loading…' : 'Load Statement'}
                    </Button>
                </Box>

                {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                {data && (
                    <>
                        {/* Summary cards */}
                        <Grid container spacing={2} sx={{ mb: 2 }}>
                            {[
                                { label: 'Opening Balance', value: fmt(data.openingBalance), color: '#1565C0' },
                                { label: 'Total Invoiced',  value: fmt(data.totalInvoiced),  color: '#C62828' },
                                { label: 'Total Received',  value: fmt(data.totalPaid),      color: '#2E7D32' },
                                { label: 'Balance Due',     value: fmt(data.closingBalance), color: data.closingBalance > 0 ? '#C62828' : '#2E7D32', bold: true },
                            ].map(card => (
                                <Grid item xs={6} sm={3} key={card.label}>
                                    <Paper variant="outlined" sx={{ p: 1.5, textAlign: 'center' }}>
                                        <Typography variant="caption" color="text.secondary">{card.label}</Typography>
                                        <Typography variant="h6" fontWeight={card.bold ? 700 : 500} color={card.color}>
                                            ₹{card.value}
                                        </Typography>
                                    </Paper>
                                </Grid>
                            ))}
                        </Grid>

                        <Divider sx={{ mb: 2 }} />

                        {/* Transactions table */}
                        <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 400 }}>
                            <Table size="small" stickyHeader>
                                <TableHead>
                                    <TableRow sx={{ bgcolor: '#E3F2FD' }}>
                                        {['Date','Type','Reference','Debit (₹)','Credit (₹)','Balance (₹)'].map(h => (
                                            <TableCell key={h} sx={{ fontWeight: 700, fontSize: 12 }}
                                                align={['Debit (₹)','Credit (₹)','Balance (₹)'].includes(h) ? 'right' : 'left'}>
                                                {h}
                                            </TableCell>
                                        ))}
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {/* Opening row */}
                                    <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                        <TableCell>{fmtDate(data.period.from)}</TableCell>
                                        <TableCell><em>Opening Balance</em></TableCell>
                                        <TableCell colSpan={3} />
                                        <TableCell align="right" sx={{ fontWeight: 700 }}>₹{fmt(data.openingBalance)}</TableCell>
                                    </TableRow>
                                    {data.transactions.map((t, i) => (
                                        <TableRow key={i} hover>
                                            <TableCell>{fmtDate(t.date)}</TableCell>
                                            <TableCell>
                                                <Chip label={t.type} size="small"
                                                    color={t.type === 'Invoice' ? 'primary' : 'success'}
                                                    variant="outlined" sx={{ fontSize: 10, height: 20 }} />
                                            </TableCell>
                                            <TableCell sx={{ fontSize: 11 }}>{t.reference}</TableCell>
                                            <TableCell align="right" sx={{ color: '#C62828', fontWeight: t.debit > 0 ? 600 : 400 }}>
                                                {t.debit > 0 ? `₹${fmt(t.debit)}` : ''}
                                            </TableCell>
                                            <TableCell align="right" sx={{ color: '#2E7D32', fontWeight: t.credit > 0 ? 600 : 400 }}>
                                                {t.credit > 0 ? `₹${fmt(t.credit)}` : ''}
                                            </TableCell>
                                            <TableCell align="right" sx={{ fontWeight: 700, color: t.balance > 0 ? '#C62828' : '#2E7D32' }}>
                                                ₹{fmt(t.balance)}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {/* Closing row */}
                                    <TableRow sx={{ bgcolor: '#E8F5E9' }}>
                                        <TableCell><strong>{fmtDate(data.period.to)}</strong></TableCell>
                                        <TableCell><strong>Closing Balance</strong></TableCell>
                                        <TableCell colSpan={3} />
                                        <TableCell align="right" sx={{ fontWeight: 700, fontSize: 13,
                                            color: data.closingBalance > 0 ? '#C62828' : '#2E7D32' }}>
                                            ₹{fmt(data.closingBalance)}
                                        </TableCell>
                                    </TableRow>
                                </TableBody>
                            </Table>
                        </TableContainer>
                    </>
                )}
            </DialogContent>

            <DialogActions sx={{ justifyContent: 'space-between', px: 3 }}>
                <Typography variant="caption" color="text.secondary">
                    {data ? `${data.transactions.length} transactions` : 'Select date range and load'}
                </Typography>
                <Button variant="contained" color="error" startIcon={<PictureAsPdf />}
                    onClick={downloadPDF} disabled={!data}>
                    Download PDF
                </Button>
            </DialogActions>
        </Dialog>
    );
};
