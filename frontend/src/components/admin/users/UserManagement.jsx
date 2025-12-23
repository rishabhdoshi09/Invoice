import React, { useState, useEffect } from 'react';
import {
    Box,
    Card,
    CardContent,
    Typography,
    Button,
    TextField,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Chip,
    IconButton,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Alert,
    CircularProgress,
    Switch,
    FormControlLabel,
    Grid
} from '@mui/material';
import {
    Add,
    Edit,
    Delete,
    Refresh,
    PersonAdd,
    AdminPanelSettings,
    Person
} from '@mui/icons-material';
import { useAuth } from '../../../context/AuthContext';
import * as authService from '../../../services/auth';

export const UserManagement = () => {
    const { user: currentUser, isAdmin } = useAuth();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    // Dialog states
    const [createDialog, setCreateDialog] = useState(false);
    const [editDialog, setEditDialog] = useState(false);
    const [deleteDialog, setDeleteDialog] = useState(false);
    const [selectedUser, setSelectedUser] = useState(null);

    // Form state
    const [formData, setFormData] = useState({
        username: '',
        password: '',
        name: '',
        email: '',
        role: 'billing_staff',
        isActive: true
    });

    const fetchUsers = async () => {
        setLoading(true);
        setError('');
        try {
            const data = await authService.listUsers();
            setUsers(data);
        } catch (err) {
            setError(err.toString());
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isAdmin) {
            fetchUsers();
        }
    }, [isAdmin]);

    const resetForm = () => {
        setFormData({
            username: '',
            password: '',
            name: '',
            email: '',
            role: 'billing_staff',
            isActive: true
        });
    };

    const handleCreateOpen = () => {
        resetForm();
        setCreateDialog(true);
    };

    const handleEditOpen = (user) => {
        setSelectedUser(user);
        setFormData({
            username: user.username,
            password: '', // Don't show password
            name: user.name,
            email: user.email || '',
            role: user.role,
            isActive: user.isActive
        });
        setEditDialog(true);
    };

    const handleDeleteOpen = (user) => {
        setSelectedUser(user);
        setDeleteDialog(true);
    };

    const handleCreate = async () => {
        setError('');
        setSuccess('');
        
        if (!formData.username || !formData.password || !formData.name) {
            setError('Username, password, and name are required');
            return;
        }

        if (formData.password.length < 6) {
            setError('Password must be at least 6 characters');
            return;
        }

        try {
            await authService.createUser({
                username: formData.username,
                password: formData.password,
                name: formData.name,
                email: formData.email || undefined,
                role: formData.role
            });
            setSuccess('User created successfully!');
            setCreateDialog(false);
            resetForm();
            fetchUsers();
        } catch (err) {
            setError(err.toString());
        }
    };

    const handleUpdate = async () => {
        setError('');
        setSuccess('');

        if (!formData.name) {
            setError('Name is required');
            return;
        }

        try {
            const updates = {
                name: formData.name,
                email: formData.email || undefined,
                role: formData.role,
                isActive: formData.isActive
            };

            // Only include password if changed
            if (formData.password && formData.password.length > 0) {
                if (formData.password.length < 6) {
                    setError('Password must be at least 6 characters');
                    return;
                }
                updates.password = formData.password;
            }

            await authService.updateUser(selectedUser.id, updates);
            setSuccess('User updated successfully!');
            setEditDialog(false);
            setSelectedUser(null);
            resetForm();
            fetchUsers();
        } catch (err) {
            setError(err.toString());
        }
    };

    const handleDelete = async () => {
        setError('');
        setSuccess('');

        try {
            await authService.deleteUser(selectedUser.id);
            setSuccess('User deleted successfully!');
            setDeleteDialog(false);
            setSelectedUser(null);
            fetchUsers();
        } catch (err) {
            setError(err.toString());
        }
    };

    if (!isAdmin) {
        return (
            <Box sx={{ p: 3 }}>
                <Alert severity="warning">
                    Admin access required to manage users.
                </Alert>
            </Box>
        );
    }

    return (
        <Box sx={{ p: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4">
                    👥 User Management
                </Typography>
                <Box sx={{ display: 'flex', gap: 1 }}>
                    <Button
                        startIcon={<Refresh />}
                        onClick={fetchUsers}
                        variant="outlined"
                    >
                        Refresh
                    </Button>
                    <Button
                        startIcon={<PersonAdd />}
                        onClick={handleCreateOpen}
                        variant="contained"
                        color="primary"
                    >
                        Add User
                    </Button>
                </Box>
            </Box>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError('')}>
                    {error}
                </Alert>
            )}

            {success && (
                <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>
                    {success}
                </Alert>
            )}

            {loading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                    <CircularProgress />
                </Box>
            ) : (
                <TableContainer component={Paper}>
                    <Table>
                        <TableHead>
                            <TableRow sx={{ bgcolor: '#f5f5f5' }}>
                                <TableCell><strong>Name</strong></TableCell>
                                <TableCell><strong>Username</strong></TableCell>
                                <TableCell><strong>Email</strong></TableCell>
                                <TableCell><strong>Role</strong></TableCell>
                                <TableCell><strong>Status</strong></TableCell>
                                <TableCell><strong>Last Login</strong></TableCell>
                                <TableCell><strong>Actions</strong></TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {users.map((user) => (
                                <TableRow key={user.id} hover>
                                    <TableCell>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            {user.role === 'admin' ? (
                                                <AdminPanelSettings color="warning" />
                                            ) : (
                                                <Person color="action" />
                                            )}
                                            {user.name}
                                            {user.id === currentUser?.id && (
                                                <Chip label="You" size="small" color="info" />
                                            )}
                                        </Box>
                                    </TableCell>
                                    <TableCell>{user.username}</TableCell>
                                    <TableCell>{user.email || '-'}</TableCell>
                                    <TableCell>
                                        <Chip
                                            label={user.role === 'admin' ? '👑 Admin' : '👤 Billing Staff'}
                                            size="small"
                                            color={user.role === 'admin' ? 'warning' : 'default'}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            label={user.isActive ? 'Active' : 'Inactive'}
                                            size="small"
                                            color={user.isActive ? 'success' : 'error'}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        {user.lastLogin 
                                            ? new Date(user.lastLogin).toLocaleString()
                                            : 'Never'
                                        }
                                    </TableCell>
                                    <TableCell>
                                        <IconButton
                                            size="small"
                                            onClick={() => handleEditOpen(user)}
                                            title="Edit User"
                                        >
                                            <Edit />
                                        </IconButton>
                                        {user.id !== currentUser?.id && (
                                            <IconButton
                                                size="small"
                                                onClick={() => handleDeleteOpen(user)}
                                                title="Delete User"
                                                color="error"
                                            >
                                                <Delete />
                                            </IconButton>
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))}
                            {users.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} align="center">
                                        <Typography color="text.secondary">
                                            No users found
                                        </Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Create User Dialog */}
            <Dialog open={createDialog} onClose={() => setCreateDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <PersonAdd />
                        Create New User
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Full Name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                label="Username"
                                value={formData.username}
                                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                required
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                label="Password"
                                type="password"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                required
                                helperText="Minimum 6 characters"
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                label="Email (Optional)"
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <FormControl fullWidth>
                                <InputLabel>Role</InputLabel>
                                <Select
                                    value={formData.role}
                                    label="Role"
                                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                >
                                    <MenuItem value="billing_staff">
                                        👤 Billing Staff (Create & View only)
                                    </MenuItem>
                                    <MenuItem value="admin">
                                        👑 Admin (Full Access)
                                    </MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setCreateDialog(false)}>Cancel</Button>
                    <Button onClick={handleCreate} variant="contained" color="primary">
                        Create User
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Edit User Dialog */}
            <Dialog open={editDialog} onClose={() => setEditDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Edit />
                        Edit User: {selectedUser?.name}
                    </Box>
                </DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Full Name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                label="Username"
                                value={formData.username}
                                disabled
                                helperText="Username cannot be changed"
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                label="New Password"
                                type="password"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                helperText="Leave blank to keep current"
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <TextField
                                fullWidth
                                label="Email"
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6}>
                            <FormControl fullWidth>
                                <InputLabel>Role</InputLabel>
                                <Select
                                    value={formData.role}
                                    label="Role"
                                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                                >
                                    <MenuItem value="billing_staff">
                                        👤 Billing Staff
                                    </MenuItem>
                                    <MenuItem value="admin">
                                        👑 Admin
                                    </MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12}>
                            <FormControlLabel
                                control={
                                    <Switch
                                        checked={formData.isActive}
                                        onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                    />
                                }
                                label={formData.isActive ? "Active (can login)" : "Inactive (cannot login)"}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setEditDialog(false)}>Cancel</Button>
                    <Button onClick={handleUpdate} variant="contained" color="primary">
                        Save Changes
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteDialog} onClose={() => setDeleteDialog(false)}>
                <DialogTitle>
                    ⚠️ Delete User
                </DialogTitle>
                <DialogContent>
                    <Typography>
                        Are you sure you want to delete <strong>{selectedUser?.name}</strong> ({selectedUser?.username})?
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        This action cannot be undone. The user will no longer be able to access the system.
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialog(false)}>Cancel</Button>
                    <Button onClick={handleDelete} variant="contained" color="error">
                        Delete User
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
};

export default UserManagement;
