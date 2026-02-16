import { createContext, useContext, useState, useCallback } from 'react';
import { Alert, Box, Typography, IconButton, Slide, Badge } from '@mui/material';
import { 
    CheckCircle, Warning, Error, Info, Close, 
    TrendingUp, TrendingDown, Receipt, Payment,
    Notifications
} from '@mui/icons-material';

// Create context for notifications
const NotificationContext = createContext(null);

// Notification types with icons and colors
const NOTIFICATION_CONFIG = {
    success: { icon: CheckCircle, color: 'success', bgcolor: '#e8f5e9' },
    warning: { icon: Warning, color: 'warning', bgcolor: '#fff3e0' },
    error: { icon: Error, color: 'error', bgcolor: '#ffebee' },
    info: { icon: Info, color: 'info', bgcolor: '#e3f2fd' },
    sale: { icon: Receipt, color: 'primary', bgcolor: '#e3f2fd' },
    payment: { icon: Payment, color: 'success', bgcolor: '#e8f5e9' },
    trend_up: { icon: TrendingUp, color: 'success', bgcolor: '#e8f5e9' },
    trend_down: { icon: TrendingDown, color: 'warning', bgcolor: '#fff3e0' },
};

function SlideTransition(props) {
    return <Slide {...props} direction="left" />;
}

export const NotificationProvider = ({ children }) => {
    const [notifications, setNotifications] = useState([]);
    const [history, setHistory] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);

    // Add a notification
    const notify = useCallback((message, type = 'info', options = {}) => {
        const id = Date.now() + Math.random();
        const notification = {
            id,
            message,
            type,
            timestamp: new Date(),
            duration: options.duration || 4000,
            action: options.action || null,
            persistent: options.persistent || false,
        };

        setNotifications(prev => [...prev, notification]);
        setHistory(prev => [notification, ...prev].slice(0, 50)); // Keep last 50
        setUnreadCount(prev => prev + 1);

        if (!notification.persistent) {
            setTimeout(() => {
                setNotifications(prev => prev.filter(n => n.id !== id));
            }, notification.duration);
        }

        return id;
    }, []);

    // Remove a notification
    const dismiss = useCallback((id) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    // Clear all notifications
    const clearAll = useCallback(() => {
        setNotifications([]);
    }, []);

    // Mark all as read
    const markAllRead = useCallback(() => {
        setUnreadCount(0);
    }, []);

    // Shorthand methods
    const success = useCallback((msg, opts) => notify(msg, 'success', opts), [notify]);
    const warning = useCallback((msg, opts) => notify(msg, 'warning', opts), [notify]);
    const error = useCallback((msg, opts) => notify(msg, 'error', opts), [notify]);
    const info = useCallback((msg, opts) => notify(msg, 'info', opts), [notify]);
    const sale = useCallback((msg, opts) => notify(msg, 'sale', opts), [notify]);
    const payment = useCallback((msg, opts) => notify(msg, 'payment', opts), [notify]);

    return (
        <NotificationContext.Provider value={{
            notify, dismiss, clearAll, markAllRead,
            success, warning, error, info, sale, payment,
            history, unreadCount, notifications
        }}>
            {children}
            
            {/* Notification Stack */}
            <Box sx={{ 
                position: 'fixed', 
                top: 80, 
                right: 20, 
                zIndex: 9999,
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
                maxWidth: 400
            }}>
                {notifications.map((notification, index) => {
                    const config = NOTIFICATION_CONFIG[notification.type] || NOTIFICATION_CONFIG.info;
                    const IconComponent = config.icon;
                    
                    return (
                        <Slide key={notification.id} direction="left" in={true} timeout={300}>
                            <Alert
                                severity={config.color === 'primary' ? 'info' : config.color}
                                icon={<IconComponent />}
                                onClose={() => dismiss(notification.id)}
                                sx={{
                                    bgcolor: config.bgcolor,
                                    boxShadow: 3,
                                    borderRadius: 2,
                                    '& .MuiAlert-message': { width: '100%' }
                                }}
                                action={
                                    <IconButton size="small" onClick={() => dismiss(notification.id)}>
                                        <Close fontSize="small" />
                                    </IconButton>
                                }
                            >
                                <Typography variant="body2" sx={{ fontWeight: 500 }}>
                                    {notification.message}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                    {notification.timestamp.toLocaleTimeString()}
                                </Typography>
                            </Alert>
                        </Slide>
                    );
                })}
            </Box>
        </NotificationContext.Provider>
    );
};

// Hook to use notifications
export const useNotifications = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotifications must be used within NotificationProvider');
    }
    return context;
};

// Notification Bell Component for header
export const NotificationBell = () => {
    const { history, unreadCount, markAllRead } = useNotifications();
    const [open, setOpen] = useState(false);

    const handleOpen = () => {
        setOpen(true);
        markAllRead();
    };

    return (
        <Box sx={{ position: 'relative' }}>
            <IconButton onClick={handleOpen} color="inherit" data-testid="notification-bell">
                <Badge badgeContent={unreadCount} color="error">
                    <Notifications />
                </Badge>
            </IconButton>
            
            {open && (
                <Box
                    sx={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        width: 320,
                        maxHeight: 400,
                        overflow: 'auto',
                        bgcolor: 'white',
                        boxShadow: 4,
                        borderRadius: 2,
                        mt: 1,
                        zIndex: 1300
                    }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <Box sx={{ p: 2, borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between' }}>
                        <Typography variant="subtitle2" fontWeight="bold">Notifications</Typography>
                        <IconButton size="small" onClick={() => setOpen(false)}>
                            <Close fontSize="small" />
                        </IconButton>
                    </Box>
                    
                    {history.length === 0 ? (
                        <Box sx={{ p: 3, textAlign: 'center' }}>
                            <Typography color="text.secondary">No notifications</Typography>
                        </Box>
                    ) : (
                        history.slice(0, 10).map((n) => {
                            const config = NOTIFICATION_CONFIG[n.type] || NOTIFICATION_CONFIG.info;
                            const IconComponent = config.icon;
                            return (
                                <Box key={n.id} sx={{ p: 1.5, borderBottom: '1px solid #f5f5f5', '&:hover': { bgcolor: '#fafafa' } }}>
                                    <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-start' }}>
                                        <IconComponent sx={{ color: `${config.color}.main`, fontSize: 18, mt: 0.3 }} />
                                        <Box sx={{ flex: 1 }}>
                                            <Typography variant="body2">{n.message}</Typography>
                                            <Typography variant="caption" color="text.secondary">
                                                {n.timestamp.toLocaleTimeString()}
                                            </Typography>
                                        </Box>
                                    </Box>
                                </Box>
                            );
                        })
                    )}
                </Box>
            )}
        </Box>
    );
};

export default NotificationProvider;
