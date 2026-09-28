/* Presentation helpers. Existing fields and transaction handlers remain the source of truth. */
const FINANCE_PAGE_HELP = {
  dashboard: "Your day at a glance. Start a bill, record a payment, or check a balance.",
  retail: "Create a bill or record money received or paid. Save, print, and share from one place.",
  upload: "Choose the working date, select an entry type, and save your entries.",
  ledger: "Search for a customer or supplier to see their balance and transaction history.",
  'daily-sheet': "Review daily stock or customer and supplier balances. Download or print any sheet.",
  reports: "Choose a report, set the period, then download or share it.",
  analytics: "Choose a period to compare sales, purchases, cash flow, and stock.",
  'billing-setup': "Manage item shortcuts, default rates, and dressed stock used when billing.",
  'access-control': "Manage your outlets and who can use them.",
  login: "Sign in to your business workspace."
};

function makeDisclosure(title, hint = '') {
  const details = document.createElement('details');
  details.className = 'simple-disclosure';
  const summary = document.createElement('summary');
  summary.textContent = title;
  details.append(summary);
  if (hint) {
    const help = document.createElement('p');
    help.className = 'section-help';
    help.textContent = hint;
    details.append(help);
  }
  return details;
}

function groupOptionalFields(ids, title, anchor) {
  if (!anchor) return;
  const fields = ids.map(id => document.getElementById(id)?.closest('.form-field')).filter(Boolean);
  if (!fields.length) return;
  const details = makeDisclosure(title);
  details.classList.add('optional-fields');
  const grid = document.createElement('div');
  grid.className = 'optional-field-grid';
  fields.forEach(field => grid.append(field));
  details.append(grid);
  const actions = anchor.querySelector(':scope > .retail-actions');
  if (actions) actions.before(details);
  else anchor.append(details);
}

function addDateShortcuts(startId, endId, anchor) {
  if (!anchor) return;
  const shortcuts = document.createElement('div');
  shortcuts.className = 'date-shortcuts';
  shortcuts.setAttribute('role', 'group');
  shortcuts.setAttribute('aria-label', 'Choose a date range');
  for (const [label, range] of [['Today', 'today'], ['Last 7 days', 'week'], ['This month', 'month']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'button-secondary';
    button.textContent = label;
    button.addEventListener('click', () => {
      const end = new Date();
      const start = new Date(end);
      if (range === 'week') start.setDate(start.getDate() - 6);
      if (range === 'month') start.setDate(1);
      const first = document.getElementById(startId);
      const last = document.getElementById(endId);
      if (!first || !last) return;
      first.value = formatDateInput(start);
      last.value = formatDateInput(end);
      first.dispatchEvent(new Event('change', {bubbles: true}));
      last.dispatchEvent(new Event('change', {bubbles: true}));
    });
    shortcuts.append(button);
  }
  anchor.append(shortcuts);
  return shortcuts;
}

function enhanceEntryTabs() {
  const tabs = Array.from(document.querySelectorAll('[data-entry-tab]'));
  tabs.forEach(tab => {
    tab.setAttribute('role', 'tab');
    tab.tabIndex = tab.classList.contains('active') ? 0 : -1;
    tab.id = `entry-tab-${tab.dataset.entryTab}`;
    const panels = Array.from(document.querySelectorAll(`[data-entry-panel="${tab.dataset.entryTab}"]`));
    panels.forEach((panel, index) => {
      panel.id = `entry-panel-${tab.dataset.entryTab}-${index}`;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', tab.id);
    });
    tab.setAttribute('aria-controls', panels.map(panel => panel.id).join(' '));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = tabs.indexOf(tab);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
      tabs[next].click();
      tabs[next].focus();
    });
  });
}

function addImportTools() {
  const types = [
    ['purchases', 'dealer', 'dealerFile', 'Purchases', 'previewDealer', 'uploadDealer'],
    ['sales', 'vendor', 'vendorFile', 'Sales', 'previewVendor', 'uploadVendor'],
    ['payments', 'payment', 'paymentFile', 'Payments', 'previewPayment', 'uploadPayment'],
    ['setup', 'opening-balance', 'openingBalanceFile', 'Opening balances', 'previewOpeningBalance', 'uploadOpeningBalance'],
    ['setup', 'opening-stock', 'openingStockFile', 'Opening stock', 'previewOpeningStock', 'uploadOpeningStock']
  ];
  for (const [panel, template, inputId, label, preview, upload] of types) {
    const sections = document.querySelectorAll(`[data-entry-panel="${panel}"]`);
    const anchor = sections[sections.length - 1];
    if (!anchor) continue;
    const details = makeDisclosure(`Import ${label.toLowerCase()} from a file`, 'Use the template for column names. Preview the file before importing. CSV or Excel, up to 5 MB.');
    // These identifiers and function names are fixed application constants.
    const controls = document.createElement('div');
    controls.className = 'import-controls';
    controls.innerHTML = `<label class="form-field"><span>${label} file</span><input id="${inputId}" type="file" accept=".csv,.xls,.xlsx"></label>
      <div class="report-actions"><button type="button" class="button-secondary" onclick="downloadTemplate('${template}')">Get template</button>
      <button type="button" class="button-secondary" onclick="${preview}()">Preview file</button>
      <button type="button" onclick="${upload}()">Import file</button></div>`;
    details.append(controls);
    anchor.append(details);
  }
}

function labelFinanceControls(root) {
  root.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach(input => {
    const label = input.closest('label');
    const heading = input.closest('.form-field, .billing-priority-field')?.querySelector('span')?.textContent;
    const retailLabels = {retailItemName: 'Item', retailQty: 'Count (NAG)', retailUnit: 'Unit', retailWeight: 'Weight (kg)', retailRate: 'Rate', retailAmount: 'Amount'};
    const retailLabel = Object.keys(retailLabels).find(name => input.classList.contains(name));
    if (!label && !input.hasAttribute('aria-label')) {
      const name = heading || retailLabels[retailLabel] || input.placeholder || ({directoryPartyType: 'Contact type', directoryPartySelect: 'Saved contact', uploadWorkingDate: 'Working date', processDate: 'Closing stock date'}[input.id]);
      if (name) input.setAttribute('aria-label', name);
    }
    if (!label && retailLabel && input.closest('.retail-item-row') && !input.matches('.retail-item-row-dressed .retailQty, .retail-item-row-dressed .retailUnit')) {
      const wrapper = document.createElement('label');
      wrapper.className = `form-field retail-field ${retailLabel}-field`;
      const caption = document.createElement('span');
      caption.textContent = retailLabels[retailLabel];
      input.before(wrapper);
      wrapper.append(caption, input);
    }
    // Keep labels visible after typing in the compact, dynamically added entry rows.
    if (!label && input.placeholder && input.closest('.manual-entry-row, .actual-stock-row') && !input.closest('.typeahead-field')) {
      const wrapper = document.createElement('label');
      wrapper.className = 'form-field entry-field';
      const caption = document.createElement('span');
      caption.textContent = input.placeholder.replace('NAG', 'Count (NAG)');
      input.before(wrapper);
      wrapper.append(caption, input);
    }
  });
}

let financeControlObserver;
function enhanceFinancePage(page) {
  financeControlObserver?.disconnect();
  const content = document.getElementById('content');
  const description = document.getElementById('pageDescription');
  if (description) description.textContent = FINANCE_PAGE_HELP[page] || '';
  document.body.dataset.page = page;
  if (!content) return;
  if (page === 'dashboard') {
    const charts = content.querySelector('.dashboard-chart-grid');
    const detailGrid = content.querySelector('.dashboard-detail-grid');
    if (charts) {
      const details = makeDisclosure('Trends, insights & stock', 'Compare recent activity and see stock by item.');
      charts.before(details);
      details.append(charts);
      if (detailGrid) details.append(detailGrid);
      details.addEventListener('toggle', () => {
        if (details.open && window.Chart?.getChart) details.querySelectorAll('canvas').forEach(canvas => Chart.getChart(canvas)?.resize());
      });
    }
  }
  if (page === 'retail') {
    groupOptionalFields(['retailCashier', 'retailCustomerPhone', 'retailCustomerAddress', 'retailIceAmount', 'retailNotes'],
      'More bill details · phone, address, cashier, ice & notes', content.querySelector('.retail-bill-details-panel'));
    groupOptionalFields(['paymentReceiptCashier', 'paymentReceiptPartyPhone', 'paymentReceiptNotes'],
      'More receipt details · phone, cashier & notes', document.getElementById('paymentReceiptSection'));
    content.querySelectorAll('.retail-actions button:not(:first-child)').forEach(button => button.classList.add('button-secondary'));
    for (const [id, panel] of [['billSummary', 'retailSalesSection'], ['paymentSummary', 'paymentReceiptSection']]) {
      const summary = document.createElement('div');
      summary.id = id;
      summary.className = 'billing-summary';
      summary.setAttribute('role', 'status');
      document.querySelector(`#${panel} .retail-actions`).before(summary);
    }
    const previewPanel = content.querySelector('.retail-preview-panel');
    const preview = makeDisclosure('Print preview');
    preview.classList.add('print-preview-disclosure');
    preview.open = window.matchMedia('(min-width: 1280px)').matches;
    preview.append(document.getElementById('retailPreview'));
    previewPanel.replaceChildren(preview);
    // Retain the ID used when switching between bill and receipt modes.
    preview.querySelector('summary').id = 'retailPreviewTitle';
    const shortcuts = content.querySelector('.retail-combined-shortcuts');
    const shortcutDetails = makeDisclosure('Quick item shortcuts');
    shortcutDetails.classList.add('item-shortcut-disclosure');
    shortcuts.before(shortcutDetails);
    shortcutDetails.append(shortcuts);
    updateBillingSummary({}, 'bill');
    updateBillingSummary({}, 'payment');
  }
  if (page === 'retail' || page === 'billing-setup') enhanceRetailTabs();
  if (page === 'upload') {
    enhanceEntryTabs();
    addImportTools();
  }
  if (page === 'ledger') addDateShortcuts('ledgerStartDate', 'ledgerEndDate', content.querySelector('.ledger-query-card'));
  if (page === 'analytics') addDateShortcuts('startDate', 'endDate', content.querySelector('.analytics-toolbar'));
  if (page === 'reports') {
    const form = content.querySelector('.report-form');
    const help = document.createElement('p');
    help.className = 'report-help section-help';
    help.setAttribute('aria-live', 'polite');
    form.before(help);
    const shortcuts = addDateShortcuts('reportStartDate', 'reportEndDate', content.querySelector('.section'));
    const descriptions = {
      ledger: 'One customer or supplier’s transactions and running balance.',
      transactions: 'Every transaction in the period. Optionally filter by customer or supplier.',
      summary: 'Sales, purchases, payments, and profit for the selected period.',
      outstanding: 'Balances to collect from customers and to pay to suppliers.',
      inventory: 'Opening, purchased, sold, and remaining stock for a single day.'
    };
    const update = () => {
      const type = document.getElementById('reportType').value;
      help.textContent = descriptions[type];
      shortcuts.hidden = type === 'inventory';
    };
    document.getElementById('reportType').addEventListener('change', update);
    update();
  }
  applyFinanceColours(content);
  labelFinanceControls(content);
  financeControlObserver = new MutationObserver(() => {
    financeControlObserver.disconnect();
    labelFinanceControls(content);
    financeControlObserver.observe(content, {childList: true, subtree: true});
  });
  financeControlObserver.observe(content, {childList: true, subtree: true});
}

function syncRetailTabs(mode) {
  const modes = {retailModeRegular: 'regular', retailModeDressed: 'dressed', retailModePayment: 'payment'};
  document.querySelectorAll('.retail-mode-button').forEach(button => {
    const selected = modes[button.id] === mode;
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(selected));
    button.tabIndex = selected ? 0 : -1;
  });
  const reset = document.querySelector('.retail-reset-button');
  if (reset) reset.hidden = mode === 'payment';
}

function enhanceRetailTabs() {
  const tabs = Array.from(document.querySelectorAll('.retail-mode-button'));
  syncRetailTabs('regular');
  tabs.forEach(tab => tab.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const index = tabs.indexOf(tab);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].click();
    tabs[next].focus();
  }));
}

function updateBillingSummary(data, kind) {
  const summary = document.getElementById(kind === 'bill' ? 'billSummary' : 'paymentSummary');
  if (!summary) return;
  const money = value => '₹ ' + Number(value || 0).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const entries = kind === 'bill'
    ? [['Bill total', data.total_amount], ['Paid', data.paid_amount], ['Due on this bill', data.outstanding_amount]]
    : [[data.direction === 'PAID' ? 'Money paid' : 'Money received', data.amount]];
  summary.replaceChildren(...entries.map(([label, value], index) => {
    const item = document.createElement('div');
    item.dataset.meaning = kind === 'payment' ? (data.direction === 'PAID' ? 'out' : 'in') : (index === 1 ? 'in' : index === 2 && Number(value) > 0 ? 'pending' : 'neutral');
    const caption = document.createElement('span');
    caption.textContent = label;
    const amount = document.createElement('strong');
    amount.textContent = money(value);
    item.append(caption, amount);
    return item;
  }));
  if (kind === 'bill') {
    const customer = document.getElementById('retailCustomerName');
    const required = document.getElementById('retailSettlementType').value !== 'paid' || Number(data.outstanding_amount || 0) > 0;
    customer?.setAttribute('aria-required', String(required));
    if (customer) customer.placeholder = required ? 'Required: choose a customer' : 'Optional for paid bills';
    const paid = document.getElementById('retailPaidAmount');
    if (paid) paid.closest('.form-field').hidden = document.getElementById('retailSettlementType').value !== 'partial';
  }
}

async function submitAuthForm(setup) {
  const button = document.querySelector('#authForm button[type="submit"]');
  if (button.disabled) return;
  button.disabled = true;
  try {
    await (setup ? setupOwnerAccount() : loginUser());
  } catch (error) {
    showToast(error.message || 'Could not sign in. Please try again.');
  } finally {
    button.disabled = false;
  }
}

// Colour supports the written label; it never replaces it.
function applyFinanceColours(root) {
  const meanings = {
    receivable: 'pending', payable: 'out', dashboardPaymentsReceived: 'in',
    dashboardPaymentsPaid: 'out', unclassifiedBalance: 'pending',
    receivableBalance: 'pending', payableBalance: 'out'
  };
  for (const [id, meaning] of Object.entries(meanings)) {
    const value = document.getElementById(id);
    const card = value?.closest('.dashboard-kpi-card, .dashboard-mini-card, .summary-box');
    if (card) card.dataset.meaning = meaning;
  }
  const legend = document.createElement('div');
  legend.className = 'colour-guide';
  legend.setAttribute('aria-label', 'Colour guide');
  legend.innerHTML = '<span><b class="key-action">Gold</b> Actions & selected tabs</span><span><b class="key-in">Green</b> Received / completed</span><span><b class="key-pending">Amber</b> To collect / needs attention</span><span><b class="key-out">Red</b> To pay / money out / errors</span>';
  root.querySelector('.container')?.append(legend);
}
