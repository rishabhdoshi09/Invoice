import { Box, Button, Card, CardContent, Typography, Grid } from '@mui/material';
import { Download } from '@mui/icons-material';

export const TallyExport = () => {
    const handleDownload = (type) => {
        const url = `/api/export/tally/${type}`;
        window.open(url, '_blank');
    };

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h5" sx={{ mb: 3 }}>Tally Export</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                Export your data in CSV format for importing into Tally software
            </Typography>

            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" sx={{ mb: 1 }}>Sales Export</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                Export all sales orders/invoices with customer details, items, and tax calculations
                            </Typography>
                            <Button 
                                variant="contained" 
                                startIcon={<Download />}
                                onClick={() => handleDownload('sales')}
                                fullWidth
                            >
                                Download Sales CSV
                            </Button>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" sx={{ mb: 1 }}>Purchases Export</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                Export all purchase bills with supplier details, items, and tax calculations
                            </Typography>
                            <Button 
                                variant="contained" 
                                startIcon={<Download />}
                                onClick={() => handleDownload('purchases')}
                                fullWidth
                            >
                                Download Purchases CSV
                            </Button>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" sx={{ mb: 1 }}>Payments Export</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                Export all payment records with party details and references
                            </Typography>
                            <Button 
                                variant="contained" 
                                startIcon={<Download />}
                                onClick={() => handleDownload('payments')}
                                fullWidth
                            >
                                Download Payments CSV
                            </Button>
                        </CardContent>
                    </Card>
                </Grid>

                <Grid item xs={12} md={6}>
                    <Card>
                        <CardContent>
                            <Typography variant="h6" sx={{ mb: 1 }}>Outstanding Export</Typography>
                            <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                                Export all outstanding receivables and payables
                            </Typography>
                            <Button 
                                variant="contained" 
                                startIcon={<Download />}
                                onClick={() => handleDownload('outstanding')}
                                fullWidth
                            >
                                Download Outstanding CSV
                            </Button>
                        </CardContent>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
};