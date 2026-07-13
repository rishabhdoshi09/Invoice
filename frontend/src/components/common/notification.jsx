
import { Alert, Snackbar } from "@mui/material"
import { useDispatch, useSelector } from "react-redux";
import { setNotification } from "../../store/application";

export const NotificationBar = () => {

    const dispatch = useDispatch();
    const { notificationState: { open, severity, message } } = useSelector(state => state.applicationState)

    const handleClose = (_, reason) => {
        // Don't dismiss errors on a stray click elsewhere — they carry
        // validation feedback the operator must actually see.
        if (reason === 'clickaway' && severity === 'error') return;
        dispatch(setNotification({ open: false, severity: 'success', message: '' }));
    };

    return (
        <Snackbar
            open={open}
            // Errors linger a little longer than success confirmations
            autoHideDuration={severity === 'error' ? 5000 : 3000}
            onClose={handleClose}
            anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
        >
            <Alert
                onClose={handleClose}
                severity={severity}
                variant="filled"
                elevation={6}
                sx={{
                    width: '100%',
                    fontWeight: 600,
                    borderRadius: 2,
                    boxShadow: '0 8px 24px rgba(15, 23, 42, 0.25)',
                    alignItems: 'center',
                }}
            >
                {message}
            </Alert>
        </Snackbar>
    )
}
