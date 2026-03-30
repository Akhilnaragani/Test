// Unified watchlist API - lightweight, UI-preserving, robust behavior
(function () {
  async function getSupabaseClientSafe() {
    if (window.supabaseClient) return window.supabaseClient;
    if (typeof window.ensureSupabaseClient === 'function') {
      try {
        return await window.ensureSupabaseClient();
      } catch (_) {
        return null;
      }
    }
    return null;
  }

  async function getCurrentUserSafe() {
    const client = await getSupabaseClientSafe();
    if (!client || !client.auth) return { client: null, user: null, error: null };
    try {
      const { data, error } = await client.auth.getUser();
      return { client, user: data?.user || null, error: error || null };
    } catch (error) {
      return { client, user: null, error };
    }
  }

  function notifyWatchlistChanged() {
    try { window.dispatchEvent(new CustomEvent('watchlist:changed')); } catch (_) {}
  }

  function refreshWatchlistIfVisible() {
    const container = document.getElementById('watchlist');
    if (!container) return;
    if (typeof window.renderWatchlist === 'function') {
      window.renderWatchlist('watchlist', 'empty-state');
    }
  }

  function markButtonsAdded(title) {
    if (!title) return;
    document.querySelectorAll('.watchlist-btn').forEach(b => {
      if ((b.dataset.title || '').toString().trim() === title.toString().trim()) {
        b.textContent = 'Added'; b.disabled = true;
      }
    });
    const modalBtn = document.getElementById('add-to-watchlist');
    if (modalBtn && document.getElementById('movie-title')?.textContent.trim() === title) {
      modalBtn.textContent = 'Added'; modalBtn.disabled = true;
    }
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem('watchlist') || '[]';
      const list = JSON.parse(raw);
      return Array.isArray(list) ? list : [];
    } catch (e) { console.warn('local read err', e); return []; }
  }

  function ensureToastContainer() {
    if (document.getElementById('toast-container')) return;
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `#toast-container{position:fixed;right:20px;bottom:20px;z-index:99999;display:flex;flex-direction:column;gap:10px}
      .toast{min-width:160px;padding:8px 12px;border-radius:8px;color:#fff;opacity:0;transform:translateY(8px);transition:opacity .2s,transform .2s}
      .toast.show{opacity:1;transform:translateY(0)}
      .toast.success{background:linear-gradient(90deg,#28a745,#218838)}
      .toast.error{background:linear-gradient(90deg,#dc3545,#c82333)}
      .toast.info{background:linear-gradient(90deg,#17a2b8,#138496)}`;
    document.head.appendChild(style);
    const container = document.createElement('div'); container.id = 'toast-container'; document.body.appendChild(container);
  }
  function showToast(msg, type = 'info', timeout = 2500) {
    try {
      ensureToastContainer();
      const c = document.getElementById('toast-container');
      const t = document.createElement('div'); t.className = `toast ${type}`; t.textContent = msg; c.appendChild(t);
      requestAnimationFrame(() => t.classList.add('show'));
      setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 250); }, timeout);
    } catch (e) { try { alert(msg); } catch (_) { } }
  }

  window.loadLocalWatchlist = function () { return loadLocal(); };

  // --- ADD ---
  window.addToWatchlist = async function (movieTitle, posterUrl) {
    movieTitle = (movieTitle || '').toString().trim(); posterUrl = posterUrl || null;
    if (!movieTitle) { showToast('Missing title', 'error'); return; }

    const { client, user, error: userErr } = await getCurrentUserSafe();

    if (userErr) {
      console.error('auth lookup err', userErr);
    }

    // Logged-in path: DB only (do not fall back to local on DB errors)
    if (client && user) {
      const user_id = user.id;

      const { data: existing, error: exErr } = await client
        .from('watchlist')
        .select('id')
        .eq('user_id', user_id)
        .ilike('movie_title', movieTitle)
        .maybeSingle();

      if (exErr) {
        console.error('dup check error', exErr);
        showToast(`Server error (check): ${exErr.message || exErr}`, 'error', 4000);
        return;
      }

      if (existing) {
        showToast('Already in your watchlist', 'info');
        markButtonsAdded(movieTitle);
        refreshWatchlistIfVisible();
        return;
      }

      const { error: insErr } = await client
        .from('watchlist')
        .insert({ user_id, movie_title: movieTitle, poster_url: posterUrl });

      if (insErr) {
        console.error('insert error', insErr);
        showToast(`Could not add (DB): ${insErr.message || insErr}`, 'error', 5000);
        return;
      }

      showToast('Added to watchlist', 'success');
      markButtonsAdded(movieTitle);
      notifyWatchlistChanged();
      refreshWatchlistIfVisible();
      return;
    }

    // Not logged-in path: local storage + sync hint
    try {
      const list = loadLocal();
      const norm = movieTitle.toLowerCase();
      if (list.find(i => ((typeof i === 'string' ? i : (i.title || '')).toString().trim().toLowerCase()) === norm)) {
        showToast('Already in your watchlist', 'info');
        markButtonsAdded(movieTitle);
        refreshWatchlistIfVisible();
        return;
      }
      list.push({ title: movieTitle, poster: posterUrl });
      localStorage.setItem('watchlist', JSON.stringify(list));
      showToast('Sign in to sync - saved locally', 'info');
      markButtonsAdded(movieTitle);
      notifyWatchlistChanged();
      refreshWatchlistIfVisible();
    } catch (e) {
      console.error('local add err', e); showToast('Could not add locally', 'error');
    }
  };

  // --- REMOVE ---
  window.removeFromWatchlist = async function (idOrTitle, sourceEl) {
    try {
      const { client, user } = await getCurrentUserSafe();
      const asNum = Number(idOrTitle);
      const isId = !isNaN(asNum) && String(idOrTitle).trim() !== '';

      if (user && isId && client) {
        const { error } = await client.from('watchlist').delete().eq('id', asNum).eq('user_id', user.id);
        if (error) {
          console.warn('supabase delete issue', error.message || error);
          showToast(`Could not remove (DB): ${error.message || error}`, 'error', 4000);
          return false;
        }
      } else {
        // local remove by title
        const title = (idOrTitle || '').toString().trim();
        if (title) {
          const list = loadLocal();
          const norm = title.toLowerCase();
          const filtered = list.filter(i => {
            const itemTitle = (typeof i === 'string' ? i : (i.title || '')).toString().trim();
            return itemTitle.toLowerCase() !== norm;
          });
          localStorage.setItem('watchlist', JSON.stringify(filtered));
        }
      }

      // update UI
      try {
        if (sourceEl && sourceEl instanceof Element) {
          const card = sourceEl.closest('.movie-item'); if (card && card.parentNode) card.parentNode.removeChild(card);
          const container = document.getElementById('watchlist'); const empty = document.getElementById('empty-state');
          if (container && empty && container.children.length === 0) empty.style.display = 'block';
          showToast('Removed from watchlist', 'success');
          notifyWatchlistChanged();
          refreshWatchlistIfVisible();
          return true;
        }
      } catch (e) { console.warn('in-place remove failed', e); }

      if (typeof window.renderWatchlist === 'function') {
        window.renderWatchlist('watchlist', 'empty-state');
        showToast('Removed from watchlist', 'success');
        notifyWatchlistChanged();
        return true;
      }
      return true;
    } catch (e) { console.error('remove err', e); showToast('Remove failed', 'error'); return false; }
  };

  // --- RENDER ---
  let __renderInFlight = null;

  window.renderWatchlist = function (containerId = 'watchlist', emptyId = 'empty-state') {
    if (__renderInFlight) return __renderInFlight;
    __renderInFlight = (async () => {
      const container = document.getElementById(containerId); const empty = document.getElementById(emptyId);
      if (!container) return;
      container.innerHTML = '';
      if (empty) empty.style.display = 'none';

      try {
        const { client, user, error: uErr } = await getCurrentUserSafe();
        if (client) {
          if (uErr) console.warn('getUser error', uErr);
          if (user) {
            const { data, error } = await client
              .from('watchlist')
              .select('*')
              .eq('user_id', user.id)
              .order('added_at', { ascending: false });

            if (error) {
              console.error('fetch watchlist error', error);
              showToast(`Could not load from DB: ${error.message || error}`, 'error', 4000);
            } else if (Array.isArray(data) && data.length) {
              const seen = new Set();
              data.forEach(row => {
                const key = (row.movie_title || '').toString().trim().toLowerCase();
                if (seen.has(key)) return; seen.add(key);

                const card = document.createElement('div'); card.className = 'movie-item'; card.dataset.rowId = row.id;
                const img = document.createElement('img'); img.src = row.poster_url || 'https://via.placeholder.com/300x450?text=No+Image'; img.alt = row.movie_title;
                const h3 = document.createElement('h3'); h3.textContent = row.movie_title;
                const actions = document.createElement('div'); actions.className = 'card-actions';
                const watchBtn = document.createElement('button'); watchBtn.className = 'btn'; watchBtn.textContent = 'Watch Now'; watchBtn.onclick = () => window.location.href = `movies.html?open=${encodeURIComponent(row.movie_title)}`;
                const removeBtn = document.createElement('button'); removeBtn.className = 'btn btn-outline'; removeBtn.textContent = 'Remove'; removeBtn.onclick = () => window.removeFromWatchlist(row.id, removeBtn);
                actions.appendChild(watchBtn); actions.appendChild(removeBtn);
                card.appendChild(img); card.appendChild(h3); card.appendChild(actions); container.appendChild(card);
              });
              return;
            }
          }
        }
      } catch (e) { console.warn('render server err', e); }

      // local fallback
      const local = loadLocal();
      const seen = new Set();
      if (!local || local.length === 0) { if (empty) empty.style.display = 'block'; return; }
      const unique = (local || []).reduce((acc, cur) => {
        const title = (typeof cur === 'string' ? cur : (cur.title || '')).toString().trim();
        const n = title.toLowerCase();
        if (!seen.has(n)) { seen.add(n); acc.push({ title, poster: typeof cur === 'string' ? null : cur.poster }); }
        return acc;
      }, []);
      if (!unique || unique.length === 0) { if (empty) empty.style.display = 'block'; return; }
      unique.forEach(item => {
        const card = document.createElement('div'); card.className = 'movie-item'; card.dataset.title = item.title;
        const img = document.createElement('img'); img.src = item.poster || 'https://via.placeholder.com/300x450?text=No+Image'; img.alt = item.title;
        const h3 = document.createElement('h3'); h3.textContent = item.title;
        const actions = document.createElement('div'); actions.className = 'card-actions';
        const watchBtn = document.createElement('button'); watchBtn.className = 'btn'; watchBtn.textContent = 'Watch Now'; watchBtn.onclick = () => window.location.href = `movies.html?open=${encodeURIComponent(item.title)}`;
        const removeBtn = document.createElement('button'); removeBtn.className = 'btn btn-outline'; removeBtn.textContent = 'Remove'; removeBtn.onclick = () => window.removeFromWatchlist(item.title, removeBtn);
        actions.appendChild(watchBtn); actions.appendChild(removeBtn); card.appendChild(img); card.appendChild(h3); card.appendChild(actions); container.appendChild(card);
      });
    })().finally(() => {
      __renderInFlight = null;
    });
    return __renderInFlight;
  };

  window.showToast = showToast;
})();
