(function () {
if (window.__CINEMAVERSE_AUTH_BOOTSTRAPPED) {
  console.warn('[auth] auth.js already loaded; skipping duplicate initialization.');
  return;
}
window.__CINEMAVERSE_AUTH_BOOTSTRAPPED = true;

// 1) Init Supabase
const SUPABASE_URL = "https://hvbeswqunsadayqghhzv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2YmVzd3F1bnNhZGF5cWdoaHp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI1NjQzNjcsImV4cCI6MjA3ODE0MDM2N30.rDvyGxFt8XO632S1Zw0ZANvYZaSsGgSb_pW49DXMMMg";
const SUPABASE_WAIT_TIMEOUT_MS = 8000;
const SUPABASE_WAIT_INTERVAL_MS = 25;
const SUPABASE_SDK_URLS = [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2",
  "https://unpkg.com/@supabase/supabase-js@2",
];

let supabase = null;
let supabaseInitPromise = null;
let supabaseSdkLoadPromise = null;

window.__SUPABASE_CONFIG = {
  url: SUPABASE_URL,
  anonKey: SUPABASE_ANON_KEY,
};

function waitForSupabaseSdk(timeoutMs = SUPABASE_WAIT_TIMEOUT_MS) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    const tick = () => {
      if (window.supabase && typeof window.supabase.createClient === "function") {
        resolve();
        return;
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error("Supabase CDN SDK did not load within the expected time window"));
        return;
      }

      window.setTimeout(tick, SUPABASE_WAIT_INTERVAL_MS);
    };

    tick();
  });
}

function loadScript(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${url}"]`);
    if (existing) {
      window.setTimeout(() => resolve(), 0);
      return;
    }

    const script = document.createElement("script");
    script.src = url;
    script.async = true;

    const timeout = window.setTimeout(() => {
      script.remove();
      reject(new Error(`Timed out loading script: ${url}`));
    }, timeoutMs);

    script.onload = () => {
      window.clearTimeout(timeout);
      resolve();
    };
    script.onerror = () => {
      window.clearTimeout(timeout);
      script.remove();
      reject(new Error(`Failed to load script: ${url}`));
    };

    document.head.appendChild(script);
  });
}

async function ensureSupabaseSdkLoaded() {
  if (window.supabase && typeof window.supabase.createClient === "function") {
    return;
  }

  if (supabaseSdkLoadPromise) {
    return supabaseSdkLoadPromise;
  }

  supabaseSdkLoadPromise = (async () => {
    try {
      await waitForSupabaseSdk(1500);
      return;
    } catch (_) {
      // Continue to script injection fallback.
    }

    let lastError = null;
    for (const url of SUPABASE_SDK_URLS) {
      try {
        await loadScript(url);
        await waitForSupabaseSdk(2500);
        return;
      } catch (error) {
        lastError = error;
        console.warn("[auth] Supabase SDK load attempt failed:", url, error);
      }
    }

    throw lastError || new Error("Unable to load Supabase SDK");
  })().catch((error) => {
    supabaseSdkLoadPromise = null;
    throw error;
  });

  return supabaseSdkLoadPromise;
}

function createSupabaseClient() {
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    console.error("[auth] Supabase SDK not loaded. Ensure @supabase/supabase-js v2 CDN script is included before auth.js");
    return null;
  }

  try {
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage,
      },
    });
  } catch (error) {
    console.error("[auth] Failed to create Supabase client", error);
    return null;
  }
}

async function initSupabaseClient() {
  if (window.supabaseClient) {
    supabase = window.supabaseClient;
    return supabase;
  }

  if (supabase) {
    return supabase;
  }

  if (!supabaseInitPromise) {
    supabaseInitPromise = (async () => {
      await ensureSupabaseSdkLoaded();

      if (window.supabaseClient) {
        supabase = window.supabaseClient;
        return supabase;
      }

      const client = createSupabaseClient();
      if (!client) {
        throw new Error("Unable to initialize Supabase client");
      }

      supabase = client;
      window.supabaseClient = client;
      return client;
    })().catch((error) => {
      supabaseInitPromise = null;
      throw error;
    });
  }

  return supabaseInitPromise;
}

async function getSupabaseClient() {
  if (supabase) return supabase;

  try {
    return await initSupabaseClient();
  } catch (error) {
    logAuthError("getSupabaseClient failed", error);
    return null;
  }
}

function getOrCreateSupabaseClientSync() {
  if (window.supabaseClient) {
    supabase = window.supabaseClient;
    return supabase;
  }

  const client = createSupabaseClient();
  if (client) {
    supabase = client;
    window.supabaseClient = client;
  }

  return client;
}

window.createSupabaseClient = getOrCreateSupabaseClientSync;
window.ensureSupabaseClient = initSupabaseClient;

async function showLoginPopup() {
  const client = await getSupabaseClient();
  if (!client) return;

  const { data: { user } } = await client.auth.getUser();
  if (!user) return;

  // 1) Try profiles.full_name
  let fullName = null;
  let profileError = null;

  try {
    const { data: profile, error } = await client
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();
    profileError = error;
    fullName = profile?.full_name || null;
  } catch (_) {}

  // 2) Fallbacks
  if (!fullName) fullName = user.user_metadata?.full_name || null;
  if (!fullName && user.email) fullName = user.email.split("@")[0];

  const popup = document.getElementById("welcome-popup");
  if (!popup || !fullName) return;

  popup.textContent = `Hi, ${fullName}`;
  popup.classList.add("show");
  setTimeout(() => popup.classList.remove("show"), 2000);
}

function logAuthError(context, error, extra = {}) {
  console.error(`[auth] ${context}`, {
    message: error?.message || "Unknown error",
    status: error?.status,
    name: error?.name,
    code: error?.code,
    error,
    ...extra,
  });
}

async function getActiveSession() {
  const client = await getSupabaseClient();
  if (!client) {
    throw new Error("Supabase client unavailable");
  }

  const { data, error } = await client.auth.getSession();
  if (error) {
    throw error;
  }

  return data?.session || null;
}

function revealProtectedPage() {
  if (typeof window.__CINEMAVERSE_UNHIDE_BODY__ === "function") {
    window.__CINEMAVERSE_UNHIDE_BODY__();
    return;
  }

  if (document.body) {
    document.body.style.display = "";
  }
}

// 2) Protect Page
async function requireAuth(options = {}) {
  const allowHydrationRetry = options.allowHydrationRetry !== false;

  try {
    let session = await getActiveSession();

    // Give storage/session hydration a brief grace window after navigation.
    if (!session && allowHydrationRetry) {
      for (let i = 0; i < 8; i += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 75));
        session = await getActiveSession();
        if (session) break;
      }
    }

    // Fallback for edge cases where memory session is stale but user is valid.
    if (!session) {
      const client = await getSupabaseClient();
      if (!client) {
        throw new Error("Supabase client unavailable");
      }

      const { data: userData, error: userError } = await client.auth.getUser();
      if (userError) {
        throw userError;
      }

      if (userData?.user) {
        session = await getActiveSession();
      }
    }

    if (session) {
      console.log("[auth] Active session found:", session.user?.email);
      return session;
    }

    console.log("[auth] No active session found");
    return null;
  } catch (error) {
    logAuthError("requireAuth failed", error);
    return null;
  }
}

// 3) Show Login/Logout UI correctly
async function updateAuthUI() {
  try {
    const session = await getActiveSession();
    const loginBtns = document.querySelectorAll(".login-button");
    const logoutBtns = document.querySelectorAll(".logout-button");

    console.log("[auth] Updating UI, session:", session ? "exists" : "none");

    if (session) {
      loginBtns.forEach(btn => {
        if (btn) btn.style.display = "none";
      });
      logoutBtns.forEach(btn => {
        if (btn) btn.style.display = "inline-block";
      });
    } else {
      loginBtns.forEach(btn => {
        if (btn) btn.style.display = "inline-block";
      });
      logoutBtns.forEach(btn => {
        if (btn) btn.style.display = "none";
      });
    }
  } catch (error) {
    logAuthError("updateAuthUI failed", error);
  }
  if (localStorage.getItem("showGreeting") === "yes") {
    localStorage.removeItem("showGreeting");
    setTimeout(showLoginPopup, 300);
  }

}

// 4) Logout Function
async function logout() {
  try {
    const client = await getSupabaseClient();
    if (!client) {
      throw new Error("Supabase client unavailable");
    }

    const { error } = await client.auth.signOut();
    if (error) throw error;

    console.log("[auth] Logged out successfully");
    window.location.replace('login.html');
  } catch (error) {
    logAuthError("logout failed", error);
    alert('Error logging out. Please try again.');
  }
}

// Cache for active session state
let activeSession = null;

const PUBLIC_PAGES = ['login.html', 'reset-password.html', 'password-reset-new.html'];
const PROTECTED_PAGES = [
  'index.html',
  'movies.html',
  'series.html',
  'watchlist.html',
  'gallery.html',
  'contact.html',
  'about.html',
];

function getCurrentPageName() {
  const page = window.location.pathname.split('/').pop();
  return page || 'index.html';
}

function isPublicPage(pageName = getCurrentPageName()) {
  return PUBLIC_PAGES.includes(pageName);
}

function isProtectedPage(pageName = getCurrentPageName()) {
  return PROTECTED_PAGES.includes(pageName);
}

// Check if current page needs authentication
async function checkAuth() {
  const currentPage = getCurrentPageName();

  console.log('[auth] Checking auth for page:', currentPage);

  // Keep public pages open (login/reset pages).
  if (isPublicPage(currentPage)) {
    console.log('[auth] Public page detected, skipping auth redirect:', currentPage);
    return true;
  }

  // Non-listed pages are not redirected by the global guard.
  if (!isProtectedPage(currentPage)) {
    console.log('[auth] Page is not in protected allowlist, skipping auth redirect:', currentPage);
    return true;
  }

  // Check session if we don't have one cached
  if (!activeSession) {
    console.log('[auth] Checking session status...');
    activeSession = await requireAuth({ allowHydrationRetry: false });
  }

  if (activeSession) {
    console.log('[auth] Valid session found, allowing access');
    return true;
  }

  // Only redirect if no session found
  console.log('[auth] No valid session, redirecting to login');
  const redirectTarget = `${currentPage}${window.location.search || ''}${window.location.hash || ''}`;
  window.location.replace('login.html?redirect=' + encodeURIComponent(redirectTarget));
  return false;
}

// Initialize authentication on page load
async function initAuth() {
  if (await checkAuth()) {
    await updateAuthUI();
  }
}

async function enforcePageAuth(options = {}) {
  const shouldUpdateUI = options.updateUI !== false;
  const allowed = await checkAuth();
  if (!allowed) return false;
  revealProtectedPage();
  if (shouldUpdateUI) {
    await updateAuthUI();
  }
  return true;
}

// Make these accessible to HTML
window.requireAuth = requireAuth;
window.updateAuthUI = updateAuthUI;
window.logout = logout;
window.checkAuth = checkAuth;
window.initAuth = initAuth;
window.enforcePageAuth = enforcePageAuth;

// Auto update UI on auth change
let authStateListenerBound = false;

async function bindAuthStateListener() {
  if (authStateListenerBound) return;

  const client = await getSupabaseClient();
  if (!client) return;

  client.auth.onAuthStateChange((event, session) => {
    console.log('[auth] Auth state changed:', event, 'Session:', session ? 'exists' : 'none');
    activeSession = session || null;

    // Only redirect on sign out
    if (event === 'SIGNED_OUT') {
      const currentPage = window.location.pathname.split('/').pop() || 'index.html';
      const publicPages = ['login.html', 'reset-password.html', 'password-reset-new.html'];
      if (!publicPages.includes(currentPage)) {
        window.location.replace('login.html');
      }
      return;
    }

    // For sign in, stay on current page and update UI
    if (event === 'SIGNED_IN') {
      updateAuthUI();
      return;
    }

    // For token refresh etc, just update UI
    updateAuthUI();
  });

  authStateListenerBound = true;
}

initSupabaseClient()
  .then(() => bindAuthStateListener())
  .catch((error) => {
    logAuthError("initial Supabase initialization failed", error);
  });

window.addEventListener('load', () => {
  bindAuthStateListener();
});

// Global page guard: auto-enforce auth on protected routes as soon as auth.js loads.
if (isProtectedPage()) {
  if (document.readyState === 'loading') {
    enforcePageAuth({ updateUI: false });
    document.addEventListener('DOMContentLoaded', () => {
      updateAuthUI();
    }, { once: true });
  } else {
    enforcePageAuth({ updateUI: true });
  }
}

})();
