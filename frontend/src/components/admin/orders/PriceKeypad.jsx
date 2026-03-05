import React, { useState } from 'react';
import { Box, Button, IconButton, Paper, Typography, Slide } from '@mui/material';
import { Dialpad, Close, Backspace } from '@mui/icons-material';

/**
 * Floating numeric keypad for price input.
 * Toggleable — opens/closes with a FAB button.
 * Calls onInput(value) whenever the value changes.
 */
const PriceKeypad = ({ value, onInput, onSubmit }) => {
    const [open, setOpen] = useState(false);

    const handleDigit = (d) => {
        const next = (value || '') + d;
        onInput(next);
    };

    const handleDot = () => {
        const cur = value || '';
        if (cur.includes('.')) return;
        onInput(cur + '.');
    };

    const handleBackspace = () => {
        const cur = value || '';
        onInput(cur.slice(0, -1));
    };

    const handleClear = () => {
        onInput('');
    };

    const btnStyle = {
        minWidth: 0, width: 56, height: 48,
        fontSize: '1.2rem', fontWeight: 700,
        borderRadius: 2,
    };

    const digitBtn = (d) => (
        <Button
            key={d}
            variant="outlined"
            onClick={() => handleDigit(String(d))}
            sx={{ ...btnStyle, color: '#1a1a2e', borderColor: '#e0e0e0', '&:hover': { bgcolor: '#f0f0f5', borderColor: '#90caf9' } }}
            data-testid={`keypad-${d}`}
        >
            {d}
        </Button>
    );

    return (
        <>
            {/* Toggle button */}
            <IconButton
                onClick={() => setOpen(!open)}
                sx={{
                    position: 'fixed', bottom: 24, right: 24, zIndex: 1400,
                    width: 56, height: 56,
                    bgcolor: open ? '#ef5350' : '#1976d2',
                    color: '#fff',
                    boxShadow: 4,
                    '&:hover': { bgcolor: open ? '#c62828' : '#1565c0' },
                    transition: 'all 0.2s ease',
                }}
                data-testid="keypad-toggle"
            >
                {open ? <Close /> : <Dialpad />}
            </IconButton>

            {/* Keypad panel */}
            <Slide direction="up" in={open} mountOnEnter unmountOnExit>
                <Paper
                    elevation={8}
                    sx={{
                        position: 'fixed', bottom: 90, right: 16, zIndex: 1400,
                        width: 220, borderRadius: 3, overflow: 'hidden',
                        bgcolor: '#fafafa',
                    }}
                    data-testid="keypad-panel"
                >
                    {/* Display */}
                    <Box sx={{ px: 2, py: 1.5, bgcolor: '#1a1a2e', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography variant="caption" sx={{ opacity: 0.7, fontWeight: 500 }}>PRICE</Typography>
                        <Typography variant="h5" sx={{ fontWeight: 700, fontFamily: 'monospace', letterSpacing: 1 }}>
                            ₹{value || '0'}
                        </Typography>
                    </Box>

                    {/* Keys */}
                    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                        <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'center' }}>
                            {[1, 2, 3].map(digitBtn)}
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'center' }}>
                            {[4, 5, 6].map(digitBtn)}
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'center' }}>
                            {[7, 8, 9].map(digitBtn)}
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'center' }}>
                            <Button
                                variant="outlined"
                                onClick={handleDot}
                                sx={{ ...btnStyle, borderColor: '#e0e0e0', '&:hover': { bgcolor: '#f0f0f5' } }}
                                data-testid="keypad-dot"
                            >
                                .
                            </Button>
                            {digitBtn(0)}
                            <Button
                                variant="outlined"
                                onClick={handleBackspace}
                                sx={{ ...btnStyle, borderColor: '#e0e0e0', color: '#e53935', '&:hover': { bgcolor: '#fce4ec' } }}
                                data-testid="keypad-backspace"
                            >
                                <Backspace fontSize="small" />
                            </Button>
                        </Box>
                        <Box sx={{ display: 'flex', gap: 0.75, justifyContent: 'center' }}>
                            <Button
                                variant="text"
                                onClick={handleClear}
                                sx={{ ...btnStyle, flex: 1, color: '#757575', fontSize: '0.8rem' }}
                                data-testid="keypad-clear"
                            >
                                CLR
                            </Button>
                            {onSubmit && (
                                <Button
                                    variant="contained"
                                    color="success"
                                    onClick={onSubmit}
                                    sx={{ ...btnStyle, flex: 1.5, fontSize: '0.9rem' }}
                                    data-testid="keypad-done"
                                >
                                    DONE
                                </Button>
                            )}
                        </Box>
                    </Box>
                </Paper>
            </Slide>
        </>
    );
};

export default PriceKeypad;
