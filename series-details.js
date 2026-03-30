"use strict";

// Shared store for series metadata. Existing inline scripts can extend/override this.
window.seriesDetails = window.seriesDetails || {};

// Provide a safe fallback only when a page hasn't already defined showSeriesDetails.
if (typeof window.showSeriesDetails !== "function") {
  window.showSeriesDetails = function showSeriesDetailsFallback(seriesName) {
    const details = (window.seriesDetails && window.seriesDetails[seriesName]) || null;
    const modal = document.getElementById("series-details");
    if (!modal || !details) return;

    const title = document.getElementById("series-title");
    const description = document.getElementById("series-description");
    const type = document.getElementById("series-type");
    const poster = document.getElementById("series-poster");
    const rating = document.getElementById("rating-value");

    if (title) title.textContent = details.title || seriesName || "Untitled";
    if (description) description.textContent = details.description || "No description available.";
    if (type) type.textContent = details.type || "Unknown";
    if (poster) poster.src = details.poster || "";
    if (rating) rating.textContent = String(details.rating || 0);

    modal.style.display = "flex";
  };
}
