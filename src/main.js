import './styles.css';

let products = [];
let activeSuppliers = [];
let currentUser = null;

const breadcrumbPage = document.querySelector('#breadcrumbPage');
const navLinks = [...document.querySelectorAll('.nav-link')];
const contentForPage = (page) => document.querySelector(`[data-page-content="${page}"]`);
const pageNames = { dashboard: 'Dashboard', products: 'Products', movements: 'Stock movements', assistant: 'AI assistant', pricing: 'Pricing', reports: 'Reports', catalog: 'Product setup', suppliers: 'Suppliers' };
const money = new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', maximumFractionDigits: 0 });
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
function stockSenseDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}
function shiftStockSenseDate(dateString, days) {
  const date = new Date(`${dateString}T00:00:00.000Z`); date.setUTCDate(date.getUTCDate() + days); return date.toISOString().slice(0, 10);
}

function productRow(product) {
  return `<tr>
    <td><div class="product-cell"><span class="product-icon ${escapeHTML(product.color)}">${escapeHTML(product.icon)}</span><span><strong>${escapeHTML(product.name)}</strong><small>${escapeHTML(product.sku)}</small></span></div></td>
    <td><span class="category-label">${escapeHTML(product.category)}</span></td>
    <td><strong class="stock-number">${product.quantity}</strong> <span class="unit">${escapeHTML(product.unit)}</span></td>
    <td><span class="status ${escapeHTML(product.tone)}"><i></i>${escapeHTML(product.status)}</span></td>
  </tr>`;
}

function renderDashboard() {
  const pageContent = contentForPage('dashboard');
  breadcrumbPage.textContent = 'Dashboard';
  const lowStock = products.filter((product) => product.status === 'Low stock').length;
  const outOfStock = products.filter((product) => product.status === 'Out of stock').length;
  const dateLabel = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Karachi' }).format(new Date()).toUpperCase();
  const categoryCounts = [...products.reduce((map, product) => map.set(product.category, (map.get(product.category) || 0) + 1), new Map()).entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const colors = ['#719783', '#b2c9b5', '#e6c87d', '#9a9ac9', '#6ea6bc', '#c17f92'];
  const visibleCategories = categoryCounts.slice(0, 5).map(([name, count], index) => ({ name, count, color: colors[index % colors.length] }));
  if (categoryCounts.length > 5) visibleCategories.push({ name: 'Other categories', count: categoryCounts.slice(5).reduce((sum, category) => sum + category[1], 0), color: '#a8a9a2' });
  let categoryCursor = 0;
  const categoryGradient = visibleCategories.length ? visibleCategories.map((category) => { const start = categoryCursor; categoryCursor += category.count / Math.max(1, products.length) * 100; return `${category.color} ${start}% ${categoryCursor}%`; }).join(', ') : '#e6ebe5 0% 100%';
  const categoryLegend = visibleCategories.map((category) => `<div><i class="legend-dot" style="background:${category.color}"></i><span>${escapeHTML(category.name)}</span><strong>${category.count}</strong></div>`).join('');
  pageContent.innerHTML = `
    <section class="page-heading dashboard-hero">
      <div class="hero-copy"><div class="eyebrow">${dateLabel} <span class="heading-dot">•</span> NOWSHERA</div><h1>Good evening, <span>${escapeHTML(currentUser.displayName)}</span> <span class="wave">✳</span></h1><p>Your inventory at a glance. Everything in its place.</p></div>
      <div class="hero-side"><button class="date-button" type="button"><span>▦</span> Last 7 days <span class="chevron">⌄</span></button><div class="hero-orbit" aria-hidden="true"><span class="orbit orbit-one"></span><span class="orbit orbit-two"></span><div class="orbit-core"><strong>${products.length}</strong><span>products</span></div><i class="orbit-star">✦</i></div><div class="hero-caption"><span></span> INVENTORY SNAPSHOT</div></div>
    </section>
    <section class="metric-grid" aria-label="Inventory summary">
      <article class="metric-card"><div class="metric-top"><span class="metric-label">TOTAL PRODUCTS</span><span class="metric-icon indigo">▦</span></div><div class="metric-value">${products.length}</div><div class="metric-note">Across all categories</div><div class="sparkline purple"><svg viewBox="0 0 180 36" preserveAspectRatio="none"><path d="M0 29 C18 24 18 27 33 19 S50 25 66 15 S87 21 101 13 S120 19 134 11 S160 17 180 3" /></svg></div></article>
      <article class="metric-card"><div class="metric-top"><span class="metric-label">LOW STOCK ITEMS</span><span class="metric-icon amber-bg">⌁</span></div><div class="metric-value">${lowStock}<span class="metric-change warning">Needs attention</span></div><div class="metric-note">At each product’s threshold</div><div class="sparkline orange"><svg viewBox="0 0 180 36" preserveAspectRatio="none"><path d="M0 9 C20 14 24 7 41 17 S59 12 76 23 S97 14 113 20 S140 12 152 25 S170 18 180 32" /></svg></div></article>
      <article class="metric-card"><div class="metric-top"><span class="metric-label">OUT OF STOCK</span><span class="metric-icon red-bg">⌁</span></div><div class="metric-value">${outOfStock}<span class="metric-change muted-change">Currently unavailable</span></div><div class="metric-note">Products to restock</div><div class="sparkline red-line"><svg viewBox="0 0 180 36" preserveAspectRatio="none"><path d="M0 24 C20 18 24 29 42 20 S62 25 79 16 S98 21 114 12 S133 20 151 10 S169 12 180 2" /></svg></div></article>
      <article class="metric-card"><div class="metric-top"><span class="metric-label">SAMPLE STOCK VALUE</span><span class="metric-icon green-bg">₨</span></div><div class="metric-value value-small">${money.format(384650)}</div><div class="metric-note">Illustrative figure · sample only</div><div class="sparkline green-line"><svg viewBox="0 0 180 36" preserveAspectRatio="none"><path d="M0 30 C19 22 27 27 42 18 S59 24 79 14 S96 18 111 14 S136 20 150 9 S168 11 180 4" /></svg></div></article>
    </section>
    <section class="content-grid">
      <article class="panel overview-panel"><div class="panel-heading"><div><h2>Inventory overview</h2><p>A quick look at your product mix</p></div><button class="more-button" aria-label="More options">•••</button></div>
        <div class="overview-body"><div class="donut-wrap"><div class="donut" style="background:conic-gradient(${categoryGradient})"><div class="donut-center"><strong>${products.length}</strong><span>products</span></div></div></div><div class="legend">${categoryLegend || '<div class="report-empty">No products yet.</div>'}</div></div><div class="panel-foot"><span><i class="mini-dot"></i> Quantities use current inventory records</span><a href="#products">View products <b>→</b></a></div>
      </article>
      <article class="panel attention-panel"><div class="panel-heading"><div><h2>Needs attention <span class="attention-count">${lowStock + outOfStock}</span></h2><p>Products that may need a restock</p></div><a class="text-link" href="#products">View all <b>→</b></a></div>
        <div class="attention-list">${products.filter((p) => p.status !== 'In stock').slice(0, 4).map((p) => `<div class="attention-item"><span class="product-icon ${escapeHTML(p.color)}">${escapeHTML(p.icon)}</span><span class="attention-name"><strong>${escapeHTML(p.name)}</strong><small>${escapeHTML(p.sku)}</small></span><span class="status ${escapeHTML(p.tone)}"><i></i>${escapeHTML(p.status)}</span></div>`).join('')}</div>
        <div class="panel-foot"><span>Showing ${lowStock + outOfStock} items below threshold</span><a href="#products">Review stock <b>→</b></a></div>
      </article>
    </section>
    <section class="panel recent-panel"><div class="panel-heading"><div><h2>Product list</h2><p>A snapshot of inventory across the mall</p></div><a class="outline-link" href="#products">All products <b>→</b></a></div><div class="table-wrap"><table><thead><tr><th>PRODUCT</th><th>CATEGORY</th><th>QUANTITY</th><th>STATUS</th></tr></thead><tbody>${products.slice(0, 5).map(productRow).join('')}</tbody></table></div></section>`;
}

function renderProducts() {
  const pageContent = contentForPage('products');
  breadcrumbPage.textContent = 'Products';
  const categoryOptions = [...new Set(products.map((product) => product.category))].sort().map((category) => `<option>${escapeHTML(category)}</option>`).join('');
  pageContent.innerHTML = `
    <section class="page-heading products-heading"><div><div class="eyebrow">INVENTORY <span class="heading-dot">•</span> SAMPLE CATALOG</div><h1>Products <span class="count-chip">${products.length}</span></h1><p>Browse the sample items tracked across Nowshera Mall.</p></div><div class="sample-note"><span>ⓘ</span> This is sample data for the project preview.</div></section>
    <section class="panel products-panel"><div class="product-toolbar"><div class="search-box"><span>⌕</span><input id="productSearch" type="search" placeholder="Search products or SKU..." aria-label="Search products"></div><div class="filter-group"><select id="categoryFilter" aria-label="Filter by category"><option value="all">All categories</option>${categoryOptions}</select><select id="statusFilter" aria-label="Filter by stock status"><option value="all">All statuses</option><option>In stock</option><option>Low stock</option><option>Out of stock</option></select></div><span class="result-count" id="resultCount">${products.length} products</span></div><div class="table-wrap"><table><thead><tr><th>PRODUCT</th><th>CATEGORY</th><th>QUANTITY</th><th>STATUS</th></tr></thead><tbody id="productRows">${products.map(productRow).join('')}</tbody></table></div><div class="products-foot"><span>Product catalog <i></i> ${products.length} products shown</span><span>Stock figures are illustrative</span></div></section>`;
  const search = document.querySelector('#productSearch');
  const category = document.querySelector('#categoryFilter');
  const status = document.querySelector('#statusFilter');
  const rows = document.querySelector('#productRows');
  const count = document.querySelector('#resultCount');
  function filterProducts() {
    const query = search.value.trim().toLowerCase();
    const filtered = products.filter((p) => (p.name.toLowerCase().includes(query) || p.sku.toLowerCase().includes(query)) && (category.value === 'all' || p.category === category.value) && (status.value === 'all' || p.status === status.value));
    rows.innerHTML = filtered.length ? filtered.map(productRow).join('') : '<tr><td colspan="4" class="empty-state">No sample products match those filters.</td></tr>';
    count.textContent = `${filtered.length} product${filtered.length === 1 ? '' : 's'}`;
  }
  search.addEventListener('input', filterProducts);
  category.addEventListener('change', filterProducts);
  status.addEventListener('change', filterProducts);
}

function refreshInventoryViews() {
  renderDashboard();
  renderProducts();
  if (currentUser?.role === 'manager') {
    renderPricing();
    renderReports();
  }
}

async function renderMovements(notice = '') {
  const pageContent = contentForPage('movements');
  breadcrumbPage.textContent = 'Stock movements';
  pageContent.innerHTML = `
    <section class="page-heading products-heading movement-heading"><div><div class="eyebrow">INVENTORY <span class="heading-dot">•</span> STOCK CONTROL</div><h1>Stock movements</h1><p>Record stock arriving or leaving, with a traceable history.</p></div><div class="sample-note"><span>✓</span> Each change is saved with your account.</div></section>
    <section class="movement-layout">
      <article class="panel movement-form-panel"><div class="panel-heading"><div><h2>Record a movement</h2><p>Choose the item and enter a whole number quantity.</p></div><span class="movement-symbol">↕</span></div>
        <form id="movementForm" class="movement-form"><label for="movementType">Movement type</label><select id="movementType" name="movementType"><option value="in">Stock in · received</option><option value="out">Stock out · sold or removed</option></select>
          <label for="movementReason" id="movementReasonLabel" hidden>Reason for removal</label><select id="movementReason" name="reason" hidden><option value="sale">Sale</option><option value="damage">Damaged</option><option value="transfer">Transfer</option><option value="adjustment">Adjustment</option><option value="other">Other</option></select>
          <label for="movementProduct">Product</label><select id="movementProduct" name="productId" required>${products.map((product) => `<option value="${product.id}">${escapeHTML(product.name)} · ${product.quantity} ${escapeHTML(product.unit)} available</option>`).join('')}</select>
          <label for="movementSupplier" id="movementSupplierLabel">Supplier (optional)</label><select id="movementSupplier" name="supplierId"><option value="">No supplier selected</option>${activeSuppliers.map((supplier) => `<option value="${supplier.id}">${escapeHTML(supplier.name)}</option>`).join('')}</select>
          <label for="movementQuantity">Quantity</label><input id="movementQuantity" name="quantity" type="number" min="1" max="1000000" step="1" placeholder="Enter quantity" required />
          <label for="movementNote" id="movementNoteLabel">Reference note</label><input id="movementNote" name="note" maxlength="120" placeholder="For example, delivery invoice INV-104" required />
          <p class="movement-feedback ${notice ? 'success' : ''}" id="movementFeedback" role="status">${notice}</p>
          <button class="login-submit movement-submit" id="movementSubmit" type="submit">Record stock in <span>→</span></button>
        </form><div class="movement-safety"><span>⌑</span><span>Stock is checked on the server before it is saved. Stock cannot go below zero.</span></div>
      </article>
      <article class="panel history-panel"><div class="panel-heading"><div><h2>Recent activity</h2><p>Latest changes with account and quantity details</p></div><span class="history-live"><i></i> AUDIT HISTORY</span></div><div class="history-content" id="historyContent"><div class="history-loading">Loading movement history…</div></div></article>
    </section>`;

  const typeInput = document.querySelector('#movementType');
  const noteLabel = document.querySelector('#movementNoteLabel');
  const noteInput = document.querySelector('#movementNote');
  const reasonInput = document.querySelector('#movementReason');
  const reasonLabel = document.querySelector('#movementReasonLabel');
  const supplierInput = document.querySelector('#movementSupplier');
  const supplierLabel = document.querySelector('#movementSupplierLabel');
  const submitButton = document.querySelector('#movementSubmit');
  typeInput.addEventListener('change', () => {
    const isIncoming = typeInput.value === 'in';
    reasonInput.hidden = isIncoming;
    reasonLabel.hidden = isIncoming;
    supplierInput.hidden = !isIncoming;
    supplierLabel.hidden = !isIncoming;
    noteLabel.textContent = isIncoming ? 'Reference note' : 'Reason / reference';
    noteInput.placeholder = isIncoming ? 'For example, delivery invoice INV-104' : 'For example, sold at counter or damaged';
    submitButton.innerHTML = `Record stock ${isIncoming ? 'in' : 'out'} <span>→</span>`;
  });
  document.querySelector('#movementForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const feedback = document.querySelector('#movementFeedback');
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = { movementType: data.get('movementType'), reason: data.get('reason'), supplierId: data.get('supplierId') || null, productId: Number(data.get('productId')), quantity: Number(data.get('quantity')), note: data.get('note') };
    submitButton.disabled = true;
    submitButton.textContent = 'Saving movement…';
    feedback.textContent = '';
    try {
      const response = await fetch('/api/movements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save movement.');
      const action = payload.movementType === 'in' ? 'Stock received' : 'Stock removed';
      products = await fetch('/api/products').then((res) => res.json());
      refreshInventoryViews();
      await renderMovements(`${action}. Quantity updated from ${result.previousQuantity} to ${result.newQuantity}.`);
    } catch (error) {
      feedback.textContent = error.message;
      feedback.classList.add('error');
      submitButton.disabled = false;
      submitButton.innerHTML = `Record stock ${typeInput.value} <span>→</span>`;
    }
  });

  try {
    const response = await fetch('/api/movements');
    if (!response.ok) throw new Error('Could not load history.');
    const movements = await response.json();
    const historyContent = document.querySelector('#historyContent');
    if (!movements.length) {
      historyContent.innerHTML = '<div class="history-empty"><span>↕</span><strong>No stock changes yet</strong><small>Your recorded stock in and stock out actions will appear here.</small></div>';
      return;
    }
    historyContent.innerHTML = `<div class="history-table-wrap"><table class="history-table"><thead><tr><th>ACTIVITY</th><th>CHANGE</th><th>BY</th><th>WHEN</th></tr></thead><tbody>${movements.map((item) => `<tr><td><div class="history-product"><span class="history-type ${escapeHTML(item.movementType)}">${item.movementType === 'in' ? '↓' : '↑'}</span><span><strong>${escapeHTML(item.productName)}</strong><small>${escapeHTML(item.sku)}${item.supplierName ? ` · Supplier: ${escapeHTML(item.supplierName)}` : ''} · ${escapeHTML(item.note)}</small></span></div></td><td><strong class="history-change ${escapeHTML(item.movementType)}">${item.movementType === 'in' ? '+' : '−'}${item.quantity}</strong><small class="history-balance">${item.previousQuantity} → ${item.newQuantity}</small></td><td><span class="history-user">${escapeHTML(item.createdBy)}</span></td><td><span class="history-date">${escapeHTML(new Date(item.createdAt).toLocaleString())}</span></td></tr>`).join('')}</tbody></table></div>`;
  } catch (error) {
    document.querySelector('#historyContent').innerHTML = `<div class="history-error">${error.message}</div>`;
  }
}

function showManagerOnlyMessage() {
  const pageContent = contentForPage('pricing');
  breadcrumbPage.textContent = 'Restricted';
  pageContent.innerHTML = '<section class="panel error-state"><strong>Manager access required</strong><span>This page contains cost and selling price information. Sign in with a Manager account to view it.</span></section>';
}

async function renderPricing(notice = '') {
  const pageContent = contentForPage('pricing');
  breadcrumbPage.textContent = 'Pricing';
  pageContent.innerHTML = '<section class="panel loading-state">Loading manager pricing…</section>';
  try {
    const response = await fetch('/api/manager/pricing');
    if (response.status === 403 || response.status === 401) return showManagerOnlyMessage();
    if (!response.ok) throw new Error('Could not load pricing information.');
    const items = await response.json();
    const stockCostValue = items.reduce((total, item) => total + item.stockCostValue, 0);
    const potentialRevenue = items.reduce((total, item) => total + item.quantity * item.sellingPrice, 0);
    const potentialGrossProfit = items.reduce((total, item) => total + item.quantity * item.unitProfit, 0);
    pageContent.innerHTML = `
      <section class="page-heading products-heading pricing-heading"><div><div class="eyebrow">MANAGER WORKSPACE <span class="heading-dot">•</span> PRIVATE FINANCIALS</div><h1>Pricing & margins</h1><p>Cost and selling prices are visible only to Manager accounts.</p></div><div class="sample-note"><span>ⓘ</span> Sample PKR prices for project preview.</div></section>
      ${notice ? `<div class="pricing-notice" role="status">✓ ${notice}</div>` : ''}
      <section class="pricing-summary-grid"><article class="pricing-summary"><span class="pricing-summary-icon">₨</span><span><small>INVENTORY COST VALUE</small><strong>${money.format(stockCostValue)}</strong><em>On hand quantity × cost price</em></span></article><article class="pricing-summary"><span class="pricing-summary-icon revenue-icon">↗</span><span><small>ESTIMATED SALES VALUE</small><strong>${money.format(potentialRevenue)}</strong><em>On hand quantity × sale price</em></span></article><article class="pricing-summary"><span class="pricing-summary-icon profit-icon">✦</span><span><small>ESTIMATED GROSS PROFIT</small><strong>${money.format(potentialGrossProfit)}</strong><em>Before operating expenses</em></span></article></section>
      <section class="panel pricing-panel"><div class="panel-heading"><div><h2>Manager pricing table</h2><p>Update an item’s cost or sale price. Changes are recorded in the database.</p></div><span class="private-badge">⌑ MANAGER ONLY</span></div><div class="table-wrap"><table class="pricing-table"><thead><tr><th>PRODUCT</th><th>ON HAND</th><th>COST PRICE</th><th>SELLING PRICE</th><th>PROFIT / UNIT</th><th>MARGIN</th><th></th></tr></thead><tbody>${items.map((item) => { const product = products.find((p) => p.id === item.id); return `<tr><td><div class="product-cell"><span class="product-icon ${escapeHTML(product?.color || 'mint')}">${escapeHTML(product?.icon || '▦')}</span><span><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(item.sku)} · ${escapeHTML(item.category)}</small></span></div></td><td><strong class="stock-number">${item.quantity}</strong> <span class="unit">${escapeHTML(item.unit)}</span></td><td>${money.format(item.costPrice)}</td><td class="sale-price">${money.format(item.sellingPrice)}</td><td class="${item.unitProfit >= 0 ? 'profit-positive' : 'profit-negative'}">${money.format(item.unitProfit)}</td><td><span class="margin-chip ${item.grossMarginPercent < 0 ? 'negative' : ''}">${item.grossMarginPercent.toFixed(1)}%</span></td><td><button class="price-edit-button" type="button" data-price-id="${item.id}">Edit</button></td></tr>`; }).join('')}</tbody></table></div><div class="pricing-foot"><span><i></i> Financial fields are returned only for Manager accounts.</span><span>${items.length} products</span></div></section>
      <dialog class="price-dialog" id="priceDialog"><form id="priceForm"><div class="dialog-top"><span class="dialog-icon">₨</span><button type="button" class="dialog-close" id="closePriceDialog" aria-label="Close">×</button></div><div class="eyebrow">MANAGER PRICE UPDATE</div><h2 id="priceDialogTitle">Update product price</h2><p>New prices will be saved immediately and used in manager reports.</p><input type="hidden" id="priceProductId" /><label for="costPriceInput">Cost price (PKR)</label><input id="costPriceInput" type="number" min="0.01" max="100000000" step="0.01" required /><label for="sellingPriceInput">Selling price (PKR)</label><input id="sellingPriceInput" type="number" min="0.01" max="100000000" step="0.01" required /><div class="price-dialog-error" id="priceDialogError" role="alert"></div><div class="dialog-actions"><button type="button" class="cancel-price" id="cancelPriceDialog">Cancel</button><button type="submit" class="save-price" id="savePriceButton">Save prices</button></div></form></dialog>`;

    const dialog = document.querySelector('#priceDialog');
    document.querySelectorAll('[data-price-id]').forEach((button) => button.addEventListener('click', () => {
      const product = items.find((item) => item.id === Number(button.dataset.priceId));
      document.querySelector('#priceProductId').value = product.id;
      document.querySelector('#costPriceInput').value = product.costPrice;
      document.querySelector('#sellingPriceInput').value = product.sellingPrice;
      document.querySelector('#priceDialogTitle').textContent = product.name;
      document.querySelector('#priceDialogError').textContent = '';
      dialog.showModal();
    }));
    const closeDialog = () => dialog.close();
    document.querySelector('#closePriceDialog').addEventListener('click', closeDialog);
    document.querySelector('#cancelPriceDialog').addEventListener('click', closeDialog);
    document.querySelector('#priceForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const saveButton = document.querySelector('#savePriceButton');
      const errorBox = document.querySelector('#priceDialogError');
      saveButton.disabled = true;
      saveButton.textContent = 'Saving…';
      errorBox.textContent = '';
      try {
        const id = document.querySelector('#priceProductId').value;
        const result = await fetch(`/api/manager/products/${id}/pricing`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ costPrice: Number(document.querySelector('#costPriceInput').value), sellingPrice: Number(document.querySelector('#sellingPriceInput').value) }) });
        const body = await result.json();
        if (!result.ok) throw new Error(body.error || 'Could not save prices.');
        await renderPricing('Prices updated successfully.');
      } catch (error) {
        errorBox.textContent = error.message;
        saveButton.disabled = false;
        saveButton.textContent = 'Save prices';
      }
    });
  } catch (error) {
    pageContent.innerHTML = `<section class="panel error-state"><strong>Pricing unavailable</strong><span>${error.message}</span></section>`;
  }
}

function showManagerReportsDenied() {
  const pageContent = contentForPage('reports');
  breadcrumbPage.textContent = 'Reports';
  pageContent.innerHTML = '<section class="panel error-state"><strong>Manager access required</strong><span>Inventory reports and audit details are available to Manager accounts only.</span></section>';
}

function showManagerCatalogDenied() {
  const pageContent = contentForPage('catalog');
  breadcrumbPage.textContent = 'Product setup';
  pageContent.innerHTML = '<section class="panel error-state"><strong>Manager access required</strong><span>Only Managers can add products or change catalog details.</span></section>';
}

async function renderReports() {
  const pageContent = contentForPage('reports');
  breadcrumbPage.textContent = 'Reports';
  const today = stockSenseDate();
  const monthAgo = shiftStockSenseDate(today, -29);
  pageContent.innerHTML = `
    <section class="page-heading products-heading reports-heading"><div><div class="eyebrow">MANAGER WORKSPACE <span class="heading-dot">•</span> INVENTORY REPORTS</div><h1>Stock activity & sales</h1><p>Review recorded stock changes and explicitly marked sales for a selected date range.</p></div><div class="sample-note"><span>⌑</span> Database-backed activity</div></section>
    <section class="panel reports-filter-panel"><form id="reportFilterForm" class="report-filter-form"><div><label for="reportDateFrom">From</label><input id="reportDateFrom" type="date" value="${monthAgo}" required /></div><span class="report-date-divider">to</span><div><label for="reportDateTo">To</label><input id="reportDateTo" type="date" value="${today}" required /></div><button class="report-apply" type="submit">Apply dates <span>→</span></button><button class="report-export" id="reportExportButton" type="button" disabled>↓ Export CSV</button></form><div class="report-feedback" id="reportFeedback" role="status"></div></section>
    <div id="reportResults"><section class="panel loading-state">Loading movement reports…</section></div>`;
  const form = document.querySelector('#reportFilterForm');
  const feedback = document.querySelector('#reportFeedback');
  const results = document.querySelector('#reportResults');
  const exportButton = document.querySelector('#reportExportButton');
  let currentReport = null;

  function downloadCsv() {
    if (!currentReport) return;
    const headings = ['Date and time', 'Product', 'SKU', 'Movement', 'Reason', 'Supplier', 'Quantity', 'Previous stock', 'New stock', 'Recorded by', 'Reference'];
    const safeCell = (value) => {
      let text = String(value ?? '');
      if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
      return `"${text.replace(/"/g, '""')}"`;
    };
    const rows = currentReport.activities.map((item) => [item.createdAt, item.productName, item.sku, item.movementType, item.reason, item.supplierName || '', item.quantity, item.previousQuantity, item.newQuantity, item.createdBy, item.note]);
    const csv = `${String.fromCharCode(0xfeff)}${[headings, ...rows].map((row) => row.map(safeCell).join(',')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `inventraiq-activity-${currentReport.dateFrom}-to-${currentReport.dateTo}.csv`;
    document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url);
  }

  function renderResults(report) {
    const { summary } = report;
    const reasonNames = { receipt: 'Receipt', sale: 'Sale', damage: 'Damaged', transfer: 'Transfer', adjustment: 'Adjustment', other: 'Other' };
    const maxSold = Math.max(1, ...report.topProducts.map((item) => item.quantitySold));
    const topRows = report.topProducts.length ? report.topProducts.map((item, index) => `<div class="report-rank-row"><span class="report-rank">${String(index + 1).padStart(2, '0')}</span><div class="report-rank-content"><div class="report-rank-label"><strong>${escapeHTML(item.productName)}</strong><span>${item.quantitySold} sold</span></div><div class="report-bar-track"><i style="width:${Math.max(3, item.quantitySold / maxSold * 100)}%"></i></div></div></div>`).join('') : '<div class="report-empty">No sales marked “Sale” in this date range.</div>';
    const dayRows = report.salesByDay.slice(-14);
    const maxDay = Math.max(1, ...dayRows.map((item) => item.quantity));
    const dayChart = dayRows.length ? `<div class="sales-day-chart">${dayRows.map((item) => `<div class="sales-day-column" title="${escapeHTML(item.date)} · ${item.quantity} units"><span>${item.quantity}</span><i style="height:${Math.max(5, item.quantity / maxDay * 100)}%"></i><small>${escapeHTML(item.date.slice(5))}</small></div>`).join('')}</div>` : '<div class="report-empty">No recorded sales to chart.</div>';
    const reasonRows = report.byReason.length ? report.byReason.map((item) => `<div class="reason-row"><span><i class="reason-dot reason-${escapeHTML(item.reason)}"></i>${escapeHTML(reasonNames[item.reason] || item.reason)}</span><strong>${item.quantity} units <small>· ${item.movementCount} events</small></strong></div>`).join('') : '<div class="report-empty">No stock activity during this period.</div>';
    const movementLabel = (item) => item.movementType === 'in' ? 'Stock in' : 'Stock out';
    const activityRows = report.activities.length ? report.activities.map((item) => `<tr><td><strong>${escapeHTML(new Date(item.createdAt).toLocaleString())}</strong></td><td><div class="report-product"><strong>${escapeHTML(item.productName)}</strong><small>${escapeHTML(item.sku)}</small></div></td><td><span class="movement-badge ${escapeHTML(item.movementType)}">${movementLabel(item)}</span><small class="report-reason">${escapeHTML(reasonNames[item.reason] || item.reason)}</small></td><td>${escapeHTML(item.supplierName || '—')}</td><td><strong>${item.movementType === 'in' ? '+' : '−'}${item.quantity}</strong><small class="report-balance">${item.previousQuantity} → ${item.newQuantity}</small></td><td>${escapeHTML(item.createdBy)}</td><td class="report-note" title="${escapeHTML(item.note)}">${escapeHTML(item.note)}</td></tr>`).join('') : '<tr><td colspan="7" class="empty-state">No stock activity was recorded during these dates.</td></tr>';
    results.innerHTML = `
      <section class="report-summary-grid"><article class="report-metric"><span class="report-metric-icon">↕</span><div><small>STOCK MOVEMENTS</small><strong>${summary.movementCount}</strong><em>Recorded activity events</em></div></article><article class="report-metric"><span class="report-metric-icon incoming">↓</span><div><small>UNITS RECEIVED</small><strong>${summary.unitsReceived}</strong><em>Stock in during period</em></div></article><article class="report-metric"><span class="report-metric-icon outgoing">↑</span><div><small>UNITS REMOVED</small><strong>${summary.unitsRemoved}</strong><em>All stock-out reasons</em></div></article><article class="report-metric"><span class="report-metric-icon sales">✦</span><div><small>UNITS SOLD</small><strong>${summary.salesUnits}</strong><em>Only movements marked Sale</em></div></article></section>
      <section class="report-chart-grid"><article class="panel report-panel"><div class="panel-heading"><div><h2>Top-selling products</h2><p>Ranked by recorded sale quantities</p></div><span class="report-period-chip">${report.dayCount} days</span></div><div class="report-rank-list">${topRows}</div></article><article class="panel report-panel"><div class="panel-heading"><div><h2>Sales by day</h2><p>Units explicitly recorded as sales</p></div><span class="report-period-chip">Up to 14 days</span></div>${dayChart}</article><article class="panel report-panel reason-panel"><div class="panel-heading"><div><h2>Movement reasons</h2><p>Recorded units grouped by reason</p></div></div><div class="reason-list">${reasonRows}</div></article></section>
      <section class="panel report-activity-panel"><div class="panel-heading"><div><h2>Audit activity</h2><p>Who changed which product, when, and by how much</p></div><span class="report-period-chip">${report.activities.length}${report.activitiesLimited ? '+' : ''} events</span></div>${report.activitiesLimited ? '<div class="report-limit-note">Showing the latest 200 events. The summary metrics still include the full selected date range.</div>' : ''}<div class="table-wrap"><table class="report-activity-table"><thead><tr><th>DATE</th><th>PRODUCT</th><th>TYPE / REASON</th><th>SUPPLIER</th><th>QUANTITY / BALANCE</th><th>BY</th><th>REFERENCE</th></tr></thead><tbody>${activityRows}</tbody></table></div></section>`;
  }

  async function loadReport() {
    const dateFrom = document.querySelector('#reportDateFrom').value;
    const dateTo = document.querySelector('#reportDateTo').value;
    feedback.textContent = '';
    if (!dateFrom || !dateTo || dateFrom > dateTo) { feedback.textContent = 'Choose a start date on or before the end date.'; return; }
    results.innerHTML = '<section class="panel loading-state">Loading movement reports…</section>';
    exportButton.disabled = true;
    try {
      const params = new URLSearchParams({ dateFrom, dateTo });
      const response = await fetch(`/api/manager/reports?${params}`);
      const report = await response.json();
      if (response.status === 403 || response.status === 401) return showManagerReportsDenied();
      if (!response.ok) throw new Error(report.error || 'Could not load reports.');
      currentReport = report; renderResults(report); exportButton.disabled = report.activities.length === 0;
    } catch (error) {
      results.innerHTML = `<section class="panel error-state"><strong>Reports unavailable</strong><span>${escapeHTML(error.message)}</span></section>`;
    }
  }
  form.addEventListener('submit', (event) => { event.preventDefault(); loadReport(); });
  exportButton.addEventListener('click', downloadCsv);
  await loadReport();
}

async function renderCatalog(notice = '') {
  const pageContent = contentForPage('catalog');
  breadcrumbPage.textContent = 'Product setup';
  pageContent.innerHTML = '<section class="panel loading-state">Loading product setup…</section>';
  try {
    const response = await fetch('/api/manager/catalog');
    if (response.status === 401 || response.status === 403) {
      pageContent.innerHTML = '<section class="panel error-state"><strong>Manager access required</strong><span>Only Managers can add products or change catalog details.</span></section>';
      return;
    }
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Could not load product setup.');
    const items = result.catalog;
    const history = result.changes.length ? result.changes.map((change) => {
      let details = {};
      try { details = JSON.parse(change.details); } catch { /* Show the event without field details if old audit data is malformed. */ }
      const fieldNames = { name: 'Name', sku: 'SKU', category: 'Category', unit: 'Unit', lowStockThreshold: 'Low-stock threshold', costPrice: 'Cost price', sellingPrice: 'Selling price', initialQuantity: 'Starting stock' };
      const summary = change.eventType === 'created'
        ? `Added ${escapeHTML(change.productName)} to the catalog with zero stock.`
        : Object.entries(details).map(([field, values]) => `${escapeHTML(fieldNames[field] || field)}: ${escapeHTML(values.before)} → ${escapeHTML(values.after)}`).join(' · ');
      return `<div class="catalog-audit-row"><span class="catalog-audit-icon ${change.eventType}">${change.eventType === 'created' ? '+' : '↻'}</span><div><strong>${summary || 'Catalog details updated'}</strong><small>${escapeHTML(change.changedBy)} · ${escapeHTML(new Date(change.createdAt).toLocaleString())}</small></div></div>`;
    }).join('') : '<div class="catalog-audit-empty">Product additions and detail changes will be listed here.</div>';
    pageContent.innerHTML = `
      <section class="page-heading products-heading catalog-heading"><div><div class="eyebrow">MANAGER WORKSPACE <span class="heading-dot">•</span> PRODUCT SETUP</div><h1>Product catalog <span class="count-chip">${items.length}</span></h1><p>Add products or update catalog details. Use Stock movements to change quantity.</p></div><button class="catalog-add-button" id="addCatalogProduct" type="button"><span>＋</span> Add product</button></section>
      ${notice ? `<div class="pricing-notice" role="status">✓ ${escapeHTML(notice)}</div>` : ''}
      <section class="catalog-layout"><article class="panel catalog-panel"><div class="panel-heading"><div><h2>Products</h2><p>Stock quantity is read-only here; use the movement form to adjust it.</p></div><span class="private-badge">⌑ MANAGER ONLY</span></div><div class="table-wrap"><table class="catalog-table"><thead><tr><th>PRODUCT</th><th>CATEGORY</th><th>ON HAND</th><th>LOW STOCK AT</th><th>PRICE SETUP</th><th></th></tr></thead><tbody>${items.map((item) => `<tr><td><div class="product-cell"><span class="product-icon ${escapeHTML(item.color)}">${escapeHTML(item.icon)}</span><span><strong>${escapeHTML(item.name)}</strong><small>${escapeHTML(item.sku)}</small></span></div></td><td>${escapeHTML(item.category)}</td><td><strong>${item.quantity}</strong> <span class="unit">${escapeHTML(item.unit)}</span></td><td>${item.lowStockThreshold} ${escapeHTML(item.unit)}</td><td><span class="catalog-price-status ${item.costPrice > 0 && item.sellingPrice > 0 ? 'configured' : ''}">${item.costPrice > 0 && item.sellingPrice > 0 ? 'Set' : 'Needs setup'}</span></td><td><button class="price-edit-button" type="button" data-catalog-edit="${item.id}">Edit details</button></td></tr>`).join('')}</tbody></table></div><div class="pricing-foot"><span>Product detail edits are recorded for Manager review.</span><span>${items.length} products</span></div></article>
      <aside class="panel catalog-audit-panel"><div class="panel-heading"><div><h2>Recent catalog changes</h2><p>Latest 30 add/edit actions</p></div><span class="history-live"><i></i> AUDIT LOG</span></div><div class="catalog-audit-list">${history}</div></aside></section>
      <dialog class="price-dialog catalog-dialog" id="catalogDialog"><form id="catalogForm"><div class="dialog-top"><span class="dialog-icon">▦</span><button type="button" class="dialog-close" id="closeCatalogDialog" aria-label="Close">×</button></div><div class="eyebrow" id="catalogDialogEyebrow">NEW PRODUCT</div><h2 id="catalogDialogTitle">Add a product</h2><p id="catalogDialogDescription">New products start with zero stock. Record received stock on the Stock movements page.</p><input type="hidden" id="catalogProductId" /><label for="catalogName">Product name</label><input id="catalogName" maxlength="100" required placeholder="For example, Wireless Mouse" /><label for="catalogSku">SKU</label><input id="catalogSku" maxlength="32" required placeholder="For example, EL-2201" /><label for="catalogCategory">Category</label><input id="catalogCategory" maxlength="40" required placeholder="For example, Electronics" /><label for="catalogUnit">Unit</label><input id="catalogUnit" maxlength="20" required placeholder="For example, pcs" /><label for="catalogThreshold">Low-stock threshold</label><input id="catalogThreshold" type="number" min="0" max="1000000" step="1" required value="20" />
        <div class="catalog-price-fields" id="catalogPriceFields"><label for="catalogCostPrice">Cost price (PKR)</label><input id="catalogCostPrice" type="number" min="0.01" max="100000000" step="0.01" value="0.01" /><label for="catalogSellingPrice">Selling price (PKR)</label><input id="catalogSellingPrice" type="number" min="0.01" max="100000000" step="0.01" value="0.01" /></div>
        <div class="price-dialog-error" id="catalogDialogError" role="alert"></div><div class="dialog-actions"><button type="button" class="cancel-price" id="cancelCatalogDialog">Cancel</button><button type="submit" class="save-price" id="saveCatalogButton">Add product</button></div></form></dialog>`;

    const dialog = document.querySelector('#catalogDialog');
    const form = document.querySelector('#catalogForm');
    const priceFields = document.querySelector('#catalogPriceFields');
    const openDialog = (item = null) => {
      form.reset(); document.querySelector('#catalogDialogError').textContent = '';
      document.querySelector('#catalogProductId').value = item?.id || '';
      document.querySelector('#catalogDialogTitle').textContent = item ? 'Edit product details' : 'Add a product';
      document.querySelector('#catalogDialogEyebrow').textContent = item ? 'EDIT CATALOG DETAILS' : 'NEW PRODUCT';
      document.querySelector('#catalogDialogDescription').textContent = item ? 'Product quantity cannot be edited here. Use Stock movements for all stock changes.' : 'New products start with zero stock. Record received stock on the Stock movements page.';
      document.querySelector('#saveCatalogButton').textContent = item ? 'Save details' : 'Add product';
      priceFields.hidden = Boolean(item);
      if (item) {
        document.querySelector('#catalogName').value = item.name;
        document.querySelector('#catalogSku').value = item.sku;
        document.querySelector('#catalogCategory').value = item.category;
        document.querySelector('#catalogUnit').value = item.unit;
        document.querySelector('#catalogThreshold').value = item.lowStockThreshold;
      }
      dialog.showModal();
    };
    document.querySelector('#addCatalogProduct').addEventListener('click', () => openDialog());
    document.querySelectorAll('[data-catalog-edit]').forEach((button) => button.addEventListener('click', () => openDialog(items.find((item) => item.id === Number(button.dataset.catalogEdit)))));
    document.querySelector('#closeCatalogDialog').addEventListener('click', () => dialog.close());
    document.querySelector('#cancelCatalogDialog').addEventListener('click', () => dialog.close());
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const saveButton = document.querySelector('#saveCatalogButton');
      const errorBox = document.querySelector('#catalogDialogError');
      const id = document.querySelector('#catalogProductId').value;
      const payload = {
        name: document.querySelector('#catalogName').value,
        sku: document.querySelector('#catalogSku').value,
        category: document.querySelector('#catalogCategory').value,
        unit: document.querySelector('#catalogUnit').value,
        lowStockThreshold: Number(document.querySelector('#catalogThreshold').value),
      };
      if (!id) { payload.costPrice = Number(document.querySelector('#catalogCostPrice').value); payload.sellingPrice = Number(document.querySelector('#catalogSellingPrice').value); }
      saveButton.disabled = true; saveButton.textContent = 'Saving…'; errorBox.textContent = '';
      try {
        const response = await fetch(id ? `/api/manager/catalog/${id}` : '/api/manager/catalog', { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not save product details.');
        dialog.close();
        products = await fetch('/api/products').then((productResponse) => productResponse.json());
        document.querySelector('.nav-count').textContent = products.length;
        refreshInventoryViews();
        await renderMovements();
        await renderCatalog(id ? 'Product details updated and recorded in the audit log.' : 'Product added with zero stock. Use Stock movements when stock arrives.');
      } catch (error) { errorBox.textContent = error.message; saveButton.disabled = false; saveButton.textContent = id ? 'Save details' : 'Add product'; }
    });
  } catch (error) {
    pageContent.innerHTML = `<section class="panel error-state"><strong>Product setup unavailable</strong><span>${escapeHTML(error.message)}</span></section>`;
  }
}

function showManagerSuppliersDenied() {
  const pageContent = contentForPage('suppliers');
  breadcrumbPage.textContent = 'Suppliers';
  pageContent.innerHTML = '<section class="panel error-state"><strong>Manager access required</strong><span>Only Managers can add suppliers or update supplier details.</span></section>';
}

async function renderSuppliers(notice = '') {
  const pageContent = contentForPage('suppliers');
  breadcrumbPage.textContent = 'Suppliers';
  pageContent.innerHTML = '<section class="panel loading-state">Loading suppliers…</section>';
  try {
    const response = await fetch('/api/manager/suppliers');
    if (response.status === 401 || response.status === 403) return showManagerSuppliersDenied();
    const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not load suppliers.');
    const suppliers = result.suppliers;
    const audit = result.changes.length ? result.changes.map((change) => {
      let details = {}; try { details = JSON.parse(change.details); } catch { /* Preserve the audit row if its details cannot be read. */ }
      const auditText = change.eventType === 'created' ? `Added ${escapeHTML(change.supplierName)} to the supplier list.` : Object.entries(details).map(([field, values]) => {
        const label = { name: 'Name', contactName: 'Contact', phone: 'Phone', email: 'Email', isActive: 'Status' }[field] || field;
        const before = field === 'isActive' ? (values.before ? 'Active' : 'Inactive') : values.before;
        const after = field === 'isActive' ? (values.after ? 'Active' : 'Inactive') : values.after;
        return `${escapeHTML(label)}: ${escapeHTML(before)} → ${escapeHTML(after)}`;
      }).join(' · ');
      return `<div class="supplier-audit-row"><span class="catalog-audit-icon ${change.eventType}">${change.eventType === 'created' ? '+' : '↻'}</span><div><strong>${auditText || 'Supplier details updated'}</strong><small>${escapeHTML(change.changedBy)} · ${escapeHTML(new Date(change.createdAt).toLocaleString())}</small></div></div>`;
    }).join('') : '<div class="catalog-audit-empty">Supplier additions and edits will appear here.</div>';
    pageContent.innerHTML = `
      <section class="page-heading products-heading supplier-heading"><div><div class="eyebrow">MANAGER WORKSPACE <span class="heading-dot">•</span> SUPPLIER DIRECTORY</div><h1>Suppliers <span class="count-chip">${suppliers.filter((supplier) => supplier.isActive).length} active</span></h1><p>Track who provides your products and link suppliers to stock receipts.</p></div><button class="catalog-add-button" id="addSupplierButton" type="button"><span>＋</span> Add supplier</button></section>
      ${notice ? `<div class="pricing-notice" role="status">✓ ${escapeHTML(notice)}</div>` : ''}
      <section class="supplier-layout"><article class="panel supplier-panel"><div class="panel-heading"><div><h2>Supplier contacts</h2><p>Inactive suppliers stay in old movement history but cannot be selected for new receipts.</p></div><span class="private-badge">⌑ MANAGER ONLY</span></div><div class="table-wrap"><table class="supplier-table"><thead><tr><th>SUPPLIER</th><th>CONTACT</th><th>PHONE</th><th>EMAIL</th><th>STATUS</th><th></th></tr></thead><tbody>${suppliers.length ? suppliers.map((supplier) => `<tr><td><strong>${escapeHTML(supplier.name)}</strong></td><td>${escapeHTML(supplier.contactName || '—')}</td><td>${escapeHTML(supplier.phone || '—')}</td><td>${escapeHTML(supplier.email || '—')}</td><td><span class="supplier-status ${supplier.isActive ? 'active' : 'inactive'}">${supplier.isActive ? 'Active' : 'Inactive'}</span></td><td><div class="supplier-actions"><button class="price-edit-button" type="button" data-supplier-edit="${supplier.id}">Edit</button><button class="supplier-toggle-button ${supplier.isActive ? 'deactivate' : 'activate'}" type="button" data-supplier-toggle="${supplier.id}">${supplier.isActive ? 'Deactivate' : 'Activate'}</button></div></td></tr>`).join('') : '<tr><td colspan="6" class="empty-state">No suppliers yet. Add a supplier to select it when stock arrives.</td></tr>'}</tbody></table></div></article>
      <aside class="panel supplier-audit-panel"><div class="panel-heading"><div><h2>Supplier changes</h2><p>Latest 30 actions</p></div><span class="history-live"><i></i> AUDIT LOG</span></div><div class="catalog-audit-list">${audit}</div></aside></section>
      <dialog class="price-dialog supplier-dialog" id="supplierDialog"><form id="supplierForm"><div class="dialog-top"><span class="dialog-icon">♧</span><button type="button" class="dialog-close" id="closeSupplierDialog" aria-label="Close">×</button></div><div class="eyebrow" id="supplierDialogEyebrow">NEW SUPPLIER</div><h2 id="supplierDialogTitle">Add a supplier</h2><p>Supplier records help identify where stock receipts came from.</p><input type="hidden" id="supplierId" /><label for="supplierName">Supplier name</label><input id="supplierName" maxlength="100" required placeholder="For example, Ali Traders" /><label for="supplierContact">Contact person <span class="optional-label">optional</span></label><input id="supplierContact" maxlength="80" placeholder="Contact name" /><label for="supplierPhone">Phone <span class="optional-label">optional</span></label><input id="supplierPhone" maxlength="30" placeholder="+92 300 1234567" /><label for="supplierEmail">Email <span class="optional-label">optional</span></label><input id="supplierEmail" type="email" maxlength="120" placeholder="supplier@example.com" /><label class="supplier-active-toggle" id="supplierActiveRow" hidden><input id="supplierActive" type="checkbox" checked /> Supplier is active</label><div class="price-dialog-error" id="supplierDialogError" role="alert"></div><div class="dialog-actions"><button type="button" class="cancel-price" id="cancelSupplierDialog">Cancel</button><button type="submit" class="save-price" id="saveSupplierButton">Add supplier</button></div></form></dialog>`;
    const dialog = document.querySelector('#supplierDialog');
    const form = document.querySelector('#supplierForm');
    const openDialog = (supplier = null) => {
      form.reset(); document.querySelector('#supplierDialogError').textContent = '';
      document.querySelector('#supplierId').value = supplier?.id || '';
      document.querySelector('#supplierDialogTitle').textContent = supplier ? 'Edit supplier' : 'Add a supplier';
      document.querySelector('#supplierDialogEyebrow').textContent = supplier ? 'UPDATE SUPPLIER' : 'NEW SUPPLIER';
      document.querySelector('#saveSupplierButton').textContent = supplier ? 'Save supplier' : 'Add supplier';
      document.querySelector('#supplierActiveRow').hidden = !supplier;
      if (supplier) {
        document.querySelector('#supplierName').value = supplier.name;
        document.querySelector('#supplierContact').value = supplier.contactName;
        document.querySelector('#supplierPhone').value = supplier.phone;
        document.querySelector('#supplierEmail').value = supplier.email;
        document.querySelector('#supplierActive').checked = Boolean(supplier.isActive);
      }
      dialog.showModal();
    };
    document.querySelector('#addSupplierButton').addEventListener('click', () => openDialog());
    document.querySelectorAll('[data-supplier-edit]').forEach((button) => button.addEventListener('click', () => openDialog(suppliers.find((supplier) => supplier.id === Number(button.dataset.supplierEdit)))));
    document.querySelector('#closeSupplierDialog').addEventListener('click', () => dialog.close());
    document.querySelector('#cancelSupplierDialog').addEventListener('click', () => dialog.close());
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const id = document.querySelector('#supplierId').value;
      const saveButton = document.querySelector('#saveSupplierButton');
      const errorBox = document.querySelector('#supplierDialogError');
      const payload = { name: document.querySelector('#supplierName').value, contactName: document.querySelector('#supplierContact').value, phone: document.querySelector('#supplierPhone').value, email: document.querySelector('#supplierEmail').value };
      if (id) payload.isActive = document.querySelector('#supplierActive').checked;
      saveButton.disabled = true; saveButton.textContent = 'Saving…'; errorBox.textContent = '';
      try {
        const saveResponse = await fetch(id ? `/api/manager/suppliers/${id}` : '/api/manager/suppliers', { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const body = await saveResponse.json(); if (!saveResponse.ok) throw new Error(body.error || 'Could not save supplier.');
        dialog.close(); await refreshSuppliers(); await renderSuppliers(id ? 'Supplier details saved to the audit log.' : 'Supplier added. It is now available for stock receipts.');
      } catch (error) { errorBox.textContent = error.message; saveButton.disabled = false; saveButton.textContent = id ? 'Save supplier' : 'Add supplier'; }
    });
    document.querySelectorAll('[data-supplier-toggle]').forEach((button) => button.addEventListener('click', async () => {
      const supplier = suppliers.find((item) => item.id === Number(button.dataset.supplierToggle));
      const nextActive = !supplier.isActive;
      if (!nextActive && !window.confirm(`Deactivate ${supplier.name}? It will no longer appear for new stock receipts. Existing history will keep its supplier name.`)) return;
      button.disabled = true;
      try {
        const update = await fetch(`/api/manager/suppliers/${supplier.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: supplier.name, contactName: supplier.contactName, phone: supplier.phone, email: supplier.email, isActive: nextActive }) });
        const body = await update.json(); if (!update.ok) throw new Error(body.error || 'Could not update supplier.');
        await refreshSuppliers(); await renderSuppliers(nextActive ? 'Supplier activated.' : 'Supplier deactivated; old movement history is preserved.');
      } catch (error) { button.disabled = false; button.title = error.message; }
    }));
  } catch (error) {
    pageContent.innerHTML = `<section class="panel error-state"><strong>Suppliers unavailable</strong><span>${escapeHTML(error.message)}</span></section>`;
  }
}

async function refreshSuppliers() {
  const response = await fetch('/api/suppliers');
  activeSuppliers = response.ok ? await response.json() : [];
  await renderMovements();
}

function renderAssistant() {
  const pageContent = contentForPage('assistant');
  breadcrumbPage.textContent = 'AI assistant';
  pageContent.innerHTML = `
    <section class="page-heading products-heading assistant-heading"><div><div class="eyebrow">STOCKSENSE <span class="heading-dot">•</span> CONFIRMATION REQUIRED</div><h1>Ask your inventory <span class="assistant-spark">✧</span></h1><p>Get answers from your records, or ask for a stock change proposal to review.</p></div><div class="sample-note"><span>⌑</span> Changes need your confirmation.</div></section>
    <section class="assistant-layout"><article class="panel assistant-panel"><div class="assistant-intro"><span class="assistant-orb">✧</span><div><strong>What would you like to know?</strong><small>Answers use current records; stock changes need your confirmation.</small></div><span class="assistant-readonly">CONFIRM REQUIRED</span></div>
      <div class="assistant-messages" id="assistantMessages" aria-live="polite"><div class="assistant-message assistant-answer"><span class="assistant-avatar">✧</span><p>Hello ${currentUser.displayName.split(' ')[0]}! Ask me about stock, low-stock items, or recorded sales. You can also request a stock change; I’ll show a review card before anything is saved.</p></div></div>
      <div class="assistant-examples"><span>TRY ASKING</span><button type="button" data-question="How many Type-C Fast Charging Cables are in stock?">Cable stock</button><button type="button" data-question="Which products are low or out of stock?">Low stock</button><button type="button" data-question="What sold most this week?">Top sales this week</button><button type="button" data-question="Add 5 units of Type-C Fast Charging Cable as a delivery">Propose stock in</button></div>
      <form class="assistant-form" id="assistantForm"><label class="sr-only" for="assistantQuestion">Ask InventraIQ</label><textarea id="assistantQuestion" maxlength="500" rows="2" placeholder="Ask about your inventory…" required></textarea><button class="assistant-send" type="submit" aria-label="Send question">↑</button></form>
      <div class="assistant-footnote"><span>ⓘ</span> Stock changes are saved only after you press “Confirm stock change”. Sales insights count movements marked “Sale”.</div>
    </article><aside class="panel assistant-side"><div class="assistant-side-icon">◉</div><h2>Review before saving</h2><p>The assistant can prepare a suggestion. InventraIQ waits for your confirmation before updating inventory.</p><div class="assistant-rule"><span>01</span><div><strong>Review the exact change</strong><small>Product, reason, quantity, and new balance are shown.</small></div></div><div class="assistant-rule"><span>02</span><div><strong>Confirm or cancel</strong><small>Nothing changes when you ask or cancel a proposal.</small></div></div><div class="assistant-rule"><span>03</span><div><strong>Fresh stock check</strong><small>If quantity changed, InventraIQ asks you to prepare a new proposal.</small></div></div></aside></section>`;
  const form = document.querySelector('#assistantForm');
  const input = document.querySelector('#assistantQuestion');
  const messages = document.querySelector('#assistantMessages');
  function addMessage(text, kind) {
    const item = document.createElement('div');
    item.className = `assistant-message ${kind === 'user' ? 'assistant-user' : 'assistant-answer'}`;
    const avatar = document.createElement('span'); avatar.className = 'assistant-avatar'; avatar.textContent = kind === 'user' ? currentUser.displayName.slice(0, 1).toUpperCase() : '✧';
    const paragraph = document.createElement('p'); paragraph.textContent = text;
    item.append(avatar, paragraph); messages.append(item); messages.scrollTop = messages.scrollHeight; return item;
  }
  function addProposalCard(after, proposal) {
    const card = document.createElement('section'); card.className = 'assistant-proposal';
    const title = document.createElement('strong'); title.className = 'proposal-heading'; title.textContent = 'Review stock change'; card.append(title);
    const details = document.createElement('div'); details.className = 'proposal-details';
    const direction = proposal.movementType === 'in' ? 'Stock in' : 'Stock out';
    const reasonNames = { receipt: 'Receipt', sale: 'Sale', damage: 'Damaged', transfer: 'Transfer', adjustment: 'Adjustment', other: 'Other' };
    const lines = [
      ['Product', `${proposal.productName} · ${proposal.sku}`],
      ['Action', `${direction} · ${reasonNames[proposal.reason] || 'Other'}`],
      ['Quantity', `${proposal.quantity} ${proposal.unit}`],
      ['On hand', `${proposal.previousQuantity} → ${proposal.newQuantity} ${proposal.unit}`],
      ['Expires', new Date(proposal.expiresAt).toLocaleTimeString()],
    ];
    for (const [label, value] of lines) {
      const row = document.createElement('div'); row.className = 'proposal-detail';
      const key = document.createElement('span'); key.textContent = label;
      const text = document.createElement('strong'); text.textContent = value;
      row.append(key, text); details.append(row);
    }
    card.append(details);
    const actions = document.createElement('div'); actions.className = 'proposal-actions';
    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'proposal-cancel'; cancel.textContent = 'Cancel proposal';
    const confirm = document.createElement('button'); confirm.type = 'button'; confirm.className = 'proposal-confirm'; confirm.textContent = 'Confirm stock change';
    actions.append(cancel, confirm); card.append(actions); after.insertAdjacentElement('afterend', card);
    cancel.addEventListener('click', async () => {
      cancel.disabled = true; confirm.disabled = true;
      try {
        const response = await fetch(`/api/assistant/proposals/${proposal.id}/cancel`, { method: 'POST' });
        if (!response.ok) { const result = await response.json(); throw new Error(result.error || 'Could not cancel proposal.'); }
        card.innerHTML = '<strong class="proposal-cancelled">Proposal cancelled. Inventory was not changed.</strong>';
      } catch (error) { card.insertAdjacentText('beforeend', ` ${error.message}`); cancel.disabled = false; confirm.disabled = false; }
    });
    confirm.addEventListener('click', async () => {
      cancel.disabled = true; confirm.disabled = true; confirm.textContent = 'Saving confirmed change…';
      try {
        const response = await fetch(`/api/assistant/proposals/${proposal.id}/confirm`, { method: 'POST' });
        const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not confirm proposal.');
        card.innerHTML = '';
        const complete = document.createElement('strong'); complete.className = 'proposal-complete';
        complete.textContent = `Confirmed: ${result.productName} stock updated from ${result.previousQuantity} to ${result.newQuantity}. The change is in Stock movements history.`;
        card.append(complete);
        fetch('/api/products').then((res) => res.ok ? res.json() : null).then(async (latest) => {
          if (!latest) return;
          products = latest;
          refreshInventoryViews();
          await renderMovements();
        }).catch(() => {});
      } catch (error) { card.innerHTML = ''; const issue = document.createElement('strong'); issue.className = 'proposal-failed'; issue.textContent = `${error.message} No change was applied by this confirmation.`; card.append(issue); }
    });
  }
  document.querySelectorAll('[data-question]').forEach((button) => button.addEventListener('click', () => { input.value = button.dataset.question; input.focus(); }));
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const question = input.value.trim(); if (!question) return;
    addMessage(question, 'user'); input.value = ''; input.disabled = true;
    const pending = addMessage('Checking the inventory records…', 'answer'); pending.classList.add('assistant-pending');
    const send = document.querySelector('.assistant-send'); send.disabled = true;
    try {
      const response = await fetch('/api/assistant/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'The assistant is unavailable.');
      pending.querySelector('p').textContent = result.answer;
      if (result.proposal) addProposalCard(pending, result.proposal);
    } catch (error) { pending.querySelector('p').textContent = error.message; pending.classList.add('assistant-error-message'); }
    finally { pending.classList.remove('assistant-pending'); input.disabled = false; send.disabled = false; input.focus(); }
  });
}

function navigate() {
  const requestedPage = location.hash.replace('#', '');
  const pages = ['dashboard', 'products', 'movements', 'assistant', 'pricing', 'reports', 'catalog', 'suppliers'];
  let page = pages.includes(requestedPage) ? requestedPage : 'dashboard';
  const managerPages = ['pricing', 'reports', 'catalog', 'suppliers'];
  if (managerPages.includes(page) && currentUser.role !== 'manager') page = 'dashboard';
  if (requestedPage !== page) history.replaceState(null, '', `${location.pathname}${location.search}#${page}`);
  setActiveSection(page);
  document.querySelector('#sidebar').classList.remove('open');
  const section = document.getElementById(page);
  if (section && requestedPage) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setActiveSection(page) {
  navLinks.forEach((link) => {
    const active = link.dataset.page === page;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'location');
    else link.removeAttribute('aria-current');
  });
  breadcrumbPage.textContent = pageNames[page];
  document.title = `InventraIQ | ${page === 'dashboard' ? 'Inventory overview' : pageNames[page]}`;
}

function watchWorkspaceScroll() {
  if (!('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver((entries) => {
    const visibleSection = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (visibleSection) setActiveSection(visibleSection.target.id);
  }, { rootMargin: '-16% 0px -66% 0px', threshold: [0, 0.15, 0.3] });
  document.querySelectorAll('.workspace-section:not([hidden])').forEach((section) => observer.observe(section));
}

function renderHome(apiNotice = '') {
  document.body.innerHTML = `
    <main class="landing-page">
      <header class="landing-nav">
        <a class="landing-brand" href="#home" aria-label="InventraIQ home"><img src="/inventraiq-logo.png" alt="InventraIQ" /></a>
        <nav aria-label="Landing page navigation"><a href="#landing-features">Features</a><a href="#account-access">Account access</a><button type="button" class="landing-nav-cta" data-open-role="manager">Sign in <span>↗</span></button></nav>
      </header>
      <section class="landing-hero" id="home">
        <div class="landing-copy"><div class="landing-eyebrow"><i></i> SMART INVENTORY FOR SHOPPING MALLS</div><h1>Know your stock.<br /><span>Move with clarity.</span></h1><p>One calm, clear workspace for products, stock movements, and AI-assisted inventory insights.</p><div class="landing-actions"><a class="landing-primary" href="#account-access">Explore your workspace <span>↓</span></a><span class="landing-local"><i></i> ${import.meta.env.DEV ? 'Local project preview' : 'Cloud demo preview'}</span></div><div class="landing-proof"><div><strong>01</strong><span>One inventory view</span></div><div><strong>02</strong><span>Role-based access</span></div><div><strong>03</strong><span>Human-confirmed stock</span></div></div></div>
        <div class="landing-visual" aria-label="Inventory dashboard illustration"><div class="landing-glow"></div><div class="landing-visual-top"><span><i></i> INVENTORY PULSE</span><span>SAMPLE VIEW</span></div><div class="landing-visual-main"><div class="landing-chart-title"><span>Stock overview</span><b>↗</b></div><div class="landing-big-number">52 <small>products</small></div><div class="landing-chart"><span style="--bar:42%"></span><span style="--bar:65%"></span><span style="--bar:51%"></span><span style="--bar:79%"></span><span style="--bar:60%"></span><span style="--bar:92%"></span><span style="--bar:73%"></span><span style="--bar:100%"></span><span style="--bar:82%"></span><span style="--bar:95%"></span></div><div class="landing-chart-labels"><span>MON</span><span>TUE</span><span>WED</span><span>THU</span><span>FRI</span><span>SAT</span><span>SUN</span></div></div><div class="landing-float-card"><span class="landing-float-icon">✧</span><span><strong>AI inventory assistant</strong><small>Answers from your records</small></span><i>●</i></div><div class="landing-orbit landing-orbit-a"></div><div class="landing-orbit landing-orbit-b"></div></div>
      </section>
      ${apiNotice ? `<div class="landing-api-notice" role="status">${escapeHTML(apiNotice)}</div>` : ''}
      <section class="landing-features" id="landing-features"><div class="landing-section-heading"><div><div class="landing-eyebrow">BUILT FOR EVERYDAY OPERATIONS</div><h2>Everything your team needs to stay in sync.</h2></div><p>Clear information for the people who manage the mall and the people who move its stock.</p></div><div class="landing-feature-grid"><article class="landing-feature"><span class="landing-feature-icon">▦</span><div><small>01 / INVENTORY</small><h3>One source of truth</h3><p>Browse products, quantities, categories, and stock alerts from one place.</p></div></article><article class="landing-feature"><span class="landing-feature-icon lavender">◉</span><div><small>02 / TEAM ACCESS</small><h3>Each role has its view</h3><p>Managers see business tools. Staff focus on the daily inventory workflow.</p></div></article><article class="landing-feature"><span class="landing-feature-icon gold">✧</span><div><small>03 / AI ASSISTANT</small><h3>Insight with a human check</h3><p>Ask about real inventory records. Review every proposed stock change before saving.</p></div></article></div></section>
      <section class="landing-access" id="account-access"><div class="landing-section-heading"><div><div class="landing-eyebrow">CHOOSE YOUR WORKSPACE</div><h2>Sign in with your account.</h2></div><p>${import.meta.env.DEV ? 'These are local demo accounts. Select a role to fill its sign-in details.' : 'Use the account details provided by the deployment owner.'}</p></div><div class="landing-account-grid"><article class="landing-account manager-account"><div class="landing-account-head"><span class="account-avatar manager-avatar">M</span><span><small>FULL WORKSPACE</small><h3>Mall Manager</h3></span><span class="account-access-mark">↗</span></div><p>Manage inventory, products, suppliers, pricing, and reports.</p>${import.meta.env.DEV ? '<div class="credential-list"><div><span>USERNAME</span><strong>manager@stocksense.local</strong></div><div><span>DEFAULT PASSWORD</span><strong>Manager123!</strong></div></div>' : '<div class="credential-list"><div><span>ACCOUNT</span><strong>Deployment credentials required</strong></div></div>'}<button type="button" class="account-login-button manager-login-button" data-open-role="manager">Continue as Manager <span>→</span></button></article><article class="landing-account staff-account"><div class="landing-account-head"><span class="account-avatar staff-avatar">S</span><span><small>DAILY OPERATIONS</small><h3>Store Staff</h3></span><span class="account-access-mark">↗</span></div><p>View stock, record movements, and ask inventory questions.</p>${import.meta.env.DEV ? '<div class="credential-list"><div><span>USERNAME</span><strong>staff@stocksense.local</strong></div><div><span>DEFAULT PASSWORD</span><strong>Staff123!</strong></div></div>' : '<div class="credential-list"><div><span>ACCOUNT</span><strong>Deployment credentials required</strong></div></div>'}<button type="button" class="account-login-button staff-login-button" data-open-role="staff">Continue as Staff <span>→</span></button></article></div>${import.meta.env.DEV ? '<div class="landing-demo-note"><span>ⓘ</span> Demo credentials are for local preview only. Replace them with secure individual accounts before live use.</div>' : '<div class="landing-demo-note"><span>ⓘ</span> Public demo passwords are disabled. Request an account from the deployment owner.</div>'}</section>
      <footer class="landing-footer"><img src="/inventraiq-logo.png" alt="InventraIQ" /><span>INVENTORY, IN BETTER FOCUS</span><a href="#account-access">Go to sign in ↑</a></footer>
      <dialog class="landing-signin-dialog" id="landingSignInDialog" aria-labelledby="landingSignInTitle"><button class="landing-dialog-close" id="closeLandingSignIn" type="button" aria-label="Close sign in">×</button><div class="login-eyebrow">ROLE-BASED SECURE ACCESS</div><h2 id="landingSignInTitle">Sign in to your workspace</h2><p class="landing-dialog-subtitle" id="landingSignInSubtitle">Your selected demo account is ready.</p><form id="landingLoginForm"><label for="landingEmail">Username / email</label><input id="landingEmail" type="email" autocomplete="username" required /><label for="landingPassword">Password</label><input id="landingPassword" type="password" autocomplete="current-password" required /><p class="login-error" id="landingLoginError" role="alert"></p><button class="login-submit" id="landingLoginSubmit" type="submit">Sign in <span>→</span></button></form><button class="landing-dialog-home" id="stayOnLanding" type="button">Return to the home page</button><div class="login-security"><span>⌑</span> Your role is checked securely by the server</div></dialog>
    </main>`;
  document.querySelectorAll('[data-open-role]').forEach((button) => button.addEventListener('click', () => renderLogin('', button.dataset.openRole)));
  document.title = 'InventraIQ | Smart inventory for shopping malls';
}

function renderLogin(message = '', selectedRole = '') {
  const dialog = document.querySelector('#landingSignInDialog');
  if (!dialog) return;
  const role = selectedRole === 'staff' ? 'staff' : 'manager';
  const account = role === 'manager'
    ? { email: 'manager@stocksense.local', password: import.meta.env.DEV ? 'Manager123!' : '', name: 'Mall Manager' }
    : { email: 'staff@stocksense.local', password: import.meta.env.DEV ? 'Staff123!' : '', name: 'Store Staff' };
  const emailInput = document.querySelector('#landingEmail');
  const passwordInput = document.querySelector('#landingPassword');
  const errorBox = document.querySelector('#landingLoginError');
  const submit = document.querySelector('#landingLoginSubmit');
  document.querySelector('#landingSignInTitle').textContent = `Sign in as ${account.name}`;
  document.querySelector('#landingSignInSubtitle').textContent = import.meta.env.DEV ? `Your ${account.name} demo credentials are filled in. You can edit them if needed.` : `Enter the ${account.name} credentials provided by the deployment owner.`;
  emailInput.value = account.email;
  passwordInput.value = account.password;
  errorBox.textContent = message;
  dialog.showModal();
  document.querySelector('#closeLandingSignIn').onclick = () => dialog.close();
  document.querySelector('#stayOnLanding').onclick = () => dialog.close();
  dialog.onclick = (event) => { if (event.target === dialog) dialog.close(); };
  document.querySelector('#landingLoginForm').onsubmit = async (event) => {
    event.preventDefault();
    errorBox.textContent = '';
    submit.disabled = true;
    submit.textContent = 'Signing in…';
    try {
      const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: emailInput.value, password: passwordInput.value }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to sign in.');
      location.reload();
    } catch (error) {
      errorBox.textContent = error.message === 'Failed to fetch' ? (import.meta.env.DEV ? 'The local API is not available. Start the InventraIQ API and try again.' : 'The online API is not responding. Please try again later.') : error.message;
      submit.disabled = false;
      submit.innerHTML = `Sign in <span>→</span>`;
    }
  };
}

async function bootstrap() {
  try {
    const sessionResponse = await fetch('/api/session');
    if (!sessionResponse.ok) return renderHome();
    const session = await sessionResponse.json();
    currentUser = session.user;
    const productResponse = await fetch('/api/products');
    if (!productResponse.ok) throw new Error('Your session could not access the inventory. Please sign in again.');
    products = await productResponse.json();
    document.querySelector('.nav-count').textContent = products.length;
    const supplierResponse = await fetch('/api/suppliers');
    activeSuppliers = supplierResponse.ok ? await supplierResponse.json() : [];
    document.querySelector('#profileName').textContent = currentUser.displayName;
    document.querySelector('#profileRole').textContent = `${currentUser.role.toUpperCase()} ACCOUNT`;
    document.querySelector('#profileAvatar').textContent = currentUser.displayName.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
    const isManager = currentUser.role === 'manager';
    document.querySelectorAll('.manager-only').forEach((item) => { item.hidden = !isManager; });
    document.querySelectorAll('.manager-workspace-section').forEach((item) => { item.hidden = !isManager; });
    renderDashboard();
    renderProducts();
    renderMovements();
    renderAssistant();
    if (isManager) {
      renderPricing();
      renderReports();
      renderCatalog();
      renderSuppliers();
    }
    watchWorkspaceScroll();
    document.querySelector('#menuToggle').addEventListener('click', () => document.querySelector('#sidebar').classList.toggle('open'));
    document.querySelector('#logoutButton').addEventListener('click', async () => {
      await fetch('/api/logout', { method: 'POST' });
      location.reload();
    });
    window.addEventListener('hashchange', navigate);
    navigate();
  } catch (error) {
    console.error('Could not start InventraIQ:', error);
    renderHome(import.meta.env.DEV ? 'The API is not connected yet. Start the InventraIQ API before signing in.' : 'The online service is temporarily unavailable. Please try again later.');
  }
}

bootstrap();
