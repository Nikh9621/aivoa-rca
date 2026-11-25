
import { createAsyncThunk, createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { analyzeRCA } from "../../services/api";

export type AnalysisMethod = "five_whys" | "fishbone";

export interface RCAAnalysis {
  analysis_method?: string;
  problem_statement?: string;
  potential_root_causes?: any[];
  contributing_factors?: any[];
  five_whys?: any[];
  fishbone?: Record<string, any>;
  missing_evidence?: any[];
  capa_recommendations?: any[];
  investigation_limitations?: any[];
  human_review_required?: boolean;
  [key: string]: any;
}

interface RCAState {
  analysis: RCAAnalysis | null;
  analysisMethod: AnalysisMethod;
  loading: boolean;
  error: string | null;
}

interface AnalyzeRCARequest {
  investigationId: number;
  method: AnalysisMethod;
}

const initialState: RCAState = {
  analysis: null,
  analysisMethod: "five_whys",
  loading: false,
  error: null,
};

export const generateRCA = createAsyncThunk<
  RCAAnalysis,
  AnalyzeRCARequest,
  { rejectValue: string }
>(
  "rca/generate",
  async ({ investigationId, method }, { rejectWithValue }) => {
    try {
      const response = await analyzeRCA(investigationId, method);

      return response.analysis ?? response;
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : "Failed to generate RCA analysis"
      );
    }
  }
);

const rcaSlice = createSlice({
  name: "rca",
  initialState,
  reducers: {
    setAnalysisMethod: (state, action: PayloadAction<AnalysisMethod>) => {
      state.analysisMethod = action.payload;
    },

    setAnalysis: (state, action: PayloadAction<RCAAnalysis>) => {
      state.analysis = action.payload;
    },

    clearRCA: (state) => {
      state.analysis = null;
      state.error = null;
      state.loading = false;
    },
  },

  extraReducers: (builder) => {
    builder
      .addCase(generateRCA.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(generateRCA.fulfilled, (state, action) => {
        state.loading = false;
        state.analysis = action.payload;
      })
      .addCase(generateRCA.rejected, (state, action) => {
        state.loading = false;
        state.error =
          action.payload || action.error.message || "RCA analysis failed";
      });
  },
});

export const { setAnalysisMethod, setAnalysis, clearRCA } = rcaSlice.actions;

export default rcaSlice.reducer;
