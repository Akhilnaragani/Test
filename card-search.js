"use strict";

(function initCardSearch() {
  const CARD_SELECTOR = ".movie-item, .movie-card, .series-card";
  const SECTION_SELECTOR = ".movie-category, .movie-list-container";
  const DEBOUNCE_MS = 300;

  let searchInput = null;
  let cards = [];
  let sections = [];
  let cardTitles = new Map();
  let debounceHandle = null;
  let currentTerm = "";

  function pickSearchInput() {
    return (
      document.getElementById("searchInput") ||
      document.querySelector("input[type='search']") ||
      document.querySelector(".search-input") ||
      document.querySelector(".search-box input")
    );
  }

  function ensureNavbarSearchStyles() {
    const styleId = "card-search-navbar-style";
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent =
      ".card-search-host{display:flex;align-items:center;flex:0 1 280px;min-width:180px;margin-left:14px;}" +
      ".card-search-host #searchInput{width:100%;margin:0;padding:9px 12px;border-radius:9px;border:1px solid rgba(255,255,255,.18);outline:none;background:rgba(16,16,16,.85);color:#fff;font:inherit;}" +
      ".card-search-host #searchInput::placeholder{color:rgba(235,235,235,.78);}" +
      "@media (max-width:980px){.card-search-host{flex:1 1 100%;margin:10px 0 0;}}";
    document.head.appendChild(style);
  }

  function getNavbarSearchHost() {
    const navbarWrapper = document.querySelector(".navbar .navbar-wrapper");
    if (!navbarWrapper) return null;

    let host = navbarWrapper.querySelector(".card-search-host");
    if (host) return host;

    host = document.createElement("div");
    host.className = "card-search-host";

    const profileContainer = navbarWrapper.querySelector(".profile-container");
    if (profileContainer && profileContainer.parentNode === navbarWrapper) {
      navbarWrapper.insertBefore(host, profileContainer);
    } else {
      navbarWrapper.appendChild(host);
    }

    return host;
  }

  function createSearchInputIfMissing() {
    const existing = pickSearchInput();
    if (existing) return existing;

    ensureNavbarSearchStyles();

    const input = document.createElement("input");
    input.type = "text";
    input.id = "searchInput";
    input.placeholder = "Search movies or series...";
    input.autocomplete = "off";
    input.setAttribute("aria-label", "Search movies or series");

    const navbarHost = getNavbarSearchHost();
    if (navbarHost) {
      navbarHost.appendChild(input);
    } else {
      // Fallback if a page has no navbar layout.
      input.style.width = "min(560px, calc(100% - 32px))";
      input.style.margin = "14px 16px 6px";
      input.style.padding = "10px 12px";
      input.style.borderRadius = "8px";
      input.style.border = "1px solid #333";
      input.style.outline = "none";
      input.style.background = "#121212";
      input.style.color = "#fff";
      input.style.font = "inherit";

      const anchor =
        document.querySelector(".movie-category") ||
        document.querySelector(".movie-list-container") ||
        document.querySelector("main.page") ||
        document.querySelector(".content-container") ||
        document.querySelector("body > section") ||
        document.body.firstElementChild;

      if (anchor && anchor.parentNode) {
        anchor.parentNode.insertBefore(input, anchor);
      } else {
        document.body.insertBefore(input, document.body.firstChild);
      }
    }

    return input;
  }

  function getCardTitle(card) {
    const titleNode = card.querySelector("h3, h4, .movie-item-title, .movie-title, [data-title]");
    if (!titleNode) {
      return (card.getAttribute("data-title") || "").trim().toLowerCase();
    }

    const title =
      titleNode.getAttribute && titleNode.hasAttribute("data-title")
        ? titleNode.getAttribute("data-title")
        : titleNode.textContent;

    return (title || "").trim().toLowerCase();
  }

  function refreshCache() {
    cards = Array.from(document.querySelectorAll(CARD_SELECTOR));
    sections = Array.from(document.querySelectorAll(SECTION_SELECTOR));
    cardTitles = new Map();

    cards.forEach((card) => {
      if (!card.dataset.cardSearchDisplay) {
        card.dataset.cardSearchDisplay = card.style.display || "";
      }
      cardTitles.set(card, getCardTitle(card));
    });

    sections.forEach((section) => {
      if (!section.dataset.cardSearchDisplay) {
        section.dataset.cardSearchDisplay = section.style.display || "";
      }
    });
  }

  function applySearch(term) {
    currentTerm = term;
    const normalized = (term || "").trim().toLowerCase();

    cards.forEach((card) => {
      const title = cardTitles.get(card) || "";
      const isMatch = !normalized || title.includes(normalized);
      card.style.display = isMatch ? card.dataset.cardSearchDisplay || "" : "none";
    });

    sections.forEach((section) => {
      const sectionCards = section.querySelectorAll(CARD_SELECTOR);
      if (!sectionCards.length) return;

      let hasVisibleCard = false;
      for (let i = 0; i < sectionCards.length; i += 1) {
        if (sectionCards[i].style.display !== "none") {
          hasVisibleCard = true;
          break;
        }
      }

      section.style.display = hasVisibleCard ? section.dataset.cardSearchDisplay || "" : "none";
    });
  }

  function bindSearchListener() {
    if (!searchInput || searchInput.dataset.cardSearchBound === "1") return;

    searchInput.dataset.cardSearchBound = "1";
    searchInput.addEventListener("input", function onSearchInput() {
      const value = searchInput.value || "";
      clearTimeout(debounceHandle);
      debounceHandle = setTimeout(function runDebouncedSearch() {
        applySearch(value);
      }, DEBOUNCE_MS);
    });
  }

  function observeDynamicCards() {
    if (!document.body || document.body.dataset.cardSearchObserved === "1") return;

    document.body.dataset.cardSearchObserved = "1";
    const observer = new MutationObserver(function onMutations() {
      refreshCache();
      if (currentTerm) {
        applySearch(currentTerm);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  function attach() {
    searchInput = createSearchInputIfMissing();
    if (!searchInput) return;

    refreshCache();
    bindSearchListener();
    observeDynamicCards();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", attach);
  } else {
    attach();
  }
})();
