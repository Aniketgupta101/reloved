import { checkReviewToolbar } from './review-toolbar-checks.mjs';
/** Local synthetic prototype only. No application/API behavior is exercised. */
import { chromium } from '../../../frontend/node_modules/playwright/index.mjs';
import { mkdir, writeFile, rename, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const base=process.env.PREVIEW_URL||'http://127.0.0.1:3191/Docs/UI_UX_PREVIEW/';
const dir=fileURLToPath(new URL('./final/',import.meta.url));await mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const page=await browser.newPage({reducedMotion:'reduce'});
const errors=[],external=[],writes=[],checks=[],failures=[],evidence=[];
const observe=p=>{p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text())});p.on('request',r=>{if(!r.url().startsWith(new URL(base).origin)&&! /^(blob:|data:)/.test(r.url()))external.push(r.url());if(r.method()!=='GET')writes.push(r.url())});p.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()} ${r.url()}`)})};observe(page);
const ready=async()=>page.evaluate(async()=>{await document.fonts.ready;for(const i of document.images)i.loading='eager';await Promise.allSettled([...document.images].map(i=>i.decode()))});
const capture=async(name,fullPage=true)=>{await ready();await page.screenshot({path:dir+name,fullPage});evidence.push({file:'final/'+name,bytes:(await stat(dir+name)).size})};
const screen=n=>page.selectOption('#screen-select',n);
const scenario=n=>page.selectOption('#scenario-select',n);
const slug=n=>n.toLowerCase().replaceAll(' ','-');
const inspect=async(label,zoom=false)=>{await ready();const facts=await page.evaluate(()=>{
 const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'};
 const small=[...document.querySelectorAll('#customer button,#customer a,#customer input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]),#customer select,#customer textarea,#customer label:has(input[type=checkbox]),#customer label:has(input[type=radio])')].filter(visible).filter(e=>{const r=e.getBoundingClientRect();return r.width<43.9||r.height<43.9}).map(e=>({text:e.textContent.trim().slice(0,50),class:e.className,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}));
 const progress=[...document.querySelectorAll('.give-progress .step span')].map(e=>({text:e.textContent,clipped:e.scrollWidth>e.clientWidth+1}));
 const inLayoutReviewNotices=[...document.querySelectorAll('#customer .preview-notice,#customer .receipt-simulation,#customer .review-feedback')].length || /preview only|synthetic|simulated receipt|local design review|nothing was submitted|no lookup is sent|no authentication|customer copy for this state/i.test(document.querySelector('#customer').textContent);
 const note=document.querySelector('#review-toolbar .review-note'),noteRect=note.getBoundingClientRect();
 const toolbarSyntheticVisible=visible(note) && noteRect.top>=0 && noteRect.bottom<=innerHeight && /synthetic/.test(document.querySelector('#review-toolbar .review-note').textContent);
 const fragmentedSystemLabels=[...document.querySelectorAll('.system-panel .inline-actions .btn')].filter(visible).filter(e=>{
   const walker=document.createTreeWalker(e,NodeFilter.SHOW_TEXT);let node;
   while(node=walker.nextNode())for(const match of node.textContent.matchAll(/\S+/g)){
     const range=document.createRange();range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);
     const boxes=[...range.getClientRects()];const button=e.getBoundingClientRect();
     if(new Set(boxes.map(r=>Math.round(r.top))).size>1 || boxes.some(r=>r.left<button.left-1 || r.right>button.right+1))return true;
   }
   return false;
 }).map(e=>e.textContent.trim());
 return {inLayoutReviewNotices,toolbarSyntheticVisible,fragmentedSystemLabels,overflow:document.documentElement.scrollWidth>innerWidth+1,small,progress,distortedBadges:[...document.querySelectorAll('.logo-badge,.home-badge,.footer-inner img')].filter(visible).filter(e=>{const r=e.getBoundingClientRect();return Math.abs(r.width-r.height)>1}).map(e=>e.className||'footer badge'),fonts:[...document.fonts].map(f=>({family:f.family,status:f.status})),missingImages:[...document.images].filter(i=>!i.complete||!i.naturalWidth).map(i=>i.src),replacementGlyphs:/[\uFFFD\u25A1]/.test(document.querySelector('#customer').textContent),infinite:document.getAnimations().filter(a=>a.effect.getTiming().iterations===Infinity).length};
 });checks.push({label,zoom,...facts});if(facts.inLayoutReviewNotices||!facts.toolbarSyntheticVisible||facts.fragmentedSystemLabels.length||facts.distortedBadges.length||facts.overflow||facts.small.length||facts.progress.some(p=>p.clipped)||facts.fonts.length!==2||facts.fonts.some(f=>f.status!=='loaded')||facts.missingImages.length||facts.replacementGlyphs||facts.infinite)failures.push({label,...facts});};
try{
 await page.goto(base,{waitUntil:'networkidle'});const screens=await page.locator('#screen-select option').allTextContents();
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});
  for(const name of screens){await screen(name);const options=await page.locator('#scenario-select option').allTextContents();
   for(const value of options){await scenario(value);await inspect(`${width}/${name}/${value}`);if(name==='Give'&&value==='Simulated receipt'&&[390,1440].includes(width))await capture(`give-simulated-receipt-${width}.png`)}
   await scenario(options[0]);
   if([390,1440].includes(width)||['Give','Wall'].includes(name))await capture(`${slug(name)}-${width}.png`);
  }
 }
 // Double each rendered text size and line height: actual text-pressure testing,
 // including pixel-sized labels, rather than a root size change alone.
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});
  for(const name of screens){await page.goto(`${base}?screen=${encodeURIComponent(name)}`,{waitUntil:'networkidle'});
   await page.evaluate(()=>{const es=[...document.querySelectorAll('#customer *')];const sizes=es.map(e=>{const s=getComputedStyle(e);return [parseFloat(s.fontSize)*2,s.lineHeight==='normal'?'normal':parseFloat(s.lineHeight)*2+'px']});es.forEach((e,i)=>{e.style.fontSize=sizes[i][0]+'px';e.style.lineHeight=sizes[i][1]})});
   await inspect(`text-200/${width}/${name}`,true);
   if(width===390&&['Give','Our Story','System States'].includes(name))await capture(`text-200-${slug(name)}-${width}.png`);
  }
 }
 // Dynamic Give stages and account tabs at the narrow pressure point.
 await page.setViewportSize({width:320,height:900});await page.goto(base);await screen('Give');
 for(const mode of ['Guest','Signed in','Saved profile']){await scenario(mode);for(const value of await page.locator('#give-step-select option').evaluateAll(es=>es.map(e=>e.value))){await page.selectOption('#give-step-select',value);await inspect(`320/Give/${mode}/step-${value}`)}}
 await screen('Account');for(const tab of ['Claiming','Giving','Notifications','Profile']){await page.locator(`[data-tab="${tab}"]`).click();await inspect(`320/Account/${tab}`)}
 // Customer validation remains visible inside the active modal; review disclosures stay outside it.
 for(const width of [390,1440]) {
  await page.setViewportSize({width,height:900});await screen('Claim detail');await scenario('Action required');await page.locator('[data-action="address-demo"]').click();
  await page.getByLabel('Building or landmark',{exact:true}).fill('Flat 12');await page.getByLabel('Pincode *',{exact:true}).fill('400050');await page.locator('[data-action="save-address"]').click();
  const error=page.getByRole('dialog').locator('#building-error');
  if(!await error.isVisible() || await error.textContent()!=='Use your building or landmark only.' || await page.locator('#building').getAttribute('aria-invalid')!=='true')failures.push({label:`${width}/Address live error`});
  await page.evaluate(()=>window.scrollTo(0,0));
  await capture(`claim-address-error-${width}.png`,false);
  await page.getByLabel('Building or landmark',{exact:true}).fill('Demo building, Bandra West');await page.locator('[data-action="save-address"]').click();
  if(await page.getByRole('dialog').count() || !/Simulated address confirmation/.test(await page.locator('#review-toolbar .review-feedback').textContent()))failures.push({label:`${width}/Address local success`});
 }
 const scrolledFeedback=await checkReviewToolbar(page,base,capture);
 // Exact visual regressions: Story contrast and system button fill.
 await screen('Our Story');if(await page.locator('.story-copy p').first().evaluate(e=>getComputedStyle(e).color)!=='rgb(17, 17, 17)')failures.push({label:'Story body contrast'});
 await screen('System States');if(await page.locator('[data-action="preview-signin"]').evaluate(e=>getComputedStyle(e).backgroundColor)!=='rgb(17, 17, 17)')failures.push({label:'System action contrast'});
 // Focus visibility and modal containment/return; overlay never falls behind toolbar.
 await screen('Wall');const trigger=page.getByRole('button',{name:'Filter',exact:true});await trigger.focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>document.activeElement?.getAttribute('aria-label')==='Close filters');
 if(await page.evaluate(()=>getComputedStyle(document.activeElement).outlineStyle)==='none')failures.push({label:'Missing keyboard focus ring'});
 await page.keyboard.press('Shift+Tab');if(await page.evaluate(()=>document.activeElement.textContent)!=='Clear all')failures.push({label:'Filter trap'});
 const covered=await page.getByRole('dialog').evaluate(e=>{const r=e.getBoundingClientRect();return !e.contains(document.elementFromPoint(r.x+r.width/2,Math.max(r.y,0)+20))});if(covered)failures.push({label:'Covered dialog'});
 await page.keyboard.press('Escape');if(!await trigger.evaluate(e=>e===document.activeElement))failures.push({label:'Filter return focus'});
 await page.emulateMedia({reducedMotion:'reduce'});await screen('Give');if(await page.evaluate(()=>document.getAnimations().length))failures.push({label:'Reduced motion animations'});
 // Normal-motion inventory, including loading, must remain finite and under 300ms.
 await page.emulateMedia({reducedMotion:'no-preference'});await screen('Give');const motion=await page.evaluate(()=>document.getAnimations().map(a=>({duration:a.effect.getTiming().duration,iterations:a.effect.getTiming().iterations,easing:a.effect.getTiming().easing})));if(motion.some(a=>a.duration>=300||a.iterations===Infinity||a.easing==='ease-in'))failures.push({label:'Motion contract',motion});
 await screen('Wall');await scenario('Loading');if(await page.evaluate(()=>document.getAnimations().some(a=>a.effect.getTiming().iterations===Infinity)))failures.push({label:'Continuous loading animation'});
 await page.setViewportSize({width:390,height:844});await capture('wall-loading-390.png');
 // Phone recording: local synthetic menu/filter/gallery/Give/account/support navigation.
 const context=await browser.newContext({viewport:{width:390,height:844},recordVideo:{dir,size:{width:390,height:844}}});const videoPage=await context.newPage();observe(videoPage);const pause=()=>videoPage.waitForTimeout(600);const select=n=>videoPage.selectOption('#screen-select',n);
 await videoPage.goto(base,{waitUntil:'networkidle'});await pause();await videoPage.getByRole('button',{name:'Open menu'}).click();await pause();await videoPage.locator('.sheet [data-action="nav:Wall"]').click();await videoPage.getByRole('button',{name:'Filter',exact:true}).click();await pause();await videoPage.getByRole('dialog').getByLabel('Category',{exact:true}).selectOption('Tops');await pause();await videoPage.locator('.product-card').first().click();await videoPage.getByRole('button',{name:'Show back photo'}).click();await pause();await videoPage.locator('[data-action="claim-demo"]').click();await pause();
 await select('Give');await videoPage.locator('[data-action="next-step"]').click();await videoPage.getByLabel('Item Title *',{exact:true}).fill('');await videoPage.locator('[data-action="next-step"]').click();await pause();await videoPage.getByLabel('Item Title *',{exact:true}).fill('Local review demo tee');await pause();await videoPage.locator('[data-action="next-step"]').click();await pause();
 await select('Account');await videoPage.selectOption('#scenario-select','Action required');await videoPage.locator('[data-action="account-claim"]').click();await videoPage.locator('[data-action="address-demo"]').click();await videoPage.getByLabel('Building or landmark',{exact:true}).fill('Flat 12');await videoPage.getByLabel('Pincode *',{exact:true}).fill('400050');await videoPage.locator('[data-action="save-address"]').click();await pause();await videoPage.getByLabel('Building or landmark',{exact:true}).fill('Demo building, Bandra West');await videoPage.locator('[data-action="save-address"]').click();await pause();
 await videoPage.getByRole('button',{name:'Open menu'}).click();await videoPage.locator('.sheet [data-action="nav:FAQ"]').click();await videoPage.locator('[data-faq="0-2"]').click();await pause();await videoPage.locator('#faq-answer-0-2 [data-nav="Standards"]').click();await pause();
 const video=videoPage.video();await context.close();await rename(await video.path(),dir+'interaction-review.webm');evidence.push({file:'final/interaction-review.webm',bytes:(await stat(dir+'interaction-review.webm')).size});
 const result={passed:!failures.length&&!errors.length&&!external.length&&!writes.length,status:'Local synthetic prototype; no backend verification',browser:'Existing Playwright with installed Google Chrome (agent-browser unavailable)',widths:[320,390,768,1440],checks:checks.length,errors,externalRequests:external,writeRequests:writes,failures,evidence,motion,scrolledFeedback};await writeFile(dir+'verification.json',JSON.stringify(result,null,2)+'\n');await writeFile(dir+'checks.json',JSON.stringify(checks,null,2)+'\n');console.log(JSON.stringify({...result,evidence:result.evidence.length},null,2));if(!result.passed)process.exitCode=1;
}finally{await browser.close()}
