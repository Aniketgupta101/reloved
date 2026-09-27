/* Isolated design review: all records and actions below are local synthetic scenarios. */
const BASE = '../../frontend/public/images/';
const ASSET = 'assets/';
const image = (name) => `${BASE}wall-items/display/${name}.png.webp`;
const products = [
  { id: 'RL-DEMO-104', title: 'Hunter x Hunter Hisoka graphic tee', size: 'M', condition: 'Good', area: 'Bandra West', category: 'Tops', gender: 'Men', nearby: true, status: 'Available', image: image('hunter-x-hunter-hisoka-tee'), back: image('hunter-x-hunter-hisoka-tee-back') },
  { id: 'RL-DEMO-105', title: 'White linen embroidered tunic', size: 'L', condition: 'Excellent', area: 'Andheri West', category: 'Tops', gender: 'Women', nearby: true, status: 'Being matched', image: image('zanella-white-linen-embroidered-tunic') },
  { id: 'RL-DEMO-106', title: 'Dark grey zip pocket joggers', size: 'M', condition: 'Good', area: 'Mumbai', category: 'Bottoms', gender: 'Men', nearby: true, status: 'Available', image: image('dark-grey-zip-pocket-joggers') },
  { id: 'RL-DEMO-107', title: 'Kids navy logo tee', size: '8 years', condition: 'Good', area: 'Thane', category: 'Tops', gender: 'Boys', nearby: false, status: 'Claimed', image: image('polo-ralph-lauren-kids-navy-logo-tee') },
  { id: 'RL-DEMO-108', title: 'Soft cotton kids tee', size: '6 years', condition: 'Good', area: 'Mumbai', category: 'Tops', gender: 'Boys', nearby: true, status: 'Available', image: image('kids-soft-cotton-tee') },
  { id: 'RL-DEMO-109', title: 'H&M grey chino shorts', size: 'M', condition: 'Good', area: 'Bandra West', category: 'Bottoms', gender: 'Men', nearby: true, status: 'Available', image: image('hm-grey-chino-shorts') },
  { id: 'RL-DEMO-110', title: 'Lego Marvel comics baseball cap', size: 'One size', condition: 'Good', area: 'Andheri West', category: 'Accessories', gender: 'Boys', nearby: false, status: 'Available', image: image('lego-marvel-comics-baseball-cap') },
  { id: 'RL-DEMO-111', title: 'Surfs on graphic tee', size: 'S', condition: 'Good', area: 'Mumbai', category: 'Tops', gender: 'Men', nearby: true, status: 'Available', image: image('surfs-on-graphic-tee') },
];
const screens = ['Home', 'Wall', 'Item detail', 'Give', 'Account', 'Claim detail'];
const state = {
  screen: new URLSearchParams(location.search).get('screen') || 'Home',
  scenario: new URLSearchParams(location.search).get('scenario') || 'Normal inventory',
  item: 0, gallery: 0, filter: 'All', gender: 'All', size: 'All', condition: 'All', nearby: false, query: '', giveStep: 0, guest: true,
  giveMode: 'Guest', detailGroup: 0, draft: null, declaration: false, acceptedTerms: false, profileEditing: false, notesRead: false,
  deliveryBuilding: '', reviewMessage: '', givingDecision: '', editingPickup: false,
  photos: [true, true, true], extraPhoto: null, groupBackWithTwo: false, multiItem: true, accountTab: 'Claiming', overlay: '', previousFocus: null,
  form: { title: 'Hunter x Hunter Hisoka graphic tee', size: 'M', condition: 'Good', category: 'Tops', brand: '', quantity: '1', description: '', defect: '' },
  secondForm: { title: 'White linen embroidered tunic', size: 'L', condition: 'Excellent', category: 'Tops', brand: '', quantity: '1', description: '', defect: '' },
  donor: { firstName: '', lastName: '', phone: '', email: '', recognition: 'anonymous', pickupLocality: 'Demo building, Bandra West, Mumbai, 400050' },
  profile: { name: 'Demo member', username: 'reloved_demo', address: 'Demo building, Bandra West, Mumbai', pincode: '400050' },
};
if (!screens.includes(state.screen)) state.screen = 'Home';
const toolbar = document.getElementById('review-toolbar');
const customer = document.getElementById('customer');
const toast = document.getElementById('toast');
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const icon = (name) => {
  const paths = {
    menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
    close: '<path d="M5 5l14 14M19 5L5 19"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  };
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
};
const btn = (label, action, kind = '') => `<button class="btn ${kind}" data-action="${action}">${label}<span class="arrow" aria-hidden="true">↗</span></button>`;
const nav = (label, screen, cls = '') => `<a href="?screen=${encodeURIComponent(screen)}" data-nav="${screen}" class="${cls}">${label}</a>`;
function setScreen(screen) {
  state.screen = screen;
  state.overlay = '';
  state.reviewMessage = '';
  const url = new URL(location.href);
  url.searchParams.set('screen', screen);
  url.searchParams.delete('scenario');
  history.pushState({ screen }, '', url);
  state.scenario = defaultScenario(screen);
  window.scrollTo({ top: 0, behavior: 'instant' });
  render();
}
function defaultScenario(screen) { return screen === 'Claim detail' ? 'Pending' : screen === 'Give' ? state.giveMode : screen === 'Account' ? 'Current' : screen === 'Item detail' ? products[state.item].status : 'Normal inventory'; }
function scenarioOptions() {
  if (state.screen === 'Home') return ['Normal inventory', 'One item', 'No items'];
  if (state.screen === 'Wall') return ['Normal inventory', 'One item', 'No items', 'Loading', 'Failure', 'Available only', 'Being matched only', 'Claimed only'];
  if (state.screen === 'Item detail') return ['Available', 'Being matched', 'Claimed', 'Unavailable', 'Own listing', 'Weekly limit', 'Long title'];
  if (state.screen === 'Give') return ['Guest', 'Signed in', 'Saved profile', 'Draft restored', 'Loading', 'Failure', 'Simulated receipt'];
  if (state.screen === 'Claim detail') return ['Pending', 'Waiting', 'Action required', 'Time proposed', 'Time agreed', 'Handover', 'Completed', 'Declined', 'Cancelled', 'Unavailable'];
  return ['Current', 'Empty', 'Action required', 'Completed', 'Loading', 'Failure', 'Claiming', 'Giving', 'Notifications', 'Profile'];
}
function reviewControls() {
  if (state.screen !== 'Give') return '';
  const steps = giveSteps();
  return `<div class="review-simulation"><label>Step <select id="give-step-select" aria-label="Review Give step">${steps.map((step, i) => `<option value="${i}" ${state.giveStep === i ? 'selected' : ''}>${step}</option>`).join('')}</select></label><button data-review="save-draft">Save preview draft</button><button data-review="restore-draft" ${state.draft ? '' : 'disabled'}>Restore preview draft</button>${steps[state.giveStep] === 'Login' ? '<button data-review="login">Simulate sign-in</button>' : ''}${steps[state.giveStep] === 'Post' ? `<button data-review="submit" ${state.declaration && state.acceptedTerms && validGiveDetails() ? '' : 'disabled'}>Simulate submission</button>` : ''}</div>`;
}
function renderToolbar() {
  const opts = scenarioOptions();
  if (!opts.includes(state.scenario)) state.scenario = opts[0];
  const baseline = ({ Home: 'home-desktop-viewport.png', Wall: 'wall-desktop-viewport.png', 'Item detail': 'item-desktop-viewport.png', Give: 'give-phone-viewport.png', Account: 'account-claiming-phone-viewport.png', 'Claim detail': 'account-claim-detail-phone-viewport.png' })[state.screen];
  toolbar.innerHTML = `<div class="review-inner"><strong>Reloved design review</strong><span class="review-note">Revised prototype · synthetic data · local interactions only · no login/upload/submission</span>${state.scenario === 'Simulated receipt' ? '<span class="review-warning">Simulated receipt · nothing submitted</span>' : ''}<span class="review-spacer"></span><label>Screen <select id="screen-select" aria-label="Review screen">${screens.map(s => `<option ${s === state.screen ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label>Scenario <select id="scenario-select" aria-label="Synthetic scenario">${opts.map(s => `<option ${s === state.scenario ? 'selected' : ''}>${s}</option>`).join('')}</select></label><div class="review-links"><a href="evidence/${baseline}" target="_blank" rel="noopener">Existing baseline</a><a href="archive/rejected-v1/index.html" target="_blank" rel="noopener">Rejected proposal</a><a href="?screen=${encodeURIComponent(state.screen)}" aria-current="page">Revised prototype</a></div></div>`;
  toolbar.querySelector('.review-inner').insertAdjacentHTML('beforeend', `${reviewControls()}${state.reviewMessage ? `<p class="review-feedback" role="status">${escapeHtml(state.reviewMessage)}</p>` : ''}`);
}
function header() {
  const active = state.screen;
  const action = active === 'Give' ? '' : active === 'Account' || active === 'Claim detail' ? btn('Wall of Kindness', 'wall', 'small-btn light') : btn('Drop an item', 'give', 'small-btn');
  return `<header class="site-header"><div class="site-header-inner">${nav(`<img class="logo-badge" src="${BASE}reloved-logo.webp" alt="" /><img class="logo" src="${ASSET}RELOVED_Primary_Wordmark_Black.svg" alt="Reloved" />`, 'Home', 'logo-link')}<nav class="main-nav" aria-label="Main navigation">${nav('Wall of Kindness', 'Wall', ['Wall', 'Item detail'].includes(active) ? 'active' : '')}<button class="nav-other" data-action="unsupported">Impact Map</button><button class="nav-other" data-action="unsupported">Wall of Love</button><button class="nav-other" data-action="unsupported">Our Story</button><button class="nav-other" data-action="unsupported">Track</button></nav><div class="header-action"><button class="account-trigger" data-action="account" aria-label="Your account">${icon('info')}</button>${action}</div><button class="menu-trigger" data-action="menu" aria-label="Open menu" aria-expanded="false">${icon('menu')}</button></div></header>`;
}
function footer() {
  return `<footer class="site-footer"><div class="footer-inner"><div><img src="${BASE}reloved-logo.webp" alt="Reloved" /></div><div class="footer-links">${nav('Wall of Kindness','Wall')}${nav('Drop an Item','Give')}<button data-action="unsupported">Track Your Drop</button><button data-action="unsupported">Community Map</button><button data-action="unsupported">Wall of Love</button><button data-action="unsupported">About Reloved</button></div></div></footer>`;
}
function productCard(p, index) {
  return `<a class="product-card" href="?screen=Item%20detail" data-item="${index}" aria-label="${p.title}, ${p.status}, ${p.size}, ₹0"><div class="product-image"><img src="${p.image}" alt="${p.title}" loading="lazy" />${p.status !== 'Available' ? `<span class="unavailable-stamp">${p.status}</span>` : ''}</div><div class="product-caption"><h3 title="${p.title}">${p.title}</h3><p class="meta">${p.size} · ${p.condition} · ${p.area}</p><div class="product-bottom"><span>${p.status}</span><strong>₹0 FREE</strong></div></div></a>`;
}
function home() {
  const count = state.scenario === 'No items' ? 0 : state.scenario === 'One item' ? 1 : 8;
  const heroItems = count ? `<div class="home-wall-grid ${count === 1 ? 'single' : ''}">${products.slice(0,count).map((p,i)=>productCard(p,i)).join('')}</div>` : `<div class="home-wall-empty"><h2>No items on the wall yet</h2><p>Be the first to pass on an item and feature on the Wall of Kindness!</p></div>`;
  return `<main class="home-world"><section class="home-hero"><div class="home-layout"><img class="home-badge" src="${BASE}reloved-logo.webp" alt="Reloved" /><h1>The Digital Wall of Kindness</h1><p class="home-subtitle">★ Preloved for free ★</p>${heroItems}<div class="home-actions">${btn('Drop an item','give')}${btn('Claim an item','wall','light')}</div></div></section><section class="home-wall-section"><div class="home-wall-inner"><div class="home-wall-heading"><div><p class="eyebrow">LIVE PRELOVED CIRCULATION</p><h2>Wall of Kindness</h2></div>${nav('Explore the full wall','Wall','btn pink')}</div><div class="home-wall-grid ${count === 1 ? 'single' : ''}">${count ? products.slice(0,count).map((p,i)=>productCard(p,i)).join('') : btn('Drop an item','give')}</div></div></section></main>`;
}
function wallItems() {
  if (state.scenario === 'No items') return [];
  const base = state.scenario === 'One item' ? products.slice(0,1) : products;
  const status = { 'Available only': 'Available', 'Being matched only': 'Being matched', 'Claimed only': 'Claimed' }[state.scenario];
  return base.filter(p => (!status || p.status === status) && (state.filter === 'All' || p.category === state.filter) && (state.gender === 'All' || p.gender === state.gender) && (state.size === 'All' || p.size === state.size) && (state.condition === 'All' || p.condition === state.condition) && (!state.nearby || p.nearby) && p.title.toLowerCase().includes(state.query.trim().toLowerCase()));
}
function filterControls() {
  const select = (label, field, values) => `<label class="filter-field"><span>${label}</span><select data-filter-type="${field}" aria-label="${label}">${values.map(value => `<option value="${value}" ${state[field] === value ? 'selected' : ''}>${value}</option>`).join('')}</select></label>`;
  return `<button type="button" class="nearby-control ${state.nearby ? 'active' : ''}" data-action="toggle-nearby" aria-pressed="${state.nearby}">Nearby · 3 km</button>${select('Category','filter',['All','Outerwear','Tops','Bottoms','Kicks','Bags','Accessories'])}${select('For','gender',['All','Women','Men','Girls','Boys','Unisex'])}${select('Size','size',['All','S','M','L','One size','6 years','8 years'])}${select('Condition','condition',['All','Excellent','Good'])}<button type="button" class="filter-clear" data-action="clear-filter">Clear all</button>`;
}
function wall() {
  const items = wallItems();
  const content = state.scenario === 'Loading' ? `<div class="loading-grid" aria-label="Loading items">${[1,2,3,4].map(()=>'<div class="skeleton"></div>').join('')}</div>` : state.scenario === 'Failure' ? `<div class="failure-state"><h2>Couldn’t load items</h2>${btn('Try again','retry')}</div>` : items.length ? `<div class="product-grid">${items.map(p=>productCard(p,products.indexOf(p))).join('')}</div>` : `<div class="empty-state"><h2>${state.scenario === 'No items' ? 'No items on the wall yet' : 'No items match'}</h2><p class="small">${state.scenario === 'No items' ? 'Be the first to pass on an item and feature on the Wall of Kindness!' : 'Clear search/filters or try another size / category.'}</p><button class="btn light" data-action="clear-filter">Clear all</button></div>`;
  return `<main class="page wall-page"><div class="wall-intro"><div><p class="eyebrow">PRELOVED CATALOGUE · ₹0 ALWAYS FREE</p><h1>Wall of Kindness</h1><p class="lead">Preloved pieces, ready for a new home.<br />Always free.</p></div></div><div class="wall-tools"><div class="search-field">${icon('search')}<input id="wall-search" type="search" placeholder="Search bags, tops, brands…" aria-label="Search the Wall" value="${escapeHtml(state.query)}" /></div><button class="btn filter-toggle" data-action="filters">Filter</button><div class="filter-set" role="group" aria-label="Filter items">${filterControls()}</div></div><div class="results-meta"><span>${state.scenario === 'Loading' ? 'Loading items' : state.scenario === 'Failure' ? 'Couldn’t load items' : `${items.length} items`}</span></div>${content}</main>`;
}
function itemDetail() {
  const p = products[state.item] || products[0];
  const status = ['Available', 'Being matched', 'Claimed', 'Unavailable'].includes(state.scenario) ? state.scenario : p.status;
  const unavailable = status !== 'Available';
  const restricted = ['Own listing', 'Weekly limit'].includes(state.scenario);
  const actionLabel = state.scenario === 'Own listing' ? 'This is your listing' : state.scenario === 'Weekly limit' ? 'Weekly claim limit reached' : status === 'Unavailable' ? 'No longer available' : 'Already matched';
  const restrictionCopy = state.scenario === 'Own listing' ? "You gave this item — you can't claim your own listing." : state.scenario === 'Weekly limit' ? 'Claims this week: 2/2 · limit reached' : status === 'Unavailable' ? '' : unavailable ? "This item has already been matched. You can't claim it." : '';
  const title = state.scenario === 'Long title' ? 'Hunter x Hunter Hisoka graphic tee with a detailed front print and an equally expressive back' : p.title;
  const pictures = [p.image, p.back].filter(Boolean);
  const picture = pictures[Math.min(state.gallery,pictures.length-1)];
  return `<main class="page"><div class="crumb"><button data-action="wall">← Explore the Wall</button> &nbsp;/&nbsp; ${p.category}</div><div class="detail-layout"><div class="detail-gallery"><div class="thumbs">${pictures.map((src,i)=>`<button class="thumb ${i===state.gallery?'active':''}" data-gallery="${i}" aria-label="Show ${i===0?'front':'back'} photo" aria-pressed="${i===state.gallery}"><img src="${src}" alt="" /></button>`).join('')}</div><div class="main-photo"><img id="main-photo" src="${picture}" alt="${title}, ${state.gallery===0?'front':'back'} view" /><span class="photo-counter">${state.gallery+1} / ${pictures.length}</span></div></div><div class="detail-info"><p class="eyebrow">Preloved / ${p.category}</p><h1>${title}</h1><p class="small item-id">Item ${p.id}</p><div class="status-line"><span class="pill ${unavailable?'unavailable':''}"><span class="status-dot"></span>${status === 'Unavailable' ? 'Reloved' : status}</span><strong>₹0 free</strong></div><div class="detail-decision"><p>${restrictionCopy}</p>${unavailable || restricted ? `<button class="btn" disabled>${actionLabel}</button>` : btn('Claim this item','claim-demo')}</div><dl class="detail-facts"><div><dt>Condition</dt><dd>${p.condition}</dd></div><div><dt>Size</dt><dd>${p.size}</dd></div><div><dt>Locality</dt><dd>${p.area}</dd></div><div><dt>Item ID</dt><dd>${p.id}</dd></div></dl><div class="detail-note"><strong>How claiming works:</strong><p>Sign in and send a request. the dropper gets a notification and can Accept or Decline. If they Accept, you’re Matched and arrange handover together (collect, they send, or Reloved-booked courier).</p></div></div></div></main>`;
}
function giveSteps() { return state.giveMode === 'Saved profile' ? ['Photo','Details','Review','Post'] : state.giveMode === 'Signed in' ? ['Photo','Details','You','Review','Post'] : ['Photo','Details','Login','Review','Post']; }
function giveProgress() {
  const steps = giveSteps();
  if (state.giveStep >= steps.length) state.giveStep = steps.length-1;
  return `<div class="give-progress" style="--step-count:${steps.length}" aria-label="Step ${state.giveStep+1} of ${steps.length}: ${steps[state.giveStep]}">${steps.map((s,i)=>`<div class="step ${i===state.giveStep?'current':i<state.giveStep?'done':''}"><div class="bar"></div><span>${s}</span></div>`).join('')}</div>`;
}
function photoTile(src, label, index) { return state.photos[index] ? `<div class="selected-photo"><img src="${src}" alt="${label} selected for item ${index===2||state.groupBackWithTwo&&index===1?2:1}" /><span class="photo-label">${label}</span><button data-remove="${index}" aria-label="Remove ${label.toLowerCase()} photo">×</button></div>` : `<button class="add-photos" data-restore="${index}">Add ${label.toLowerCase()} photo</button>`; }
function givePhotoStage() {
  const group1Count = Number(state.photos[0]) + Number(state.photos[1] && !state.groupBackWithTwo) + Number(Boolean(state.extraPhoto) && !state.multiItem);
  const group2Count = Number(state.photos[2]) + Number(state.photos[1] && state.groupBackWithTwo) + Number(Boolean(state.extraPhoto) && state.multiItem);
  const addedPhoto = state.extraPhoto ? `<div class="selected-photo"><img src="${state.extraPhoto}" alt="Local photo preview" /><span class="photo-label">Photo</span><button data-action="remove-extra" aria-label="Remove added photo">×</button></div>` : '';
  return `<div class="give-stage"><h2>Drop something. Pass it on.</h2><p class="intro">Take photos or choose from your gallery. We will ask for the details next.</p><div class="mode-select" role="group" aria-label="Item mode"><button data-action="mode-single" aria-pressed="${!state.multiItem}" class="${!state.multiItem?'active':''}">One Item</button><button data-action="mode-multi" aria-pressed="${state.multiItem}" class="${state.multiItem?'active':''}">Multiple Items</button></div><div class="photo-groups"><div class="photo-group"><div class="group-head"><strong>Item 1 · ${group1Count} ${group1Count===1?'photo':'photos'}</strong>${state.multiItem?'<button data-action="edit-group">Edit group</button>':''}</div><div class="selected-photos">${photoTile(products[0].image,'Front',0)}${state.groupBackWithTwo?'':photoTile(products[0].back,'Back',1)}${!state.multiItem?(addedPhoto || '<button class="add-photos" data-action="add-photo">Upload from gallery</button>'):''}</div></div>${state.multiItem?`<div class="photo-group single"><div class="group-head"><strong>Item 2 · ${group2Count} ${group2Count===1?'photo':'photos'}</strong><button data-action="edit-group">Edit group</button></div><div class="selected-photos">${photoTile(products[1].image,'Front',2)}${state.groupBackWithTwo?photoTile(products[0].back,'Back',1):''}${addedPhoto || '<button class="add-photos" data-action="add-photo">Upload from gallery</button>'}</div></div>`:''}</div><input id="local-photo-picker" type="file" accept="image/*" hidden /><div class="privacy-note">${icon('info')}<div><strong>Photo privacy</strong>Photograph the item only — no faces, ID cards, or readable name / flat plates. You can still continue if a photo is imperfect; retaking is safer for the Wall.</div></div></div>`;
}
function giveDetailsStage() {
  const draft = state.detailGroup === 1 && state.multiItem ? state.secondForm : state.form;
  const field = (label, key, type = 'text') => `<div class="field"><label for="item-${key}">${label}</label><input id="item-${key}" data-form="${key}" type="${type}" ${type === 'number' ? 'min="1" max="99"' : 'maxlength="240"'} value="${escapeHtml(draft[key])}" /></div>`;
  const select = (label, key, options) => {
    if (key === 'category') options = ['Tops','Bags','Kicks'];
    if (key === 'condition') options = ['Excellent','Good','Fair but fully usable'];
    return `<div class="field"><label for="item-${key}">${label}</label><select id="item-${key}" data-form="${key}">${options.map(value => `<option value="${value}" ${draft[key] === value ? 'selected' : ''}>${key === 'category' ? {Tops:'Apparel',Bags:'Bags',Kicks:'Shoes'}[value] : value}</option>`).join('')}</select></div>`;
  };
  return `<div class="give-stage"><h2>Item Details</h2><p class="intro">Tell us about what you are passing on.</p>${state.multiItem ? `<div class="mode-select" role="group" aria-label="Item details">${[0,1].map(i => `<button data-detail-group="${i}" aria-pressed="${state.detailGroup === i}" class="${state.detailGroup === i ? 'active' : ''}">Item ${i+1}</button>`).join('')}</div>` : ''}${field('Item Title *','title')}<div class="form-pair">${select('Category *','category',['Tops','Bottoms','Outerwear','Kicks','Bags','Accessories'])}${select('Condition *','condition',['Good','Excellent'])}${field('Size','size')}${field('Brand','brand')}${field('Quantity *','quantity','number')}</div>${field('Description','description')}${field('Any defects? (Optional)','defect')}</div>`;
}
function giveYouStage() {
  const field = (label, key, type = 'text') => `<div class="field"><label for="donor-${key}">${label}</label><input id="donor-${key}" data-donor="${key}" type="${type}" maxlength="120" autocomplete="off" value="${escapeHtml(state.donor[key])}" /></div>`;
  return `<div class="give-stage"><h2>Donor Details</h2><p class="intro">How we can contact you regarding this drop.</p><div class="form-pair">${field('First Name *','firstName')}${field('Last Name (Optional)','lastName')}${field('Mobile Number *','phone','tel')}${field('Email (Optional)','email','email')}</div><p class="small">10 digits, starting with 6-9.</p><fieldset class="recognition"><legend>Wall of Love Recognition</legend>${[['name','Show my first name'],['anonymous','Keep me anonymous']].map(([value,label]) => `<label class="legal-check"><input type="radio" name="recognition" data-donor="recognition" value="${value}" ${state.donor.recognition === value ? 'checked' : ''} />${label}</label>`).join('')}</fieldset></div>`;
}
function giveLoginStage() { return `<div class="give-stage"><h2>Sign in to post</h2><p class="intro">We save your photos and details on this device, then bring you back here after sign-in to finish.</p><div class="state-notice">After login: if photos look missing, stay on this page — we reconnect them automatically. Do not re-submit until the pink banner says photos are ready.</div><div class="review-piece"><img src="${givePhotos(0)[0] || products[0].image}" alt="Item 1" /><div><p class="eyebrow">Ready to post</p><strong>${escapeHtml(state.form.title)}</strong></div></div><p class="small">New here? After the email code you only add <strong>Name, Username, and Area</strong>.</p></div>`; }
function givePhotos(group) {
  const photos = [];
  if (group === 0 && state.photos[0]) photos.push(products[0].image);
  if (state.photos[1] && (state.multiItem && state.groupBackWithTwo ? group === 1 : group === 0)) photos.push(products[0].back);
  if (group === 1 && state.multiItem && state.photos[2]) photos.push(products[1].image);
  if (state.extraPhoto && (state.multiItem ? group === 1 : group === 0)) photos.push(state.extraPhoto);
  return photos;
}
function validGiveDetails() {
  return (state.multiItem ? [state.form,state.secondForm] : [state.form]).every((draft,i) => draft.title.trim() && Number(draft.quantity) >= 1 && Number.isInteger(Number(draft.quantity)) && givePhotos(i).length);
}
function giveReviewStage() {
  return `<div class="give-stage"><h2>Review your drop</h2><p class="intro">Check photos, item details, and handover — next step is Terms.</p>${(state.multiItem ? [state.form,state.secondForm] : [state.form]).map((draft,i) => `<section class="review-item"><h3>Item ${i+1} details</h3><div class="review-photos">${givePhotos(i).map(src => `<img src="${src}" alt="Item ${i+1}" />`).join('')}</div><div class="review-piece"><div><strong>${escapeHtml(draft.title || `Item ${i+1}`)}</strong><p>${escapeHtml(draft.size)} · ${escapeHtml(draft.condition)} · ${escapeHtml(draft.category)}</p><p>Quantity: ${escapeHtml(draft.quantity)}</p>${draft.description ? `<p>${escapeHtml(draft.description)}</p>` : ''}<div class="inline-actions"><button data-edit-item="${i}">Edit details</button><button data-action="edit-photos">Edit photos</button></div></div></div></section>`).join('')}<div class="state-notice"><h3>Pickup &amp; delivery</h3><p class="eyebrow">How it moves</p><p>After a claim, you and the claimer confirm addresses and pick a delivery time. Reloved books the courier.</p><p class="eyebrow">Your pickup building</p>${state.editingPickup ? `<div class="field"><label for="pickup-building">Building / landmark *</label><input id="pickup-building" data-donor="pickupLocality" maxlength="240" value="${escapeHtml(state.donor.pickupLocality)}" /></div>` : `<p>${escapeHtml(state.donor.pickupLocality)}</p>`}<button class="link" data-action="edit-pickup">${state.editingPickup ? 'Done' : 'Edit address'}</button></div></div>`;
}
function givePostStage() { return `<div class="give-stage"><h2>Terms &amp; submit</h2><p class="intro">Accept Terms, then submit your drop — it goes live on the Wall right away.</p><p class="legal-copy">By clicking “I Accept,” you agree to the RELOVED Terms &amp; Conditions. RELOVED is a platform that facilitates dropping and claiming preloved items and is not the owner, seller, buyer, or guarantor of any item. Items are offered and claimed on an “as is” basis. RELOVED does not inspect, authenticate or guarantee the condition, quality, authenticity, safety or suitability of any item and, to the extent permitted by law, is not responsible for any loss, damage, injury, dispute or claim arising from items or interactions between users.</p><label class="legal-check"><input type="checkbox" data-consent="declaration" ${state.declaration ? 'checked' : ''} /> I confirm the item is clean, safe, fully usable, and not materially torn or stained. I am dropping it freely without receiving payment.</label><label class="legal-check"><input type="checkbox" data-consent="acceptedTerms" ${state.acceptedTerms ? 'checked' : ''} /> I have read and agree to the RELOVED Terms &amp; Conditions and Privacy Policy.</label></div>`; }
function give() {
  if (state.scenario==='Simulated receipt') return `<main class="page"><div class="receipt-layout"><img class="receipt-mark" src="${ASSET}RELOVED_Signature_Badge_Print_Flat_Black.svg" alt="" /><h1>Thank you for your drop.</h1><p class="lead">Your item is live on the Wall of Kindness. Claimers can request it — you Accept or Decline from your profile.</p><div class="receipt-ref"><span class="label">Submission Reference</span><strong>RL-DEMO-RECEIPT</strong></div><div class="home-actions">${btn('View my profile','account')}${btn('Explore the Wall','wall','light')}</div></div></main>`;
  const steps = giveSteps();
  state.giveStep = Math.min(state.giveStep, steps.length-1);
  const current = steps[state.giveStep];
  if (state.scenario === 'Loading') return `<main class="page"><div class="give-top"><h1>Drop an item</h1>${giveProgress()}</div><div class="give-stage" aria-busy="true"><h2>Reconnecting photos…</h2><div class="loading-grid" aria-label="Loading photos"><div class="skeleton"></div><div class="skeleton"></div></div></div></main>`;
  const stage = current==='Photo' ? givePhotoStage() : current==='Details' ? giveDetailsStage() : current==='You' ? giveYouStage() : current==='Login' ? giveLoginStage() : current==='Review' ? giveReviewStage() : givePostStage();
  const next = current==='Login' ? 'Login' : state.giveStep < steps.length-1 ? 'Continue' : 'I Accept - Submit';
  return `<main class="page"><div class="give-top"><h1>Drop an item</h1>${giveProgress()}</div>${state.scenario === 'Draft restored' ? '<p class="state-notice" role="status">Draft restored — continue where you left off.</p>' : ''}${state.scenario === 'Failure' ? `<div class="state-notice error" role="alert"><p>Failed to submit. Please try again.</p>${btn('Try again','give-retry','light')}</div>` : ''}<div class="give-layout">${stage}<div class="give-side"><div class="give-action-card"><button class="btn" data-action="next-step" aria-label="${state.giveStep < steps.length-1 ? `Continue to ${steps[state.giveStep+1].toLowerCase()}` : next}" ${current==='Post'||current==='Login'?'disabled':''}>${next}<span class="arrow" aria-hidden="true">↗</span></button>${state.giveStep>0?'<button class="link" data-action="back-step">Back</button>':''}</div></div></div></main>`;
}
function accountCard(p, type) {
  const completed = state.scenario === 'Completed', action = state.scenario === 'Action required';
  const status = completed ? 'Reloved' : action ? type === 'claim' ? 'Confirm your address' : 'Accept or Decline' : type === 'claim' ? 'Awaiting dropper' : state.givingDecision || 'Available';
  return `<article class="account-card"><img src="${p.image}" alt="${p.title}" /><div><p class="eyebrow">${status}</p><h3>${p.title}</h3><p>${p.size} · ${p.area}</p>${btn(type==='claim'?'Open details →':'View item',type==='claim'?'account-claim':'account-item','small-btn light')}<div class="account-actions">${type === 'claim' && !completed ? '<button data-action="cancel-demo">Cancel claim</button>' : ''}${type === 'give' && action ? '<button data-action="accept-demo">Accept</button><button data-action="decline-demo">Decline</button>' : ''}${type === 'claim' && action ? '<button data-action="chat-demo">Open chat</button>' : ''}</div></div></article>`;
}
function profilePanel() {
  const labels = { name:'Name', username:'Username', address:'Address', pincode:'Pincode' };
  const incomplete = ['Empty','Action required'].includes(state.scenario);
  return `<div class="profile-panel"><div class="section-head"><h3>Your profile</h3><button data-action="edit-profile">${state.profileEditing ? 'Cancel' : 'Edit profile'}</button></div>${incomplete ? '<div class="state-notice"><h3>Update your address</h3><p>Please add your building name, full address, area, and pincode so Reloved can book pickups accurately. Tap Edit profile to complete this before delivery is needed.</p></div>' : ''}${state.profileEditing ? `<form id="preview-profile">${Object.entries(labels).map(([key,label]) => `<div class="field"><label for="profile-${key}">${key === 'name' ? 'Full name *' : key === 'address' ? 'Full address *' : `${label} *`}</label><input id="profile-${key}" name="${key}" required maxlength="${key === 'pincode' ? '6' : '120'}" ${key === 'pincode' ? 'inputmode="numeric" pattern="[0-9]{6}"' : ''} value="${escapeHtml(state.profile[key])}" /></div>`).join('')}<button class="btn" type="submit">Save profile</button></form>` : `<dl class="profile-facts">${Object.entries(labels).map(([key,label]) => `<div><dt>${label}</dt><dd>${escapeHtml(incomplete ? '-' : state.profile[key])}</dd></div>`).join('')}<div><dt>Mobile</dt><dd>-</dd></div><div><dt>Email</dt><dd>-</dd></div></dl>`}</div>`;
}
function account() {
  const tab = state.accountTab;
  const empty = state.scenario === 'Empty', completed = state.scenario === 'Completed';
  const empties = { Claiming: ['No claims yet','Browse the Wall and request an item — status and chat live here.'], Giving: ['Nothing here yet.',"Once you drop an item using this phone/email, it'll show up here."], Notifications: ['No alerts yet','When someone claims your items, or a dropper accepts your request, it shows up here.'] };
  let main;
  if (state.scenario === 'Loading') main = '<div class="skeleton" role="status" aria-label="Loading account" aria-busy="true"></div>';
  else if (state.scenario === 'Failure') main = `<div class="state-notice error">${tab === 'Notifications' ? '<h3>Couldn’t load alerts</h3>' : ''}<p>Check your connection, then try again.</p>${btn('Retry','account-retry','light')}</div>`;
  else if (tab === 'Profile') main = profilePanel();
  else if (empty) main = `<div class="empty-state"><h3>${empties[tab][0]}</h3><p>${empties[tab][1]}</p>${tab === 'Claiming' ? btn('Browse the Wall','wall','light') : tab === 'Giving' ? btn('Drop an item','give','light') : ''}</div>`;
  else if (tab === 'Notifications') main = `<div class="notifications-list">${!state.notesRead ? '<button class="link" data-action="read-notes">Mark all read</button>' : ''}<button class="notification-row ${state.notesRead ? 'read' : ''}" data-action="account-claim"><span class="notification-dot" aria-hidden="true"></span><span><strong>${completed ? 'RELOVED ❤️' : state.scenario === 'Action required' ? 'Your item has been accepted! ❤️' : 'Waiting for the dropper to respond.'}</strong><span>${products[0].title}</span></span><span aria-hidden="true">↗</span></button></div>`;
  else main = accountCard(tab === 'Giving' ? products[1] : products[0],tab === 'Giving' ? 'give' : 'claim');
  return `<main class="page"><div class="account-head"><h1>Your account</h1><p>Profile, drops, claims, and notifications in one place.</p></div><div class="account-overview">${[['Claims this week',empty ? '0/2' : '1/2'],['Submissions',empty ? '0' : '2'],['Reloved',completed ? '1' : '0']].map(([label,value]) => `<div><p class="eyebrow">${label}</p><strong>${state.scenario === 'Loading' ? '–' : value}</strong>${label === 'Reloved' ? '<p class="small">Completed handovers</p>' : ''}</div>`).join('')}</div><nav class="account-tabs" aria-label="Account sections">${[{value:'Claiming',label:'Claims'},{value:'Giving',label:'Drops'},{value:'Notifications',label:'Notifications'},{value:'Profile',label:'Profile'}].map(t=>`<button data-tab="${t.value}" class="${tab===t.value?'active':''}" aria-current="${tab===t.value?'page':'false'}">${t.label}</button>`).join('')}</nav><div class="account-content"><div class="account-main"><h2>${tab==='Claiming'?"Items you've requested":tab==='Giving'?'Your drops':tab}</h2>${main}</div></div></main>`;
}
const claimStates = {
  Pending: { label: 'Awaiting dropper', body: 'Waiting for the dropper to respond. You’ll be notified when they accept or decline.', cancel: true },
  Waiting: { label: 'Waiting for a delivery time', body: 'Waiting for the dropper to share when they’re free.', cancel: true, chat: true },
  'Action required': { label: 'Confirm your address', body: 'Your item has been accepted! ❤️', cancel: true, chat: true },
  'Time proposed': { label: 'Dropper shared a time — confirm', body: 'the dropper is available on the time below. We need you present at your delivery building then.', cancel: true, chat: true },
  'Time agreed': { label: 'Time locked — courier soon', body: 'Reloved will book the courier. You’ll get an update here when it’s booked.', cancel: true, chat: true },
  Handover: { label: 'Delivered — confirm received', body: 'Your item has been accepted! ❤️', chat: true },
  Completed: { label: 'Reloved', body: "Congratulations, you have benefited from someone's goodness. Don't forget to pay it forward.", chat: true },
  Declined: { label: "Couldn't match", body: "We couldn't match you this time — distance or timing may not have worked. The item is back on the Wall if you'd like to browse nearby." },
  Cancelled: { label: 'Cancelled', body: 'The item is available on the Wall again.' },
};
function claimDetail() {
  if (state.scenario === 'Unavailable') return `<main class="page"><div class="empty-state"><h1>This claim wasn't found on your account.</h1><p>If you just dropped an item, open your profile → Drops. Claims are only for items you requested from the Wall.</p><div class="inline-actions">${btn('Back to account','account','light')}${btn('Browse the Wall','wall')}</div></div></main>`;
  const scenario = claimStates[state.scenario] || claimStates.Pending;
  let action = '';
  if (state.scenario === 'Action required') action = `<div class="next-action"><h3>Delivery building / landmark</h3><p>Confirm your delivery building if needed (area only is shared).</p>${btn('Share address','address-demo')}</div>`;
  if (state.scenario === 'Time proposed') action = `<div class="next-action"><p class="eyebrow">Pick the date that works</p><p>1 October 2026, 2:00 pm</p>${btn('I’ll be there','agree-time')}<button class="link" data-action="query-time">Not free / have a query</button></div>`;
  if (state.scenario === 'Time agreed') action = '<div class="next-action"><h3>Agreed time</h3><p>1 October 2026, 2:00 pm</p></div>';
  if (state.scenario === 'Handover') action = `<div class="next-action">${btn('Received','receive-demo')}</div>`;
  if (state.scenario === 'Completed') action = `<div class="next-action"><h3>RELOVED ❤️</h3>${btn('Share a Reloved photo','received-photo','light')}</div>`;
  if (['Declined','Cancelled'].includes(state.scenario)) action = `<div class="next-action">${btn('Browse the Wall','wall','light')}</div>`;
  return `<main class="claim-wrap"><div class="crumb"><button data-action="account">← Back to account</button> &nbsp;/&nbsp; ${products[0].id}</div><div class="claim-layout"><div class="claim-item"><img src="${products[0].image}" alt="${products[0].title}" /></div><div class="claim-content"><p class="eyebrow">${scenario.label}</p><h1>${products[0].title}</h1><p class="item-meta">Size M · Good · Bandra West</p><div class="claim-status"><h2>${scenario.body}</h2></div>${state.deliveryBuilding && scenario.chat ? `<div class="state-notice"><h3>Delivery building</h3><p>${escapeHtml(state.deliveryBuilding)}</p></div>` : ''}${action}<div class="claim-secondary"><button data-action="chat-demo">Chat with Reloved</button>${scenario.chat ? '<button data-action="chat-demo">Chat with dropper</button>' : ''}${scenario.cancel ? '<button data-action="cancel-demo">Cancel claim</button>' : ''}</div><div class="claim-support"><div><strong>Item ID</strong><p>${products[0].id}</p></div></div></div></div></main>`;
}
function overlay() {
  if (!state.overlay) return '';
  if (state.overlay==='menu') return `<div class="sheet-backdrop" data-close="true"><div class="sheet" role="dialog" aria-modal="true" aria-label="Menu"><div class="sheet-head"><h2>Menu</h2><button class="icon-btn" data-action="close" aria-label="Close menu">${icon('close')}</button></div><nav class="sheet-nav" aria-label="Mobile navigation"><button data-action="nav:Home">Home</button><button data-action="nav:Wall">Wall of Kindness</button><button data-action="nav:Give">Drop an item</button><button data-action="nav:Account">Your account</button><button data-action="unsupported">Impact Map</button><button data-action="unsupported">Wall of Love</button><button data-action="unsupported">Our Story</button><button data-action="unsupported">Track</button></nav></div></div>`;
  if (state.overlay==='filters') return `<div class="sheet-backdrop" data-close="true"><div class="sheet" role="dialog" aria-modal="true" aria-label="Narrow results"><div class="sheet-head"><h2>Narrow results</h2><button class="icon-btn" data-action="close" aria-label="Close filters">${icon('close')}</button></div><div class="filter-set" role="group" aria-label="Filter items">${filterControls()}</div></div></div>`;
  if (state.overlay==='address') return `<div class="dialog-backdrop" data-close="true"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h2 id="dialog-title">Delivery building / landmark</h2><div class="field"><label for="building">Building or landmark</label><input id="building" maxlength="240" value="${escapeHtml(state.deliveryBuilding)}" placeholder="Building or landmark only" /></div><div class="field"><label for="delivery-pincode">Pincode *</label><input id="delivery-pincode" inputmode="numeric" maxlength="6" placeholder="e.g. 400053" /></div><div class="inline-actions"><button class="btn" data-action="save-address">Share address</button><button class="btn light" data-action="close">Cancel</button></div></div></div>`;
  if (state.overlay==='query') return `<div class="dialog-backdrop" data-close="true"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h2 id="dialog-title">Tell the dropper</h2><div class="field"><label for="time-query">Tell the dropper</label><input id="time-query" maxlength="240" placeholder="e.g. Out of town that weekend — evenings next week work" /></div><div class="inline-actions"><button class="btn" data-action="save-query">Send to dropper</button><button class="btn light" data-action="close">Cancel</button></div></div></div>`;
  if (state.overlay==='group') return `<div class="dialog-backdrop" data-close="true"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h2 id="dialog-title">Keep photos together</h2><p>Review which item the back photo belongs to. This only changes the local preview.</p><div class="inline-actions"><button class="btn light" data-action="toggle-group">${state.groupBackWithTwo?'Move back photo to item 1':'Move back photo to item 2'}</button><button class="btn light" data-action="close">Close</button></div></div></div>`;
  const cancelCopy = ['Waiting','Action required','Time proposed','Time agreed'].includes(state.scenario) ? 'This will cancel your match. The item goes back on the Wall for someone else.' : 'This will withdraw your request. The item stays on the Wall for others.';
  return `<div class="dialog-backdrop" data-close="true"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h2 id="dialog-title">${state.overlay==='cancel'?'Cancel this claim?':state.overlay==='chat'?'Chat preview':state.overlay==='photo'?'Share a Reloved photo':'Request preview'}</h2><p>${state.overlay==='cancel'?cancelCopy:state.overlay==='chat'?'The live account offers chat for this claim. Messaging is unavailable in this local design review.':state.overlay==='photo'?'Photo sharing is unavailable in this local design review.':'The live application handles requests after login and confirmation. This design review does not submit a claim.'}</p><div class="inline-actions">${state.overlay==='cancel'?'<button class="btn" data-action="confirm-cancel">Cancel claim</button>':''}<button class="btn light" data-action="close">${state.overlay === 'cancel' ? 'Keep claim' : 'Close'}</button></div></div></div>`;
}
function render() {
  renderToolbar();
  const content = state.screen==='Home' ? home() : state.screen==='Wall' ? wall() : state.screen==='Item detail' ? itemDetail() : state.screen==='Give' ? give() : state.screen==='Account' ? account() : claimDetail();
  customer.innerHTML = header()+content+footer()+overlay();
  document.title = `${state.screen} · Reloved revised review`;
  toolbar.inert = Boolean(state.overlay);
  customer.querySelectorAll(':scope > header,:scope > main,:scope > footer').forEach(element => { element.inert = Boolean(state.overlay); });
  if (state.overlay) { document.body.style.overflow='hidden'; requestAnimationFrame(()=>customer.querySelector('.sheet .icon-btn,.dialog input,.dialog .btn')?.focus()); }
  else document.body.style.overflow='';
}
let toastTimer;
function showToast(message) { toast.textContent=message; toast.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>toast.classList.remove('show'),3000); }
function openOverlay(name) { state.previousFocus=document.activeElement?.dataset?.action || null; state.overlay=name; render(); }
function closeOverlay() {
  const sheet=customer.querySelector('.sheet');
  const finish=()=>{state.overlay='';render();if(state.previousFocus)customer.querySelector(`[data-action="${state.previousFocus}"]`)?.focus();};
  if(sheet && !window.matchMedia('(prefers-reduced-motion: reduce)').matches){sheet.classList.add('is-closing');setTimeout(finish,230);}else finish();
}
function changeGallery(index) {
  const p=products[state.item] || products[0], src=index===0?p.image:p.back;
  if (!src || index===state.gallery) return;
  state.gallery=index; render(); customer.querySelector(`[data-gallery="${index}"]`)?.focus({ preventScroll: true });
}
function localFeedback(message) { state.reviewMessage = message; renderToolbar(); showToast(message); }
function selectScenario(scenario) {
  state.scenario = scenario;
  state.overlay = '';
  state.gallery = 0;
  state.reviewMessage = '';
  if (state.screen === 'Give') {
    if (['Guest','Signed in','Saved profile'].includes(scenario)) { state.giveMode=scenario; state.giveStep=0; }
    if (scenario === 'Failure') state.giveStep=giveSteps().length-1;
    if (scenario === 'Draft restored') {
      if (state.draft) restoreDraft();
      else { saveDraft(); state.reviewMessage='Synthetic draft snapshot restored in this tab only.'; }
    }
  }
  if (state.screen === 'Account') { state.profileEditing=false; state.notesRead=false; state.givingDecision=''; if (['Claiming','Giving','Notifications','Profile'].includes(scenario)) state.accountTab=scenario; }
  const url=new URL(location.href); url.searchParams.set('scenario',state.scenario); history.replaceState({},'',url);
  render();
}
function saveDraft() {
  const keys=['giveMode','giveStep','detailGroup','photos','extraPhoto','multiItem','groupBackWithTwo','form','secondForm','donor','declaration','acceptedTerms'];
  state.draft=structuredClone(Object.fromEntries(keys.map(key=>[key,state[key]])));
}
function restoreDraft() { if (state.draft) Object.assign(state,structuredClone(state.draft)); }
function transitionClaim(scenario, message) { setScreen('Claim detail'); selectScenario(scenario); localFeedback(message); }
customer.addEventListener('click', (event)=>{
  const target=event.target.closest('button,a');
  if (!target) { if(event.target.hasAttribute('data-close')) closeOverlay(); return; }
  if (target.dataset.nav) { event.preventDefault(); setScreen(target.dataset.nav); return; }
  if (target.dataset.item!==undefined) { event.preventDefault(); state.item=Number(target.dataset.item);state.gallery=0;setScreen('Item detail');return; }
  if (target.dataset.gallery!==undefined) {changeGallery(Number(target.dataset.gallery));return;}
  if (target.dataset.filter) {state.filter=target.dataset.filter;state.overlay='';render();return;}
  if (target.dataset.tab) {state.accountTab=target.dataset.tab;state.profileEditing=false;render();customer.querySelector(`[data-tab="${state.accountTab}"]`)?.focus();return;}
  if (target.dataset.detailGroup!==undefined || target.dataset.editItem!==undefined) {state.detailGroup=Number(target.dataset.detailGroup ?? target.dataset.editItem);state.giveStep=1;render();return;}
  if (target.dataset.remove!==undefined) {state.photos[Number(target.dataset.remove)]=false;render();showToast('Photo removed from this preview.');return;}
  if (target.dataset.restore!==undefined) {state.photos[Number(target.dataset.restore)]=true;render();showToast('Photo added back to this preview.');return;}
  const action=target.dataset.action;
  if (!action) return;
  if (action.startsWith('nav:')) {setScreen(action.slice(4));return;}
  if (action==='wall'||action==='give'||action==='account'||action==='item'||action==='claim-detail') {setScreen(({wall:'Wall',give:'Give',account:'Account',item:'Item detail','claim-detail':'Claim detail'})[action]);return;}
  if (action==='menu'||action==='filters') {openOverlay(action);return;}
  if (action==='close') {closeOverlay();return;}
  if (action==='mode-single') {state.multiItem=false;state.groupBackWithTwo=false;state.detailGroup=0;render();return;}
  if (action==='mode-multi') {state.multiItem=true;render();return;}
  if (action==='next-step') {
    const current=giveSteps()[state.giveStep];
    if (current==='Photo' && !(state.multiItem ? [0,1] : [0]).every(i=>givePhotos(i).length)) {localFeedback('Preview validation · add a photo for each item before continuing.');return;}
    if (['Details','Review'].includes(current) && !validGiveDetails()) {localFeedback('Preview validation · each item needs a title, a photo, and a whole quantity of at least 1.');return;}
    if (current==='Review' && (!state.donor.pickupLocality.trim() || /\b(flat|wing|apartment|floor)\b/i.test(state.donor.pickupLocality))) {localFeedback('Preview validation · enter a building or landmark without flat or wing details.');return;}
    if (current==='You' && (!state.donor.firstName.trim() || !/^[6-9]\d{9}$/.test(state.donor.phone))) {localFeedback('Preview validation · enter a first name and a 10-digit mobile number starting with 6–9.');return;}
    if(state.giveStep<giveSteps().length-1){state.giveStep++;render();customer.querySelector('.give-stage h2')?.setAttribute('tabindex','-1');customer.querySelector('.give-stage h2')?.focus();}return;
  }
  if (action==='back-step') {state.giveStep=Math.max(0,state.giveStep-1);render();return;}
  if (action==='edit-details') {state.giveStep=1;render();return;}
  if (action==='edit-photos') {state.giveStep=0;render();return;}
  if (action==='edit-group') {openOverlay('group');return;}
  if (action==='edit-pickup') {state.editingPickup=!state.editingPickup;render();return;}
  if (action==='toggle-group') {state.groupBackWithTwo=!state.groupBackWithTwo;closeOverlay();showToast('Photo group changed in this preview.');return;}
  if (action==='add-photo') {document.getElementById('local-photo-picker')?.click();return;}
  if (action==='remove-extra') {if(state.extraPhoto && state.draft?.extraPhoto!==state.extraPhoto)URL.revokeObjectURL(state.extraPhoto);state.extraPhoto=null;render();showToast('Photo removed from this preview.');return;}
  if (action==='claim-demo') {openOverlay('claim');return;}
  if (action==='cancel-demo') {openOverlay('cancel');return;}
  if (action==='chat-demo') {openOverlay('chat');return;}
  if (action==='address-demo') {openOverlay('address');return;}
  if (action==='save-address') {const value=document.getElementById('building')?.value.trim(),pincode=document.getElementById('delivery-pincode')?.value.trim();if(!value){document.getElementById('building')?.focus();return;}if(/\b(flat|wing|apartment|floor)\b/i.test(value)){showToast('Use your building or landmark only.');return;}if(!/^\d{6}$/.test(pincode)){showToast('Enter your 6-digit pincode (e.g. 400053), then update.');document.getElementById('delivery-pincode')?.focus();return;}state.deliveryBuilding=`${value}, ${pincode}`;transitionClaim('Waiting','Simulated address confirmation · nothing sent or saved to an account.');return;}
  if (action==='account-claim') {const scenario=state.scenario==='Completed'?'Completed':state.scenario==='Action required'?'Action required':'Pending';setScreen('Claim detail');selectScenario(scenario);return;}
  if (action==='account-item') {state.item=1;state.gallery=0;setScreen('Item detail');return;}
  if (action==='give-retry') {selectScenario(state.giveMode);state.giveStep=giveSteps().length-1;render();localFeedback('Preview retry · retained draft ready to review. Nothing submitted.');return;}
  if (action==='account-retry') {selectScenario('Current');return;}
  if (action==='read-notes') {state.notesRead=true;render();localFeedback('Notifications marked read in this preview only.');return;}
  if (action==='edit-profile') {state.profileEditing=!state.profileEditing;render();return;}
  if (action==='accept-demo'||action==='decline-demo') {selectScenario('Current');state.givingDecision=action==='accept-demo'?'Matched':'Available';render();localFeedback(`Simulated ${action==='accept-demo'?'acceptance':'decline'} · no request changed.`);return;}
  if (action==='confirm-cancel') {transitionClaim('Cancelled','Simulated cancellation · no real claim changed.');return;}
  if (action==='agree-time') {transitionClaim('Time agreed','Simulated time agreement · no schedule or courier booking created.');return;}
  if (action==='receive-demo') {transitionClaim('Completed','Simulated receipt confirmation · no handover changed.');return;}
  if (action==='query-time') {openOverlay('query');localFeedback('Preview only · this message will not be sent.');return;}
  if (action==='save-query') {if(!document.getElementById('time-query')?.value.trim()){document.getElementById('time-query')?.focus();return;}transitionClaim('Waiting','Simulated availability response · no message sent.');return;}
  if (action==='received-photo') {openOverlay('photo');return;}
  if (action==='clear-filter') {state.filter='All';state.gender='All';state.size='All';state.condition='All';state.nearby=false;state.query='';render();return;}
  if (action==='toggle-nearby') {state.nearby=!state.nearby;render();return;}
  if (action==='retry') {state.scenario='Normal inventory';render();showToast('Synthetic items loaded in this preview.');return;}
  if (action==='unsupported') {showToast('This destination is outside the six-screen design review.');return;}
});
function updateFormField(target) {
  if (target.dataset.form) (state.detailGroup === 1 && state.multiItem ? state.secondForm : state.form)[target.dataset.form]=target.value;
  if (target.dataset.donor) state.donor[target.dataset.donor]=target.value;
}
customer.addEventListener('input',event=>{
  if(event.target.id==='wall-search'){state.query=event.target.value;const caret=event.target.selectionStart;render();const input=document.getElementById('wall-search');input?.focus();input?.setSelectionRange(caret,caret);}
  updateFormField(event.target);
});
customer.addEventListener('change',event=>{
  updateFormField(event.target);
  if (event.target.dataset.consent) {state[event.target.dataset.consent]=event.target.checked;renderToolbar();return;}
  if(event.target.dataset.filterType){state[event.target.dataset.filterType]=event.target.value;state.overlay='';render();customer.querySelector('[data-action="filters"]')?.focus();return;}
  if(event.target.id==='local-photo-picker'){const file=event.target.files?.[0];if(!file)return;if(!file.type.startsWith('image/')||file.size>10_000_000){showToast('Choose an image under 10 MB for this preview.');return;}if(state.extraPhoto && state.draft?.extraPhoto!==state.extraPhoto)URL.revokeObjectURL(state.extraPhoto);state.extraPhoto=URL.createObjectURL(file);render();showToast('Preview only · photo added.');}
});
customer.addEventListener('submit',event=>{
  if(event.target.id!=='preview-profile')return;
  event.preventDefault();
  const data=Object.fromEntries(new FormData(event.target));
  if(/\b(flat|wing|apartment|floor)\b/i.test(data.address)){localFeedback('Preview validation · use your building or landmark only.');return;}
  state.profile=data;state.profileEditing=false;selectScenario('Current');localFeedback('Profile updated in this preview only. No account was changed.');
});
toolbar.addEventListener('change',event=>{
  if(event.target.id==='screen-select')setScreen(event.target.value);
  if(event.target.id==='scenario-select')selectScenario(event.target.value);
  if(event.target.id==='give-step-select'){state.giveStep=Number(event.target.value);if(['Loading','Failure','Simulated receipt'].includes(state.scenario))state.scenario=state.giveMode;render();}
});
toolbar.addEventListener('click',event=>{
  const action=event.target.closest('[data-review]')?.dataset.review;
  if(action==='save-draft'){saveDraft();localFeedback('Preview draft saved in this tab only; it is cleared when the page reloads.');}
  if(action==='restore-draft' && state.draft){restoreDraft();selectScenario('Draft restored');localFeedback('Preview draft restored in this tab only.');}
  if(action==='login'){saveDraft();state.giveMode='Signed in';state.giveStep=3;state.scenario='Draft restored';render();localFeedback('Simulated sign-in · no authentication performed. Draft retained in this tab.');}
  if(action==='submit' && state.declaration && state.acceptedTerms && validGiveDetails()){selectScenario('Simulated receipt');localFeedback('Simulated receipt · no upload or submission took place.');}
});
document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&state.overlay){closeOverlay();return;}
  if(['ArrowLeft','ArrowRight'].includes(event.key) && event.target.closest('.detail-gallery')){event.preventDefault();changeGallery(state.gallery === 0 ? 1 : 0);return;}
  if(event.key==='Tab'&&state.overlay){const focusable=[...customer.querySelectorAll('.sheet button,.sheet select,.sheet input,.dialog button,.dialog input')].filter(el=>!el.disabled);if(!focusable.length)return;const first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
});
let touchStartX=null;
customer.addEventListener('touchstart',event=>{if(event.target.closest('.main-photo'))touchStartX=event.changedTouches[0]?.clientX;},{passive:true});
customer.addEventListener('touchend',event=>{if(touchStartX!==null && event.target.closest('.main-photo') && Math.abs(event.changedTouches[0]?.clientX-touchStartX)>40)changeGallery(state.gallery===0?1:0);touchStartX=null;},{passive:true});
window.addEventListener('popstate',()=>{const params=new URLSearchParams(location.search);state.screen=screens.includes(params.get('screen'))?params.get('screen'):'Home';selectScenario(params.get('scenario')||defaultScenario(state.screen));});
selectScenario(new URLSearchParams(location.search).get('scenario') || defaultScenario(state.screen));
