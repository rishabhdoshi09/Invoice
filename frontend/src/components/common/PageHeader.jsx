import { Box, Typography } from '@mui/material';

/**
 * Shared page header — one consistent title block across every page.
 *
 *   <PageHeader
 *     title="Customers"
 *     subtitle="Track balances, receipts and ledgers"
 *     icon={<People />}
 *     actions={<Button …>Add Customer</Button>}
 *   />
 */
export const PageHeader = ({ title, subtitle, icon, actions, sx }) => (
    <Box sx={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 1.5, mb: 2.5, ...sx,
    }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, minWidth: 0 }}>
            {icon && (
                <Box sx={{
                    width: 40, height: 40, borderRadius: 2, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    bgcolor: '#DBEAFE', color: '#1565C0',
                }}>
                    {icon}
                </Box>
            )}
            <Box sx={{ minWidth: 0 }}>
                <Typography variant="h5" sx={{ fontWeight: 800, letterSpacing: '-0.01em', lineHeight: 1.25 }} noWrap>
                    {title}
                </Typography>
                {subtitle && (
                    <Typography variant="body2" color="text.secondary" noWrap>
                        {subtitle}
                    </Typography>
                )}
            </Box>
        </Box>
        {actions && (
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                {actions}
            </Box>
        )}
    </Box>
);

export default PageHeader;
