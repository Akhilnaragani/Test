"use strict";

(function initCinemaversePerformanceUtils() {
  if (window.cinemaversePerf) return;

  const CACHE_PREFIX = "cinemaverse_cache::";
  const CACHE_SIGNAL_KEY = "cinemaverse_cache_signal";

  function now() {
    return Date.now();
  }

  function makeCacheKey(key) {
    return `${CACHE_PREFIX}${key}`;
  }

  function safeJsonParse(value) {
    try {
      return JSON.parse(value);
    } catch (_) {
      return null;
    }
  }

  function getCache(key, ttlMs) {
    const raw = localStorage.getItem(makeCacheKey(key));
    if (!raw) return null;

    const parsed = safeJsonParse(raw);
    if (!parsed || !parsed.timestamp || !("data" in parsed)) return null;

    if (typeof ttlMs === "number" && ttlMs > 0 && now() - parsed.timestamp > ttlMs) {
      localStorage.removeItem(makeCacheKey(key));
      return null;
    }

    return parsed.data;
  }

  function setCache(key, data) {
    try {
      localStorage.setItem(
        makeCacheKey(key),
        JSON.stringify({
          timestamp: now(),
          data
        })
      );
    } catch (_) {
      // Ignore storage quota issues and continue without cache.
    }
  }

  function removeCache(key) {
    try {
      localStorage.removeItem(makeCacheKey(key));
    } catch (_) {
      // Ignore storage access issues.
    }
  }

  function invalidateCaches(keys) {
    const list = Array.isArray(keys) ? keys : [keys];
    list.filter(Boolean).forEach((key) => removeCache(key));
  }

  function emitCacheSignal(payload) {
    try {
      const message = {
        timestamp: now(),
        ...payload
      };
      localStorage.setItem(CACHE_SIGNAL_KEY, JSON.stringify(message));
    } catch (_) {
      // Non-critical operation.
    }
  }

  async function getCachedSupabaseRows(options) {
    const cacheKey = options.cacheKey;
    const ttlMs = options.ttlMs;
    const query = options.query;
    const forceRefresh = options.forceRefresh === true;

    if (!cacheKey || typeof query !== "function") {
      return { data: null, source: "none", error: new Error("Invalid cache query options") };
    }

    if (!forceRefresh) {
      const cached = getCache(cacheKey, ttlMs);
      if (cached) {
        return { data: cached, source: "cache", error: null };
      }
    }

    try {
      const result = await query();
      const data = Array.isArray(result?.data) ? result.data : (result?.data || []);
      const error = result?.error || null;

      if (error) {
        const stale = getCache(cacheKey);
        if (stale) {
          return { data: stale, source: "stale-cache", error };
        }
        return { data: null, source: "network", error };
      }

      setCache(cacheKey, data);
      return { data, source: "network", error: null };
    } catch (error) {
      const stale = getCache(cacheKey);
      if (stale) {
        return { data: stale, source: "stale-cache", error };
      }
      return { data: null, source: "network", error };
    }
  }

  function optimizeImageUrl(url, width) {
    const raw = (url || "").toString().trim();
    if (!raw || raw.startsWith("data:")) return raw;

    try {
      const parsed = new URL(raw, window.location.href);
      const host = parsed.hostname.toLowerCase();

      if (host.includes("image.tmdb.org")) {
        const targetWidth = width >= 1000 ? "w1280" : width >= 600 ? "w780" : "w500";
        parsed.pathname = parsed.pathname.replace(/\/w\d+\//, `/${targetWidth}/`);
        return parsed.toString();
      }

      if (host.includes("imgsrv.crunchyroll.com") || host.includes("cloudinary.com")) {
        parsed.searchParams.set("format", "webp");
        parsed.searchParams.set("quality", "85");
        if (width) parsed.searchParams.set("width", String(width));
        return parsed.toString();
      }

      return raw;
    } catch (_) {
      return raw;
    }
  }

  function setImageDefaults(img) {
    if (!(img instanceof HTMLImageElement)) return;

    if (!img.hasAttribute("loading")) {
      const inHero = !!img.closest(".featured-content, .home-slider, .slide");
      img.loading = inHero ? "eager" : "lazy";
    }
    if (!img.hasAttribute("decoding")) {
      img.decoding = "async";
    }

    if (!img.hasAttribute("fetchpriority")) {
      const inHero = !!img.closest(".featured-content, .home-slider");
      img.fetchPriority = inHero ? "high" : "low";
    }

    if (!img.hasAttribute("width") || !img.hasAttribute("height")) {
      if (img.classList.contains("movie-item-img")) {
        img.width = 280;
        img.height = 160;
      } else if (img.closest(".movies-list .movie-item")) {
        img.width = 200;
        img.height = 300;
      }
    }

    if (!img.dataset.cinemaverseOptimizedSrc && img.currentSrc === "" && img.src) {
      const targetWidth = img.width || 800;
      const optimized = optimizeImageUrl(img.src, targetWidth);
      if (optimized && optimized !== img.src) {
        img.dataset.cinemaverseOptimizedSrc = "1";
        img.src = optimized;
      }
    }
  }

  function applyImageOptimizations(root) {
    const target = root || document;
    target.querySelectorAll("img").forEach(setImageDefaults);
  }

  function observeImageMutations() {
    if (!document.body || document.body.dataset.cinemaverseImageObserved === "1") return;

    document.body.dataset.cinemaverseImageObserved = "1";
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof Element)) return;
          if (node.tagName === "IMG") {
            setImageDefaults(node);
          } else {
            applyImageOptimizations(node);
          }
        });
      });
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  function createSkeletonCards(container, count) {
    if (!container) return [];
    const nodes = [];
    const safeCount = Math.max(0, Number(count) || 0);

    for (let i = 0; i < safeCount; i += 1) {
      const card = document.createElement("div");
      card.className = "movie-item cinemaverse-skeleton";

      const image = document.createElement("div");
      image.className = "cinemaverse-skeleton-image";

      const line = document.createElement("div");
      line.className = "cinemaverse-skeleton-line";

      card.appendChild(image);
      card.appendChild(line);
      nodes.push(card);
    }

    return nodes;
  }

  function showSkeleton(container, count) {
    if (!container) return [];
    const nodes = createSkeletonCards(container, count);
    if (!nodes.length) return [];

    const fragment = document.createDocumentFragment();
    nodes.forEach((node) => fragment.appendChild(node));
    container.appendChild(fragment);
    return nodes;
  }

  function clearSkeleton(nodes) {
    (nodes || []).forEach((node) => {
      if (node && node.parentNode) node.parentNode.removeChild(node);
    });
  }

  function appendWithFragment(container, nodes, mode) {
    if (!container || !nodes || !nodes.length) return;

    const fragment = document.createDocumentFragment();
    nodes.forEach((node) => fragment.appendChild(node));

    if (mode === "prepend") {
      container.prepend(fragment);
    } else {
      container.appendChild(fragment);
    }
  }

  function injectSkeletonStyles() {
    const styleId = "cinemaverse-skeleton-style";
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent =
      ".cinemaverse-skeleton{pointer-events:none;animation:cvFade .45s ease;overflow:hidden}" +
      ".cinemaverse-skeleton-image{height:300px;border-radius:8px;background:linear-gradient(90deg,#1a1a1a 20%,#242424 45%,#1a1a1a 70%);background-size:200% 100%;animation:cvShimmer 1.2s infinite}" +
      ".cinemaverse-skeleton-line{height:18px;margin:10px;border-radius:6px;background:#272727}" +
      "@keyframes cvShimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}" +
      "@keyframes cvFade{from{opacity:.4}to{opacity:1}}";
    document.head.appendChild(style);
  }

  injectSkeletonStyles();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      applyImageOptimizations();
      observeImageMutations();
    });
  } else {
    applyImageOptimizations();
    observeImageMutations();
  }

  window.cinemaversePerf = {
    getCache,
    setCache,
    removeCache,
    invalidateCaches,
    emitCacheSignal,
    cacheSignalKey: CACHE_SIGNAL_KEY,
    getCachedSupabaseRows,
    optimizeImageUrl,
    applyImageOptimizations,
    showSkeleton,
    clearSkeleton,
    appendWithFragment
  };
})();
