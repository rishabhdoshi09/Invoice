import { Box, Button, Card, CardContent, Modal, Paper, TableContainer, Table, TableHead, TableBody, TableCell, TableRow, TextField  } from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import { useState, useMemo, Children } from 'react';
import { CreateProduct } from './create';
import { EditProduct } from './edit';
import { deleteProductAction, updateProductAction } from '../../../store/products';


export const ListProjects = () =>  {

  const dispatch = useDispatch();
  const [editProductId, setEditProductId] = useState('');
  const [open, setOpen] = useState(false);
  const [inlineNameId, setInlineNameId] = useState('');
  const [inlineNameVal, setInlineNameVal] = useState('');

  const { products: { rows} } = useSelector(state => state.productState);
  const productList = useMemo(() => Object.values(rows), [rows]);

  const startInlineName = (productObj) => {
    setInlineNameId(productObj.id);
    setInlineNameVal(productObj.name);
  };

  const commitInlineName = async (productObj) => {
    const trimmed = inlineNameVal.trim();
    if (trimmed && trimmed !== productObj.name) {
      await dispatch(updateProductAction(productObj.id, {
        name: trimmed,
        pricePerKg: productObj.pricePerKg,
        type: productObj.type
      }));
    }
    setInlineNameId('');
  };

  // Check if the product being edited is high-value
  const isHighValueProduct = editProductId && rows[editProductId] && rows[editProductId].pricePerKg >= 300;

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
          width: isHighValueProduct ? "60%" : "80%",
          transform: 'translate(-50%, -50%)',
          bgcolor: isHighValueProduct ? 'white' : 'background.paper',
          boxShadow: 24,
          p: isHighValueProduct ? 0 : 4,
        }}>
       <EditProduct productId={editProductId} />
       </Box>
      </Modal>

      <Card>
        <CardContent>
          <CreateProduct />
        </CardContent>
      </Card>

      <br></br>

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
              Children.toArray(productList.map((productObj) => {
                return(
                  <TableRow>
                    <TableCell sx={{ minWidth: 160 }}>
                      {inlineNameId === productObj.id ? (
                        <TextField
                          size="small"
                          autoFocus
                          value={inlineNameVal}
                          onChange={(e) => setInlineNameVal(e.target.value)}
                          onBlur={() => commitInlineName(productObj)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitInlineName(productObj);
                            if (e.key === 'Escape') setInlineNameId('');
                          }}
                          sx={{ minWidth: 140 }}
                        />
                      ) : (
                        <Box
                          onClick={() => startInlineName(productObj)}
                          sx={{ cursor: 'pointer', '&:hover': { textDecoration: 'underline', color: '#1976d2' } }}
                          title="Click to edit name"
                        >
                          {productObj.name}
                        </Box>
                      )}
                    </TableCell>
                    <TableCell>{productObj.type.toUpperCase()}</TableCell>
                    <TableCell>{productObj.pricePerKg}</TableCell>
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
