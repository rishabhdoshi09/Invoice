import { useEffect, useState, useCallback } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { styled, useTheme } from '@mui/material/styles';
import { Box, CssBaseline, Divider, IconButton, List, ListItem, ListItemButton, ListItemIcon, ListItemText, AppBar as MuiAppBar, Drawer as MuiDrawer, Toolbar, Typography, Button, Chip, Menu, MenuItem, Tooltip } from '@mui/material';
import { ChevronLeft as ChevronLeftIcon, ChevronRight as ChevronRightIcon, Folder as FolderIcon, Menu as MenuIcon, Shop, People, ShoppingCart, Payment, Assessment, CloudDownload, Dashboard, Logout, AccountCircle, Group, Today, AccountBalance, Calculate, Inventory, Search, Keyboard } from '@mui/icons-material';
import { GlobalSearch } from '../common/GlobalSearch';
import { NotificationBell } from '../common/SmartNotifications';
import { KeyboardShortcutsHelp } from '../common/KeyboardShortcuts';
import { useSelector, useDispatch } from 'react-redux';

import { Loader } from '../common/loader';
import { LoaderState } from '../../enums/loader';
import { NotificationBar } from '../common/notification';

import { listProductsAction } from '../../store/products';
import { useAuth } from '../../context/AuthContext';

const drawerWidth = 240;

const openedMixin = (theme) => ({
    width: drawerWidth,
    transition: theme.transitions.create('width', {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.enteringScreen,
    }),
    overflowX: 'hidden',
});

const closedMixin = (theme) => ({
    transition: theme.transitions.create('width', {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.leavingScreen,
    }),
    overflowX: 'hidden',
    width: `calc(${theme.spacing(7)} + 1px)`,
    [theme.breakpoints.up('sm')]: {
        width: `calc(${theme.spacing(8)} + 1px)`,
    },
});

const DrawerHeader = styled('div')(({ theme }) => ({
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    padding: theme.spacing(0, 1),
    ...theme.mixins.toolbar,
}));

const AppBar = styled(MuiAppBar, {
    shouldForwardProp: (prop) => prop !== 'open',
})(({ theme, open }) => ({
    zIndex: theme.zIndex.drawer + 1,
    transition: theme.transitions.create(['width', 'margin'], {
        easing: theme.transitions.easing.sharp,
        duration: theme.transitions.duration.leavingScreen,
    }),
    ...(open && {
        marginLeft: drawerWidth,
        width: `calc(100% - ${drawerWidth}px)`,
        transition: theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen,
        }),
    }),
}));

const Drawer = styled(MuiDrawer, { shouldForwardProp: (prop) => prop !== 'open' })(
    ({ theme, open }) => ({
        width: drawerWidth,
        flexShrink: 0,
        whiteSpace: 'nowrap',
        boxSizing: 'border-box',
        ...(open && {
            ...openedMixin(theme),
            '& .MuiDrawer-paper': openedMixin(theme),
        }),
        ...(!open && {
            ...closedMixin(theme),
            '& .MuiDrawer-paper': closedMixin(theme),
        }),
    }),
);

export const Layout = () =>  {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { loadingState } = useSelector(state => state.applicationState);
    const { user, isAdmin, logout } = useAuth();

    const theme = useTheme();

    const [open, setOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState(null);
    const [showSearch, setShowSearch] = useState(false);

    const handleDrawerOpen = () => {
        setOpen(true);
    };

    const handleDrawerClose = () => {
        setOpen(false);
    };

    const handleMenuOpen = (event) => {
        setAnchorEl(event.currentTarget);
    };

    const handleMenuClose = () => {
        setAnchorEl(null);
    };

    const handleLogout = async () => {
        handleMenuClose();
        await logout();
        navigate('/login');
    };

    // Keyboard shortcuts help dialog
    const [shortcutsOpen, setShortcutsOpen] = useState(false);

    // Global keyboard shortcut for search (Ctrl+K)
    const handleKeyDown = useCallback((e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            setShowSearch(true);
        }
    }, []);

    useEffect(() => {
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [handleKeyDown]);

    const pages = [
        {
            key: 'day-start',
            label: 'Day Start', 
            icon: <AccountBalance />,
            path: 'day-start'
        },
        {
            key: 'orders',
            label: 'Orders', 
            icon: <Shop />,
            path: 'orders'
        },
        {
            key: 'products',
            label: 'Products', 
            icon: <FolderIcon />,
            path: 'products'
        },
        {
            key: 'suppliers',
            label: 'Suppliers', 
            icon: <People />,
            path: 'suppliers'
        },
        {
            key: 'customers',
            label: 'Customers', 
            icon: <People />,
            path: 'customers'
        },
        {
            key: 'purchases',
            label: 'Purchases', 
            icon: <ShoppingCart />,
            path: 'purchases'
        },
        {
            key: 'payments',
            label: 'Payments', 
            icon: <Payment />,
            path: 'payments'
        },
        {
            key: 'daily-payments',
            label: 'Daily Payments', 
            icon: <Today />,
            path: 'daily-payments'
        },
        {
            key: 'stock',
            label: 'Stock', 
            icon: <Inventory />,
            path: 'stock'
        },
        {
            key: 'reports',
            label: 'Reports', 
            icon: <Assessment />,
            path: 'reports'
        },
        {
            key: 'tally-export',
            label: 'Tally Export', 
            icon: <CloudDownload />,
            path: 'tally-export'
        },
        {
            key: 'gst-export',
            label: 'GST Export Tool', 
            icon: <Calculate />,
            path: 'gst-export',
            adminOnly: true
        },
    ];

    // Add admin dashboard for admins
    if (isAdmin) {
        pages.push({
            key: 'users',
            label: 'Users', 
            icon: <Group />,
            path: 'users'
        });
        pages.push({
            key: 'admin-dashboard',
            label: 'Admin Dashboard', 
            icon: <Dashboard />,
            path: 'admin-dashboard'
        });
    }

    useEffect(()=>{
        dispatch(listProductsAction());
    }, [dispatch])

    return (
        <>
        <Box sx={{ display: 'flex' }}>
           
            <CssBaseline />
            <AppBar position="fixed" open={open}>
                <Toolbar>
                    <IconButton
                        color="inherit"
                        aria-label="open drawer"
                        onClick={handleDrawerOpen}
                        edge="start"
                        sx={{
                            marginRight: 5,
                            ...(open && { display: 'none' }),
                        }}
                    >
                        <MenuIcon />
                    </IconButton>
                    <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 0, mr: 2 }}>
                        { "Customer Invoicing".toUpperCase() }
                    </Typography>
                    
                    {/* Global Search */}
                    <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'center', maxWidth: 600, mx: 'auto' }}>
                        {showSearch ? (
                            <GlobalSearch onClose={() => setShowSearch(false)} />
                        ) : (
                            <Tooltip title="Search (Ctrl+K)">
                                <Button
                                    onClick={() => setShowSearch(true)}
                                    sx={{
                                        color: 'rgba(255,255,255,0.7)',
                                        bgcolor: 'rgba(255,255,255,0.1)',
                                        borderRadius: 2,
                                        px: 2,
                                        textTransform: 'none',
                                        '&:hover': { bgcolor: 'rgba(255,255,255,0.2)' }
                                    }}
                                    startIcon={<Search />}
                                    data-testid="open-search-btn"
                                >
                                    Search orders, customers... &nbsp;
                                    <Chip 
                                        label="Ctrl+K" 
                                        size="small" 
                                        sx={{ 
                                            height: 20, 
                                            fontSize: '0.65rem', 
                                            bgcolor: 'rgba(255,255,255,0.2)',
                                            color: 'white'
                                        }} 
                                    />
                                </Button>
                            </Tooltip>
                        )}
                    </Box>
                    
                    {/* User info and logout */}
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {/* Keyboard Shortcuts Help */}
                        <Tooltip title="Keyboard Shortcuts (?)">
                            <IconButton 
                                color="inherit" 
                                onClick={() => setShortcutsOpen(true)}
                                sx={{ opacity: 0.8, '&:hover': { opacity: 1 } }}
                                data-testid="keyboard-shortcuts-btn"
                            >
                                <Keyboard />
                            </IconButton>
                        </Tooltip>
                        
                        {/* Notification Bell */}
                        <NotificationBell />
                        
                        <Chip 
                            label={user?.role === 'admin' ? '👑 Admin' : '👤 Staff'} 
                            size="small"
                            color={user?.role === 'admin' ? 'warning' : 'default'}
                            sx={{ color: 'white', borderColor: 'white' }}
                            variant="outlined"
                        />
                        <Button
                            color="inherit"
                            onClick={handleMenuOpen}
                            startIcon={<AccountCircle />}
                        >
                            {user?.name || user?.username}
                        </Button>
                        <Menu
                            anchorEl={anchorEl}
                            open={Boolean(anchorEl)}
                            onClose={handleMenuClose}
                        >
                            <MenuItem disabled>
                                <Typography variant="body2" color="text.secondary">
                                    Logged in as: {user?.username}
                                </Typography>
                            </MenuItem>
                            <MenuItem disabled>
                                <Typography variant="body2" color="text.secondary">
                                    Role: {user?.role}
                                </Typography>
                            </MenuItem>
                            <Divider />
                            {isAdmin && (
                                <MenuItem onClick={() => { handleMenuClose(); navigate('/admin-dashboard'); }}>
                                    <ListItemIcon><Dashboard fontSize="small" /></ListItemIcon>
                                    Admin Dashboard
                                </MenuItem>
                            )}
                            <MenuItem onClick={handleLogout}>
                                <ListItemIcon><Logout fontSize="small" /></ListItemIcon>
                                Logout
                            </MenuItem>
                        </Menu>
                    </Box>
                </Toolbar>
            </AppBar>
            <Drawer variant="permanent" open={open}>
                <DrawerHeader>
                    <IconButton onClick={handleDrawerClose}>
                        {theme.direction === 'rtl' ? <ChevronRightIcon /> : <ChevronLeftIcon />}
                    </IconButton>
                </DrawerHeader>
                <Divider />
                <List>
                    {pages.filter(p => !p.adminOnly || isAdmin).map((pageObj) => (
                        <ListItem key={pageObj.key} disablePadding sx={{ display: 'block' }} onClick={()=>navigate(`/${pageObj.path}`)}>
                            <ListItemButton
                                sx={{
                                    minHeight: 48,
                                    justifyContent: open ? 'initial' : 'center',
                                    px: 2.5,
                                }}
                            >
                                <ListItemIcon
                                    sx={{
                                        minWidth: 0,
                                        mr: open ? 3 : 'auto',
                                        justifyContent: 'center',
                                    }}
                                >
                                    {pageObj.icon}
                                </ListItemIcon>
                                <ListItemText primary={pageObj.label.toUpperCase()} sx={{ opacity: open ? 1 : 0 }} />
                            </ListItemButton>
                        </ListItem>
                    ))}
                </List>
            </Drawer>
            <Box component="main" sx={{ flexGrow: 1, p: 3 }}>
                <DrawerHeader />
                <Loader isLoading={loadingState === LoaderState.START}/>
                <NotificationBar />
                <Outlet />
            </Box>
        </Box>
        
        {/* Keyboard Shortcuts Help Dialog */}
        <KeyboardShortcutsHelp open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        </>
    );
}
