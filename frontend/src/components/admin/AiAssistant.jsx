import React, { useState, useRef, useEffect } from 'react';
import {
    Box, Fab, Paper, Typography, TextField, IconButton,
    CircularProgress, Collapse, Divider, Tooltip, Chip
} from '@mui/material';
import {
    AutoAwesome, Close, Send, DeleteOutline, SmartToy
} from '@mui/icons-material';
import axios from 'axios';

const STORAGE_KEY = 'ai_chat_history';

const loadHistory = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch { return []; }
};

const saveHistory = (history) => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(history.slice(-20))); }
    catch {}
};

const SUGGESTIONS = [
    'Aaj kitna sale hua?',
    'Kitna cash drawer mein hona chahiye?',
    'Sabse zyada due customer kaun hai?',
    'Last 7 din ki sales dikhao',
];

export const AiAssistant = () => {
    const [open, setOpen] = useState(false);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [messages, setMessages] = useState(loadHistory);
    const [error, setError] = useState('');
    const bottomRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [open]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, loading]);

    useEffect(() => {
        saveHistory(messages);
    }, [messages]);

    const send = async (text) => {
        const question = (text || input).trim();
        if (!question) return;
        setInput('');
        setError('');

        const userMsg = { role: 'user', content: question };
        setMessages(prev => [...prev, userMsg]);
        setLoading(true);

        try {
            const token = localStorage.getItem('token');
            // Send only assistant/user turns (not system) as history
            const history = messages
                .filter(m => m.role !== 'system')
                .slice(-6)
                .map(m => ({ role: m.role, content: m.content }));

            const { data } = await axios.post('/api/ai/chat', {
                message: question,
                history,
            }, { headers: { Authorization: `Bearer ${token}` } });

            setMessages(prev => [...prev, { role: 'assistant', content: data.data.reply }]);
        } catch (err) {
            const msg = err.response?.data?.message || 'Connection error. Is the backend running?';
            setError(msg);
            setMessages(prev => prev.slice(0, -1)); // remove user message on error
        } finally {
            setLoading(false);
        }
    };

    const clearChat = () => {
        setMessages([]);
        localStorage.removeItem(STORAGE_KEY);
        setError('');
    };

    return (
        <>
            {/* Floating button */}
            <Tooltip title="AI Business Assistant" placement="left">
                <Fab
                    onClick={() => setOpen(p => !p)}
                    sx={{
                        position: 'fixed', bottom: 24, right: 24,
                        bgcolor: open ? '#333' : '#6200ea',
                        color: '#fff', zIndex: 1400,
                        '&:hover': { bgcolor: open ? '#555' : '#4a00b4' },
                        boxShadow: '0 4px 20px rgba(98,0,234,0.4)',
                    }}
                >
                    {open ? <Close /> : <AutoAwesome />}
                </Fab>
            </Tooltip>

            {/* Chat window */}
            <Collapse
                in={open}
                timeout={200}
                sx={{ position: 'fixed', bottom: 90, right: 24, zIndex: 1399 }}
            >
                <Paper elevation={8} sx={{
                    width: 360, maxHeight: 520, display: 'flex', flexDirection: 'column',
                    borderRadius: 3, overflow: 'hidden',
                    border: '1px solid #6200ea22',
                }}>
                    {/* Header */}
                    <Box sx={{
                        bgcolor: '#6200ea', color: '#fff', px: 2, py: 1.2,
                        display: 'flex', alignItems: 'center', gap: 1
                    }}>
                        <SmartToy sx={{ fontSize: 20 }} />
                        <Box sx={{ flex: 1 }}>
                            <Typography fontWeight={700} fontSize="0.9rem">AI Assistant</Typography>
                            <Typography variant="caption" sx={{ opacity: 0.75, fontSize: '0.7rem' }}>
                                Powered by DeepSeek
                            </Typography>
                        </Box>
                        {messages.length > 0 && (
                            <Tooltip title="Clear chat">
                                <IconButton size="small" onClick={clearChat} sx={{ color: '#fff', opacity: 0.7, '&:hover': { opacity: 1 } }}>
                                    <DeleteOutline fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                        <IconButton size="small" onClick={() => setOpen(false)} sx={{ color: '#fff' }}>
                            <Close fontSize="small" />
                        </IconButton>
                    </Box>

                    {/* Messages */}
                    <Box sx={{
                        flex: 1, overflowY: 'auto', p: 1.5, display: 'flex', flexDirection: 'column', gap: 1,
                        bgcolor: '#fafafa', minHeight: 280, maxHeight: 380,
                    }}>
                        {messages.length === 0 && (
                            <Box>
                                <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, textAlign: 'center', fontSize: '0.8rem' }}>
                                    Apne business ke baare mein kuch bhi puchho
                                </Typography>
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6, justifyContent: 'center' }}>
                                    {SUGGESTIONS.map(s => (
                                        <Chip
                                            key={s}
                                            label={s}
                                            size="small"
                                            onClick={() => send(s)}
                                            sx={{ fontSize: '0.7rem', cursor: 'pointer', bgcolor: '#ede7f6', '&:hover': { bgcolor: '#d1c4e9' } }}
                                        />
                                    ))}
                                </Box>
                            </Box>
                        )}

                        {messages.map((m, i) => (
                            <Box key={i} sx={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                                <Paper
                                    elevation={0}
                                    sx={{
                                        px: 1.5, py: 1, maxWidth: '85%', borderRadius: 2,
                                        bgcolor: m.role === 'user' ? '#6200ea' : '#fff',
                                        color: m.role === 'user' ? '#fff' : 'text.primary',
                                        border: m.role === 'assistant' ? '1px solid #e0e0e0' : 'none',
                                        fontSize: '0.82rem',
                                        whiteSpace: 'pre-wrap',
                                        wordBreak: 'break-word',
                                        lineHeight: 1.5,
                                    }}
                                >
                                    {m.content}
                                </Paper>
                            </Box>
                        ))}

                        {loading && (
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <CircularProgress size={14} sx={{ color: '#6200ea' }} />
                                <Typography variant="caption" color="text.secondary">Thinking…</Typography>
                            </Box>
                        )}

                        {error && (
                            <Box sx={{ bgcolor: '#fdecea', border: '1px solid #f44336', borderRadius: 1, p: 1 }}>
                                <Typography variant="caption" color="error.main">{error}</Typography>
                            </Box>
                        )}

                        <div ref={bottomRef} />
                    </Box>

                    <Divider />

                    {/* Input */}
                    <Box sx={{ p: 1, display: 'flex', gap: 0.5, bgcolor: '#fff' }}>
                        <TextField
                            inputRef={inputRef}
                            size="small"
                            fullWidth
                            placeholder="Kuch bhi puchho…"
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                            }}
                            disabled={loading}
                            multiline
                            maxRows={3}
                            sx={{ '& .MuiOutlinedInput-root': { fontSize: '0.82rem', borderRadius: 2 } }}
                        />
                        <IconButton
                            onClick={() => send()}
                            disabled={loading || !input.trim()}
                            sx={{ color: '#6200ea', alignSelf: 'flex-end', mb: 0.25 }}
                        >
                            {loading ? <CircularProgress size={18} /> : <Send fontSize="small" />}
                        </IconButton>
                    </Box>
                </Paper>
            </Collapse>
        </>
    );
};

export default AiAssistant;
