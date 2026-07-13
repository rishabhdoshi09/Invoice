import store from '../store';
import { setNotification } from '../store/application';

/**
 * Fire the app's styled Snackbar from anywhere — components, handlers,
 * plain functions — without needing a hook or dispatch in scope.
 * Drop-in replacement for the blocking browser alert().
 *
 *   toast('Amount must be positive.');          // error (default)
 *   toast('Receipt saved.', 'success');
 */
export const toast = (message, severity = 'error') =>
    store.dispatch(setNotification({ open: true, severity, message }));

export const toastSuccess = (message) => toast(message, 'success');
export const toastInfo = (message) => toast(message, 'info');

export default toast;
