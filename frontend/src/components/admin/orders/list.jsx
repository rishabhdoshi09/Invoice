import { Button, Paper, TextField, Typography, TableContainer, Table, TableHead, TableBody, TableCell, TableRow, Chip, Tooltip } from '@mui/material';
import { useNavigate, useLocation } from 'react-router';
import { useDispatch, useSelector } from 'react-redux';
import { useEffect, useState, Children, useRef } from 'react';
import { listOrdersAction, deleteOrderAction  } from '../../../store/orders';
import { Pagination } from '../../common/pagination';
import { useAuth } from '../../../context/AuthContext';
import { Note } from '@mui/icons-material';

// Key for storing scroll position
const SCROLL_POSITION_KEY = 'orders_scroll_position';

export const ListOrders = () => {

    const dispatch = useDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const { isAdmin } = useAuth();
    const { orders: { count, rows } } = useSelector(state => state.orderState);
    const tableRef = useRef(null);

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
    }, [refetch, dispatch, filters]);

    // Restore scroll position when coming back from edit page
    useEffect(() => {
        const savedPosition = sessionStorage.getItem(SCROLL_POSITION_KEY);
        if (savedPosition && rows.length > 0) {
            // Small delay to ensure the table is rendered
            setTimeout(() => {
                window.scrollTo(0, parseInt(savedPosition, 10));
                sessionStorage.removeItem(SCROLL_POSITION_KEY);
            }, 100);
        }
    }, [rows]);

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
    }, [filters.q, dispatch, filters]);

    // Save scroll position and navigate to edit
    const handleEditClick = (orderId) => {
        sessionStorage.setItem(SCROLL_POSITION_KEY, window.scrollY.toString());
        navigate(`edit/${orderId}`);
    };

    return (
        <>
            <Typography component={'div'}>
                <TextField size="small" id="q" label="Search Order" onChange={filterChangeHandler} sx={{margin: "0px 15px 0px 0px"}}></TextField>
                <Button variant="contained" onClick={() => navigate(`create`)} sx={{margin: "0px 15px"}}>Create Order</Button>
            </Typography>

            <br></br>

            <TableContainer component={Paper} ref={tableRef}>
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
                            <TableCell><b>Notes</b></TableCell>
                            <TableCell><b>Action</b></TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {
                            Children.toArray(Object.values(rows).map((orderObj) => {
                                return (
                                    <TableRow sx={orderObj.staffNotes ? { bgcolor: '#fff8e1' } : {}} id={`order-row-${orderObj.id}`}>
                                        <TableCell>{orderObj.orderNumber}</TableCell>
                                        <TableCell>{orderObj.orderDate}</TableCell>
                                        <TableCell>{orderObj.customerName}</TableCell>
                                        <TableCell>{orderObj.customerMobile}</TableCell>
                                        <TableCell>{orderObj.subTotal}</TableCell>
                                        <TableCell>{orderObj.tax} ({orderObj.taxPercent}%)</TableCell>
                                        <TableCell>{orderObj.total}</TableCell>
                                        <TableCell>
                                            {orderObj.staffNotes ? (
                                                <Tooltip title={orderObj.staffNotes.split('\n').slice(-1)[0]}>
                                                    <Chip 
                                                        icon={<Note />} 
                                                        label="Has Notes" 
                                                        size="small" 
                                                        color="warning"
                                                    />
                                                </Tooltip>
                                            ) : (
                                                <Typography variant="caption" color="text.secondary">-</Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Button variant='outlined' sx={{margin: '5px'}} onClick={() => handleEditClick(orderObj.id)}>
                                                {isAdmin ? 'Edit' : 'View/Note'}
                                            </Button>
                                            {isAdmin && (
                                                <Button variant='outlined' sx={{margin: '5px'}} onClick={()=>{ dispatch(deleteOrderAction(orderObj.id))}}>Delete</Button>
                                            )}
                                        </TableCell>
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
