import { useState, useEffect, useCallback } from 'react';
import {
    Dialog, DialogTitle, DialogContent, Box, Typography, Grid,
    List, ListItem, IconButton, Chip, Paper
} from '@mui/material';
import { Close, Keyboard } from '@mui/icons-material';

// All keyboard shortcuts in the application
const SHORTCUTS = [
    { category: 'Global', shortcuts: [
        { keys: ['Ctrl', 'K'], description: 'Open global search' },
        { keys: ['Esc'], description: 'Close dialogs/search' },
    ]},
    { category: 'Order Creation', shortcuts: [
        { keys: ['='], description: 'Fetch weight from scale & add item' },
        { keys: ['/'], description: 'Fetch weight from scale' },
        { keys: ['Shift', 'D'], description: 'Delete last item' },
        { keys: ['Ctrl', 'P'], description: 'Print invoice' },
        { keys: ['1'], description: 'Quick select Dabba product' },
    ]},
    { category: 'Navigation', shortcuts: [
        { keys: ['↑', '↓'], description: 'Navigate in lists/search results' },
        { keys: ['Enter'], description: 'Select/confirm' },
        { keys: ['Tab'], description: 'Move between fields' },
    ]},
    { category: 'Data Entry', shortcuts: [
        { keys: ['Caps Lock'], description: 'Override tens digit protection (Admin)' },
    ]},
];

export const KeyboardShortcutsHelp = ({ open, onClose }) => {
    return (
        <Dialog 
            open={open} 
            onClose={onClose} 
            maxWidth="md" 
            fullWidth
            PaperProps={{ sx: { borderRadius: 3 } }}
        >
            <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Keyboard color="primary" />
                    <Typography variant="h6" fontWeight="bold">Keyboard Shortcuts</Typography>
                </Box>
                <IconButton onClick={onClose} size="small">
                    <Close />
                </IconButton>
            </DialogTitle>
            <DialogContent>
                <Grid container spacing={3}>
                    {SHORTCUTS.map((category, idx) => (
                        <Grid item xs={12} md={6} key={idx}>
                            <Paper variant="outlined" sx={{ p: 2, borderRadius: 2, height: '100%' }}>
                                <Typography variant="subtitle2" fontWeight="bold" color="primary" sx={{ mb: 1.5 }}>
                                    {category.category}
                                </Typography>
                                <List dense disablePadding>
                                    {category.shortcuts.map((shortcut, sIdx) => (
                                        <ListItem key={sIdx} disablePadding sx={{ py: 0.5 }}>
                                            <Box sx={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
                                                <Box sx={{ display: 'flex', gap: 0.5 }}>
                                                    {shortcut.keys.map((key, kIdx) => (
                                                        <Box key={kIdx} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                                            <Chip
                                                                label={key}
                                                                size="small"
                                                                sx={{
                                                                    bgcolor: '#f5f5f5',
                                                                    fontFamily: 'monospace',
                                                                    fontWeight: 'bold',
                                                                    fontSize: '0.75rem',
                                                                    height: 24,
                                                                    borderRadius: 1
                                                                }}
                                                            />
                                                            {kIdx < shortcut.keys.length - 1 && (
                                                                <Typography variant="caption" color="text.secondary">+</Typography>
                                                            )}
                                                        </Box>
                                                    ))}
                                                </Box>
                                                <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'right' }}>
                                                    {shortcut.description}
                                                </Typography>
                                            </Box>
                                        </ListItem>
                                    ))}
                                </List>
                            </Paper>
                        </Grid>
                    ))}
                </Grid>
                
                <Box sx={{ mt: 3, p: 2, bgcolor: '#f5f5f5', borderRadius: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                        <strong>Pro Tip:</strong> Press <Chip label="?" size="small" sx={{ height: 18, fontSize: '0.65rem', mx: 0.5 }} /> 
                        anywhere in the app to open this help dialog.
                    </Typography>
                </Box>
            </DialogContent>
        </Dialog>
    );
};

// Hook to handle '?' key for opening shortcuts help
export const useKeyboardShortcutsHelp = () => {
    const [helpOpen, setHelpOpen] = useState(false);

    const handleKeyDown = useCallback((e) => {
        // Check if '?' key is pressed (Shift + /)
        if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
            // Don't trigger in input fields
            const target = e.target;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
                return;
            }
            e.preventDefault();
            setHelpOpen(true);
        }
    }, []);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    return {
        helpOpen,
        setHelpOpen,
        openHelp: () => setHelpOpen(true),
        closeHelp: () => setHelpOpen(false)
    };
};

export default KeyboardShortcutsHelp;
