// AccessPay entry point: a tiny hash router.
//
// Why hash routing? The app is served as static files (no server-side
// routing), and hash URLs still give every screen its own address, working
// back/forward buttons and bookmarkable transaction details.

import { qs, qsa, focusHeading } from './lib/dom.js';
import { createStore } from './store.js';
import { overviewView } from './views/overview.js';
import { checkoutView } from './views/checkout.js';
import { transactionsView } from './views/transactions.js';
import { detailsView } from './views/details.js';
import { settingsView } from './views/settings.js';

const main = qs('#main');
const store = createStore();

// Each route has a view object: { title, render(container, context) }.
const routes = [
  { name: 'overview', pattern: /^\/?$/, view: overviewView },
  { name: 'pay', pattern: /^\/pay$/, view: checkoutView },
  { name: 'transactions', pattern: /^\/transactions$/, view: transactionsView },
  // Details pages highlight "Transactions" in the nav too.
  { name: 'transactions', pattern: /^\/transactions\/([^/]+)$/, view: detailsView },
  { name: 'settings', pattern: /^\/settings$/, view: settingsView },
];

function parseHash() {
  // "#/transactions?status=failed" -> { path: "/transactions", query: URLSearchParams }
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, queryString = ''] = raw.split('?');
  return { path, query: new URLSearchParams(queryString) };
}

let isFirstRender = true;

function renderRoute() {
  const { path, query } = parseHash();
  let match = null;
  let route = null;

  for (const r of routes) {
    match = path.match(r.pattern);
    if (match) { route = r; break; }
  }

  if (!route) {
    main.innerHTML = `
      <h1>Page not found</h1>
      <p class="muted">There is no page at this address. <a href="#/">Go to the overview</a>.</p>`;
    document.title = 'Page not found · AccessPay';
    focusHeading(main);
    return;
  }

  // Each render gets a brand-new wrapper element. Views attach their event
  // listeners to it, so when the user navigates away the old listeners are
  // thrown away with the old wrapper instead of piling up on <main>.
  const viewRoot = document.createElement('div');
  viewRoot.className = 'view';
  main.replaceChildren(viewRoot);
  route.view.render(viewRoot, { match, query, store });
  document.title = `${route.view.title} · AccessPay`;

  qsa('.nav__link').forEach((link) => {
    if (link.dataset.route === route.name) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });

  // On first load keep focus at the top of the document (skip link first);
  // on later navigations move focus to the new page heading. Screen readers
  // read the focused heading, so no extra live-region announcement is needed.
  if (!isFirstRender) focusHeading(main);
  isFirstRender = false;
}

// The skip link points at "#main", but the router owns the hash. Handle it
// here so it moves focus without being treated as a route change.
qs('.skip-link').addEventListener('click', (event) => {
  event.preventDefault();
  main.focus();
});

window.addEventListener('hashchange', renderRoute);
renderRoute();
