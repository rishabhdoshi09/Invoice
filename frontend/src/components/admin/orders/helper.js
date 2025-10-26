
export const generatePdfDefinition = (data) => {
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
                "style": "invoiceNumber"
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
                            { text: 'Subtotal', colSpan: 4 },
                            {},
                            {},
                            {},
                            `₹ ${data.subTotal}`
                        ],
                        [
                            { text: `Tax (${data.taxPercent}%)`, colSpan: 4 },
                            {},
                            {},
                            {},
                            `₹ ${data.tax}`
                        ],
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