const API_BASE = '/api';
const TOKEN_KEY = 'reverse_ai_token';

export function getAuthToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setAuthToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
  } catch {}
}

export function clearAuthToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

function authHeaders(extra = {}) {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}`, ...extra } : { ...extra };
}

export async function registerAccount(name, email, password) {
  const res = await fetch(`${API_BASE}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Registration failed');
  if (data.access_token) setAuthToken(data.access_token);
  return data;
}

export async function loginAccount(email, password) {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Sign in failed');
  if (data.access_token) setAuthToken(data.access_token);
  return data;
}

export async function fetchCurrentUser() {
  const token = getAuthToken();
  if (!token) return null;
  const res = await fetch(`${API_BASE}/auth/me`, { headers: authHeaders() });
  if (!res.ok) {
    clearAuthToken();
    return null;
  }
  return res.json();
}

export async function fetchInvestigations({ search = '', status = '', sortBy = 'updated_at', sortOrder = 'desc' } = {}) {
  const params = new URLSearchParams();
  if (search) params.set('search', search);
  if (status && status !== 'All') params.set('status', status.toLowerCase());
  if (sortBy) params.set('sort_by', sortBy);
  if (sortOrder) params.set('sort_order', sortOrder);
  const qs = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${API_BASE}/investigations${qs}`, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to fetch investigations' }));
    throw new Error(err.detail || 'Failed to fetch investigations');
  }
  return res.json();
}

export async function fetchInvestigation(id) {
  const res = await fetch(`${API_BASE}/investigations/${encodeURIComponent(id)}`, { headers: authHeaders() });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to fetch investigation' }));
    const error = new Error(err.detail || 'Failed to fetch investigation');
    error.status = res.status;
    throw error;
  }
  return res.json();
}

export async function createInvestigation(formData) {
  const res = await fetch(`${API_BASE}/investigations`, {
    method: 'POST',
    headers: authHeaders(),
    body: formData
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to create investigation' }));
    throw new Error(err.detail || 'Failed to create investigation');
  }
  return res.json();
}

export async function updateInvestigation(id, payload) {
  const res = await fetch(`${API_BASE}/investigations/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to update investigation' }));
    throw new Error(err.detail || 'Failed to update investigation');
  }
  return res.json();
}

export async function deleteInvestigation(id) {
  const res = await fetch(`${API_BASE}/investigations/${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to delete investigation' }));
    throw new Error(err.detail || 'Failed to delete investigation');
  }
  return res.json();
}

export async function runInvestigationAnalysis(id) {
  const res = await fetch(`${API_BASE}/investigations/${encodeURIComponent(id)}/run-analysis`, {
    method: 'POST'
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Analysis execution failed' }));
    throw new Error(err.detail || 'Analysis execution failed');
  }
  return res.json();
}

export async function uploadDataset(invId, file, name, isSupplemental = false) {
  const formData = new FormData();
  formData.append('file', file);
  if (name) formData.append('dataset_name', name);
  formData.append('is_supplemental', isSupplemental);

  const res = await fetch(`${API_BASE}/investigations/${invId}/datasets/upload`, {
    method: 'POST',
    body: formData
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
    throw new Error(err.detail || 'Upload failed');
  }
  return res.json();
}

export async function previewDataset(invId, dsId) {
  const res = await fetch(`${API_BASE}/investigations/${invId}/datasets/${dsId}/preview`);
  if (!res.ok) throw new Error('Failed to preview dataset');
  return res.json();
}

export async function deleteDataset(invId, dsId) {
  const res = await fetch(`${API_BASE}/investigations/${encodeURIComponent(invId)}/datasets/${encodeURIComponent(dsId)}`, {
    method: 'DELETE'
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to remove dataset' }));
    throw new Error(err.detail || 'Failed to remove dataset');
  }
  return res.json();
}

export async function fuseDatasets(invId) {
  const res = await fetch(`${API_BASE}/investigations/${invId}/fuse`, {
    method: 'POST'
  });
  if (!res.ok) throw new Error('Failed to fuse datasets');
  return res.json();
}

export async function triggerAnomalyDiscovery(invId, metricCol, background = false) {
  const form = new FormData();
  if (metricCol) form.append('metric_col', metricCol);
  if (background) form.append('background', 'true');
  const res = await fetch(`${API_BASE}/investigations/${encodeURIComponent(invId)}/discover`, {
    method: 'POST',
    body: form
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Pattern discovery failed' }));
    throw new Error(err.detail || 'Pattern discovery failed');
  }
  return res.json();
}

export async function toggleFindingMark(invId, findingId, marked) {
  const res = await fetch(`${API_BASE}/investigations/${encodeURIComponent(invId)}/findings/${encodeURIComponent(findingId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ marked_for_investigation: marked })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Failed to update finding' }));
    throw new Error(err.detail || 'Failed to update finding');
  }
  return res.json();
}

export async function evaluateHypotheses(invId) {
  const res = await fetch(`${API_BASE}/investigations/${invId}/hypotheses/evaluate`, {
    method: 'POST'
  });
  if (!res.ok) throw new Error('Hypothesis evaluation failed');
  return res.json();
}

export async function runWhatIfSimulation(invId, targetCol, predictorCol, deltaPct) {
  const res = await fetch(`${API_BASE}/investigations/${encodeURIComponent(invId)}/what-if`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      target_col: targetCol,
      predictor_col: predictorCol,
      delta_pct: Number(deltaPct)
    })
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'What-If simulation failed' }));
    throw new Error(err.detail || 'What-If simulation failed');
  }
  return res.json();
}

export async function generateRecommendations(invId) {
  const res = await fetch(`${API_BASE}/investigations/${invId}/recommendations/generate`, {
    method: 'POST'
  });
  if (!res.ok) throw new Error('Recommendations formulation failed');
  return res.json();
}

export async function optimizeBudget(invId, maxBudget, maxDays, maxObservations = 500, maxParallel = 3) {
  const form = new FormData();
  form.append('max_budget', maxBudget);
  form.append('max_days', maxDays);
  form.append('max_observations', maxObservations);
  form.append('max_parallel_experiments', maxParallel);
  const res = await fetch(`${API_BASE}/investigations/${invId}/budget/optimize`, {
    method: 'POST',
    body: form
  });
  if (!res.ok) throw new Error('Budget optimization failed');
  return res.json();
}

export async function fetchInvestigationCharts(invId) {
  const res = await fetch(`${API_BASE}/investigations/${invId}/charts`);
  if (!res.ok) throw new Error('Failed to fetch chart data');
  return res.json();
}

export async function fetchSettingsStatus() {
  const res = await fetch(`${API_BASE}/settings/status`);
  if (!res.ok) throw new Error('Failed to fetch settings status');
  return res.json();
}

export async function uploadSupplementalEvidence(invId, file, datasetName) {
  const formData = new FormData();
  formData.append('file', file);
  if (datasetName) formData.append('dataset_name', datasetName);
  const res = await fetch(`${API_BASE}/investigations/${invId}/evidence/supplement`, {
    method: 'POST',
    body: formData
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Supplemental upload failed' }));
    throw new Error(err.detail || 'Supplemental upload failed');
  }
  return res.json();
}

export async function getReport(invId) {
  const res = await fetch(`${API_BASE}/investigations/${invId}/report`);
  if (!res.ok) throw new Error('Failed to fetch report');
  return res.json();
}

export async function loadDemoScenario() {
  const res = await fetch(`${API_BASE}/demo/load-manufacturing`, {
    method: 'POST'
  });
  if (!res.ok) throw new Error('Failed to initialize demo scenario');
  return res.json();
}

export async function executeDemoNextStep() {
  const res = await fetch(`${API_BASE}/demo/execute-next-step`, {
    method: 'POST'
  });
  if (!res.ok) throw new Error('Failed to execute demo next step');
  return res.json();
}
