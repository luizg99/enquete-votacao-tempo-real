const routes = [];
let currentCleanup = null;

export function register(pattern, render) {
  const keys = [];
  const regex = new RegExp('^' + pattern.replace(/:([^/]+)/g, (_, k) => {
    keys.push(k);
    return '([^/]+)';
  }) + '$');
  routes.push({ regex, keys, render });
}

function match(hash) {
  const path = hash.replace(/^#/, '') || '/';
  for (const r of routes) {
    const m = path.match(r.regex);
    if (m) {
      const params = {};
      r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); });
      return { render: r.render, params };
    }
  }
  return null;
}

function highlightNav(hash) {
  document.querySelectorAll('[data-nav]').forEach(el => {
    el.classList.toggle('active', hash.startsWith('#/' + el.dataset.nav));
  });
}

export function start(root) {
  const run = () => {
    const hash = location.hash || '#/admin';
    if (!location.hash) { location.hash = '#/admin'; return; }
    highlightNav(hash);
    if (typeof currentCleanup === 'function') {
      try { currentCleanup(); } catch {}
      currentCleanup = null;
    }
    const found = match(hash);
    root.innerHTML = '';
    if (!found) {
      root.innerHTML = '<div class="empty">Rota não encontrada.</div>';
      return;
    }
    const result = found.render(root, found.params);
    if (typeof result === 'function') currentCleanup = result;
  };
  window.addEventListener('hashchange', run);
  run();
}

export function navigate(hash) {
  location.hash = hash;
}
