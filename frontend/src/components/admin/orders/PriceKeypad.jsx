import React, { useState } from 'react';
import { Box, Button, IconButton, Paper, Typography, Slide } from '@mui/material';
import { Dialpad, Close, Backspace } from '@mui/icons-material';

const PriceKeypad = ({ value, onDigit, onBackspace, onClear }) => {
    const [open, setOpen] = useState(false);
    const [pressed, setPressed] = useState(null);

    const handlePress = (key, action) => {
        setPressed(key);
        action();
        setTimeout(() => setPressed(null), 120);
    };

    const btn = (label, action, sx = {}) => (
        <Button
            key={label}
            variant="text"
            onMouseDown={() => handlePress(label, action)}
            sx={{
                minWidth: 0, width: 60, height: 52,
                fontSize: '1.35rem', fontWeight: 600,
                borderRadius: '50%',
                color: '#1a1a2e',
                bgcolor: pressed === label ? '#e3e8f0' : 'transparent',
                transition: 'all 0.1s ease',
                '&:hover': { bgcolor: '#f0f2f5' },
                '&:active': { transform: 'scale(0.92)', bgcolor: '#e3e8f0' },
                ...sx,
            }}
            data-testid={`keypad-${label}`}
        >
            {label}
        </Button>
    );

    return (
        <>
            <IconButton
                onClick={() => setOpen(!open)}
                sx={{
                    position: 'fixed', bottom: 24, right: 24, zIndex: 1400,
                    width: 56, height: 56,
                    bgcolor: open ? '#ef5350' : '#1976d2',
                    color: '#fff',
                    boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
                    '&:hover': { bgcolor: open ? '#c62828' : '#1565c0' },
                    transition: 'all 0.2s ease',
                }}
                data-testid="keypad-toggle"
            >
                {open ? <Close /> : <Dialpad />}
            </IconButton>

            <Slide direction="up" in={open} mountOnEnter unmountOnExit>
                <Paper
                    elevation={12}
                    sx={{
                        position: 'fixed', bottom: 90, right: 16, zIndex: 1400,
                        width: 224, borderRadius: 4, overflow: 'hidden',
                        bgcolor: '#fff',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
                    }}
                    data-testid="keypad-panel"
                >
                    {/* Display */}
                    <Box sx={{
                        px: 2.5, py: 2, bgcolor: '#1a1a2e',
                        display: 'flex', alignItems: 'baseline', justifyContent: 'flex-end', gap: 0.5,
                    }}>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', fontWeight: 500, mr: 'auto' }}>PRICE</Typography>
                        <Typography sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '1.1rem', fontWeight: 500 }}>{'\u20B9'}</Typography>
                        <Typography sx={{ color: '#fff', fontSize: '2rem', fontWeight: 700, fontFamily: "'SF Mono', 'Roboto Mono', monospace", letterSpacing: 1, lineHeight: 1 }}>
                            {value || '0'}
                        </Typography>
                    </Box>

                    {/* Calculator layout — numbers from bottom up */}
                    <Box sx={{ p: 1.5, display: 'flex', flexDirection: 'column', gap: 0.25 }}>
                        {/* Row: 7 8 9 */}
                        <Box sx={{ display: 'flex', justifyContent: 'space-evenly' }}>
                            {[7, 8, 9].map(d => btn(d, () => onDigit(d)))}
                        </Box>
                        {/* Row: 4 5 6 */}
                        <Box sx={{ display: 'flex', justifyContent: 'space-evenly' }}>
                            {[4, 5, 6].map(d => btn(d, () => onDigit(d)))}
                        </Box>
                        {/* Row: 1 2 3 */}
                        <Box sx={{ display: 'flex', justifyContent: 'space-evenly' }}>
                            {[1, 2, 3].map(d => btn(d, () => onDigit(d)))}
                        </Box>
                        {/* Row: CLR 0 ⌫ */}
                        <Box sx={{ display: 'flex', justifyContent: 'space-evenly' }}>
                            {btn('C', onClear, { fontSize: '0.9rem', color: '#9e9e9e', fontWeight: 700 })}
                            {btn(0, () => onDigit(0))}
                            {btn(<Backspace sx={{ fontSize: 20 }} />, onBackspace, { color: '#e53935' })}
                        </Box>
                    </Box>
                </Paper>
            </Slide>
        </>
    );
};

export default PriceKeypad;
