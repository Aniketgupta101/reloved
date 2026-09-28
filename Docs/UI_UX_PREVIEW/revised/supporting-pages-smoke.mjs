import { chromium } from '../../../frontend/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { blockUnsafeRequests, requireLoopbackBase } from './preview-safety.mjs';
const baseURL=requireLoopbackBase(process.env.PREVIEW_URL || 'http://127.0.0.1:3191/Docs/UI_UX_PREVIEW/');
const base=baseURL.href;
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage({viewport:{width:320,height:844},reducedMotion:'reduce'});
const errors=[],external=[],writes=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await blockUnsafeRequests(page,baseURL,{external,writes});
const screens=['Track','FAQ','Our Story','Contact','Impact Map','Wall of Love','Standards','Partner','System States'];
const screen=name=>page.selectOption('#screen-select',name);
const scenario=name=>page.selectOption('#scenario-select',name);
const overflow=async label=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${label} overflow`);
let stateChecks=0;
try {
 await page.goto(base,{waitUntil:'networkidle'});
 for(const width of [320,390,768,1440]) {
  await page.setViewportSize({width,height:900});
  for(const name of screens) {
   await screen(name);
   for(const value of await page.locator('#scenario-select option').allTextContents()) {
    await scenario(value);assert.equal(await page.locator('main').count(),1);assert.equal(await page.locator('#customer .preview-notice').count(),0);assert.doesNotMatch(await page.locator('#customer').textContent(),/Preview only|synthetic|No authentication|Customer copy for this state/i);await overflow(`${width}/${name}/${value}`);stateChecks++;
   }
  }
 }
 // Every footer destination is an actual local page.
 for(const name of screens.filter(n=>n!=='System States')) {
  await page.locator(`footer [data-nav="${name}"]`).click();assert.equal(await page.locator('#screen-select').inputValue(),name);
 }
 // Desktop nav, mobile menu, focus trap/close, and browser history.
 for(const name of ['Impact Map','Wall of Love','Our Story','Track']) {
  await page.locator(`.main-nav [data-nav="${name}"]`).click();assert.equal(await page.locator('#screen-select').inputValue(),name);
 }
 await page.setViewportSize({width:320,height:844});
 for(const name of screens.filter(n=>n!=='System States')) {
  await page.getByRole('button',{name:'Open menu',exact:true}).click();
  await page.locator(`.sheet [data-action="nav:${name}"]`).click();assert.equal(await page.locator('#screen-select').inputValue(),name);
  assert.equal(await page.getByRole('dialog').count(),0);await overflow(`menu ${name}`);
 }
 await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.keyboard.press('Escape');
 assert.equal(await page.getByRole('button',{name:'Open menu',exact:true}).evaluate(el=>el===document.activeElement),true);
 await screen('FAQ');
 const faq=page.locator('[data-faq="0-0"]');await faq.focus();await page.keyboard.press('Enter');
 assert.equal(await faq.getAttribute('aria-expanded'),'true');assert.equal(await page.locator('#faq-answer-0-0').isVisible(),true);
 assert.match(await page.locator('#faq-answer-0-0').textContent(),/^Go to Drop an Item, upload photos/);
 await page.locator('[data-faq="0-2"]').click();assert.equal(await faq.getAttribute('aria-expanded'),'false');
 await page.locator('#faq-answer-0-2 [data-nav="Standards"]').click();assert.equal(await page.locator('#screen-select').inputValue(),'Standards');
 await page.goBack();assert.equal(await page.locator('#screen-select').inputValue(),'FAQ');
 // A Notifications FAQ link overrides every previously selected account tab.
 for(const tab of ['Claiming','Giving','Notifications','Profile']) {
  await screen('Account');await page.locator(`[data-tab="${tab}"]`).click();await screen('FAQ');
  const notificationsQuestion=page.locator('[data-faq="3-1"]');
  if(await notificationsQuestion.getAttribute('aria-expanded')==='false')await notificationsQuestion.click();
  await page.locator('#faq-answer-3-1').getByRole('link',{name:'Notifications',exact:true}).click();
  assert.equal(await page.locator('#screen-select').inputValue(),'Account');
  assert.equal(await page.locator('[data-tab="Notifications"]').getAttribute('aria-current'),'page',`Notifications from ${tab}`);
  assert.equal(await page.locator('main').evaluate(el=>el===document.activeElement),true,'Notifications destination receives focus');
 }
 await page.reload();assert.equal(await page.locator('[data-tab="Notifications"]').getAttribute('aria-current'),'page','Notifications destination survives reload');
 // Tracking never sends user input to a service or stores it in the URL.
 await screen('Track');await page.getByLabel('Reference Number').fill('rl-demo-drop');await page.locator('main button[type="submit"]').click();
 assert.equal(await page.locator('#scenario-select').inputValue(),'Drop status');assert.match(await page.locator('main').textContent(),/Submission Status/);
 await page.getByLabel('Reference Number').fill('RL-DEMO-CLAIM');await page.locator('main button[type="submit"]').click();
 assert.equal(await page.locator('#scenario-select').inputValue(),'Claim status');await page.locator('main [data-nav="Claim detail"]').click();
 assert.equal(await page.locator('#screen-select').inputValue(),'Claim detail');
 await screen('Track');await page.getByLabel('Reference Number').fill('unknown-reference');await page.locator('main button[type="submit"]').click();
 assert.equal(await page.locator('#scenario-select').inputValue(),'Not found');assert.equal(page.url().includes('unknown-reference'),false);
 await scenario('Error');await page.locator('[data-support-retry]').click();assert.equal(await page.locator('#scenario-select').inputValue(),'Lookup');
 await page.getByLabel('Reference Number').fill('   ');await page.locator('main button[type="submit"]').click();assert.equal(await page.getByLabel('Reference Number').evaluate(el=>el.checkValidity()),false);
 await page.getByLabel('Reference Number').fill('RL-DEMO-DROP');assert.equal(await page.getByLabel('Reference Number').evaluate(el=>el.checkValidity()),true);
 // Map interaction uses only the existing local synthetic inventory.
 await screen('Impact Map');await page.locator('[data-map-filter="Available"]').click();await page.locator('[data-map-area="Bandra West"]').click();
 assert.equal(await page.locator('#map-selection .map-items li').count(),2);await page.locator('#map-selection a').first().click();assert.equal(await page.locator('#screen-select').inputValue(),'Item detail');
 await screen('Impact Map');await page.locator('[data-map-filter="Being Matched"]').click();
 assert.equal(await page.locator('[data-map-area]').count(),1,'Only one locality has Being matched inventory');
 assert.equal(await page.locator('[data-map-area="Thane"]').count(),0,'Claimed inventory is excluded');
 await page.locator('[data-map-area="Andheri West"]').click();
 assert.equal(await page.locator('#map-selection .map-items li').count(),1);
 assert.match(await page.locator('#map-selection .map-items').textContent(),/White linen embroidered tunic.*Being matched/s);
 await page.locator('[data-map-filter="All"]').click();
 assert.equal(await page.locator('[data-map-area="Thane"]').count(),1,'All still includes Claimed inventory');
 await screen('Give');await scenario('Simulated receipt');await page.locator('[data-action="track-receipt"]').click();assert.equal(await page.locator('#screen-select').inputValue(),'Track');assert.match(await page.locator('.track-result').textContent(),/RL-DEMO-RECEIPT/);await page.locator('[data-action="track-drops"]').click();assert.equal(await page.locator('[data-tab="Giving"]').getAttribute('aria-current'),'page');
 // Browser validation and honest local feedback for both forms; values survive scenario review.
 await screen('Contact');await page.locator('main button[type="submit"]').click();assert.equal(await page.getByLabel('Your Name *',{exact:true}).evaluate(el=>el.validity.valueMissing),true);
 await page.getByLabel('Your Name *',{exact:true}).fill('Demo Reviewer');await page.getByLabel('Email Address *',{exact:true}).fill('demo@example.test');await page.getByLabel('Message *',{exact:true}).fill('Local review only');
 await page.locator('main button[type="submit"]').click();assert.match(await page.locator('#review-toolbar .review-feedback').textContent(),/No message was sent/);
 await scenario('Error');assert.equal(await page.getByLabel('Your Name *',{exact:true}).inputValue(),'Demo Reviewer');
 await screen('Partner');
 for(const [label,value] of [['Organisation Name *','Demo organisation'],['Broad Locality / Area *','Bandra West'],['Contact Person *','Demo Reviewer'],['Mobile Phone Number *','9876543210'],['Email Address *','demo@example.test']])await page.getByLabel(label,{exact:true}).fill(value);
 await page.locator('input[name="consent"]').check();await page.locator('main button[type="submit"]').click();assert.match(await page.locator('#review-toolbar .review-feedback').textContent(),/No application was submitted/);
 assert.equal(await page.locator('main input[type="checkbox"]').count(),7);
 // All system states have recovery navigation. Unknown deep links render 404.
 await screen('System States');await page.getByRole('button',{name:'Sign in',exact:true}).click();assert.match(await page.locator('.review-feedback').textContent(),/No authentication performed/);
 await scenario('Restricted');assert.match(await page.locator('#review-toolbar .review-context').textContent(),/Customer copy for this state is not defined/);
 await scenario('Generic failure');await page.getByRole('button',{name:'Try again',exact:true}).click();assert.equal(await page.locator('#screen-select').inputValue(),'Home');
 for(const value of ['', 'Signed out', 'Restricted', 'Generic failure', 'unrecognised-scenario']) {
  const query=new URLSearchParams({screen:'missing-page'});if(value)query.set('scenario',value);
  await page.goto(`${base}?${query}`,{waitUntil:'networkidle'});
  assert.equal(await page.locator('main h1').textContent(),'404',`Unknown screen with scenario ${value}`);
  assert.equal(await page.locator('#scenario-select').inputValue(),'Missing URL / not found');
 }
 // Back navigation must resolve an unknown URL the same way as initial load.
 await page.evaluate(()=>history.replaceState({},'', '?screen=missing-page&scenario=Signed%20out'));
 await page.locator('main [data-nav="Home"]').click();await page.goBack();
 assert.equal(await page.locator('main h1').textContent(),'404','Unknown screen remains 404 on browser Back');
 await page.locator('main [data-nav="Home"]').click();assert.equal(await page.locator('#screen-select').inputValue(),'Home');
 // New page touch targets at mobile sizes, including FAQ and map controls.
 for(const name of screens) {
  await screen(name);
  const small=await page.locator('main button,main a,main input:not([type="checkbox"]),main select,main textarea').evaluateAll(els=>els.filter(el=>el.getBoundingClientRect().height&&el.getBoundingClientRect().height<44).map(el=>el.outerHTML.slice(0,160)));
  assert.deepEqual(small,[],`${name} undersized controls`);
 }
 for(const width of [390,1440]) {
  await page.setViewportSize({width,height:1000});
  for(const name of ['Track','FAQ','Our Story','Contact','Impact Map','Wall of Love','Standards','Partner','System States']) {
   await screen(name);if(name==='Track')await scenario('Drop status');if(name==='FAQ' && await page.locator('[data-faq="0-0"]').getAttribute('aria-expanded')==='false')await page.locator('[data-faq="0-0"]').click();
   await page.screenshot({path:fileURLToPath(new URL(`./support-${name.toLowerCase().replaceAll(' ','-')}-${width}.png`,import.meta.url)),fullPage:true});
  }
 }
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.deepEqual(writes,[]);
 const result={passed:true,stateChecks,widths:[320,390,768,1440],faqItems:24,regressions:['FAQ Notifications destination','Unknown screen with scenario','Exact Being Matched filter'],errors,externalRequests:external,writeRequests:writes};
 await writeFile(new URL('./supporting-pages-verification.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify(result));
} finally {await browser.close();}
