import { Box, Button, Card, CardContent, Modal, Paper, TableContainer, Table, TableHead, TableBody, TableCell, TableRow  } from '@mui/material';
import { useDispatch, useSelector } from 'react-redux';
import { useState, Children } from 'react';
import { CreateProduct } from './create';
import { EditProduct } from './edit';
import { deleteProductAction } from '../../../store/products';


export const ListProjects = () => {  
  
  const dispatch = useDispatch();
  const [editProductId, setEditProductId] = useState('');
  const [open, setOpen] = useState(false);
  
  const { products: { rows} } = useSelector(state => state.productState);

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
              Children.toArray(Object.values(rows).map((productObj) => {
                return(
                  <TableRow>
                    <TableCell>{productObj.name}</TableCell>
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
