import moment from 'moment';

/**
 * Format a phone number for WhatsApp (Indian format).
 * Strips spaces, dashes, +, and adds 91 prefix if needed.
 */
const formatPhone = (phone) => {
    if (!phone) return '';
    let clean = phone.replace(/[\s\-\+\(\)]/g, '');
    if (clean.length === 10) clean = '91' + clean;
    if (!clean.startsWith('91') && clean.length === 12) return clean;
    return clean;
};

/**
 * Generate a WhatsApp invoice message from order data.
 * Works with both full order objects and minimal quick-sale data.
 */
export const generateInvoiceMessage = (order) => {
    const lines = [];
    const date = order.orderDate 
        ? moment(order.orderDate, ['DD-MM-YYYY', 'YYYY-MM-DD', 'DD/MM/YYYY']).format('DD/MM/YYYY')
        : moment().format('DD/MM/YYYY');

    lines.push(`*INVOICE${order.orderNumber ? ' ' + order.orderNumber : ''}*`);
    lines.push(`Date: ${date}`);
    if (order.customerName) lines.push(`Customer: ${order.customerName}`);
    lines.push('');

    // Items
    const items = order.orderItems || order.items || [];
    if (items.length > 0) {
        lines.push('*Items:*');
        items.forEach((item, i) => {
            const name = item.name || item.productName || 'Item';
            const qty = item.quantity || item.qty || 0;
            const price = item.productPrice || item.price || 0;
            const total = item.totalPrice || item.total || (qty * price);
            const altLabel = item.altName && item.altName.trim() ? ` (${item.altName.trim()})` : '';
            lines.push(`${i + 1}. ${name}${altLabel} - ${qty} x Rs.${price} = Rs.${total.toLocaleString('en-IN')}`);
        });
        lines.push('');
    }

    lines.push(`*Total: Rs.${(order.total || 0).toLocaleString('en-IN')}*`);
    
    if (order.paidAmount !== undefined && order.paidAmount !== null) {
        lines.push(`Paid: Rs.${(order.paidAmount || 0).toLocaleString('en-IN')}`);
    }
    if (order.dueAmount > 0) {
        lines.push(`*Due: Rs.${order.dueAmount.toLocaleString('en-IN')}*`);
    }

    const status = order.paymentStatus === 'paid' ? 'PAID' : order.paymentStatus === 'partial' ? 'PARTIAL' : 'UNPAID';
    lines.push(`Status: ${status}`);
    lines.push('');
    lines.push('Thank you for your business!');

    return lines.join('\n');
};

/**
 * Open WhatsApp with a pre-filled invoice message.
 * @param {string} phone - Customer phone number
 * @param {object} order - Order/invoice data
 */
export const sendInvoiceViaWhatsApp = (phone, order) => {
    const message = generateInvoiceMessage(order);
    const encodedMessage = encodeURIComponent(message);
    const formattedPhone = formatPhone(phone);
    
    // If phone available, use wa.me/{phone}; otherwise just wa.me with text
    const url = formattedPhone
        ? `https://wa.me/${formattedPhone}?text=${encodedMessage}`
        : `https://wa.me/?text=${encodedMessage}`;
    
    window.open(url, '_blank');
};
