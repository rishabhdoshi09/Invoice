/**
 * Which ledger rows get the "Change date" and "Edit notes" buttons, and what a
 * click hands to the page (which sends it to PATCH /payments|purchases/:id/date
 * or /notes).
 *
 * Run: CI=true npx react-scripts test --watchAll=false --testPathPattern=ledgerEdits
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

describe('supplier ledger', () => {
    const supplier = {
        id: 's1', name: 'ramu vatii',
        openingBalance: 1000, openingBalanceDate: '2026-04-01',
        purchases: [{ id: 'pur1', billNumber: 'PUR-EAEFE198', billDate: '02-09-2026', total: 68610, paymentStatus: 'paid', paidAmount: 5000, purchaseItems: [] }],
        payments: [{ id: 'pay1', paymentNumber: 'PAY-ED3BD99E', paymentDate: '04-09-2026', amount: 25000, notes: 'suhas' }],
    };
    const renderLedger = (props) => render(<SupplierLedgerDialog open supplier={supplier} onClose={noop} onDeletePurchase={noop}
        onDeletePayment={noop} onChangeDate={noop} onEditNotes={noop} onPayment={noop} onPurchase={noop}
        onDownload={noop} onPrint={noop} {...props} />);

    test('purchase and payment rows get both buttons; derived rows get none', () => {
        renderLedger();
        for (const id of ['purchase-pur1', 'payment-pay1']) {
            expect(screen.getByTestId(`change-date-${id}`)).toBeInTheDocument();
            expect(screen.getByTestId(`edit-notes-${id}`)).toBeInTheDocument();
        }
        // "Paid against" follows its purchase; the opening balance is not an entry.
        expect(screen.getAllByTestId(/^change-date-/)).toHaveLength(2);
        expect(screen.getAllByTestId(/^edit-notes-/)).toHaveLength(2);
    });

    test('clicks hand over the entry: its date for a date change, its notes for a notes edit', () => {
        const onChangeDate = jest.fn();
        const onEditNotes = jest.fn();
        renderLedger({ onChangeDate, onEditNotes });
        fireEvent.click(screen.getByTestId('change-date-payment-pay1'));
        expect(onChangeDate).toHaveBeenCalledWith(expect.objectContaining({
            type: 'payment', id: 'pay1', date: '04/09/2026', refNo: 'PAY-ED3BD99E',
        }));
        fireEvent.click(screen.getByTestId('edit-notes-payment-pay1'));
        expect(onEditNotes).toHaveBeenCalledWith(expect.objectContaining({
            type: 'payment', id: 'pay1', raw: expect.objectContaining({ notes: 'suhas' }),
        }));
    });
});

describe('customer ledger', () => {
    const customer = {
        id: 'c1', name: 'Suhas',
        orders: [{ id: 'o1', orderNumber: 'INV/2026-27/0101', orderDate: '01-09-2026', total: 5000 }],
        payments: [
            { id: 'r1', paymentNumber: 'PAY-464782EE', paymentDate: '11-09-2026', amount: 2655, notes: 'customer' },
            { id: 'r2', paymentNumber: 'PAY-TOGGLE-ABC123', paymentDate: '11-09-2026', amount: 100 },
        ],
    };
    const renderLedger = (props) => render(<CustomerLedgerDialog open customer={customer} onClose={noop} onDownload={noop}
        onPrint={noop} onReceipt={noop} onSale={noop} onDeleteReceipt={noop} onChangeReceiptDate={noop}
        onEditReceiptNotes={noop} onEditInvoice={noop} onDeleteInvoice={noop} {...props} />);

    test('receipts get both buttons, except invoice-status markers; invoices use their own edit', () => {
        renderLedger();
        expect(screen.getByTestId('change-date-receipt-r1')).toBeInTheDocument();
        expect(screen.getByTestId('edit-notes-receipt-r1')).toBeInTheDocument();
        expect(screen.queryByTestId('change-date-receipt-r2')).not.toBeInTheDocument(); // the server would refuse it
        expect(screen.queryByTestId('edit-notes-receipt-r2')).not.toBeInTheDocument();
        expect(screen.getAllByTestId(/^change-date-/)).toHaveLength(1);
        expect(screen.getAllByTestId(/^edit-notes-/)).toHaveLength(1);
    });

    test('clicks hand over the receipt', () => {
        const onChangeReceiptDate = jest.fn();
        const onEditReceiptNotes = jest.fn();
        renderLedger({ onChangeReceiptDate, onEditReceiptNotes });
        fireEvent.click(screen.getByTestId('change-date-receipt-r1'));
        expect(onChangeReceiptDate).toHaveBeenCalledWith(expect.objectContaining({ id: 'r1', date: '11/09/2026' }));
        fireEvent.click(screen.getByTestId('edit-notes-receipt-r1'));
        expect(onEditReceiptNotes).toHaveBeenCalledWith(expect.objectContaining({
            id: 'r1', raw: expect.objectContaining({ notes: 'customer' }),
        }));
    });
});
