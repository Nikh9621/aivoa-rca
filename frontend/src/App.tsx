
import { useCallback, useEffect, useState } from "react";

import AuthPage from "./components/AuthPage";

import {
  getCurrentUser,
  getToken,
  logoutUser,
  extractRCA,
  extractRCAFromPDF,
  saveInvestigation,
  getInvestigationById,
  updateInvestigation,
} from "./services/api";

import {
  clearInvestigations,
  fetchInvestigations,
} from "./redux/slices/investigationSlice";

import {
  generateRCA,
  setAnalysisMethod,
  setAnalysis,
  clearRCA,
} from "./redux/slices/rcaSlice";

import { useAppDispatch, useAppSelector } from "./redux/hooks";

import "./App.css";

import {
  LayoutDashboard,
  FileText,
  ClipboardList,
  Settings,
  Plus,
  Upload,
  Sparkles,
  FileUp,
  AlertCircle,
  CheckCircle2,
  Loader2,
  RotateCcw,
  ChevronRight,
  Activity,
  ShieldCheck,
  FlaskConical,
  X,
  Bell,
  Brain,
  GitBranch,
  Save,
  Search,
  LogOut,
} from "lucide-react";

type RCAData = {
  title: string;
  product_name: string | null;
  batch_number: string | null;
  process: string | null;
  equipment: string | null;
  deviation_description: string | null;
  event_date: string | null;
  expected_result: string | null;
  actual_result: string | null;
  immediate_action: string | null;
  initial_findings: string[];
  contributing_factors: string[];
  equipment_condition: string | null;
  operator_observation: string | null;
  evidence_found: string[];
  missing_evidence: string[];
  source_summary: string;
  confidence: string;
  [key: string]: any;
};

type Tab =
  | "upload"
  | "review"
  | "investigations"
  | "rca"
  | "settings";

type CAPAItem = {
  action_type: string;
  action: string;
  rationale: string;
  related_potential_cause: string;
  effectiveness_check: string;
  owner: string | null;
  target_date: string | null;
  status: string;
};

type CurrentUser = {
  id: number;
  full_name: string;
  email: string;
};

function App() {
  // --------------------------------------------------
  // AUTHENTICATION STATE
  // --------------------------------------------------

  const [currentUser, setCurrentUser] =
    useState<CurrentUser | null>(null);

  const [authChecking, setAuthChecking] = useState(true);

  // --------------------------------------------------
  // GENERAL APPLICATION STATE
  // --------------------------------------------------

  const [activeTab, setActiveTab] = useState<Tab>("upload");
  const [sourceType, setSourceType] = useState<"text" | "pdf">("text");

  const [documentText, setDocumentText] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [result, setResult] = useState<RCAData | null>(null);
  const [editedResult, setEditedResult] = useState<RCAData | null>(null);

  const [reviewed, setReviewed] = useState(false);

  const [savedInvestigationId, setSavedInvestigationId] =
    useState<number | null>(null);

  // --------------------------------------------------
  // REDUX STATE
  // --------------------------------------------------

  const dispatch = useAppDispatch();

  const {
    investigations,
    loading: fetchingInvestigations,
    error: investigationError,
  } = useAppSelector((state) => state.investigations);

  const {
    analysis,
    analysisMethod,
    loading: analysisLoading,
    error: analysisError,
  } = useAppSelector((state) => state.rca);

  // --------------------------------------------------
  // VERIFY LOGIN SESSION
  // --------------------------------------------------

  useEffect(() => {
    const verifySession = async () => {
      if (!getToken()) {
        setAuthChecking(false);
        return;
      }

      try {
        const user = await getCurrentUser();
        setCurrentUser(user);
      } catch (err) {
        console.error("Session verification failed:", err);

        logoutUser();
        setCurrentUser(null);
      } finally {
        setAuthChecking(false);
      }
    };

    void verifySession();
  }, []);

  // --------------------------------------------------
  // AUTHENTICATION SUCCESS
  // --------------------------------------------------

  const handleAuthSuccess = (user: CurrentUser) => {
    setCurrentUser(user);
  };

  // --------------------------------------------------
  // LOGOUT
  // --------------------------------------------------

  const handleLogout = () => {
    logoutUser();

    setCurrentUser(null);

    dispatch(clearInvestigations());
    dispatch(clearRCA());

    setActiveTab("upload");

    setDocumentText("");
    setSelectedFile(null);

    setResult(null);
    setEditedResult(null);

    setReviewed(false);
    setSavedInvestigationId(null);

    setSelectedInvestigationId(null);
    setEditedAnalysis(null);

    setError("");
    setAnalysisSuccess("");
  };

  // --------------------------------------------------
  // LOCAL RCA STATE
  // --------------------------------------------------

  const [selectedInvestigationId, setSelectedInvestigationId] =
    useState<number | null>(null);

  const [analysisSaving, setAnalysisSaving] = useState(false);

  const [editedAnalysis, setEditedAnalysis] = useState<any>(null);

  const [analysisSuccess, setAnalysisSuccess] = useState("");

  // --------------------------------------------------
  // LOAD INVESTIGATIONS THROUGH REDUX
  // --------------------------------------------------

  const loadInvestigations = useCallback(async () => {
    try {
      await dispatch(fetchInvestigations()).unwrap();
    } catch (err) {
      console.error("Unable to load investigations:", err);
    }
  }, [dispatch]);

  // Load investigations only after successful login.
  useEffect(() => {
    if (currentUser) {
      void loadInvestigations();
    }
  }, [currentUser, loadInvestigations]);

  // --------------------------------------------------
  // PDF VALIDATION
  // --------------------------------------------------

  const handleFile = (file?: File) => {
    if (!file) return;

    setError("");

    if (file.type !== "application/pdf") {
      setError("Please upload a PDF file only.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("File size must be less than 10 MB.");
      return;
    }

    setSelectedFile(file);
  };

  // --------------------------------------------------
  // AI EXTRACTION
  // --------------------------------------------------

  const handleExtraction = async () => {
    setError("");

    if (sourceType === "text" && !documentText.trim()) {
      setError("Please enter investigation details first.");
      return;
    }

    if (sourceType === "pdf" && !selectedFile) {
      setError("Please select a PDF file first.");
      return;
    }

    try {
      setLoading(true);

      const data =
        sourceType === "text"
          ? await extractRCA(documentText)
          : await extractRCAFromPDF(selectedFile!);

      const extractedData = data?.data ?? data;

      if (!extractedData) {
        throw new Error("The AI extraction API returned no data.");
      }

      setResult(extractedData);
      setEditedResult({ ...extractedData });

      setReviewed(false);
      setSavedInvestigationId(null);

      setActiveTab("review");
    } catch (err: any) {
      setError(
        err.message || "Something went wrong during AI extraction."
      );
    } finally {
      setLoading(false);
    }
  };

  // --------------------------------------------------
  // REVIEW FORM HELPERS
  // --------------------------------------------------

  const updateField = (field: string, value: any) => {
    setEditedResult((previous) =>
      previous ? { ...previous, [field]: value } : previous
    );
  };

  const updateArrayField = (field: string, value: string) => {
    setEditedResult((previous) =>
      previous
        ? {
            ...previous,
            [field]: value
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean),
          }
        : previous
    );
  };

  const resetChanges = () => {
    if (result) {
      setEditedResult({ ...result });
      setReviewed(false);
      setSavedInvestigationId(null);
      setError("");
    }
  };

  // --------------------------------------------------
  // SAVE INVESTIGATION
  // --------------------------------------------------

  const confirmDetails = async () => {
    if (!editedResult || savedInvestigationId) return;

    try {
      setSaving(true);
      setError("");

      const payload = {
        title: editedResult.title?.trim() || "Untitled Investigation",
        product_name: editedResult.product_name || null,
        batch_number: editedResult.batch_number || null,
        process: editedResult.process || null,
        equipment: editedResult.equipment || null,
        deviation_description:
          editedResult.deviation_description || null,
        investigation_status: "reviewed",
        extracted_data: editedResult,
        rca_data: {},
        capa_data: [],
      };

      const response = await saveInvestigation(payload);

      const savedRecord = response?.data ?? response;

      if (!savedRecord?.id) {
        throw new Error(
          "Investigation response did not contain a record ID."
        );
      }

      setSavedInvestigationId(savedRecord.id);
      setReviewed(true);

      await loadInvestigations();
    } catch (err: any) {
      setError(err.message || "Unable to save investigation.");
    } finally {
      setSaving(false);
    }
  };

  // --------------------------------------------------
  // NEW INVESTIGATION
  // --------------------------------------------------

  const startNewInvestigation = () => {
    setActiveTab("upload");
    setSourceType("text");

    setDocumentText("");
    setSelectedFile(null);

    setResult(null);
    setEditedResult(null);

    setReviewed(false);
    setSaving(false);
    setSavedInvestigationId(null);

    setError("");

    setSelectedInvestigationId(null);
    setEditedAnalysis(null);
    setAnalysisSuccess("");

    dispatch(clearRCA());
  };

  // --------------------------------------------------
  // FORM RENDER HELPERS
  // --------------------------------------------------

  const renderInput = (
    label: string,
    field: string,
    value: any
  ) => (
    <div className="field-group" key={field}>
      <label className="field-label">{label}</label>
      <input
        className="field-control"
        type="text"
        value={value ?? ""}
        onChange={(e) => updateField(field, e.target.value)}
        placeholder={`Enter ${label.toLowerCase()}`}
      />
    </div>
  );

  const renderTextarea = (
    label: string,
    field: string,
    value: any
  ) => (
    <div className="field-group" key={field}>
      <label className="field-label">{label}</label>
      <textarea
        className="field-control"
        rows={3}
        value={value ?? ""}
        onChange={(e) => updateField(field, e.target.value)}
        placeholder={`Enter ${label.toLowerCase()}`}
      />
    </div>
  );

  const renderArrayField = (
    label: string,
    field: string,
    value: string[]
  ) => (
    <div className="field-group" key={field}>
      <label className="field-label">{label}</label>
      <textarea
        className="field-control"
        rows={4}
        value={(value || []).join("\n")}
        onChange={(e) => updateArrayField(field, e.target.value)}
        placeholder="Enter one item per line"
      />
      <small className="field-help">
        Enter each item on a separate line.
      </small>
    </div>
  );

  // --------------------------------------------------
  // RCA ANALYSIS - OPEN INVESTIGATION
  // --------------------------------------------------

  const openRCA = async (id?: number) => {
    const investigationId = id ?? savedInvestigationId;

    setAnalysisSuccess("");
    setEditedAnalysis(null);
    setSelectedInvestigationId(investigationId ?? null);

    dispatch(clearRCA());

    setActiveTab("rca");

    if (!investigationId) return;

    try {
      const response = await getInvestigationById(investigationId);
      const record = response?.data ?? response;

      const storedAnalysis = record?.rca_data;

      if (
        storedAnalysis &&
        typeof storedAnalysis === "object" &&
        Object.keys(storedAnalysis).length > 0
      ) {
        dispatch(setAnalysis(storedAnalysis));

        setEditedAnalysis(
          JSON.parse(JSON.stringify(storedAnalysis))
        );

        dispatch(
          setAnalysisMethod(
            storedAnalysis.analysis_method === "fishbone"
              ? "fishbone"
              : "five_whys"
          )
        );
      }
    } catch (err: any) {
      console.error("Unable to load RCA:", err);
    }
  };

  // --------------------------------------------------
  // LOAD SAVED RCA WHEN INVESTIGATION CHANGES
  // --------------------------------------------------

  const handleInvestigationChange = async (value: string) => {
    const id = value ? Number(value) : null;

    setSelectedInvestigationId(id);

    setEditedAnalysis(null);
    setAnalysisSuccess("");

    dispatch(clearRCA());

    if (!id) return;

    try {
      const response = await getInvestigationById(id);
      const record = response?.data ?? response;

      const storedAnalysis = record?.rca_data;

      if (
        storedAnalysis &&
        typeof storedAnalysis === "object" &&
        Object.keys(storedAnalysis).length > 0
      ) {
        dispatch(setAnalysis(storedAnalysis));

        setEditedAnalysis(
          JSON.parse(JSON.stringify(storedAnalysis))
        );

        dispatch(
          setAnalysisMethod(
            storedAnalysis.analysis_method === "fishbone"
              ? "fishbone"
              : "five_whys"
          )
        );
      }
    } catch (err: any) {
      console.error("Unable to load investigation:", err);
    }
  };

  // --------------------------------------------------
  // GENERATE RCA THROUGH REDUX
  // --------------------------------------------------

  const generateAnalysis = async () => {
    if (!selectedInvestigationId) {
      setAnalysisSuccess("");
      return;
    }

    try {
      setAnalysisSuccess("");

      const response = await dispatch(
        generateRCA({
          investigationId: selectedInvestigationId,
          method: analysisMethod,
        })
      ).unwrap();

      const generated =
        response?.analysis ??
        response?.data?.analysis ??
        response?.data ??
        response;

      console.log("RCA generated response:", generated);

      if (!generated || typeof generated !== "object") {
        throw new Error("The API did not return RCA analysis.");
      }

      dispatch(setAnalysis(generated));

      setEditedAnalysis(
        JSON.parse(JSON.stringify(generated))
      );

      setAnalysisSuccess(
        "AI analysis generated. Please review all findings."
      );
    } catch (err: any) {
      console.error("RCA generation failed:", err);
    }
  };

  // --------------------------------------------------
  // UPDATE RCA FIELDS
  // --------------------------------------------------

  const updateAnalysisField = (field: string, value: any) => {
    setEditedAnalysis((previous: any) =>
      previous ? { ...previous, [field]: value } : previous
    );
  };

  // --------------------------------------------------
  // UPDATE POTENTIAL ROOT CAUSES
  // --------------------------------------------------

  const updateCause = (
    index: number,
    field: string,
    value: any
  ) => {
    setEditedAnalysis((previous: any) => {
      if (!previous) return previous;

      const causes = [
        ...(Array.isArray(previous.potential_root_causes)
          ? previous.potential_root_causes
          : []),
      ];

      causes[index] = {
        ...causes[index],
        [field]: value,
      };

      return {
        ...previous,
        potential_root_causes: causes,
      };
    });
  };

  // --------------------------------------------------
  // UPDATE CAPA
  // --------------------------------------------------

  const updateCAPA = (
    index: number,
    field: string,
    value: any
  ) => {
    setEditedAnalysis((previous: any) => {
      if (!previous) return previous;

      const actions = [
        ...(Array.isArray(previous.capa_recommendations)
          ? previous.capa_recommendations
          : []),
      ];

      actions[index] = {
        ...actions[index],
        [field]: value,
      };

      return {
        ...previous,
        capa_recommendations: actions,
      };
    });
  };

  // --------------------------------------------------
  // SAVE HUMAN-REVIEWED RCA AND CAPA
  // --------------------------------------------------

  const saveRCAAnalysis = async () => {
    if (!selectedInvestigationId || !editedAnalysis) {
      return;
    }

    try {
      setAnalysisSaving(true);
      setAnalysisSuccess("");

      const response = await getInvestigationById(
        selectedInvestigationId
      );

      const record = response?.data ?? response;

      if (!record) {
        throw new Error("Investigation record not found.");
      }

      const existingExtracted = record.extracted_data || {};

      const payload = {
        title: record.title,
        product_name: record.product_name,
        batch_number: record.batch_number,
        process: record.process,
        equipment: record.equipment,
        deviation_description: record.deviation_description,
        investigation_status: "rca_reviewed",
        extracted_data: existingExtracted,
        rca_data: editedAnalysis,
        capa_data: Array.isArray(editedAnalysis.capa_recommendations)
          ? editedAnalysis.capa_recommendations
          : [],
      };

      await updateInvestigation(
        selectedInvestigationId,
        payload
      );

      dispatch(setAnalysis(editedAnalysis));

      setEditedAnalysis(
        JSON.parse(JSON.stringify(editedAnalysis))
      );

      setAnalysisSuccess(
        "RCA and CAPA successfully saved to PostgreSQL."
      );

      await loadInvestigations();
    } catch (err: any) {
      console.error("Unable to save RCA:", err);
    } finally {
      setAnalysisSaving(false);
    }
  };

  // --------------------------------------------------
  // RESET RCA EDITS
  // --------------------------------------------------

  const resetRCAChanges = () => {
    if (analysis) {
      setEditedAnalysis(
        JSON.parse(JSON.stringify(analysis))
      );

      setAnalysisSuccess("");
    }
  };

  // --------------------------------------------------
  // DISPLAY HELPERS
  // --------------------------------------------------

  const toTextList = (value: any): string[] => {
    if (Array.isArray(value)) {
      return value
        .map((item) => {
          if (typeof item === "string") return item;

          if (item && typeof item === "object") {
            return Object.entries(item)
              .map(([key, val]) => `${key}: ${String(val ?? "")}`)
              .join(" — ");
          }

          return String(item ?? "");
        })
        .filter(Boolean);
    }

    if (typeof value === "string") {
      return value.trim() ? [value] : [];
    }

    if (value && typeof value === "object") {
      return Object.entries(value).map(
        ([key, item]) => `${key}: ${String(item ?? "")}`
      );
    }

    return [];
  };

  // Normalize 5 Whys data.
  const fiveWhysRaw = editedAnalysis?.five_whys;

  const fiveWhysItems: any[] = Array.isArray(fiveWhysRaw)
    ? fiveWhysRaw.map((item: any, index: number) =>
        typeof item === "string"
          ? { why: `Why ${index + 1}`, answer: item }
          : item && typeof item === "object"
          ? item
          : { why: `Why ${index + 1}`, answer: String(item ?? "") }
      )
    : fiveWhysRaw && typeof fiveWhysRaw === "object"
    ? Object.entries(fiveWhysRaw).map(([key, value]) =>
        value && typeof value === "object"
          ? value
          : { why: key, answer: String(value ?? "") }
      )
    : [];

  // Normalize fishbone data.
  const fishboneRaw = editedAnalysis?.fishbone;

  const fishboneItems: any[] = Array.isArray(fishboneRaw)
    ? fishboneRaw
    : fishboneRaw && typeof fishboneRaw === "object"
    ? Object.entries(fishboneRaw).map(([category, value]) => {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          return {
            category,
            ...value,
          };
        }

        return {
          category,
          potential_factors: Array.isArray(value)
            ? value
            : value
            ? [String(value)]
            : [],
          supporting_evidence: [],
          evidence_gaps: [],
        };
      })
    : [];

  const totalEvidenceGaps =
    editedResult?.missing_evidence?.length || 0;

  const selectedInvestigation = investigations.find(
    (item) => item.id === selectedInvestigationId
  );

  // --------------------------------------------------
  // AUTHENTICATION LOADING SCREEN
  // --------------------------------------------------

  if (authChecking) {
    return (
      <div className="auth-layout">
        <Loader2 className="spin" size={30} />
        <p>Verifying your session...</p>
      </div>
    );
  }

  // --------------------------------------------------
  // SHOW LOGIN / REGISTER PAGE
  // --------------------------------------------------

  if (!currentUser) {
    return <AuthPage onAuthSuccess={handleAuthSuccess} />;
  }

  // --------------------------------------------------
  // UI
  // --------------------------------------------------

  return (
    <div className="app-layout">
      {/* SIDEBAR */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <FlaskConical size={22} />
          </div>

          <div>
            <h2>AIVOA<span>.AI</span></h2>
            <small>QUALITY INTELLIGENCE</small>
          </div>
        </div>

        <p className="nav-label">WORKSPACE</p>

        <button
          className={`nav-item ${activeTab === "upload" ? "active" : ""}`}
          onClick={() => setActiveTab("upload")}
        >
          <LayoutDashboard size={18} />
          Dashboard
        </button>

        <button
          className={`nav-item ${activeTab === "investigations" ? "active" : ""}`}
          onClick={() => {
            setActiveTab("investigations");
            void loadInvestigations();
          }}
        >
          <ClipboardList size={18} />
          Investigations
        </button>

        <button className="nav-item" onClick={startNewInvestigation}>
          <FileText size={18} />
          New Investigation
        </button>

        <button
          className={`nav-item ${activeTab === "rca" ? "active" : ""}`}
          onClick={() => openRCA()}
        >
          <Brain size={18} />
          Root Cause Analysis
        </button>

        <p className="nav-label" style={{ marginTop: 30 }}>
          PREFERENCES
        </p>

        <button
          className={`nav-item ${activeTab === "settings" ? "active" : ""}`}
          onClick={() => setActiveTab("settings")}
        >
          <Settings size={18} />
          Settings
        </button>

        {/* LOGGED-IN USER PROFILE */}
        <div className="sidebar-bottom">
          <div className="profile">
            <div className="avatar">
              {currentUser.full_name
                .split(" ")
                .map((part) => part[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>

            <div>
              <strong>{currentUser.full_name}</strong>
              <small>{currentUser.email}</small>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              title="Logout"
              aria-label="Logout"
              style={{
                border: "none",
                background: "transparent",
                cursor: "pointer",
                color: "inherit",
                marginLeft: "auto",
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT */}
      <main className="main-content">
        {/* TOPBAR */}
        <header className="topbar">
          <div>
            <p className="breadcrumb">
              Workspace /{" "}
              {activeTab === "review"
                ? "Review Extraction"
                : activeTab === "investigations"
                ? "Investigations"
                : activeTab === "settings"
                ? "Settings"
                : activeTab === "rca"
                ? "Root Cause Analysis"
                : "Dashboard"}
            </p>

            <h2>
              {activeTab === "review"
                ? "Review Investigation"
                : activeTab === "investigations"
                ? "Investigations"
                : activeTab === "settings"
                ? "Settings"
                : activeTab === "rca"
                ? "Root Cause Analysis"
                : "Root Cause Analysis"}
            </h2>
          </div>

          <div className="top-actions">
            <div className="system-status">
              <span></span>
              System Operational
            </div>

            <button className="icon-button" type="button">
              <Bell size={19} />
            </button>
          </div>
        </header>

        <div className="page-content">
          {/* DASHBOARD */}
          {activeTab === "upload" && (
            <>
              <div className="welcome-row">
                <div>
                  <span className="eyebrow">
                    PHARMACEUTICAL QUALITY MANAGEMENT
                  </span>
                  <h1>Welcome to AIVOA.AI</h1>
                  <p className="subtitle">
                    AI-powered Root Cause Analysis for pharmaceutical manufacturing deviations.
                  </p>
                </div>

                <button
                  className="primary-button"
                  onClick={startNewInvestigation}
                >
                  <Plus size={16} />
                  New Investigation
                </button>
              </div>

              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-icon purple">
                    <ClipboardList />
                  </div>
                  <p>Total Investigations</p>
                  <h2>{investigations.length}</h2>
                  <small>Saved investigations</small>
                </div>

                <div className="stat-card">
                  <div className="stat-icon orange">
                    <Activity />
                  </div>
                  <p>Under Review</p>
                  <h2>{result && !reviewed ? 1 : 0}</h2>
                  <small>Pending review</small>
                </div>

                <div className="stat-card">
                  <div className="stat-icon green">
                    <ShieldCheck />
                  </div>
                  <p>Reviewed</p>
                  <h2>{reviewed ? 1 : 0}</h2>
                  <small>Human reviewed</small>
                </div>

                <div className="stat-card">
                  <div className="stat-icon blue">
                    <FileText />
                  </div>
                  <p>Evidence Gaps</p>
                  <h2>{totalEvidenceGaps}</h2>
                  <small>Missing evidence items</small>
                </div>
              </div>

              <div className="workspace-card">
                <div className="section-heading">
                  <div>
                    <h2>Create Investigation</h2>
                    <p>
                      Upload a deviation report or paste investigation details to begin AI analysis.
                    </p>
                  </div>
                  <span className="draft-badge">NEW ANALYSIS</span>
                </div>

                <div className="steps">
                  <div className="step current">
                    <span>1</span>
                    Source Document
                  </div>
                  <div className="step-line"></div>
                  <div className="step">
                    <span>2</span>
                    Review Extraction
                  </div>
                  <div className="step-line"></div>
                  <div className="step">
                    <span>3</span>
                    Root Cause Analysis
                  </div>
                </div>

                <div className="input-heading">
                  <h3>Investigation Source</h3>
                  <p>
                    Choose how you want to provide the investigation information.
                  </p>
                </div>

                <div className="source-tabs">
                  <button
                    className={`source-tab ${sourceType === "text" ? "selected" : ""}`}
                    onClick={() => {
                      setSourceType("text");
                      setError("");
                    }}
                  >
                    <FileText size={16} />
                    Paste Text
                  </button>

                  <button
                    className={`source-tab ${sourceType === "pdf" ? "selected" : ""}`}
                    onClick={() => {
                      setSourceType("pdf");
                      setError("");
                    }}
                  >
                    <FileUp size={16} />
                    Upload PDF
                  </button>
                </div>

                {sourceType === "text" && (
                  <div className="text-input-area">
                    <label>Investigation Report</label>

                    <textarea
                      value={documentText}
                      onChange={(e) => setDocumentText(e.target.value)}
                      placeholder={`Paste your pharmaceutical deviation report here...

Product Name: Paracetamol API
Batch Number: PCM-2026-045
Process: Crystallization
Equipment: Reactor R-102

Deviation Description:
Temperature increased to 75°C instead of the specified range of 60–65°C.

Initial Findings:
Temperature sensor calibration was overdue.
Cooling system response was delayed.`}
                    />

                    <div className="input-footer">
                      <span>
                        Supported input: Pharmaceutical deviation reports
                      </span>
                      <span>{documentText.length} characters</span>
                    </div>
                  </div>
                )}

                {sourceType === "pdf" && (
                  <div className="upload-area">
                    {!selectedFile ? (
                      <>
                        <div className="upload-icon">
                          <Upload size={25} />
                        </div>

                        <h3>Upload Investigation Report</h3>
                        <p>
                          Select a PDF investigation report from your computer.
                        </p>
                        <small>PDF format · Maximum size 10 MB</small>

                        <label
                          className="browse-button"
                          htmlFor="pdf-upload"
                          style={{ marginTop: 15 }}
                        >
                          Browse Files
                        </label>

                        <input
                          id="pdf-upload"
                          type="file"
                          accept=".pdf,application/pdf"
                          style={{ display: "none" }}
                          onChange={(e) =>
                            handleFile(e.target.files?.[0])
                          }
                        />
                      </>
                    ) : (
                      <div className="selected-file">
                        <FileText size={30} />
                        <div>
                          <strong>{selectedFile.name}</strong>
                          <small>
                            {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                          </small>
                        </div>
                        <button
                          onClick={() => setSelectedFile(null)}
                          type="button"
                        >
                          <X size={18} />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="info-note">
                  <AlertCircle size={18} />
                  <p>
                    AI will extract investigation details, identify missing evidence,
                    and prepare structured information for human review.
                  </p>
                </div>

                {error && (
                  <div className="error-message">
                    <AlertCircle size={17} />
                    {error}
                  </div>
                )}

                <div className="form-actions">
                  <button
                    className="secondary-button"
                    onClick={startNewInvestigation}
                  >
                    Reset
                  </button>

                  <button
                    className="primary-button"
                    onClick={handleExtraction}
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="spin" size={16} />
                        Extracting...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        Extract with AI
                        <ChevronRight size={16} />
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="recent-heading">
                <h2>Recent Investigations</h2>
                <button
                  className="view-all"
                  onClick={() => {
                    setActiveTab("investigations");
                    void loadInvestigations();
                  }}
                >
                  View All <ChevronRight size={15} />
                </button>
              </div>

              {investigations.length === 0 ? (
                <div className="empty-state">
                  <div><ClipboardList size={35} /></div>
                  <h3>No investigations yet</h3>
                  <p>Your saved investigations will appear here.</p>
                </div>
              ) : (
                <div className="workspace-card">
                  {investigations.slice(0, 5).map((item) => (
                    <div className="investigation-item" key={item.id}>
                      <div className="investigation-item-icon">
                        <FileText size={21} />
                      </div>

                      <div className="investigation-item-details">
                        <strong>{item.title}</strong>
                        <p>
                          {item.product_name || "Product not specified"}
                          {" · "}
                          {item.batch_number || "Batch not specified"}
                        </p>
                      </div>

                      <button
                        className="secondary-button"
                        onClick={() => openRCA(item.id)}
                      >
                        Open RCA
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* REVIEW EXTRACTION */}
          {activeTab === "review" && editedResult && (
            <div className="workspace-card">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">AI EXTRACTION RESULTS</span>
                  <h2 style={{ marginTop: 8 }}>
                    Review Extracted Information
                  </h2>
                  <p>
                    Verify and edit the information extracted from your investigation report.
                  </p>
                </div>

                <span className="draft-badge">
                  {savedInvestigationId ? "SAVED" : "PENDING REVIEW"}
                </span>
              </div>

              <div className="review-panel">
                <div className="review-header">
                  <h3>Investigation Details</h3>
                  <span className="confidence-badge">
                    Confidence: {editedResult.confidence || "Unknown"}
                  </span>
                </div>

                <div className="field-grid">
                  {renderInput("Investigation Title", "title", editedResult.title)}
                  {renderInput("Product Name", "product_name", editedResult.product_name)}
                  {renderInput("Batch Number", "batch_number", editedResult.batch_number)}
                  {renderInput("Process", "process", editedResult.process)}
                  {renderInput("Equipment", "equipment", editedResult.equipment)}
                  {renderInput("Event Date", "event_date", editedResult.event_date)}
                </div>

                {renderTextarea(
                  "Deviation Description",
                  "deviation_description",
                  editedResult.deviation_description
                )}

                <div className="field-grid">
                  {renderInput("Expected Result", "expected_result", editedResult.expected_result)}
                  {renderInput("Actual Result", "actual_result", editedResult.actual_result)}
                </div>

                {renderTextarea(
                  "Immediate Action Taken",
                  "immediate_action",
                  editedResult.immediate_action
                )}

                <div className="review-divider"></div>

                <h3 className="review-section-title">Initial Findings</h3>

                {renderArrayField(
                  "Initial Findings",
                  "initial_findings",
                  editedResult.initial_findings || []
                )}

                {renderArrayField(
                  "Contributing Factors",
                  "contributing_factors",
                  editedResult.contributing_factors || []
                )}

                {renderTextarea(
                  "Equipment Condition",
                  "equipment_condition",
                  editedResult.equipment_condition
                )}

                {renderTextarea(
                  "Operator Observation",
                  "operator_observation",
                  editedResult.operator_observation
                )}

                <div className="review-divider"></div>

                <h3 className="review-section-title">
                  Evidence Assessment
                </h3>

                {renderArrayField(
                  "Evidence Found",
                  "evidence_found",
                  editedResult.evidence_found || []
                )}

                {renderArrayField(
                  "Missing Evidence / Records to Review",
                  "missing_evidence",
                  editedResult.missing_evidence || []
                )}

                {renderTextarea(
                  "AI Source Summary",
                  "source_summary",
                  editedResult.source_summary
                )}
              </div>

              {savedInvestigationId && (
                <div className="success-message">
                  <CheckCircle2 size={18} />
                  Investigation saved successfully! Record ID: {savedInvestigationId}
                </div>
              )}

              {error && (
                <div className="error-message">
                  <AlertCircle size={17} />
                  {error}
                </div>
              )}

              <div className="form-actions">
                <button
                  className="secondary-button"
                  onClick={resetChanges}
                  disabled={saving || !!savedInvestigationId}
                >
                  <RotateCcw size={15} />
                  Reset Changes
                </button>

                <button
                  className="secondary-button"
                  onClick={() => setActiveTab("upload")}
                >
                  Back
                </button>

                <button
                  className="primary-button"
                  onClick={confirmDetails}
                  disabled={saving || !!savedInvestigationId}
                >
                  {saving ? (
                    <>
                      <Loader2 className="spin" size={16} />
                      Saving...
                    </>
                  ) : savedInvestigationId ? (
                    <>
                      <CheckCircle2 size={16} />
                      Saved Successfully
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} />
                      Confirm & Save
                    </>
                  )}
                </button>
              </div>

              <div className="info-note">
                <AlertCircle size={18} />
                <p>
                  Human review is required before the extracted information
                  is used for further RCA analysis.
                </p>
              </div>

              {savedInvestigationId && (
                <div className="form-actions">
                  <button
                    className="primary-button"
                    onClick={() => openRCA(savedInvestigationId)}
                  >
                    <Brain size={16} />
                    Continue to RCA Analysis
                  </button>
                </div>
              )}
            </div>
          )}

          {/* INVESTIGATIONS */}
          {activeTab === "investigations" && (
            <>
              <div className="welcome-row">
                <div>
                  <span className="eyebrow">QUALITY MANAGEMENT</span>
                  <h1>Investigations</h1>
                  <p className="subtitle">
                    View and manage your saved root cause investigations.
                  </p>
                </div>

                <button
                  className="primary-button"
                  onClick={startNewInvestigation}
                >
                  <Plus size={16} />
                  New Investigation
                </button>
              </div>

              <div className="workspace-card">
                <div className="section-heading">
                  <div>
                    <h2>Investigation Records</h2>
                    <p>
                      Total saved investigations: {investigations.length}
                    </p>
                  </div>

                  <button
                    className="secondary-button"
                    onClick={loadInvestigations}
                    disabled={fetchingInvestigations}
                  >
                    {fetchingInvestigations ? "Refreshing..." : "Refresh"}
                  </button>
                </div>

                {investigationError && (
                  <div className="error-message">
                    <AlertCircle size={17} />
                    {investigationError}
                  </div>
                )}

                {fetchingInvestigations ? (
                  <div className="empty-state">
                    <Loader2 className="spin" size={30} />
                    <p>Loading investigations...</p>
                  </div>
                ) : investigations.length === 0 ? (
                  <div className="empty-state">
                    <ClipboardList size={35} />
                    <h3>No investigations found</h3>
                    <p>Your saved investigation records will appear here.</p>
                  </div>
                ) : (
                  <div className="investigation-list">
                    {investigations.map((item) => (
                      <div className="investigation-item" key={item.id}>
                        <div className="investigation-item-icon">
                          <FileText size={21} />
                        </div>

                        <div className="investigation-item-details">
                          <strong>{item.title}</strong>
                          <p>
                            Product: {item.product_name || "Not specified"}
                          </p>
                          <p>
                            Batch: {item.batch_number || "Not specified"}
                            {" · "}
                            Process: {item.process || "Not specified"}
                          </p>
                          <small>
                            Record ID: {item.id}
                            {" · "}
                            {item.created_at
                              ? new Date(item.created_at).toLocaleDateString()
                              : "Date unavailable"}
                          </small>
                        </div>

                        <button
                          className="secondary-button"
                          onClick={() => openRCA(item.id)}
                        >
                          <Brain size={15} />
                          RCA Analysis
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* RCA ANALYSIS */}
          {activeTab === "rca" && (
            <>
              <div className="welcome-row">
                <div>
                  <span className="eyebrow">
                    AI INVESTIGATION WORKSPACE
                  </span>
                  <h1>Root Cause Analysis</h1>
                  <p className="subtitle">
                    Investigate potential causes using structured AI-assisted methods.
                  </p>
                </div>
              </div>

              <div className="workspace-card">
                <div className="section-heading">
                  <div>
                    <h2>Select Investigation</h2>
                    <p>
                      Choose a previously saved and human-reviewed investigation.
                    </p>
                  </div>
                </div>

                <div className="field-group">
                  <label className="field-label">
                    Investigation Record
                  </label>

                  <select
                    className="field-control"
                    value={selectedInvestigationId ?? ""}
                    onChange={(e) =>
                      handleInvestigationChange(e.target.value)
                    }
                  >
                    <option value="">Select an investigation</option>

                    {investigations.map((item) => (
                      <option key={item.id} value={item.id}>
                        #{item.id} - {item.title} (
                        {item.batch_number || "No batch"})
                      </option>
                    ))}
                  </select>
                </div>

                {selectedInvestigation && (
                  <div className="info-note">
                    <FileText size={18} />
                    <p>
                      {selectedInvestigation.product_name || "Product not specified"}
                      {" · "}
                      {selectedInvestigation.batch_number || "Batch not specified"}
                      {" · "}
                      {selectedInvestigation.process || "Process not specified"}
                    </p>
                  </div>
                )}

                <div className="review-divider"></div>

                <div className="input-heading">
                  <h3>Choose Analysis Method</h3>
                  <p>
                    Select the investigation technique you want the AI to use.
                  </p>
                </div>

                <div className="rca-method-grid">
                  <button
                    className={`rca-method-card ${analysisMethod === "five_whys" ? "selected" : ""}`}
                    onClick={() => {
                      dispatch(setAnalysisMethod("five_whys"));
                      dispatch(clearRCA());
                      setEditedAnalysis(null);
                      setAnalysisSuccess("");
                    }}
                  >
                    <div className="rca-method-icon">
                      <Search size={23} />
                    </div>
                    <h3>5 Whys Analysis</h3>
                    <p>
                      Explore the sequence of questions behind a deviation.
                    </p>
                    <small>Structured causal investigation</small>
                  </button>

                  <button
                    className={`rca-method-card ${analysisMethod === "fishbone" ? "selected" : ""}`}
                    onClick={() => {
                      dispatch(setAnalysisMethod("fishbone"));
                      dispatch(clearRCA());
                      setEditedAnalysis(null);
                      setAnalysisSuccess("");
                    }}
                  >
                    <div className="rca-method-icon">
                      <GitBranch size={23} />
                    </div>
                    <h3>Fishbone Analysis</h3>
                    <p>
                      Examine potential factors across six categories.
                    </p>
                    <small>
                      Man · Machine · Method · Material · Measurement · Environment
                    </small>
                  </button>
                </div>

                {analysisError && (
                  <div className="error-message">
                    <AlertCircle size={17} />
                    {analysisError}
                  </div>
                )}

                <div className="form-actions">
                  <button
                    className="primary-button"
                    onClick={generateAnalysis}
                    disabled={
                      analysisLoading || !selectedInvestigationId
                    }
                  >
                    {analysisLoading ? (
                      <>
                        <Loader2 className="spin" size={16} />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Sparkles size={16} />
                        Generate AI Analysis
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* GENERATED ANALYSIS */}
              {editedAnalysis && (
                <div className="workspace-card rca-results">
                  <div className="section-heading">
                    <div>
                      <span className="eyebrow">
                        AI GENERATED FINDINGS
                      </span>
                      <h2 style={{ marginTop: 8 }}>
                        Analysis Results
                      </h2>
                      <p>
                        Review the suggestions carefully. Potential causes
                        are not confirmed root causes.
                      </p>
                    </div>

                    <span className="draft-badge">
                      HUMAN REVIEW REQUIRED
                    </span>
                  </div>

                  <div className="field-group">
                    <label className="field-label">
                      Problem Statement
                    </label>
                    <textarea
                      className="field-control"
                      rows={3}
                      value={editedAnalysis.problem_statement || ""}
                      onChange={(e) =>
                        updateAnalysisField(
                          "problem_statement",
                          e.target.value
                        )
                      }
                    />
                  </div>

                  {/* 5 WHYS */}
                  {analysisMethod === "five_whys" && (
                    <>
                      <h3 className="review-section-title">
                        5 Whys Investigation
                      </h3>

                      {fiveWhysItems.length === 0 ? (
                        <div className="empty-state">
                          <p>No supported Why steps were generated.</p>
                        </div>
                      ) : (
                        <div className="rca-why-list">
                          {fiveWhysItems.map(
                            (item: any, index: number) => (
                              <div className="rca-why-item" key={index}>
                                <div className="rca-why-number">
                                  WHY {index + 1}
                                </div>

                                <div className="field-group">
                                  <label className="field-label">
                                    Question
                                  </label>
                                  <textarea
                                    className="field-control"
                                    rows={2}
                                    value={item.why || ""}
                                    onChange={(e) => {
                                      const next = [...fiveWhysItems];

                                      next[index] = {
                                        ...next[index],
                                        why: e.target.value,
                                      };

                                      updateAnalysisField(
                                        "five_whys",
                                        next
                                      );
                                    }}
                                  />
                                </div>

                                <div className="field-group">
                                  <label className="field-label">
                                    Answer / Finding
                                  </label>
                                  <textarea
                                    className="field-control"
                                    rows={3}
                                    value={item.answer || ""}
                                    onChange={(e) => {
                                      const next = [...fiveWhysItems];

                                      next[index] = {
                                        ...next[index],
                                        answer: e.target.value,
                                      };

                                      updateAnalysisField(
                                        "five_whys",
                                        next
                                      );
                                    }}
                                  />
                                </div>

                                <p className="field-help">
                                  Evidence status:{" "}
                                  {item.evidence_status || "unknown"}
                                </p>
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {/* FISHBONE */}
                  {analysisMethod === "fishbone" && (
                    <>
                      <h3 className="review-section-title">
                        Fishbone Categories
                      </h3>

                      {fishboneItems.length === 0 ? (
                        <div className="empty-state">
                          <p>No supported fishbone factors were generated.</p>
                        </div>
                      ) : (
                        <div className="rca-fishbone-grid">
                          {fishboneItems.map(
                            (item: any, index: number) => (
                              <div
                                className="rca-fishbone-card"
                                key={index}
                              >
                                <h3>
                                  {item.category || `Category ${index + 1}`}
                                </h3>

                                <p className="field-label">
                                  Potential Factors
                                </p>
                                <p>
                                  {toTextList(item.potential_factors).join(", ") ||
                                    "None documented"}
                                </p>

                                <p className="field-label">
                                  Supporting Evidence
                                </p>
                                <p>
                                  {toTextList(item.supporting_evidence).join(", ") ||
                                    "None documented"}
                                </p>

                                <p className="field-label">
                                  Evidence Gaps
                                </p>
                                <p>
                                  {toTextList(item.evidence_gaps).join(", ") ||
                                    "None identified"}
                                </p>
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {/* POTENTIAL ROOT CAUSES */}
                  <div className="review-divider"></div>

                  <h3 className="review-section-title">
                    Potential Root Causes
                  </h3>

                  {(editedAnalysis.potential_root_causes || []).length === 0 ? (
                    <div className="empty-state">
                      <p>
                        No potential root causes could be supported by the available information.
                      </p>
                    </div>
                  ) : (
                    editedAnalysis.potential_root_causes.map(
                      (cause: any, index: number) => (
                        <div className="rca-cause-card" key={index}>
                          <div className="review-header">
                            <h3>Potential Cause {index + 1}</h3>
                            <span className="confidence-badge">
                              {cause.confidence || "Unknown"} confidence
                            </span>
                          </div>

                          <div className="field-group">
                            <label className="field-label">
                              Potential Cause
                            </label>
                            <textarea
                              className="field-control"
                              rows={2}
                              value={cause.cause || ""}
                              onChange={(e) =>
                                updateCause(index, "cause", e.target.value)
                              }
                            />
                          </div>

                          <div className="field-group">
                            <label className="field-label">
                              Rationale
                            </label>
                            <textarea
                              className="field-control"
                              rows={3}
                              value={cause.rationale || ""}
                              onChange={(e) =>
                                updateCause(index, "rationale", e.target.value)
                              }
                            />
                          </div>

                          <div className="field-group">
                            <label className="field-label">
                              Supporting Observations
                            </label>
                            <textarea
                              className="field-control"
                              rows={3}
                              value={toTextList(cause.supporting_observations).join("\n")}
                              onChange={(e) =>
                                updateCause(
                                  index,
                                  "supporting_observations",
                                  e.target.value.split("\n").filter(Boolean)
                                )
                              }
                            />
                          </div>

                          <div className="field-group">
                            <label className="field-label">
                              Evidence Required
                            </label>
                            <textarea
                              className="field-control"
                              rows={3}
                              value={toTextList(cause.evidence_required).join("\n")}
                              onChange={(e) =>
                                updateCause(
                                  index,
                                  "evidence_required",
                                  e.target.value.split("\n").filter(Boolean)
                                )
                              }
                            />
                          </div>

                          <span className="draft-badge">
                            POTENTIAL - NOT CONFIRMED
                          </span>
                        </div>
                      )
                    )
                  )}

                  {/* CONTRIBUTING FACTORS */}
                  <div className="review-divider"></div>

                  <h3 className="review-section-title">
                    Contributing Factors
                  </h3>

                  <textarea
                    className="field-control"
                    rows={4}
                    value={toTextList(editedAnalysis.contributing_factors).join("\n")}
                    onChange={(e) =>
                      updateAnalysisField(
                        "contributing_factors",
                        e.target.value.split("\n").filter(Boolean)
                      )
                    }
                  />

                  {/* MISSING EVIDENCE */}
                  <div className="review-divider"></div>

                  <h3 className="review-section-title">
                    Missing Evidence
                  </h3>

                  <textarea
                    className="field-control"
                    rows={4}
                    value={toTextList(editedAnalysis.missing_evidence).join("\n")}
                    onChange={(e) =>
                      updateAnalysisField(
                        "missing_evidence",
                        e.target.value.split("\n").filter(Boolean)
                      )
                    }
                  />

                  {/* CAPA */}
                  <div className="review-divider"></div>

                  <h3 className="review-section-title">
                    Corrective and Preventive Actions (CAPA)
                  </h3>

                  {(Array.isArray(editedAnalysis.capa_recommendations)
                    ? editedAnalysis.capa_recommendations
                    : []
                  ).length === 0 ? (
                    <div className="empty-state">
                      <p>No CAPA recommendations generated.</p>
                    </div>
                  ) : (
                    editedAnalysis.capa_recommendations.map(
                      (item: CAPAItem, index: number) => (
                        <div className="rca-capa-card" key={index}>
                          <div className="review-header">
                            <h3>Action {index + 1}</h3>
                            <span className="draft-badge">
                              {(item.action_type || "proposed").toUpperCase()}
                            </span>
                          </div>

                          <div className="field-group">
                            <label className="field-label">
                              Recommended Action
                            </label>
                            <textarea
                              className="field-control"
                              rows={3}
                              value={item.action || ""}
                              onChange={(e) =>
                                updateCAPA(index, "action", e.target.value)
                              }
                            />
                          </div>

                          <div className="field-group">
                            <label className="field-label">
                              Rationale
                            </label>
                            <textarea
                              className="field-control"
                              rows={2}
                              value={item.rationale || ""}
                              onChange={(e) =>
                                updateCAPA(index, "rationale", e.target.value)
                              }
                            />
                          </div>

                          <div className="field-group">
                            <label className="field-label">
                              Related Potential Cause
                            </label>
                            <input
                              className="field-control"
                              value={item.related_potential_cause || ""}
                              onChange={(e) =>
                                updateCAPA(
                                  index,
                                  "related_potential_cause",
                                  e.target.value
                                )
                              }
                            />
                          </div>

                          <div className="field-group">
                            <label className="field-label">
                              Effectiveness Check
                            </label>
                            <textarea
                              className="field-control"
                              rows={2}
                              value={item.effectiveness_check || ""}
                              onChange={(e) =>
                                updateCAPA(
                                  index,
                                  "effectiveness_check",
                                  e.target.value
                                )
                              }
                            />
                          </div>

                          <div className="field-grid">
                            <div className="field-group">
                              <label className="field-label">Owner</label>
                              <input
                                className="field-control"
                                value={item.owner || ""}
                                placeholder="Assign owner"
                                onChange={(e) =>
                                  updateCAPA(
                                    index,
                                    "owner",
                                    e.target.value || null
                                  )
                                }
                              />
                            </div>

                            <div className="field-group">
                              <label className="field-label">
                                Target Date
                              </label>
                              <input
                                className="field-control"
                                type="date"
                                value={item.target_date || ""}
                                onChange={(e) =>
                                  updateCAPA(
                                    index,
                                    "target_date",
                                    e.target.value || null
                                  )
                                }
                              />
                            </div>
                          </div>
                        </div>
                      )
                    )
                  )}

                  {/* LIMITATIONS */}
                  <div className="review-divider"></div>

                  <h3 className="review-section-title">
                    Investigation Limitations
                  </h3>

                  <textarea
                    className="field-control"
                    rows={3}
                    value={toTextList(editedAnalysis.investigation_limitations).join("\n")}
                    onChange={(e) =>
                      updateAnalysisField(
                        "investigation_limitations",
                        e.target.value.split("\n").filter(Boolean)
                      )
                    }
                  />

                  <div className="info-note">
                    <ShieldCheck size={18} />
                    <p>
                      AI-generated causes and CAPA are recommendations only.
                      Qualified human review and evidence verification are required
                      before approval or implementation.
                    </p>
                  </div>

                  {analysisSuccess && (
                    <div className="success-message">
                      <CheckCircle2 size={18} />
                      {analysisSuccess}
                    </div>
                  )}

                  {analysisError && (
                    <div className="error-message">
                      <AlertCircle size={17} />
                      {analysisError}
                    </div>
                  )}

                  <div className="form-actions">
                    <button
                      className="secondary-button"
                      onClick={resetRCAChanges}
                      disabled={analysisSaving}
                    >
                      <RotateCcw size={15} />
                      Reset Changes
                    </button>

                    <button
                      className="primary-button"
                      onClick={saveRCAAnalysis}
                      disabled={analysisSaving}
                    >
                      {analysisSaving ? (
                        <>
                          <Loader2 className="spin" size={16} />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Save size={16} />
                          Save RCA & CAPA
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* SETTINGS */}
          {activeTab === "settings" && (
            <div className="workspace-card">
              <div className="section-heading">
                <div>
                  <h2>Settings</h2>
                  <p>Application configuration and preferences.</p>
                </div>
              </div>

              <div className="settings-item">
                <div>
                  <strong>Application</strong>
                  <p>AIVOA.AI Root Cause Analysis</p>
                </div>
                <span className="draft-badge">ACTIVE</span>
              </div>

              <div className="settings-item">
                <div>
                  <strong>AI Engine</strong>
                  <p>Groq API with LangGraph workflow</p>
                </div>
                <span className="draft-badge">CONFIGURED</span>
              </div>

              <div className="settings-item">
                <div>
                  <strong>Database</strong>
                  <p>PostgreSQL</p>
                </div>
                <span className="draft-badge">CONFIGURED</span>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
