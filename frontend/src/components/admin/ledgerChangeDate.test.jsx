/**
 * Which ledger rows get the "Change date" button, and what a click hands to the
 * page (which sends it to PATCH /payments|purchases/:id/date).
 *
 * Run: CI=true npx react-scripts test --watchAll=false --testPathPattern=ledgerChangeDate
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SupplierLedgerDialog } from './suppliers/list';
import { CustomerLedgerDialog } from './customers/list';

// RTK Query pulls in an ESM-only package that CRA's Jest can't load; the
// dialogs don't use it (only the pages' save handlers do).
jest.mock('../../store/api', () => ({ api: { util: { invalidateTags: jest.fn() } } }));
jest.mock('../../utils/toast', () => ({ toast: jest.fn(), toastSuccess: jest.fn(), toastInfo: jest.fn(), default: jest.fn() }));

const noop = () => {};

test('supplier ledger: purchase and payment rows can be re-dated; derived rows cannot', () => {
    const onChangeDate = jest.fn();
    const supplier = {
        id: 's1', name: 'ramu vatii',
        openingBalance: 1000, openingBalanceDate: '2026-04-01',
        purchases: [{ id: 'pur1', billNumber: 'PUR-EAEFE198', billDate: '02-09-2026', total: 68610, paymentStatus: 'paid', paidAmount: 5000, purchaseItems: [] }],
        payments: [{ id: 'pay1', paymentNumber: 'PAY-ED3BD99E', paymentDate: '04-09-2026', amount: 25000, notes: 'suhas' }],
    };
    render(<SupplierLedgerDialog open supplier={supplier} onClose={noop} onDeletePurchase={noop} onDeletePayment={noop}
        onChangeDate={onChangeDate} onPayment={noop} onPurchase={noop} onDownload={noop} onPrint={noop} />);

    expect(screen.getByTestId('change-date-purchase-pur1')).toBeInTheDocument();
    expect(screen.getByTestId('change-date-payment-pay1')).toBeInTheDocument();
    // "Paid against" follows its purchase; the opening balance is not an entry.
    expect(screen.queryByTestId('change-date-bill-payment-pur1-paid')).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^change-date-/)).toHaveLength(2);

    fireEvent.click(screen.getByTestId('change-date-payment-pay1'));
    expect(onChangeDate).toHaveBeenCalledWith(expect.objectContaining({
        type: 'payment', id: 'pay1', date: '04/09/2026', refNo: 'PAY-ED3BD99E',
    }));
});

test('customer ledger: receipts can be re-dated, except invoice-status markers; invoices use their own edit', () => {
    const onChangeReceiptDate = jest.fn();
    const customer = {
        id: 'c1', name: 'Suhas',
        orders: [{ id: 'o1', orderNumber: 'INV/2026-27/0101', orderDate: '01-09-2026', total: 5000 }],
        payments: [
            { id: 'r1', paymentNumber: 'PAY-464782EE', paymentDate: '11-09-2026', amount: 2655 },
            { id: 'r2', paymentNumber: 'PAY-TOGGLE-ABC123', paymentDate: '11-09-2026', amount: 100 },
        ],
    };
    render(<CustomerLedgerDialog open customer={customer} onClose={noop} onDownload={noop} onPrint={noop}
        onReceipt={noop} onSale={noop} onDeleteReceipt={noop} onChangeReceiptDate={onChangeReceiptDate}
        onEditInvoice={noop} onDeleteInvoice={noop} />);

    expect(screen.getByTestId('change-date-receipt-r1')).toBeInTheDocument();
    expect(screen.queryByTestId('change-date-receipt-r2')).not.toBeInTheDocument(); // the server would refuse it
    expect(screen.getAllByTestId(/^change-date-/)).toHaveLength(1);

    fireEvent.click(screen.getByTestId('change-date-receipt-r1'));
    expect(onChangeReceiptDate).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1', date: '11/09/2026' }));
});
