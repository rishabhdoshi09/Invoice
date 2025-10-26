import { CircularProgress, Backdrop } from '@mui/material';

export const Loader = (props) => {
    return (
        <>
        {props.isLoading && 
            <Backdrop
                sx={{ color: '#fff', zIndex: (theme) => theme.zIndex.drawer + 1 }}
                open={props.isLoading}
            >
                <CircularProgress color="secondary" size={50}/>
            </Backdrop>
        }
        </>
    )   
}
