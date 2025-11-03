import { Box, Button, Card, CardContent, Modal, Paper, TableContainer, Table, TableHead, TableBody, TableCell, TableRow, Typography, Chip, Divider, TextField, List, ListItem, ListItemButton, ListItemText  } from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import { useState, Children, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreateProduct } from './create';
import { EditProduct } from './edit';
import { deleteProductAction } from '../../../store/products';
import { Edit as EditIcon, Search as SearchIcon } from '@mui/icons-material';


export const ListProjects = () => {  
  
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [editProductId, setEditProductId] = useState('');
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  
  const { products: { rows} } = useSelector(state => state.productState);
  
  // Separate products by price
  const highValueProducts = Object.values(rows).filter(p => p.pricePerKg >= 300);
  const regularProducts = Object.values(rows).filter(p => p.pricePerKg < 300);

  // Search functionality
  useEffect(() => {
    if (searchQuery.trim().length > 0) {
      const allProducts = Object.values(rows);
      const filtered = allProducts.filter(p => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setSearchResults(filtered);
      setShowResults(true);

      // Auto-navigate if exactly one match and it's high-value
      if (filtered.length === 1 && filtered[0].pricePerKg >= 300) {
        setTimeout(() => {
          navigate(`/products/edit-price/${filtered[0].id}`);
        }, 500);
      }
    } else {
      setSearchResults([]);
      setShowResults(false);
    }
  }, [searchQuery, rows, navigate]);

  const handleQuickEdit = (productId) => {
    navigate(`/products/edit-price/${productId}`);
  };

  return (
    <>
      <Modal
        open={open}
        onClose={()=>setOpen(false)}
      >
        <Box sx={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: "80%",
          transform: 'translate(-50%, -50%)',
          bgcolor: 'background.paper',
          boxShadow: 24,
          p: 4,
        }}>
       <EditProduct productId={editProductId} />
       </Box>
      </Modal>

      {/* Quick Search for Fast Access */}
      <Card sx={{ mb: 3, bgcolor: '#e3f2fd', border: '2px solid #1976d2' }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2, color: '#1565c0', fontWeight: 600 }}>
            🔍 Quick Price Editor Access
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Type product name to instantly open the focused price editor
          </Typography>
          <Box sx={{ position: 'relative' }}>
            <TextField
              fullWidth
              placeholder="Start typing product name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: <SearchIcon sx={{ mr: 1, color: '#1976d2' }} />,
              }}
              sx={{
                bgcolor: 'white',
                '& .MuiOutlinedInput-root': {
                  '& fieldset': {
                    borderWidth: '2px',
                  }
                }
              }}
              autoFocus
            />
            
            {/* Search Results Dropdown */}
            {showResults && searchResults.length > 0 && (
              <Paper 
                sx={{ 
                  position: 'absolute', 
                  top: '100%', 
                  left: 0, 
                  right: 0, 
                  mt: 1, 
                  maxHeight: 300, 
                  overflow: 'auto',
                  zIndex: 1000,
                  boxShadow: 3
                }}
              >
                <List>
                  {searchResults.map((product) => (
                    <ListItem key={product.id} disablePadding>
                      <ListItemButton 
                        onClick={() => handleQuickEdit(product.id)}
                        sx={{
                          bgcolor: product.pricePerKg >= 300 ? '#fff3e0' : 'white',
                          '&:hover': {
                            bgcolor: product.pricePerKg >= 300 ? '#ffe0b2' : '#f5f5f5'
                          }
                        }}
                      >
                        <ListItemText 
                          primary={
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <Typography variant="body1" sx={{ fontWeight: 500 }}>
                                {product.name}
                              </Typography>
                              <Typography 
                                variant="h6" 
                                sx={{ 
                                  fontWeight: 700, 
                                  color: product.pricePerKg >= 300 ? '#d84315' : '#666' 
                                }}
                              >
                                ₹{product.pricePerKg}
                              </Typography>
                            </Box>
                          }
                          secondary={
                            <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                              <Chip 
                                label={product.type} 
                                size="small" 
                                sx={{ fontSize: '0.7rem' }}
                              />
                              {product.pricePerKg >= 300 && (
                                <Chip 
                                  label="High Value" 
                                  size="small" 
                                  color="warning"
                                  sx={{ fontSize: '0.7rem', fontWeight: 600 }}
                                />
                              )}
                            </Box>
                          }
                        />
                      </ListItemButton>
                    </ListItem>
                  ))}
                </List>
              </Paper>
            )}

            {showResults && searchResults.length === 0 && (
              <Paper sx={{ position: 'absolute', top: '100%', left: 0, right: 0, mt: 1, p: 2, zIndex: 1000 }}>
                <Typography color="text.secondary">No products found</Typography>
              </Paper>
            )}
          </Box>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <CreateProduct />
        </CardContent>
      </Card>

      <br></br>

      {/* High-Value Products Section (≥300) */}
      {highValueProducts.length > 0 && (
        <>
          <Card sx={{ mb: 3, bgcolor: '#fff3e0', border: '2px solid #ff9800' }}>
            <CardContent>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <Typography variant="h6" sx={{ color: '#e65100', fontWeight: 600 }}>
                  ⚠️ High-Value Products (₹300+)
                </Typography>
                <Chip 
                  label={`${highValueProducts.length} products`} 
                  size="small" 
                  sx={{ ml: 2, bgcolor: '#ff9800', color: 'white' }}
                />
              </Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                These products need extra attention. Use the focused price editor to avoid mistakes.
              </Typography>
              <TableContainer component={Paper}>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell><b>Name</b></TableCell>
                      <TableCell><b>Type</b></TableCell>
                      <TableCell><b>Price / Kg</b></TableCell>
                      <TableCell><b>Actions</b></TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {
                      Children.toArray(highValueProducts.map((productObj) => {
                        return(
                          <TableRow sx={{ bgcolor: 'white' }}>
                            <TableCell sx={{ fontWeight: 600 }}>{productObj.name}</TableCell>
                            <TableCell>{productObj.type.toUpperCase()}</TableCell>
                            <TableCell>
                              <Typography variant="body1" sx={{ fontWeight: 700, color: '#d84315', fontSize: '1.1rem' }}>
                                ₹{productObj.pricePerKg}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <Button 
                                variant='contained' 
                                color="warning"
                                startIcon={<EditIcon />}
                                sx={{ margin: '5px', fontWeight: 600 }} 
                                onClick={() => navigate(`/products/edit-price/${productObj.id}`)}
                              >
                                Edit Price (Focused)
                              </Button>
                              <Button 
                                variant='outlined' 
                                sx={{margin: '5px'}} 
                                onClick={()=>{ setEditProductId(productObj.id); setOpen(true)}}
                              >
                                Edit Details
                              </Button>
                              <Button 
                                variant='outlined' 
                                color="error"
                                sx={{margin: '5px'}} 
                                onClick={()=>{ dispatch(deleteProductAction(productObj.id))}}
                              >
                                Delete
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      }))
                    }
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
          <Divider sx={{ my: 3 }} />
        </>
      )}

      {/* Regular Products Section */}
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell><b>Name</b></TableCell>
              <TableCell><b>Type</b></TableCell>
              <TableCell><b>Price / Kg</b></TableCell>
              <TableCell><b>Action</b> </TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {
              Children.toArray(regularProducts.map((productObj) => {
                return(
                  <TableRow>
                    <TableCell>{productObj.name}</TableCell>
                    <TableCell>{productObj.type.toUpperCase()}</TableCell>
                    <TableCell>₹{productObj.pricePerKg}</TableCell>
                    <TableCell>
                      <Button variant='outlined' sx={{margin: '5px'}} onClick={()=>{ setEditProductId(productObj.id); setOpen(true)}}>Edit</Button>
                      <Button variant='outlined' sx={{margin: '5px'}} onClick={()=>{ dispatch(deleteProductAction(productObj.id))}}>Delete</Button>
                    </TableCell>
                  </TableRow>
                );
              }))
            }
          </TableBody>
        </Table>
      </TableContainer>
    </>
  );
}
