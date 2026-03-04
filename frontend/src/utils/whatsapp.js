import moment from 'moment';

/**
 * Format a phone number for WhatsApp (Indian format).
 */
const formatPhone = (phone) => {
    if (!phone) return '';
    let clean = phone.replace(/[\s\-\+\(\)]/g, '');
    if (clean.length === 10) clean = '91' + clean;
    return clean;
};

const fmt = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/**
 * Generate a clean, professional WhatsApp invoice message.
 */
export const generateInvoiceMessage = (order) => {
    const lines = [];
    const date = order.orderDate
        ? moment(order.orderDate, ['DD-MM-YYYY', 'YYYY-MM-DD', 'DD/MM/YYYY']).format('DD MMM YYYY')
        : moment().format('DD MMM YYYY');

    // Header
    lines.push(`━━━━━━━━━━━━━━━━━━`);
    lines.push(`*INVOICE*`);
    if (order.orderNumber) lines.push(`#${order.orderNumber}`);
    lines.push(`${date}`);
    lines.push(`━━━━━━━━━━━━━━━━━━`);

    // Items table
    const items = order.orderItems || order.items || [];
    if (items.length > 0) {
        items.forEach((item, i) => {
            const originalName = item.name || item.productName || 'Item';
            const altName = item.altName && item.altName.trim();
            // Show ONLY alt name if it exists, otherwise show original name
            const displayName = altName ? altName.trim() : originalName;
            const qty = item.quantity || item.qty || 0;
            const price = item.productPrice || item.price || 0;
            const total = item.totalPrice || item.total || (qty * price);
            lines.push(`${displayName}`);
            lines.push(`  ${qty} x ₹${fmt(price)} = *₹${fmt(total)}*`);
        });
        lines.push(`──────────────────`);
    }

    // Totals
    const total = order.total || 0;
    const paid = order.paidAmount || 0;
    const due = order.dueAmount || (total - paid);

    lines.push(`*TOTAL     ₹${fmt(total)}*`);

    if (due > 0) {
        lines.push(`Paid       ₹${fmt(paid)}`);
        lines.push(`*BALANCE  ₹${fmt(due)}*`);
    } else {
        lines.push(`✅ *PAID*`);
    }

    lines.push(`━━━━━━━━━━━━━━━━━━`);

    return lines.join('\n');
};

/**
 * Open WhatsApp with a pre-filled invoice message.
 */
export const sendInvoiceViaWhatsApp = (phone, order) => {
    const message = generateInvoiceMessage(order);
    const encodedMessage = encodeURIComponent(message);
    const formattedPhone = formatPhone(phone);

    const url = formattedPhone
        ? `https://wa.me/${formattedPhone}?text=${encodedMessage}`
        : `https://wa.me/?text=${encodedMessage}`;

    window.open(url, '_blank');
};
