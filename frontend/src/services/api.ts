
const API_BASE_URL = "http://localhost:8000";
const TOKEN_KEY = "aivoa_access_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function logoutUser() {
  localStorage.removeItem(TOKEN_KEY);
}

async function handleResponse(response: Response) {
  if (response.status === 204) return null;

  const text = await response.text();
  const result = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(
      result.detail || result.message || "Something went wrong"
    );
  }

  return result.data ?? result;
}

async function apiRequest(
  endpoint: string,
  options: RequestInit = {},
  requiresAuth = true
) {
  const headers = new Headers(options.headers);

  if (requiresAuth) {
    const token = getToken();
    if (token) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  if (
    options.body &&
    !(options.body instanceof FormData) &&
    !headers.has("Content-Type")
  ) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  return handleResponse(response);
}

// Authentication

export async function registerUser(data: {
  full_name: string;
  email: string;
  password: string;
}) {
  const result = await apiRequest(
    "/api/auth/register",
    {
      method: "POST",
      body: JSON.stringify(data),
    },
    false
  );

  localStorage.setItem(TOKEN_KEY, result.access_token);
  return result;
}

export async function loginUser(data: {
  email: string;
  password: string;
}) {
  const result = await apiRequest(
    "/api/auth/login",
    {
      method: "POST",
      body: JSON.stringify(data),
    },
    false
  );

  localStorage.setItem(TOKEN_KEY, result.access_token);
  return result;
}

export async function getCurrentUser() {
  return apiRequest("/api/auth/me");
}

// AI extraction

export async function extractRCA(sourceText: string) {
  return apiRequest("/api/ai/extract", {
    method: "POST",
    body: JSON.stringify({ text: sourceText }),
  });
}

export async function extractRCAFromPDF(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  return apiRequest("/api/ai/extract-pdf", {
    method: "POST",
    body: formData,
  });
}

// Investigations

export async function getInvestigations() {
  return apiRequest("/api/investigations");
}

export async function getInvestigationById(id: number) {
  return apiRequest(`/api/investigations/${id}`);
}

export async function saveInvestigation(data: any) {
  return apiRequest("/api/investigations", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updateInvestigation(id: number, data: any) {
  return apiRequest(`/api/investigations/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

export async function deleteInvestigation(id: number) {
  return apiRequest(`/api/investigations/${id}`, {
    method: "DELETE",
  });
}

// Backend health

export async function checkBackendHealth() {
  return apiRequest("/api/health", {}, false);
}

// RCA analysis

export async function analyzeRCA(
  investigationId: number,
  method: "five_whys" | "fishbone"
) {
  return apiRequest("/api/ai/analyze-rca", {
    method: "POST",
    body: JSON.stringify({
      investigation_id: investigationId,
      method,
    }),
  });
}
