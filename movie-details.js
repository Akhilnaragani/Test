"use strict";

// Provide a safe fallback only when a page hasn't already defined showMovieDetails.
if (typeof window.showMovieDetails !== "function") {
  window.showMovieDetails = function showMovieDetailsFallback(movieName) {
    const details = (window.movieDetails && window.movieDetails[movieName]) || null;
    const modal = document.getElementById("movie-details");
    if (!modal || !details) return;

    const title = document.getElementById("movie-title");
    const description = document.getElementById("movie-description");
    const type = document.getElementById("movie-type");
    const poster = document.getElementById("movie-poster");
    const rating = document.getElementById("rating-value");

    if (title) title.textContent = details.title || movieName || "Untitled";
    if (description) description.textContent = details.description || "No description available.";
    if (type) type.textContent = details.type || "Unknown";
    if (poster) poster.src = details.poster || "";
    if (rating) rating.textContent = String(details.rating || 0);

    modal.style.display = "flex";
  };
}
