export const generatePdfDefinition = (props) => {
  console.warn("Using placeholder PDF template 1");
  return {
    content: [
      { text: 'INVOICE (Template 1 - Placeholder)', style: 'header' },
      { text: `Customer: ${props.customerName || 'N/A'}`, margin: [0, 10, 0, 10] },
      { text: 'Please replace this file with the actual PDF generation logic.' }
    ],
    styles: {
      header: { fontSize: 18, bold: true }
    }
  };
};
