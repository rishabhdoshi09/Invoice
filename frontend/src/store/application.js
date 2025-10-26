import { createSlice } from '@reduxjs/toolkit';
import { LoaderState } from '../enums/loader';

const initialState = {
    loadingState: LoaderState.STOP,
    notificationState: {
        open: false,
        severity: 'success',
        message: ''
    }
};

const reducers = {
    loading(state, action) {
        state.loadingState = action.payload.loadingState;
    },
    notification(state, action) {
        state.notificationState = action.payload;
    }
}

const applicationSlice = createSlice({
    name: 'applicationState',
    initialState: initialState,
    reducers: reducers
});

const { loading, notification } = applicationSlice.actions;

export const startLoading = () => (dispatch) => dispatch(loading({ loadingState: LoaderState.START }));
export const stopLoading = () => (dispatch) => dispatch(loading({ loadingState: LoaderState.STOP }));
export const setNotification = (payload) => (dispatch) => dispatch(notification(payload));

export default applicationSlice;
