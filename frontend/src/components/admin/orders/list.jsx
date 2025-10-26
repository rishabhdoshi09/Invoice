import { Button, Paper, TextField, Typography, TableContainer, Table, TableHead, TableBody, TableCell, TableRow, } from '@mui/material';
import { useNavigate } from 'react-router';
import { useDispatch, useSelector } from 'react-redux';
import { useEffect, useState, Children } from 'react';
import { listOrdersAction, deleteOrderAction  } from '../../../store/orders';
import { Pagination } from '../../common/pagination';

export const ListOrders = () => {

    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { orders: { count, rows } } = useSelector(state => state.orderState);

    const [refetch, shouldFetch] = useState(true);
    const [filters, setFilters] = useState({
        limit: 25,
        offset: 0,
        q: ""
    });

    useEffect(() => {
        if (refetch) {
            shouldFetch(false);
            dispatch(listOrdersAction(filters));
        }
    }, [refetch]);


    const paginate = (limit, offset) => {
        shouldFetch(true);
        setFilters((prevState) => {
            return {
                ...prevState,
                limit: limit,
                offset: offset,
            };
        });
    };

    const filterChangeHandler = (e) => {
        setFilters((prevState) => {
            return {
                ...prevState,
                [e.target.id]: e.target.value
            };
        });
    }

    useEffect(() => {
        const getData = setTimeout(() => {
            dispatch(listOrdersAction(filters));
        }, 500);
    
        return () => clearTimeout(getData);
    }, [filters.q]);

    return (
        <>
            <Typography component={'div'}>
                <TextField size="small" id="q" label="Search Order" onChange={filterChangeHandler} sx={{margin: "0px 15px 0px 0px"}}></TextField>
                <Button variant="contained" onClick={() => navigate(`create`)} sx={{margin: "0px 15px"}}>Create Order</Button>
            </Typography>

            <br></br>

            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell><b>Order Number</b></TableCell>
                            <TableCell><b>Order Date</b></TableCell>
                            <TableCell><b>Name</b></TableCell>
                            <TableCell><b>Mobile</b></TableCell>
                            <TableCell><b>Subtotal</b></TableCell>
                            <TableCell><b>Tax</b></TableCell>
                            <TableCell><b>Total</b></TableCell>
                            <TableCell><b>Action</b></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {
                            Children.toArray(Object.values(rows).map((orderObj) => {
                                return (
                                    <TableRow>
                                        <TableCell>{orderObj.orderNumber}</TableCell>
                                        <TableCell>{orderObj.orderDate}</TableCell>
                                        <TableCell>{orderObj.customerName}</TableCell>
                                        <TableCell>{orderObj.customerMobile}</TableCell>
                                        <TableCell>{orderObj.subTotal}</TableCell>
                                        <TableCell>{orderObj.tax} ({orderObj.taxPercent}%)</TableCell>
                                        <TableCell>{orderObj.total}</TableCell>
                                        <TableCell><Button variant='outlined' sx={{margin: '5px'}} onClick={()=>{ dispatch(deleteOrderAction(orderObj.id))}}>Delete</Button></TableCell>
                                    </TableRow>
                                );
                            }))
                        }
                    </TableBody>
                </Table>
            </TableContainer>
            <Pagination
                limit={filters.limit}
                offset={filters.offset}
                count={count}
                updateFilters={paginate}
            />
        </>
    );
}
