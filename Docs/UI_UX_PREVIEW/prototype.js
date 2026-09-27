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
  photos: [true, true, true], extraPhoto: null, groupBackWithTwo: false, multiItem: true, accountTab: 'Claiming', overlay: '', previousFocus: null,
  form: { title: 'Hunter x Hunter Hisoka graphic tee', size: 'M', condition: 'Good' },
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
  const url = new URL(location.href);
  url.searchParams.set('screen', screen);
  url.searchParams.delete('scenario');
  history.pushState({ screen }, '', url);
  state.scenario = defaultScenario(screen);
  window.scrollTo({ top: 0, behavior: 'instant' });
  render();
}
function defaultScenario(screen) { return screen === 'Claim detail' ? 'Waiting' : screen === 'Give' ? 'Guest' : 'Normal inventory'; }
function scenarioOptions() {
  if (state.screen === 'Home') return ['Normal inventory', 'One item', 'No items'];
  if (state.screen === 'Wall') return ['Normal inventory', 'One item', 'No items', 'Loading', 'Failure'];
  if (state.screen === 'Item detail') return ['Available', 'Unavailable', 'Long title'];
  if (state.screen === 'Give') return ['Guest', 'Signed in', 'Saved profile', 'Simulated receipt'];
  if (state.screen === 'Claim detail') return ['Waiting', 'Action required'];
  return ['Claiming', 'Giving', 'Notifications', 'Profile'];
}
function renderToolbar() {
  const opts = scenarioOptions();
  if (!opts.includes(state.scenario)) state.scenario = opts[0];
  const baseline = ({ Home: 'home-desktop-viewport.png', Wall: 'wall-desktop-viewport.png', 'Item detail': 'item-desktop-viewport.png', Give: 'give-phone-viewport.png', Account: 'account-claiming-phone-viewport.png', 'Claim detail': 'account-claim-detail-phone-viewport.png' })[state.screen];
  toolbar.innerHTML = `<div class="review-inner"><strong>Reloved design review</strong><span class="review-note">Revised prototype · synthetic data · local interactions only · no login/upload/submission</span>${state.scenario === 'Simulated receipt' ? '<span class="review-warning">Simulated receipt · nothing submitted</span>' : ''}<span class="review-spacer"></span><label>Screen <select id="screen-select" aria-label="Review screen">${screens.map(s => `<option ${s === state.screen ? 'selected' : ''}>${s}</option>`).join('')}</select></label><label>Scenario <select id="scenario-select" aria-label="Synthetic scenario">${opts.map(s => `<option ${s === state.scenario ? 'selected' : ''}>${s}</option>`).join('')}</select></label><div class="review-links"><a href="evidence/${baseline}" target="_blank" rel="noopener">Existing baseline</a><a href="archive/rejected-v1/index.html" target="_blank" rel="noopener">Rejected proposal</a><a href="?screen=${encodeURIComponent(state.screen)}" aria-current="page">Revised prototype</a></div></div>`;
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
  return base.filter(p => (state.filter === 'All' || p.category === state.filter) && (state.gender === 'All' || p.gender === state.gender) && (state.size === 'All' || p.size === state.size) && (state.condition === 'All' || p.condition === state.condition) && (!state.nearby || p.nearby) && p.title.toLowerCase().includes(state.query.toLowerCase()));
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
  const unavailable = state.scenario === 'Unavailable' || p.status !== 'Available';
  const title = state.scenario === 'Long title' ? 'Hunter x Hunter Hisoka graphic tee with a detailed front print and an equally expressive back' : p.title;
  const pictures = [p.image, p.back].filter(Boolean);
  const picture = pictures[Math.min(state.gallery,pictures.length-1)];
  return `<main class="page"><div class="crumb"><button data-action="wall">← Explore the Wall</button> &nbsp;/&nbsp; ${p.category}</div><div class="detail-layout"><div class="detail-gallery"><div class="thumbs">${pictures.map((src,i)=>`<button class="thumb ${i===state.gallery?'active':''}" data-gallery="${i}" aria-label="Show ${i===0?'front':'back'} photo" aria-pressed="${i===state.gallery}"><img src="${src}" alt="" /></button>`).join('')}</div><div class="main-photo"><img id="main-photo" src="${picture}" alt="${title}, ${state.gallery===0?'front':'back'} view" /><span class="photo-counter">${state.gallery+1} / ${pictures.length}</span></div></div><div class="detail-info"><p class="eyebrow">Preloved / ${p.category}</p><h1>${title}</h1><p class="small item-id">Item ${p.id}</p><div class="status-line"><span class="pill ${unavailable?'unavailable':''}"><span class="status-dot"></span>${unavailable ? (p.status==='Available'?'Being matched':p.status) : 'Available'}</span><strong>₹0 free</strong></div><div class="detail-decision"><p>${unavailable ? 'This item has already been matched. You can’t claim it.' : ''}</p>${unavailable ? `<button class="btn" disabled>Already matched</button>` : btn('Claim this item','claim-demo')}</div><dl class="detail-facts"><div><dt>Condition</dt><dd>${p.condition}</dd></div><div><dt>Size</dt><dd>${p.size}</dd></div><div><dt>Area</dt><dd>${p.area}</dd></div><div><dt>Item ID</dt><dd>${p.id}</dd></div></dl><div class="detail-note"><strong>How claiming works:</strong><p>Sign in and send a request. the dropper gets a notification and can Accept or Decline. If they Accept, you’re Matched and arrange handover together (collect, they send, or Reloved-booked courier).</p></div></div></div></main>`;
}
function giveSteps() { return state.scenario === 'Saved profile' ? ['Photo','Details','Review','Post'] : state.scenario === 'Signed in' ? ['Photo','Details','You','Review','Post'] : ['Photo','Details','Login','Review','Post']; }
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
  return `<div class="give-stage"><h2>Item Details</h2><p class="intro">Tell us about what you are passing on.</p><div class="field"><label for="item-title">Item Title *</label><input id="item-title" data-form="title" value="${escapeHtml(state.form.title)}" /></div><div class="form-pair"><div class="field"><label for="item-size">Size</label><input id="item-size" data-form="size" value="${escapeHtml(state.form.size)}" /></div><div class="field"><label for="item-condition">Condition</label><select id="item-condition" data-form="condition"><option ${state.form.condition==='Good'?'selected':''}>Good</option><option ${state.form.condition==='Excellent'?'selected':''}>Excellent</option></select></div></div></div>`;
}
function giveYouStage() { return `<div class="give-stage"><h2>Donor Details</h2><p class="intro">How we can contact you regarding this drop.</p><div class="field"><label for="demo-name">Name</label><input id="demo-name" placeholder="Your name" autocomplete="off" /></div><div class="field"><label for="demo-area">Building or landmark</label><input id="demo-area" placeholder="Building or landmark only" autocomplete="off" /></div><div class="privacy-note">${icon('info')}<div><strong>Important privacy rule</strong>To protect your anonymity, do not enter your flat number or wing. Only select your building name from the map search, and hand the item to your building’s security guard in a bag.</div></div></div>`; }
function giveLoginStage() { return `<div class="give-stage"><h2>Login</h2><div class="review-piece"><img src="${products[0].image}" alt="Item 1" /><div><strong>Item 1</strong></div></div></div>`; }
function giveReviewStage() { return `<div class="give-stage"><h2>Review your drop</h2><p class="intro">Check photos, item details, and handover — next step is Terms.</p><div class="review-piece"><img src="${products[0].image}" alt="Item 1" /><div><strong>${escapeHtml(state.form.title || 'Item 1')}</strong><p>${escapeHtml(state.form.size || 'Size not set')} · ${escapeHtml(state.form.condition)}</p><div class="inline-actions"><button data-action="edit-details">Edit details</button><button data-action="edit-photos">Edit photos</button></div></div></div>${state.multiItem?`<div class="review-piece"><img src="${products[1].image}" alt="Item 2" /><div><strong>White linen embroidered tunic</strong><p>1 selected photo</p><div class="inline-actions"><button data-action="edit-photos">Edit photos</button></div></div></div>`:''}</div>`; }
function givePostStage() { return `<div class="give-stage"><h2>Terms</h2><p class="legal-copy">By clicking “I Accept,” you agree to the RELOVED Terms &amp; Conditions. RELOVED is a platform that facilitates dropping and claiming preloved items and is not the owner, seller, buyer, or guarantor of any item. Items are offered and claimed on an “as is” basis. RELOVED does not inspect, authenticate or guarantee the condition, quality, authenticity, safety or suitability of any item and, to the extent permitted by law, is not responsible for any loss, damage, injury, dispute or claim arising from items or interactions between users.</p><label class="legal-check"><input type="checkbox" /> I confirm the item is clean, safe, fully usable, and not materially torn or stained. I am dropping it freely without receiving payment.</label><label class="legal-check"><input type="checkbox" /> I have read and agree to the RELOVED Terms &amp; Conditions and Privacy Policy.</label></div>`; }
function give() {
  if (state.scenario==='Simulated receipt') return `<main class="page"><div class="receipt-layout"><img class="receipt-mark" src="${ASSET}RELOVED_Signature_Badge_Print_Flat_Black.svg" alt="" /><h1>Thank you for your drop.</h1><p class="lead">Your item is live on the Wall of Kindness. Claimers can request it — you Accept or Decline from your profile.</p><div class="receipt-ref"><span class="label">Submission Reference</span><strong>RL-DEMO-RECEIPT</strong></div><div class="home-actions">${btn('View my profile','account')}${btn('Explore the Wall','wall','light')}</div></div></main>`;
  const steps = giveSteps(), current = steps[state.giveStep];
  const stage = current==='Photo' ? givePhotoStage() : current==='Details' ? giveDetailsStage() : current==='You' ? giveYouStage() : current==='Login' ? giveLoginStage() : current==='Review' ? giveReviewStage() : givePostStage();
  const next = current==='Login' ? 'Login' : state.giveStep < steps.length-1 ? 'Continue' : 'I Accept';
  return `<main class="page"><div class="give-top"><h1>Drop an item</h1>${giveProgress()}</div><div class="give-layout">${stage}<div class="give-side"><div class="give-action-card"><button class="btn" data-action="next-step" aria-label="${state.giveStep < steps.length-1 ? `Continue to ${steps[state.giveStep+1].toLowerCase()}` : next}" ${current==='Post'||current==='Login'?'disabled':''}>${next}<span class="arrow" aria-hidden="true">↗</span></button>${state.giveStep>0?'<button class="link" data-action="back-step">Back</button>':''}</div></div></div></main>`;
}
function accountCard(p, type) { return `<div class="account-card"><img src="${p.image}" alt="${p.title}" /><div><p class="eyebrow">${type==='claim'?'Claims · Pending':'Drops · Available'}</p><h3>${p.title}</h3><p>${p.size} · ${p.area}</p>${btn(type==='claim'?'View claim':'View item',type==='claim'?'claim-detail':'item','small-btn light')}<div class="account-actions"><button data-action="${type==='claim'?'cancel-demo':'unsupported'}">${type==='claim'?'Cancel claim':'Edit listing'}</button><button data-action="${type==='claim'?'chat-demo':'unsupported'}">${type==='claim'?'Open chat':'View requests'}</button></div></div></div>`; }
function account() {
  const tab = state.accountTab;
  const main = tab==='Claiming' ? `${accountCard(products[0],'claim')}` : tab==='Giving' ? `${accountCard(products[1],'give')}` : tab==='Notifications' ? `<div class="activity-row"><span>No alerts yet</span></div>` : `<div class="activity-row"><span>Your profile</span></div>`;
  return `<main class="page"><div class="account-head"><h1>Your account</h1><p>Profile, drops, claims, and notifications in one place.</p></div><nav class="account-tabs" aria-label="Account sections">${[{value:'Claiming',label:'Claims'},{value:'Giving',label:'Drops'},{value:'Notifications',label:'Notifications'},{value:'Profile',label:'Profile'}].map(t=>`<button data-tab="${t.value}" class="${tab===t.value?'active':''}" aria-current="${tab===t.value?'page':'false'}">${t.label}</button>`).join('')}</nav><div class="account-content"><div class="account-main"><h2>${tab==='Claiming'?"Items you've requested":tab==='Giving'?'Your drops':tab}</h2>${main}</div></div></main>`;
}
function claimDetail() {
  const required = state.scenario==='Action required';
  return `<main class="claim-wrap"><div class="crumb"><button data-action="account">← Your account</button> &nbsp;/&nbsp; ${products[0].id}</div><div class="claim-layout"><div class="claim-item"><img src="${products[0].image}" alt="Hunter x Hunter Hisoka graphic tee" /></div><div class="claim-content"><p class="eyebrow">${required?'Matched':'Pending'}</p><h1>${products[0].title}</h1><p class="item-meta">Size M · Good · Bandra West</p><div class="claim-status"><h2>${required?'Your item has been accepted! ❤️':'Waiting for the dropper to respond.'}</h2></div>${required?`<div class="next-action"><h3>Delivery building / landmark</h3><p>Confirm your delivery building if needed (area only is shared).</p>${btn('Share address','address-demo')}</div>`:''}<div class="claim-secondary"><button data-action="chat-demo">Chat with dropper</button><button data-action="cancel-demo">Cancel claim</button></div><div class="claim-support"><div><strong>Item ID</strong><p>${products[0].id}</p></div></div></div></div></main>`;
}
function overlay() {
  if (!state.overlay) return '';
  if (state.overlay==='menu') return `<div class="sheet-backdrop" data-close="true"><div class="sheet" role="dialog" aria-modal="true" aria-label="Menu"><div class="sheet-head"><h2>Menu</h2><button class="icon-btn" data-action="close" aria-label="Close menu">${icon('close')}</button></div><nav class="sheet-nav" aria-label="Mobile navigation"><button data-action="nav:Home">Home</button><button data-action="nav:Wall">Wall of Kindness</button><button data-action="nav:Give">Drop an item</button><button data-action="nav:Account">Your account</button><button data-action="unsupported">Impact Map</button><button data-action="unsupported">Wall of Love</button><button data-action="unsupported">Our Story</button><button data-action="unsupported">Track</button></nav></div></div>`;
  if (state.overlay==='filters') return `<div class="sheet-backdrop" data-close="true"><div class="sheet" role="dialog" aria-modal="true" aria-label="Narrow results"><div class="sheet-head"><h2>Narrow results</h2><button class="icon-btn" data-action="close" aria-label="Close filters">${icon('close')}</button></div><div class="filter-set" role="group" aria-label="Filter items">${filterControls()}</div></div></div>`;
  if (state.overlay==='address') return `<div class="dialog-backdrop" data-close="true"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h2 id="dialog-title">Share a building</h2><p>This is a synthetic, local action. No address is sent or saved to an account.</p><div class="field" style="margin-top:18px"><label for="building">Building or landmark</label><input id="building" placeholder="Building or landmark only" /></div><div class="inline-actions"><button class="btn" data-action="save-address">Save in preview</button><button class="btn light" data-action="close">Cancel</button></div></div></div>`;
  if (state.overlay==='group') return `<div class="dialog-backdrop" data-close="true"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h2 id="dialog-title">Keep photos together</h2><p>Review which item the back photo belongs to. This only changes the local preview.</p><div class="inline-actions"><button class="btn light" data-action="toggle-group">${state.groupBackWithTwo?'Move back photo to item 1':'Move back photo to item 2'}</button><button class="btn light" data-action="close">Close</button></div></div></div>`;
  return `<div class="dialog-backdrop" data-close="true"><div class="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><h2 id="dialog-title">${state.overlay==='cancel'?'Cancel this claim?':state.overlay==='chat'?'Chat preview':'Request preview'}</h2><p>${state.overlay==='cancel'?'Cancellation is supported in this claim state in the live application. The review will not change a real request.':state.overlay==='chat'?'The live account offers chat for this claim. Messaging is unavailable in this local design review.':'The live application handles requests after login and confirmation. This design review does not submit a claim.'}</p><div class="inline-actions"><button class="btn light" data-action="close">Close</button></div></div></div>`;
}
function render() {
  renderToolbar();
  const content = state.screen==='Home' ? home() : state.screen==='Wall' ? wall() : state.screen==='Item detail' ? itemDetail() : state.screen==='Give' ? give() : state.screen==='Account' ? account() : claimDetail();
  customer.innerHTML = header()+content+footer()+overlay();
  document.title = `${state.screen} · Reloved revised review`;
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
  const existing=document.getElementById('main-photo');
  const next=new Image();
  next.onload=()=>{ existing?.classList.add('fading'); setTimeout(()=>{ state.gallery=index; render(); }, window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:105); };
  next.src=src;
}
customer.addEventListener('click', (event)=>{
  const target=event.target.closest('button,a');
  if (!target) { if(event.target.hasAttribute('data-close')) closeOverlay(); return; }
  if (target.dataset.nav) { event.preventDefault(); setScreen(target.dataset.nav); return; }
  if (target.dataset.item!==undefined) { event.preventDefault(); state.item=Number(target.dataset.item);state.gallery=0;setScreen('Item detail');state.scenario='Available';render();return; }
  if (target.dataset.gallery!==undefined) {changeGallery(Number(target.dataset.gallery));return;}
  if (target.dataset.filter) {state.filter=target.dataset.filter;state.overlay='';render();return;}
  if (target.dataset.tab) {state.accountTab=target.dataset.tab;render();return;}
  if (target.dataset.remove!==undefined) {state.photos[Number(target.dataset.remove)]=false;render();showToast('Photo removed from this preview.');return;}
  if (target.dataset.restore!==undefined) {state.photos[Number(target.dataset.restore)]=true;render();showToast('Photo added back to this preview.');return;}
  const action=target.dataset.action;
  if (!action) return;
  if (action.startsWith('nav:')) {setScreen(action.slice(4));return;}
  if (action==='wall'||action==='give'||action==='account'||action==='item'||action==='claim-detail') {setScreen(({wall:'Wall',give:'Give',account:'Account',item:'Item detail','claim-detail':'Claim detail'})[action]);return;}
  if (action==='menu'||action==='filters') {openOverlay(action);return;}
  if (action==='close') {closeOverlay();return;}
  if (action==='mode-single') {state.multiItem=false;state.groupBackWithTwo=false;render();return;}
  if (action==='mode-multi') {state.multiItem=true;render();return;}
  if (action==='next-step') {if(state.giveStep<giveSteps().length-1){state.giveStep++;render();customer.querySelector('.give-stage h2')?.setAttribute('tabindex','-1');customer.querySelector('.give-stage h2')?.focus();showToast('Preview only · step changed.');}return;}
  if (action==='back-step') {state.giveStep=Math.max(0,state.giveStep-1);render();return;}
  if (action==='edit-details') {state.giveStep=1;render();return;}
  if (action==='edit-photos') {state.giveStep=0;render();return;}
  if (action==='edit-group') {openOverlay('group');return;}
  if (action==='toggle-group') {state.groupBackWithTwo=!state.groupBackWithTwo;closeOverlay();showToast('Photo group changed in this preview.');return;}
  if (action==='add-photo') {document.getElementById('local-photo-picker')?.click();return;}
  if (action==='remove-extra') {if(state.extraPhoto)URL.revokeObjectURL(state.extraPhoto);state.extraPhoto=null;render();showToast('Photo removed from this preview.');return;}
  if (action==='claim-demo') {openOverlay('claim');return;}
  if (action==='cancel-demo') {openOverlay('cancel');return;}
  if (action==='chat-demo') {openOverlay('chat');return;}
  if (action==='address-demo') {openOverlay('address');return;}
  if (action==='save-address') {const value=document.getElementById('building')?.value.trim();if(!value){document.getElementById('building')?.focus();return;}if(/\b(flat|wing|apartment|floor)\b/i.test(value)){showToast('Use your building or landmark only.');return;}closeOverlay();showToast('Building saved in this preview only.');return;}
  if (action==='clear-filter') {state.filter='All';state.gender='All';state.size='All';state.condition='All';state.nearby=false;state.query='';render();return;}
  if (action==='toggle-nearby') {state.nearby=!state.nearby;render();return;}
  if (action==='retry') {state.scenario='Normal inventory';render();showToast('Synthetic items loaded in this preview.');return;}
  if (action==='unsupported') {showToast('This destination is outside the six-screen design review.');return;}
});
customer.addEventListener('input',event=>{if(event.target.id==='wall-search'){state.query=event.target.value;const caret=event.target.selectionStart;render();const input=document.getElementById('wall-search');input?.focus();input?.setSelectionRange(caret,caret);}if(event.target.dataset.form)state.form[event.target.dataset.form]=event.target.value;});
customer.addEventListener('change',event=>{if(event.target.dataset.filterType){state[event.target.dataset.filterType]=event.target.value;state.overlay='';render();return;}if(event.target.id==='local-photo-picker'){const file=event.target.files?.[0];if(!file)return;if(!file.type.startsWith('image/')||file.size>10_000_000){showToast('Choose an image under 10 MB for this preview.');return;}if(state.extraPhoto)URL.revokeObjectURL(state.extraPhoto);state.extraPhoto=URL.createObjectURL(file);render();showToast('Preview only · photo added.');}});
toolbar.addEventListener('change',event=>{if(event.target.id==='screen-select'){setScreen(event.target.value);}if(event.target.id==='scenario-select'){state.scenario=event.target.value;state.giveStep=0;state.gallery=0;state.accountTab=['Claiming','Giving','Notifications','Profile'].includes(state.scenario)?state.scenario:state.accountTab;const url=new URL(location.href);url.searchParams.set('scenario',state.scenario);history.replaceState({},'',url);render();}});
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&state.overlay){closeOverlay();return;}if(event.key==='Tab'&&state.overlay){const focusable=[...customer.querySelectorAll('.sheet button,.dialog button,.dialog input')].filter(el=>!el.disabled);if(!focusable.length)return;const first=focusable[0],last=focusable[focusable.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}});
window.addEventListener('popstate',()=>{const params=new URLSearchParams(location.search);state.screen=params.get('screen')||'Home';state.scenario=params.get('scenario')||defaultScenario(state.screen);render();});
render();
