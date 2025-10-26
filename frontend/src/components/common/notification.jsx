
import { Alert, Snackbar } from "@mui/material"
import { useDispatch, useSelector } from "react-redux";
import { setNotification } from "../../store/application";

export const NotificationBar = () => {

    const dispatch = useDispatch();
    const { notificationState: { open, severity, message } } = useSelector(state => state.applicationState)

    const handleClose = () => {
        dispatch(setNotification({ open: false, severity: 'success', message: '' }));
    };

    return (
        <Snackbar
            open={open}
            autoHideDuration={3000}
            onClose={handleClose}
            anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
            <Alert
                onClose={handleClose}
                severity={severity}
                sx={{ width: '100%' }}
            >
                {message}
            </Alert>
        </Snackbar>
    )
}