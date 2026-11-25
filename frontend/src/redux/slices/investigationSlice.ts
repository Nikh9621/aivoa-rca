
import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import type { PayloadAction } from "@reduxjs/toolkit";
import { getInvestigations } from "../../services/api";

interface Investigation {
  id: number;
  title: string;
  product_name?: string;
  batch_number?: string;
  process?: string;
  equipment?: string;
  investigation_status?: string;
  created_at?: string;
}

interface InvestigationState {
  investigations: Investigation[];
  loading: boolean;
  error: string | null;
}

const initialState: InvestigationState = {
  investigations: [],
  loading: false,
  error: null,
};

export const fetchInvestigations = createAsyncThunk(
  "investigations/fetchAll",
  async () => {
    const response = await getInvestigations();

    return Array.isArray(response)
      ? response
      : response.data ?? [];
  }
);

const investigationSlice = createSlice({
  name: "investigations",
  initialState,
  reducers: {
    setInvestigations: (
      state,
      action: PayloadAction<Investigation[]>
    ) => {
      state.investigations = action.payload;
    },

    clearInvestigations: (state) => {
      state.investigations = [];
      state.error = null;
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(fetchInvestigations.pending, (state) => {
        state.loading = true;
        state.error = null;
      })

      .addCase(
        fetchInvestigations.fulfilled,
        (state, action) => {
          state.loading = false;
          state.investigations = action.payload;
        }
      )

      .addCase(fetchInvestigations.rejected, (state, action) => {
        state.loading = false;
        state.error =
          action.error.message || "Failed to load investigations";
      });
  },
});

export const {
  setInvestigations,
  clearInvestigations,
} = investigationSlice.actions;

export default investigationSlice.reducer;
