// Hosted frontend and API share one origin. An explicit window override supports local UI tests.
const DEFAULT_BASE_URL = window.location.protocol === "file:" ? "http://127.0.0.1:8000" : window.location.origin;
const BASE_URL = (window.FINANCE_CONSOLE_API_URL || DEFAULT_BASE_URL).replace(/\/$/, "");

let activeRequests = 0;
const responseCache = new Map();
const CACHE_TTL = 60 * 1000;

function getAuthToken() {
  return localStorage.getItem("FINANCE_CONSOLE_AUTH_TOKEN") || "";
}

function getSelectedOutletId() {
  return localStorage.getItem("FINANCE_CONSOLE_SELECTED_OUTLET_ID") || "";
}

function clearAuthState() {
  clearApiCache();
  localStorage.removeItem("FINANCE_CONSOLE_AUTH_TOKEN");
  localStorage.removeItem("FINANCE_CONSOLE_AUTH_USER");
  localStorage.removeItem("FINANCE_CONSOLE_SELECTED_OUTLET_ID");
  if (typeof handleAuthExpired === "function") {
    handleAuthExpired();
  }
}

function clearApiCache() {
  responseCache.clear();
}

function responseCacheKey(url, method = "GET") {
  return `${method}:${url}|scope:${getSelectedOutletId()}:${getAuthToken()}`;
}

function clearCachedResponse(url, method = "GET") {
  const prefix = `${method}:${url}|scope:`;
  for (const key of responseCache.keys()) if (key.startsWith(prefix)) responseCache.delete(key);
}

function clearCachedResponsesByPrefix(prefix, method = "GET") {
  const keyPrefix = `${method}:${prefix}`;
  Array.from(responseCache.keys()).forEach(key => {
    if (key.startsWith(keyPrefix)) {
      responseCache.delete(key);
    }
  });
}

async function apiCall(url, method = "GET", body = null, headers = {}, apiOptions = {}) {
    const shouldShowLoader = apiOptions.loader === true || method !== "GET";
    const useCache = apiOptions.cache === true && method === "GET";
    const cacheKey = responseCacheKey(url, method);

    if (useCache) {
      const cached = responseCache.get(cacheKey);
      if (cached && Date.now() - cached.time < CACHE_TTL) {
        return cached.data;
      }
    }

    if (shouldShowLoader) showLoading(requestMessage(method, url));

    const options = {
      method: method,
      headers: { ...headers },
    };

    try {
      const authToken = getAuthToken();
      if (authToken) {
        options.headers["X-Auth-Token"] = authToken;
      }

      const selectedOutletId = getSelectedOutletId();
      if (selectedOutletId) {
        options.headers["X-Outlet-Id"] = selectedOutletId;
      }

      if (body) {
        options.body = body;
        if (method === "POST" && ["/retail-bills", "/payment-receipts"].includes(url)) {
          const requestId = JSON.parse(body).request_id;
          if (requestId) options.headers["Idempotency-Key"] = requestId;
        }
      }

      const res = await fetchWithRetry(BASE_URL + url, options);

      if (authToken !== getAuthToken() || selectedOutletId !== getSelectedOutletId()) {
        throw new Error("Outlet or account changed while the request was running");
      }
      if (res.status === 401) {
        let errorMessage = "AUTH_REQUIRED";
        try {
          const payload = await res.clone().json();
          const authDetail = payload?.error || payload?.detail;
          if (authDetail) errorMessage = String(authDetail);
        } catch (e) {
          // ignore parse issues and fall back to generic auth error
        }
        clearAuthState();
        throw new Error(errorMessage || "AUTH_REQUIRED");
      }

      if (!res.ok) {
        const errorBody = await res.json().catch(() => ({}));
        const error = new Error(typeof errorBody.detail === "string" ? errorBody.detail : errorBody.error || `API error: ${res.status}`);
        error.status = res.status;
        throw error;
      }

      const data = await res.json();

      if (data && data.error) {
        console.warn("API returned an error:", data.error);
      }

      if (useCache) {
        responseCache.set(cacheKey, { data, time: Date.now() });
      }

      return data;
    } finally {
      if (shouldShowLoader) hideLoading();
    }
  }

async function optionalApiCall(url, fallback, method = "GET", body = null, options = {}) {
  try {
    return await apiCall(url, method, body, {}, { loader: false, cache: method === "GET", ...options });
  } catch (e) {
    console.warn(`Optional API unavailable: ${url}`, e);
    return fallback;
  }
}

async function fetchWithRetry(url, options = {}, attempts = 2) {
  // A lost response does not mean a write failed. Retry only reads or deduplicated documents.
  const method = String(options.method || "GET").toUpperCase();
  if (!["GET", "HEAD", "OPTIONS"].includes(method) && !options.headers?.["Idempotency-Key"]) attempts = 0;
  let lastError;

  for (let attempt = 0; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok || response.status < 500 || attempt === attempts) {
        return response;
      }
    } catch (e) {
      lastError = e;
      if (attempt === attempts) throw e;
    }

    await wait(1200 * (attempt + 1));
  }

  throw lastError || new Error("Network request failed");
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function showLoading(message = "Processing...") {
  activeRequests += 1;
  const loader = document.getElementById("globalLoader");
  const text = document.getElementById("loaderText");

  if (text) text.innerText = message;
  if (loader) {
    loader.classList.add("show");
    loader.setAttribute("aria-hidden", "false");
  }
}

function hideLoading() {
  activeRequests = Math.max(0, activeRequests - 1);
  if (activeRequests > 0) return;

  const loader = document.getElementById("globalLoader");
  if (loader) {
    loader.classList.remove("show");
    loader.setAttribute("aria-hidden", "true");
  }
}

async function withLoading(message, callback) {
  showLoading(message);
  try {
    return await callback();
  } finally {
    hideLoading();
  }
}

function getCachedResponse(url, method = "GET") {
  const cached = responseCache.get(responseCacheKey(url, method));
  if (!cached || Date.now() - cached.time >= CACHE_TTL) return null;
  return cached.data;
}

function clearOperationalCaches() {
  clearCachedResponsesByPrefix("/top-debtors");
  clearCachedResponsesByPrefix("/top-payables");
  clearCachedResponsesByPrefix("/party/profile");
  clearCachedResponsesByPrefix("/party/detail");
  clearCachedResponsesByPrefix("/party/ledger");
  clearCachedResponsesByPrefix("/dashboard?date=");
  clearCachedResponsesByPrefix("/inventory/by-item?date=");
  clearCachedResponsesByPrefix("/analytics/trend?");
  clearCachedResponsesByPrefix("/analytics/summary?");
  clearCachedResponsesByPrefix("/analytics/leakage?");
  clearCachedResponsesByPrefix("/analytics/item-volume?");
  clearCachedResponsesByPrefix("/analytics/payment-modes?");
  clearCachedResponsesByPrefix("/daily-sheet?");
}

function requestMessage(method, url) {
  if (method === "POST") return "Processing...";
  if (url.includes("analytics")) return "Loading analytics...";
  if (url.includes("dashboard")) return "Loading dashboard...";
  if (url.includes("ledger") || url.includes("party")) return "Loading ledger...";
  if (url.includes("reports")) return "Preparing report...";
  return "Loading...";
}
