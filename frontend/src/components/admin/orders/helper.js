
export const generatePdfDefinition = (data) => {
    // GST Rate: 5% total (2.5% SGST + 2.5% CGST)
    const GST_RATE = 0.05;
    const SGST_RATE = 0.025;
    const CGST_RATE = 0.025;

    // Sort items by sortOrder to maintain the order they were added
    const sortedItems = [...(data.orderItems || [])].sort((a, b) => {
        const sortA = a.sortOrder !== undefined ? a.sortOrder : 999;
        const sortB = b.sortOrder !== undefined ? b.sortOrder : 999;
        return sortA - sortB;
    });

    // Calculate tax-inclusive values for each item
    // Product price is inclusive of GST, so we need to extract base price
    const itemsWithTax = sortedItems.map(item => {
        const inclusivePrice = Number(item.productPrice) || 0;
        const quantity = Number(item.quantity) || 0;
        const inclusiveTotal = Number(item.totalPrice) || 0;
        
        // Calculate base price (exclusive of GST)
        // inclusivePrice = basePrice * (1 + GST_RATE)
        // basePrice = inclusivePrice / (1 + GST_RATE)
        const basePrice = inclusivePrice / (1 + GST_RATE);
        const baseTotal = inclusiveTotal / (1 + GST_RATE);
        
        // Calculate tax amounts
        const sgstAmount = baseTotal * SGST_RATE;
        const cgstAmount = baseTotal * CGST_RATE;
        
        return {
            ...item,
            basePrice: basePrice.toFixed(2),
            baseTotal: baseTotal.toFixed(2),
            sgstAmount: sgstAmount.toFixed(2),
            cgstAmount: cgstAmount.toFixed(2),
            inclusiveTotal: inclusiveTotal.toFixed(2)
        };
    });

    // Calculate totals
    const totalBaseAmount = itemsWithTax.reduce((sum, item) => sum + parseFloat(item.baseTotal), 0);
    const totalSgst = itemsWithTax.reduce((sum, item) => sum + parseFloat(item.sgstAmount), 0);
    const totalCgst = itemsWithTax.reduce((sum, item) => sum + parseFloat(item.cgstAmount), 0);
    const grandTotal = totalBaseAmount + totalSgst + totalCgst;

    return {
        content: [
            {
                "text": "RISHABH STEEL CENTRE",
                "style": "companyName"
            },
            {
                "text": "Specialist in: Wholesale in Utensils and All Items",
                "style": "companyService"
            },
            {
                "text": "A - 22, Sujata Shopping Centre, Navghar Road, Bhayandar (E), Dist. Thane - 401 105",
                "style": "companyAddress"
            },
            {
                "text": "Mobile: 9322674294 | 9137248501 | 9987798562",
                "style": "companyContact"
            },
            {
                "text": "GST IN: 27AALPD6339G1ZN",
                "style": "gstNumber"
            },
            {
                "canvas": [
                    {
                        "type": "line",
                        "x1": 0,
                        "y1": 0,
                        "x2": 515,
                        "y2": 0,
                        "lineWidth": 1,
                        "lineColor": "black",
                        "margin": [0, 0, 0, 20]
                    }
                ]
            },
            {
                columns: [
                    {
                        width: '50%',
                        stack: [
                            { text: `Customer Name: ${data.customerName || 'Walk-in'}`, style: 'customerInfo' },
                            { text: `Mobile: ${data.customerMobile || '-'}`, style: 'customerInfo' },
                        ]
                    },
                    {
                        width: '50%',
                        stack: [
                            { text: `Invoice No: ${data.orderNumber}`, style: 'invoiceInfo', alignment: 'right' },
                            { text: `Date: ${data.orderDate}`, style: 'invoiceInfo', alignment: 'right' },
                        ]
                    }
                ]
            },
            {
                text: 'TAX INVOICE',
                style: 'taxInvoiceTitle',
                margin: [0, 15, 0, 10]
            },
            {
                style: 'tableExample',
                table: {
                    headerRows: 1,
                    widths: ['6%', '30%', '12%', '8%', '12%', '10%', '10%', '12%'],
                    body: [
                        [
                            { text: 'Sr', style: 'tableHeader' },
                            { text: 'Description', style: 'tableHeader' },
                            { text: 'Rate', style: 'tableHeader' },
                            { text: 'Qty', style: 'tableHeader' },
                            { text: 'Taxable Amt', style: 'tableHeader' },
                            { text: 'SGST\n2.5%', style: 'tableHeader' },
                            { text: 'CGST\n2.5%', style: 'tableHeader' },
                            { text: 'Total', style: 'tableHeader' }
                        ],
                        ...itemsWithTax.map((item, index) => [
                            { text: `${index + 1}`, alignment: 'center' },
                            { text: (item.altName && item.altName.trim()) ? item.altName.trim() : item.name },
                            { text: `₹${item.basePrice}`, alignment: 'right' },
                            { text: `${item.quantity}`, alignment: 'center' },
                            { text: `₹${item.baseTotal}`, alignment: 'right' },
                            { text: `₹${item.sgstAmount}`, alignment: 'right' },
                            { text: `₹${item.cgstAmount}`, alignment: 'right' },
                            { text: `₹${item.inclusiveTotal}`, alignment: 'right', bold: true }
                        ])
                    ]
                },
                "layout": {
                    "hLineWidth": function (i, node) {
                        return (i === 0 || i === 1 || i === node.table.body.length) ? 1 : 0.5;
                    },
                    "vLineWidth": function () {
                        return 0.5;
                    },
                    "hLineColor": function (i) {
                        return i === 0 || i === 1 ? "black" : "#cccccc";
                    },
                    "vLineColor": function () {
                        return "#cccccc";
                    },
                    "paddingLeft": function () {
                        return 4;
                    },
                    "paddingRight": function () {
                        return 4;
                    },
                    "paddingTop": function () {
                        return 4;
                    },
                    "paddingBottom": function () {
                        return 4;
                    }
                }
            },
            {
                style: 'summaryTable',
                table: {
                    widths: ['*', '25%'],
                    body: [
                        [
                            { text: 'Taxable Amount:', alignment: 'right' },
                            { text: `₹ ${totalBaseAmount.toFixed(2)}`, alignment: 'right' }
                        ],
                        [
                            { text: 'SGST @ 2.5%:', alignment: 'right' },
                            { text: `₹ ${totalSgst.toFixed(2)}`, alignment: 'right' }
                        ],
                        [
                            { text: 'CGST @ 2.5%:', alignment: 'right' },
                            { text: `₹ ${totalCgst.toFixed(2)}`, alignment: 'right' }
                        ],
                        [
                            { text: 'Grand Total:', alignment: 'right', bold: true, fontSize: 14 },
                            { text: `₹ ${grandTotal.toFixed(2)}`, alignment: 'right', bold: true, fontSize: 14 }
                        ]
                    ]
                },
                layout: 'noBorders',
                margin: [0, 10, 0, 0]
            },
            {
                text: '(Prices are inclusive of GST)',
                style: 'gstNote',
                margin: [0, 10, 0, 0]
            }
        ],
        "styles": {
          "companyName": {
            fontSize: 26,
            bold: true,
            alignment: "center",
            margin: [0, 10, 0, 5]
          },
          "companyService": {
            fontSize: 14,
            bold: true,
            alignment: "center",
            margin: [0, 0, 0, 5]
          },
          "companyAddress": {
            fontSize: 11,
            alignment: "center",
            margin: [0, 0, 0, 5]
          },
          "companyContact": {
            fontSize: 11,
            alignment: "center",
            bold: true,
            margin: [0, 0, 0, 5]
          },
          "gstNumber": {
            fontSize: 12,
            color: "red",
            bold: true,
            alignment: "center",
            margin: [0, 0, 0, 10]
          },
          "customerInfo": {
            fontSize: 11,
            margin: [0, 2, 0, 2]
          },
          "invoiceInfo": {
            fontSize: 11,
            margin: [0, 2, 0, 2]
          },
          "taxInvoiceTitle": {
            fontSize: 16,
            bold: true,
            alignment: "center",
            decoration: 'underline'
          },
          "tableExample": {
            fontSize: 10,
            margin: [0, 5, 0, 10]
          },
          "tableHeader": {
            bold: true,
            fontSize: 9,
            alignment: "center",
            fillColor: '#f0f0f0'
          },
          "summaryTable": {
            fontSize: 11,
            margin: [250, 0, 0, 0]
          },
          "gstNote": {
            fontSize: 10,
            italics: true,
            alignment: "center",
            color: "#666666"
          },
          "footertext": {
            fontSize: 10,
            alignment: "center",
            margin: [0, 5, 0, 0]
          }
        },
        pageSize: 'A4',
        pageMargins: [40, 40, 40, 60],
        footer: function (currentPage, pageCount) {
            return [
                {
                    "canvas": [
                        {
                            "type": "line",
                            "x1": 40,
                            "y1": 20,
                            "x2": 550,
                            "y2": 20,
                            "lineWidth": 0.5,
                            "lineColor": "#999999"
                        }
                    ]
                },
                {
                    "text": "This is a computer generated invoice. E&OE.",
                    "style": "footertext"
                }
            ];
        }
    };
};


export const generatePdfDefinition2 = (data) => {
    return {
        content: [
            {
                "text": "RISHABH STEEL CENTRE",
                "style": "companyName"
            },
            {
                "text": "Specialist in: Wholesale in Utensils and All Items",
                "style": "companyService"
            },
            {
                "text": "A - 22, Sujata Shopping Centre, Navghar Road, Bhayandar (E), Dist. Thane - 401 105",
                "style": "companyAddress"
            },
            {
                "text": "Mobile: 9322674294 | 9137248501 | 9987798562",
                "style": "companyContact"
            },
            {
                "canvas": [
                    {
                        "type": "line",
                        "x1": 0,
                        "y1": 0,
                        "x2": 515,
                        "y2": 0,
                        "lineWidth": 1,
                        "lineColor": "black",
                        "margin": [0, 0, 0, 20]
                    }
                ]
            },
            { text: `Customer Name: ${data.customerName}`, style: 'customerName' },
            { text: `Mobile: ${data.customerMobile}`, style: 'customerMobile' },
            { text: `Order Number: ${data.orderNumber}`, style: 'orderNumber' },
            { text: `Date: ${data.orderDate}`, style: 'orderDate' },
            {
                style: 'tableExample',
                table: {
                    headerRows: 1,
                    widths: ['10%', '40%', '20%', '10%', '20%'],
                    body: [
                        [
                            { text: 'Sr No.', style: 'tableHeader' },
                            { text: 'Name', style: 'tableHeader' },
                            { text: 'Unit Price', style: 'tableHeader' },
                            { text: 'Qty', style: 'tableHeader' },
                            { text: 'Price', style: 'tableHeader' }
                        ],
                        ...data.orderItems.map((item, index) => [
                            `${index + 1}.`,
                            item.name,
                            `₹ ${item.productPrice}`,
                            item.quantity,
                            `₹ ${item.totalPrice}`
                        ]),
                        [
                            { text: 'Total', colSpan: 4 },
                            {},
                            {},
                            {},
                            `₹ ${data.total}`
                        ]
                    ]
                },
                "layout": {
                    "hLineWidth": function (i, node) {
                        return (i === 0 || i === node.table.body.length) ? 1 : 1;
                    },
                    "vLineWidth": function (i) {
                        return 1;
                    },
                    "hLineColor": function (i) {
                        return "black";
                    },
                    "vLineColor": function (i) {
                        return "black";
                    },
                    "paddingLeft": function () {
                        return 5;
                    },
                    "paddingRight": function () {
                        return 5;
                    },
                    "paddingTop": function () {
                        return 5;
                    },
                    "paddingBottom": function () {
                        return 5;
                    }
                }
            }
        ],
        "styles": {
          "companyName": {
            fontSize: 30,
            bold: true,
            alignment: "center",
            margin: [0, 20, 0, 5]
          },
          "companyService": {
            fontSize: 18,
            bold: true,
            alignment: "center",
            margin: [0, 0, 0, 5]
          },
          "companyAddress": {
            fontSize: 14,
            alignment: "center",
            margin: [0, 0, 0, 10]
          },
          "companyContact": {
            fontSize: 14,
            alignment: "center",
            bold: true,
            margin: [0, 0, 0, 10]
          },
          "invoiceNumber": {
            fontSize: 16,
            color: "red",
            bold: true,
            alignment: "center",
            margin: [0, 0, 0, 10]
          },
          "customerName": {
            fontSize: 14,
            margin: [0, 20, 0, 0]
          },
          "customerMobile": {
            fontSize: 14,
            margin: [0, 5, 0, 10]
          },
          "orderNumber": {
            fontSize: 14,
            bold: true,
            margin: [0, 20, 0, 0]
          },
          "orderDate": {
            fontSize: 14,
            bold: true,
            margin: [0, 5, 0, 10]
          },
          "tableExample": {
            fontSize: 14,
            margin: [0, 10, 0, 15],
            width: "100%",
            border: [true, true, true, true]
          },
          "tableHeader": {
            bold: true,
            alignment: "left"
          },
          "footertext": {
            fontSize: 12,
            alignment: "center",
            margin: [0, 5, 0, 0]
          }
        },
        pageSize: 'A4',
        pageMargins: [40, 60, 40, 60],
        footer: function (currentPage, pageCount) {
            return [
                {
                    "canvas": [
                        {
                            "type": "line",
                            "x1": 40,
                            "y1": 30,
                            "x2": 550,
                            "y2": 30,
                            "lineWidth": 1,
                            "lineColor": "black"
                        }
                    ]
                },
                {
                    "text": "It is a system generated receipt, no signature required",
                    "style": "footertext"
                }
            ];
        }
    };
};
