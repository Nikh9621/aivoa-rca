
import { configureStore } from "@reduxjs/toolkit";

import investigationReducer from "./slices/investigationSlice";
import rcaReducer from "./slices/rcaSlice";

export const store = configureStore({
  reducer: {
    investigations: investigationReducer,
    rca: rcaReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
