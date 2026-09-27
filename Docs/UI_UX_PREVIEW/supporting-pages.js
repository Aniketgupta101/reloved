/* Supporting public views for the isolated review. No requests, auth, or submissions. */
function supportIntro(title, body = '', eyebrow = '') {
  return `<div class="support-intro">${eyebrow ? `<p class="eyebrow">${eyebrow}</p>` : ''}<h1>${title}</h1>${body ? `<p class="lead">${body}</p>` : ''}</div>`;
}
function previewNotice(text) { return `<p class="preview-notice">Preview only · ${text}</p>`; }
function helpLinks() { return `<aside class="support-help"><div><h2>Still stuck?</h2><p>Our community team replies within 24-48 hours.</p></div>${nav('Contact Us','Contact','btn light')}${nav('FAQs','FAQ','link')}</aside>`; }
function supportRetry() { return '<button class="btn light" data-support-retry="true">Try again</button>'; }
function supportField(label, name, placeholder = '', type = 'text', required = false) {
  const value = state.supportForms[state.screen]?.[name] || '';
  return `<div class="field"><label for="support-${name}">${label}</label><input id="support-${name}" name="${name}" type="${type}" placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(value)}" ${required ? 'required' : ''} ${type === 'tel' ? 'inputmode="numeric" pattern="[0-9]{10}" maxlength="10"' : 'maxlength="160"'} /></div>`;
}
function supportSelect(label, name, options) {
  const current = state.supportForms[state.screen]?.[name];
  return `<div class="field"><label for="support-${name}">${label}</label><select id="support-${name}" name="${name}">${options.map(option=>`<option ${current===option?'selected':''}>${option}</option>`).join('')}</select></div>`;
}
function supportTextarea(label, name, placeholder, required = false) {
  return `<div class="field"><label for="support-${name}">${label}</label><textarea id="support-${name}" name="${name}" placeholder="${escapeHtml(placeholder)}" rows="5" maxlength="3000" ${required?'required':''}>${escapeHtml(state.supportForms[state.screen]?.[name] || '')}</textarea></div>`;
}
function trackingPage() {
  const intro = supportIntro('Track Submission','Enter your submission reference to check its current status.');
  const form = `<form data-support-form="Track" class="support-card"><div class="field"><label for="track-reference">Reference Number</label><input id="track-reference" name="reference" placeholder="e.g. A1B2C3D4" required maxlength="80" value="${escapeHtml(state.trackReference)}" aria-describedby="track-preview" /></div><p id="track-preview" class="preview-notice">Preview only · use RL-DEMO-DROP or RL-DEMO-CLAIM to view synthetic records. Other references show not found. No lookup is sent.</p><button class="btn" type="submit">Track <span aria-hidden="true">↗</span></button></form>`;
  let result = '';
  if (state.scenario === 'Loading') result = '<section class="support-card" aria-busy="true" role="status" aria-label="Loading submission"><div class="skeleton"></div><p class="preview-notice">Preview only · loading scenario</p></section>';
  if (['Not found','Error'].includes(state.scenario)) result = `<section class="support-card" role="status"><h2>Reference not found</h2><p>Please check your reference number and try again.</p>${state.scenario==='Error'?previewNotice('lookup failure scenario. No network request was made.'):''}${supportRetry()}</section>`;
  if (state.scenario === 'Drop status') result = `<section class="support-card track-result" aria-labelledby="track-result-title"><h2 id="track-result-title">Submission Status</h2>${previewNotice('synthetic drop record. Nothing was submitted.')}<p>Reference: <strong>${escapeHtml(state.trackReference || 'RL-DEMO-DROP')}</strong></p><dl class="track-facts"><div><dt>Current Status</dt><dd>Submitted</dd></div><div><dt>Submitted</dt><dd>28/09/2026</dd></div></dl><h3>Items (1)</h3><div class="track-item"><img src="${products[0].image}" alt="${products[0].title}" /><div><strong>${products[0].title}</strong><p>Tops</p><span class="status-pill">Available</span></div></div><button class="btn light" data-action="track-drops">Your drops <span aria-hidden="true">↗</span></button></section>`;
  if (state.scenario === 'Claim status') result = `<section class="support-card track-result" aria-labelledby="track-result-title"><h2 id="track-result-title">Awaiting dropper</h2>${previewNotice('synthetic claim record. No claim was submitted.')}<p>Reference: <strong>${escapeHtml(state.trackReference || 'RL-DEMO-CLAIM')}</strong></p><div class="track-item"><img src="${products[0].image}" alt="${products[0].title}" /><strong>${products[0].title}</strong></div><p>Waiting for the dropper to respond. You’ll be notified when they accept or decline.</p>${nav('View claim','Claim detail','btn light')}</section>`;
  return `<main class="page support-page narrow">${intro}${form}${result}${helpLinks()}</main>`;
}
function faqPage() {
  return `<main class="page support-page narrow">${supportIntro('Frequently asked questions','Everything about dropping, claiming, and your account, straight from how reloved actually works.','GOT QUESTIONS?')}<div class="faq-groups">${previewFaqGroups.map((group,groupIndex)=>`<section class="faq-group" aria-labelledby="faq-group-${groupIndex}"><h2 id="faq-group-${groupIndex}">${group.title}</h2>${group.items.map((item,itemIndex)=>{ const key=`${groupIndex}-${itemIndex}`, open=state.faqOpen===key; return `<div class="faq-item"><h3><button id="faq-button-${key}" data-faq="${key}" aria-expanded="${open}" aria-controls="faq-answer-${key}"><span>${escapeHtml(item.q)}</span><span class="faq-plus" aria-hidden="true">${open?'−':'+'}</span></button></h3><div id="faq-answer-${key}" class="faq-answer" role="region" aria-labelledby="faq-button-${key}" ${open?'':'hidden'}>${item.a}</div></div>`;}).join('')}</section>`).join('')}</div>${helpLinks()}</main>`;
}
function toggleFaq(button) {
  const key=button.dataset.faq;
  state.faqOpen=state.faqOpen===key?'':key;
  customer.querySelectorAll('[data-faq]').forEach(control=>{
    const open=control.dataset.faq===state.faqOpen;
    control.setAttribute('aria-expanded',String(open));
    control.querySelector('.faq-plus').textContent=open?'−':'+';
    document.getElementById(control.getAttribute('aria-controls')).hidden=!open;
  });
}
function storyPage() {
  return `<main class="page support-page narrow">${supportIntro('Our Story.','','THE SOUL OF RE-LOVED')}<article class="story-copy"><p>RE-LOVED was born from the beautiful spirit of the Wall of Kindness or <em>Neki Ki Deewar</em> which originated on the streets of Iran. A movement born out of pure empathy, with a simple, quiet promise:</p><blockquote><p>Leave what you no longer need.</p><p>Take what you do.</p></blockquote><p>We wanted to bring that exact heartbeat into the digital age.</p><p>Think about the pieces sitting quietly in the back of your wardrobe right now that once made you feel special, but now just collect dust. Those items still carry stories, memories, and so much life. They don’t deserve to sit forgotten, and they certainly don’t deserve to become waste.</p><p>Somewhere out there, someone is looking for exactly what you no longer wear.</p><p>So we built RE-LOVED. A premium digital space with zero cash, zero judgment, and absolute dignity. Just a direct circle of people gently passing things from one wardrobe to another.</p><p>When we choose to pass a piece on instead of buying something new, we breathe fresh life into it, protect the earth we walk on, and keep the circle moving.</p><p class="story-statement">Skip the transaction. Love the planet.</p><p class="eyebrow">★ Preloved for free ★</p></article><section class="story-closing"><h2>“Skip the transaction. Love the planet.”</h2><p>Welcome to Re-Loved</p><p>★ Preloved for free ★</p></section><div class="inline-actions">${nav('Drop an item','Give','btn')}${nav('Claim an item','Wall','btn light')}</div></main>`;
}
function contactPage() {
  return `<main class="page support-page narrow">${supportIntro('Contact us','Have a question or feedback regarding the reloved digital Wall of Kindness initiative? Reach out to our community team.')}<p>Common question? Check the ${nav('FAQs','FAQ','link')} first, you might get your answer faster.</p><a class="contact-phone" href="tel:+919429397422"><span class="eyebrow">Customer care</span><strong>+91 94293 97422</strong><span>Reloved public line — your personal number stays private</span></a><form data-support-form="Contact" class="support-card">${previewNotice('this form does not send a message. Use sample details to review validation.')}<div class="support-form-feedback" role="status">${state.scenario==='Validation'?'Please fill in your name, email, and message.':state.scenario==='Error'?'Unable to send message. Please try again.':''}</div><div class="support-form-grid">${supportField('Your Name *','name','Full Name','text',true)}${supportField('Email Address *','email','name@domain.com','email',true)}${supportField('Mobile Phone (Optional)','phone','98765 43210','tel')}${supportField('Subject','subject','General Question / Feedback / Campaign')}</div>${supportTextarea('Message *','message','How can we help you?',true)}<button class="btn" type="submit">Send Message <span aria-hidden="true">↗</span></button></form></main>`;
}
function standardsPage() {
  const prohibited=['Materially torn or stained clothing','Damaged or unsafe electronics','Expired medicines or consumables','Broken toys or missing essential parts','Hazardous or illegal materials','Unsanitized footwear or bedding'];
  return `<main class="page support-page narrow">${supportIntro('Quality &amp; Safety Standards','Every item given through reloved must be clean, safe, fully functional, and honestly represented.')}<section class="support-card"><h2>Strictly Prohibited Items:</h2><ul class="standards-list">${prohibited.map(text=>`<li><span aria-hidden="true">×</span>${text}</li>`).join('')}</ul></section><div class="inline-actions">${nav('Drop an item','Give','btn')}${nav('FAQs','FAQ','btn light')}</div>${helpLinks()}</main>`;
}
function partnerPage() {
  const form=state.supportForms.Partner;
  return `<main class="page support-page">${supportIntro('Partner with reloved.','We work with verified NGOs, schools, shelters, ashrams, and community initiatives to allocate free preloved goods to genuine beneficiaries with full dignity and zero cost.','VERIFIED DISTRIBUTION NETWORK')}<form data-support-form="Partner" class="support-card"><h2>Partner Application Form</h2>${previewNotice('this form does not submit an application. Use sample details to review validation.')}<div class="support-form-feedback" role="status">${state.scenario==='Validation'?'Please fill in all required fields and accept the partner pledge.':state.scenario==='Error'?'Failed to submit application. Please check your network and try again.':''}</div><div class="support-form-grid">${supportField('Organisation Name *','orgName','e.g. Hope Foundation Mumbai','text',true)}${supportSelect('Organisation Type *','orgType',['Registered NGO / Trust','School / Educational Trust','Shelter / Care Home','Community Initiative','Ashram / Welfare Center','Other Community Org'])}${supportSelect('Registration Status *','registrationStatus',['Registered 80G / 12A / Society','Registered Trust','Informal Community Group','Other'])}${supportField('Broad Locality / Area *','locality','e.g. Dharavi, Kurla, Malad West','text',true)}${supportField('Contact Person *','contactPerson','Full Name','text',true)}${supportField('Role / Designation','role','e.g. Program Manager, Director')}${supportField('Mobile Phone Number *','phone','98765 43210','tel',true)}${supportField('Email Address *','email','partner@org.in','email',true)}${supportField('Beneficiary Group Served','beneficiaryGroup','e.g. Primary school children, elderly, families')}${supportField('Approx. Monthly Item Need','approxQuantity','e.g. 50-100 clothing items, 20 book sets')}</div><fieldset class="support-categories"><legend>Most Needed Categories</legend>${['Outerwear','Tops','Bottoms','Kicks','Bags','Accessories'].map(category=>`<label><input type="checkbox" name="categories" value="${category}" ${(form.categories || ['Tops']).includes(category)?'checked':''} /><span>${category}</span></label>`).join('')}</fieldset>${supportTextarea('Additional Notes / Overview','message',"Tell us briefly about your organization's work and distribution process.")}<label class="legal-check"><input name="consent" type="checkbox" required ${form.consent?'checked':''} /><span>I certify that our organization will distribute all allocated items 100% free of charge to genuine beneficiaries, with full respect for dignity and zero commercial resale.</span></label><button class="btn" type="submit">Submit Partner Application <span aria-hidden="true">↗</span></button></form>${helpLinks()}</main>`;
}
function impactMapPage() {
  const areas=[...new Set(products.map(p=>p.area))];
  const matches=products.filter(p=>state.mapFilter==='All'||(state.mapFilter==='Available'?p.status==='Available':p.status==='Being matched'));
  let content;
  if(state.scenario==='Loading') content='<div class="support-card" role="status" aria-busy="true"><div class="skeleton"></div><p class="preview-notice">Preview only · loading localities</p></div>';
  else if(state.scenario==='Error') content=`<div class="support-card">${previewNotice('map unavailable scenario. No map service is connected.')}<p>Check your connection, then try again.</p>${supportRetry()}</div>`;
  else if(state.scenario==='Empty') content='<div class="support-card empty-state"><h2>No live inventory pins yet</h2></div>';
  else content=`<div class="locality-map" aria-label="Illustrative Mumbai locality map"><div class="map-water" aria-hidden="true"></div><div class="map-localities">${areas.map((area,index)=>{ const count=matches.filter(p=>p.area===area).length;return count?`<button class="locality-pin pin-${index}" data-map-area="${area}" aria-pressed="${state.mapArea===area}">${icon('info')}<span>${area} · ${count}</span></button>`:'';}).join('')}</div></div>${state.mapArea?`<section id="map-selection" tabindex="-1" class="support-card"><h2>${state.mapArea}</h2>${previewNotice('existing synthetic inventory for this broad locality.')}<ul class="map-items">${matches.filter(p=>p.area===state.mapArea).map(p=>`<li><a href="?screen=Item%20detail" data-item="${products.indexOf(p)}"><span>${p.title}</span><span>${p.status} ↗</span></a></li>`).join('')}</ul></section>`:''}`;
  return `<main class="page support-page">${supportIntro('Community Impact Map','Explore broad localities, active partner hubs, and verified drop points across Mumbai where preloved items are in active circulation.','MUMBAI COMMUNITY GEOGRAPHY')}<section class="map-panel"><div class="map-heading"><div><p class="eyebrow">Interactive localities</p><h2>Live Wall map</h2><p>Pins use broad areas only — never exact addresses.</p></div><div class="map-filters" role="group" aria-label="Map inventory filters">${['All','Available','Being Matched'].map(filter=>`<button data-map-filter="${filter}" aria-pressed="${state.mapFilter===filter}">${filter}</button>`).join('')}</div></div>${previewNotice('illustrative locality layout using existing synthetic items. Not geographically accurate. No live map, partner hubs, or verified drop points are connected.')}${content}</section>${nav('Wall of Kindness','Wall','btn light')}</main>`;
}
function lovePage() {
  return `<main class="page support-page">${supportIntro('Wall of Love','Honoring the individuals who keep preloved items in active community circulation.','COMMUNITY DONOR RECOGNITION')}<section class="support-card"><h2>Donor Recognition Preferences</h2><ul class="recognition-options"><li>Show my first name</li><li>Recognise me anonymously</li><li>Do not show me publicly</li></ul></section>${state.scenario==='Loading'?'<section class="support-card" role="status" aria-busy="true"><p>Loading Wall of Love...</p></section>':`<section class="support-card empty-state"><h2>Nothing here yet.</h2><p>Once items are reloved into new homes, they'll show up here.</p></section>`}${nav('Drop an item','Give','btn')}</main>`;
}
function systemStatesPage() {
  const scenarios={
    'Signed out': ['Sign in to post','Sign in to finish dropping your item. New here? We’ll set up your profile next.'],
    'Restricted': ['Restricted','Preview only · restricted access scenario. Customer copy for this state is not defined in the source pages.'],
    'Missing URL / not found': ['404','The page you requested was not found on the Wall of Kindness.'],
    'Generic failure': ['Check your connection, then try again.','Preview only · generic failure scenario. No network request was made.'],
  };
  const [title,body]=scenarios[state.scenario];
  return `<main class="page support-page narrow"><div class="system-panel">${previewNotice(`${state.scenario.toLowerCase()} system state. No authentication or permission check is performed.`)}${supportIntro(title,body)}<div class="inline-actions">${state.scenario==='Signed out'?'<button class="btn" data-action="preview-signin">Sign in</button>':state.scenario==='Generic failure'?'<button class="btn" data-action="preview-retry">Try again</button>':''}${nav('Return Home','Home','btn light')}${nav('Contact Us','Contact','btn light')}</div></div></main>`;
}
function supportingPage() {
  return ({ Track: trackingPage, FAQ: faqPage, 'Our Story': storyPage, Contact: contactPage, Standards: standardsPage, Partner: partnerPage, 'Impact Map': impactMapPage, 'Wall of Love': lovePage, 'System States': systemStatesPage })[state.screen]();
}
function rememberSupportingForm(form) {
  if(form.dataset.supportForm==='Track') {state.trackReference=form.elements.reference.value;return;}
  const data=Object.fromEntries(new FormData(form));
  if(form.dataset.supportForm==='Partner') {data.categories=new FormData(form).getAll('categories');data.consent=form.elements.consent.checked;}
  state.supportForms[form.dataset.supportForm]=data;
}
function submitSupportingForm(form) {
  rememberSupportingForm(form);
  if(form.dataset.supportForm==='Track') {
    state.trackReference=state.trackReference.trim().toUpperCase();
    if(!state.trackReference){form.elements.reference.setCustomValidity('Please check your reference number and try again.');form.elements.reference.reportValidity();return;}
    selectScenario(['RL-DEMO-DROP','RL-DEMO-RECEIPT'].includes(state.trackReference)?'Drop status':state.trackReference==='RL-DEMO-CLAIM'?'Claim status':'Not found');
    customer.querySelector('.track-result h2,.support-card[role="status"] h2')?.setAttribute('tabindex','-1');
    customer.querySelector('.track-result h2,.support-card[role="status"] h2')?.focus();
    localFeedback('Preview only · synthetic tracking state. No lookup was sent.');
    return;
  }
  const feedback=form.querySelector('.support-form-feedback');
  feedback.textContent=form.dataset.supportForm==='Contact'?'Preview only · form validated. No message was sent.':'Preview only · form validated. No application was submitted.';
  feedback.setAttribute('tabindex','-1');feedback.focus();
  localFeedback(feedback.textContent);
}
