import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar, Box, CssBaseline, Drawer, IconButton, List, ListItem,
  ListItemButton, ListItemIcon, ListItemText, Toolbar, Typography,
  Divider, Collapse, Avatar, Menu, MenuItem, Tooltip
} from '@mui/material';
import {
  Menu as MenuIcon,
  Inventory as InventoryIcon,
  Receipt as ReceiptIcon,
  People as PeopleIcon,
  LocalShipping as LocalShippingIcon,
  ShoppingCart as ShoppingCartIcon,
  Payment as PaymentIcon,
  Assessment as AssessmentIcon,
  ExpandLess,
  ExpandMore,
  AccountBalance as AccountBalanceIcon,
  Dashboard as DashboardIcon,
  Today as TodayIcon,
  AccountCircle,
  Logout,
  Person,
  ReceiptLong
} from '@mui/icons-material';
import { useAuth } from '../../../context/AuthContext';

const drawerWidth = 240;

const menuItems = [
  { text: 'Products', icon: <InventoryIcon />, path: '/products' },
  { text: 'Orders', icon: <ReceiptIcon />, path: '/orders' },
  { text: 'Create Order', icon: <ShoppingCartIcon />, path: '/orders/create' },
  { text: 'Suppliers', icon: <LocalShippingIcon />, path: '/suppliers' },
  { text: 'Customers', icon: <PeopleIcon />, path: '/customers' },
  { text: 'Purchases', icon: <ShoppingCartIcon />, path: '/purchases' },
  { text: 'Payments', icon: <PaymentIcon />, path: '/payments' },
  { text: 'Daily Payments', icon: <PaymentIcon />, path: '/daily-payments' },
  { 
    text: 'Reports', 
    icon: <AssessmentIcon />, 
    path: '/reports',
    children: [
      { text: 'Outstanding', path: '/reports/outstanding' }
    ]
  },
  { text: 'Tally Export', icon: <AccountBalanceIcon />, path: '/tally-export' },
];

const adminMenuItems = [
  { text: 'Day Start', icon: <TodayIcon />, path: '/day-start' },
  { text: 'Dashboard', icon: <DashboardIcon />, path: '/admin-dashboard' },
  { text: 'GST Export', icon: <ReceiptLong />, path: '/gst-export' },
  { text: 'User Management', icon: <Person />, path: '/users' },
];

export const Layout = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout, isAdmin } = useAuth();

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const handleMenuClick = (path) => {
    navigate(path);
    setMobileOpen(false);
  };

  const handleReportsClick = () => {
    setReportsOpen(!reportsOpen);
  };

  const handleUserMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    handleUserMenuClose();
    await logout();
    navigate('/login');
  };

  const drawer = (
    <div>
      <Toolbar>
        <Typography variant="h6" noWrap component="div">
          BizLedger
        </Typography>
      </Toolbar>
      <Divider />
      <List>
        {menuItems.map((item) => (
          item.children ? (
            <React.Fragment key={item.text}>
              <ListItemButton onClick={handleReportsClick}>
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.text} />
                {reportsOpen ? <ExpandLess /> : <ExpandMore />}
              </ListItemButton>
              <Collapse in={reportsOpen} timeout="auto" unmountOnExit>
                <List component="div" disablePadding>
                  {item.children.map((child) => (
                    <ListItemButton 
                      key={child.text}
                      sx={{ pl: 4 }}
                      selected={location.pathname === child.path}
                      onClick={() => handleMenuClick(child.path)}
                    >
                      <ListItemText primary={child.text} />
                    </ListItemButton>
                  ))}
                </List>
              </Collapse>
            </React.Fragment>
          ) : (
            <ListItem key={item.text} disablePadding>
              <ListItemButton 
                selected={location.pathname === item.path}
                onClick={() => handleMenuClick(item.path)}
              >
                <ListItemIcon>{item.icon}</ListItemIcon>
                <ListItemText primary={item.text} />
              </ListItemButton>
            </ListItem>
          )
        ))}
      </List>
      
      {isAdmin && (
        <>
          <Divider />
          <List>
            <ListItem>
              <Typography variant="caption" color="text.secondary">
                Admin
              </Typography>
            </ListItem>
            {adminMenuItems.map((item) => (
              <ListItem key={item.text} disablePadding>
                <ListItemButton 
                  selected={location.pathname === item.path}
                  onClick={() => handleMenuClick(item.path)}
                >
                  <ListItemIcon>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.text} />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </>
      )}
    </div>
  );

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <AppBar
        position="fixed"
        sx={{
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          ml: { sm: `${drawerWidth}px` },
        }}
      >
        <Toolbar>
          <IconButton
            color="inherit"
            aria-label="open drawer"
            edge="start"
            onClick={handleDrawerToggle}
            sx={{ mr: 2, display: { sm: 'none' } }}
          >
            <MenuIcon />
          </IconButton>
          <Typography variant="h6" noWrap component="div" sx={{ flexGrow: 1 }}>
            {location.pathname.split('/').pop().replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'Home'}
          </Typography>
          
          <Tooltip title={user?.name || user?.username || 'User'}>
            <IconButton onClick={handleUserMenuOpen} color="inherit">
              <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}>
                {(user?.name || user?.username || 'U')[0].toUpperCase()}
              </Avatar>
            </IconButton>
          </Tooltip>
          
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleUserMenuClose}
            onClick={handleUserMenuClose}
          >
            <MenuItem disabled>
              <AccountCircle sx={{ mr: 1 }} />
              {user?.name || user?.username}
              {isAdmin && <Typography variant="caption" sx={{ ml: 1 }}>(Admin)</Typography>}
            </MenuItem>
            <Divider />
            <MenuItem onClick={handleLogout}>
              <Logout sx={{ mr: 1 }} />
              Logout
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>
      
      <Box
        component="nav"
        sx={{ width: { sm: drawerWidth }, flexShrink: { sm: 0 } }}
      >
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', sm: 'none' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
        >
          {drawer}
        </Drawer>
        <Drawer
          variant="permanent"
          sx={{
            display: { xs: 'none', sm: 'block' },
            '& .MuiDrawer-paper': { boxSizing: 'border-box', width: drawerWidth },
          }}
          open
        >
          {drawer}
        </Drawer>
      </Box>
      
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          width: { sm: `calc(100% - ${drawerWidth}px)` },
          mt: 8
        }}
      >
        <Outlet />
      </Box>
    </Box>
  );
};

export default Layout;
