import assert from 'node:assert/strict'
import { mkdir } from 'node:fs/promises'
import { withPublicBrowser, installFixtures, fixtureResponse, assertNoOverflow, assertTargets } from './public-browser-harness.mjs'
const evidence = '../.local-proof/task-5/public-support'
await mkdir(evidence, { recursive: true })
const photo = '/images/wall-items/hunter-x-hunter-hisoka-tee.png'
const item = { id: 'local-item', slug: 'local-item', title: 'Graphic cotton tee', category: 'Tops', locality: 'Bandra', status: 'reloved', publicStatus: 'available', images: [{ storagePath: photo }] }
const submission = { status: 'pending_review', submittedAt: '2026-09-25', items: [item] }
await withPublicBrowser(async (browser, baseURL) => {
  let passed = 0; const failures = []
  const check = async (name, run) => { if (process.env.SUPPORT_CHECK_FILTER && !name.includes(process.env.SUPPORT_CHECK_FILTER)) return; try { await run(); passed++; console.log(`PASS ${name}`) } catch (e) { failures.push(`${name}: ${e.message}`); console.error(`FAIL ${name}: ${e.message}`) } }
  async function scenario(path, run, { width = 390, fixtures = {}, expectedErrors = [], signedIn = false, fallback = false } = {}) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce', serviceWorkers: 'block' }); context.setDefaultTimeout(2500)
    // Cold MapLibre/navigation work can outlast interaction assertions under concurrent local QA.
    context.setDefaultNavigationTimeout(15000)
    await context.addInitScript(({ signedIn, fallback, origin }) => {
      if (signedIn && location.origin === origin) localStorage.setItem('reloved_donor_token', 'local-browser-fixture-only')
      if (fallback) { const original = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (type, ...args) { return /^webgl/.test(type) ? null : original.call(this, type, ...args) } }
    }, { signedIn, fallback, origin: new URL(baseURL).origin })
    const fixtureErrors = []; const writes = []
    const responses = { 'POST /api/analytics/events': req => { writes.push(req.postDataJSON()); return { ok: true } }, 'GET /api/items': { items: [item] }, 'GET /api/track/LOCAL-REF': { submission }, 'GET /api/donor/notifications/unread-count': { unreadCount: 0 }, 'GET /api/donor/profile': { profile: { id: 'local', name: 'Local', onboardedAt: '2026-09-01' } }, 'GET /api/donor/notifications': { notifications: [], unreadCount: 0 }, ...fixtures }
    for (const [key, value] of Object.entries(responses)) if (typeof value === 'function') responses[key] = async req => { try { return await value(req) } catch (e) { fixtureErrors.push(e.message); return { error: 'Fixture contract failed' } } }
    const audit = await installFixtures(context, baseURL, responses); const page = await context.newPage()
    try {
      await page.goto(baseURL + path); await run(page, audit, writes); await assertNoOverflow(page)
      assert.deepEqual(fixtureErrors, []); assert.deepEqual(audit.violations, [])
      assert.deepEqual(audit.errors.filter(e => !expectedErrors.some(pattern => pattern.test(e))), [])
    } finally { await context.close() }
  }
  const root = p => p.locator('.public-support').first()
  const capture = async (p, name) => { await p.evaluate(() => scrollTo(0, 0)); await p.screenshot({ path: `${evidence}/${name}.png`, fullPage: true }) }
  async function composition(p) {
    assert.equal(await root(p).count(), 1, 'support page must opt into approved composition')
    assert.equal(await root(p).locator('h1').evaluate(el => getComputedStyle(el).textTransform), 'none')
    for (const panel of await root(p).locator('[class*="shadow-"]').all()) assert.equal(await panel.evaluate(el => getComputedStyle(el).boxShadow), 'none')
    await assertTargets(root(p).locator('button, a')); await assertNoOverflow(p)
  }
  for (const width of [320, 390, 768, 1440]) {
    for (const [path, title] of [['/track', 'Track Submission'], ['/faq', 'Frequently asked questions'], ['/about', 'Our Story.'], ['/contact', 'Contact us'], ['/standards', 'Quality & Safety Standards'], ['/partner', 'Partner with reloved.'], ['/map', 'Community Impact Map'], ['/love', 'Wall of Love'], ['/missing-local-only', '404']]) await check(`${path} composition ${width}`, () => scenario(path, async p => {
      await p.getByRole('heading', { name: title, exact: true }).waitFor(); await composition(p); await capture(p, `${path.slice(1)}-${width}`)
    }, { width }))
    await check(`track result readable long content ${width}`, () => scenario('/track/LOCAL-REF', async p => {
      await p.getByText('Current Status', { exact: true }).waitFor(); await composition(p)
      assert.equal(await p.locator('.public-track-items .truncate').count(), 0, 'item facts must wrap rather than truncate')
      await capture(p, `track-result-${width}`)
    }, { width, fixtures: { 'GET /api/track/LOCAL-REF': { submission: { ...submission, items: [{ ...item, title: 'A very long descriptive garment name with a detailed pattern and carefully repaired embroidered sleeves' }] } } } }))
  }
  await check('track labelled lookup preserves reference and analytics', () => scenario('/track', async (p, audit) => {
    await p.getByLabel('Reference Number', { exact: true }).fill('  local-ref  '); await p.getByRole('button', { name: 'Track', exact: true }).click()
    await p.getByText('Current Status', { exact: true }).waitFor(); assert.ok(p.url().endsWith('/track/LOCAL-REF'))
    assert.ok(audit.requests.includes('GET /api/track/LOCAL-REF'))
    const events = await p.evaluate(() => window.dataLayer || [])
    assert.ok(events.some(e => e.event === 'track_lookup_submitted' && e.reference === 'LOCAL-REF'))
    assert.ok(events.some(e => e.event === 'track_status_viewed' && e.reference === 'LOCAL-REF' && e.status === 'pending_review'))
  }))
  await check('track loading exposes status and reduced motion', () => scenario('/track/LOCAL-REF', async p => {
    const busy = p.locator('.public-support [aria-busy=true]'); await busy.waitFor(); assert.equal(await busy.evaluate(el => getComputedStyle(el).animationName), 'none')
    await p.getByText('Current Status', { exact: true }).waitFor()
  }, { fixtures: { 'GET /api/track/LOCAL-REF': fixtureResponse({ submission }, { delayMs: 900 }) } }))
  for (const [name, response] of [['missing', { submission: null }], ['failed', fixtureResponse({ error: 'Local failure' }, { status: 503 })], ['denied', fixtureResponse({ error: 'Local denied' }, { status: 403 })]]) await check(`track ${name} preserves recovery and signed-out access`, () => scenario('/track/LOCAL-REF', async p => {
    await p.getByRole('heading', { name: 'Reference not found' }).waitFor(); await root(p).getByRole('link', { name: 'Track', exact: true }).click(); await p.getByRole('heading', { name: 'Track Submission' }).waitFor()
  }, { fixtures: { 'GET /api/track/LOCAL-REF': response }, expectedErrors: [/Failed to load resource/] }))
  await check('FAQ keyboard state and answer relationship', () => scenario('/faq', async p => {
    const q = root(p).locator('button').first(); await q.focus(); await p.keyboard.press('Enter'); assert.equal(await q.getAttribute('aria-expanded'), 'true')
    const id = await q.getAttribute('aria-controls'); assert.ok(id); assert.ok(await p.locator(`[id="${id}"]`).isVisible()); await p.keyboard.press('Space'); assert.equal(await q.getAttribute('aria-expanded'), 'false')
    assert.ok((await p.evaluate(() => window.dataLayer || [])).some(e => e.event === 'faq_question_opened' && e.question && e.group))
  }))
  const contactData = { name: 'Local Fixture', email: 'local@example.invalid', phone: '9876543210', subject: 'Local check', message: 'Local verification only.' }
  async function contact(p) { for (const [label, key] of [['Your Name *','name'],['Email Address *','email'],['Mobile Phone (Optional)','phone'],['Subject','subject'],['Message *','message']]) await p.getByLabel(label, { exact: true }).fill(contactData[key]) }
  await check('contact validation exact payload pending success and reset', () => scenario('/contact', async (p, audit) => {
    await p.getByRole('button', { name: 'Send Message', exact: true }).click(); await p.getByRole('alert').filter({ hasText: 'Please fill in your name, email, and message.' }).waitFor(); assert.ok(!audit.requests.includes('POST /api/contact'))
    await contact(p); await p.getByRole('button', { name: 'Send Message', exact: true }).click(); await p.getByRole('button', { name: 'Sending Message...' }).waitFor(); await p.getByRole('heading', { name: 'Message Received' }).waitFor()
    assert.ok((await p.evaluate(() => window.dataLayer || [])).some(e => e.event === 'contact_submitted' && e.subject === 'Local check'))
    await p.getByRole('button', { name: 'Send Another Message' }).click(); assert.equal(await p.getByLabel('Your Name *', { exact: true }).inputValue(), '')
  }, { fixtures: { 'POST /api/contact': req => { assert.deepEqual(req.postDataJSON(), contactData); return fixtureResponse({ ok: true }, { delayMs: 700 }) } } }))
  await check('contact failure retains fields and can resubmit', () => {
    let attempts = 0
    return scenario('/contact', async p => { await contact(p); await p.getByRole('button', { name: 'Send Message', exact: true }).click(); await p.getByRole('alert').filter({ hasText: 'Local send failed' }).waitFor(); assert.equal(await p.getByLabel('Your Name *', { exact: true }).inputValue(), contactData.name); await p.getByRole('button', { name: 'Send Message', exact: true }).click(); await p.getByRole('heading', { name: 'Message Received' }).waitFor() }, { fixtures: { 'POST /api/contact': () => ++attempts === 1 ? fixtureResponse({ error: 'Local send failed' }, { status: 503 }) : { ok: true } }, expectedErrors: [/Failed to load resource/, /Contact message error/] })
  })
  await check('partner exact payload validation consent and success', () => scenario('/partner', async (p, audit) => {
    await p.getByRole('button', { name: 'Submit Partner Application' }).click(); await p.getByRole('alert').waitFor(); assert.ok(!audit.requests.includes('POST /api/partner-applications'))
    for (const [label, value] of [['Organisation Name *','Local Org'],['Contact Person *','Local Person'],['Mobile Phone Number *','9876543210'],['Email Address *','org@example.invalid']]) await p.getByLabel(label, { exact: true }).fill(value)
    await p.getByRole('button', { name: '+ Bags', exact: true }).click(); await p.getByRole('checkbox').check(); await p.getByRole('button', { name: 'Submit Partner Application' }).click(); await p.getByRole('heading', { name: 'Application Received' }).waitFor(); await p.getByText('PARTNER-LOCAL', { exact: true }).waitFor()
    assert.ok((await p.evaluate(() => window.dataLayer || [])).some(e => e.event === 'partner_application_submitted' && e.reference === 'PARTNER-LOCAL'))
  }, { fixtures: { 'POST /api/partner-applications': req => { assert.deepEqual(req.postDataJSON(), { orgName:'Local Org',orgType:'NGO',registrationStatus:'Registered NGO',contactPerson:'Local Person',role:'',phone:'9876543210',email:'org@example.invalid',locality:'',beneficiaryGroup:'',requiredCategories:['Tops','Bags'],approxQuantity:'',message:'',consent:true }); return { reference:'PARTNER-LOCAL' } } } }))
  await check('map fallback preserves filters area grouping and item destination', () => scenario('/map', async p => {
    await p.getByText('Mumbai live inventory map', { exact: true }).waitFor(); await p.getByRole('button', { name: 'Bandra · 2', exact: true }).click(); await p.getByRole('link', { name: /Graphic cotton tee/ }).waitFor()
    await p.getByRole('button', { name: 'Available', exact: true }).click(); assert.equal(await p.getByRole('button', { name: 'Available', exact: true }).getAttribute('aria-pressed'), 'true'); assert.equal(await root(p).getByRole('link', { name: /Graphic cotton tee/ }).count(), 1)
    await p.getByRole('button', { name: 'Being Matched', exact: true }).click(); assert.equal(await root(p).getByRole('link', { name: /Matched piece/ }).getAttribute('href'), '/drop/matched-local')
    await p.getByRole('button', { name: 'Close locality', exact: true }).click(); await assertTargets(root(p).locator('button')); await capture(p, 'map-fallback')
  }, { fallback: true, expectedErrors: [/Failed to initialize WebGL/, /WebGL.*supported/], fixtures: { 'GET /api/items': req => { assert.equal(new URL(req.url()).search, '?status=wall'); return { items: [item, { ...item,id:'matched',slug:'matched-local',title:'Matched piece',publicStatus:'claimed' }] } } } }))
  for (const state of ['empty','loading','failure']) await check(`map ${state} current fallback`, () => scenario('/map', async p => { await p.getByText('Mumbai live inventory map', { exact:true }).waitFor(); if (state === 'loading') await p.locator('.public-map [aria-busy=true]').waitFor(); await p.getByText('No live inventory pins yet', { exact:true }).waitFor() }, { fallback:true, expectedErrors:[/Failed to load resource/,/Failed to initialize WebGL/,/WebGL.*supported/], fixtures:{ 'GET /api/items': fixtureResponse({ items:[] }, { delayMs:state==='loading'?900:0,status:state==='failure'?503:200 }) } }))
  await check('love real item imagery and no invented recipient', () => scenario('/love', async (p, audit) => { const img = root(p).getByRole('img', { name:item.title,exact:true }); await img.scrollIntoViewIfNeeded(); await img.evaluate(el => el.decode()); assert.ok((await img.getAttribute('src')).endsWith('/images/wall-items/thumbs/hunter-x-hunter-hisoka-tee.webp')); assert.equal(await img.evaluate(el=>getComputedStyle(el).objectFit),'contain'); assert.ok(!audit.requests.some(url=>url.includes('unsplash'))); await capture(p,'love-item') }))
  for (const state of ['empty','loading','failure']) await check(`love ${state} existing semantics`, () => scenario('/love', async p => { if(state==='loading') await p.getByText('Loading Wall of Love...', {exact:true}).waitFor(); await p.getByRole('heading',{name:'Nothing here yet.'}).waitFor() }, { fixtures:{ 'GET /api/items':fixtureResponse({items:[]},{delayMs:state==='loading'?900:0,status:state==='failure'?503:200}) },expectedErrors:[/Failed to load resource/,/Error fetching completed donors/] }))
  await check('help modal focus escape scroll restore and signed-out action', () => scenario('/track', async p => {
    const trigger=p.getByRole('button',{name:'Open help',exact:true}); await trigger.click(); const dialog=p.getByRole('dialog',{name:'Ask Reloved',exact:true}); await dialog.waitFor(); assert.equal(await p.evaluate(()=>document.body.style.overflow),'hidden'); assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)), 'focus must remain inside help dialog')
    await dialog.getByRole('button',{name:'How do I claim an item?',exact:true}).click(); await dialog.getByText('Open an item on the Wall, sign in with email OTP (phone optional), confirm your details, and send the request. The giver — not Reloved admin — Accepts or Declines.',{exact:true}).waitFor(); await dialog.getByRole('textbox').fill('Local help'); await dialog.getByRole('button',{name:'Send message'}).click(); await dialog.getByRole('link',{name:'Sign in',exact:true}).waitFor()
    const last=dialog.getByRole('link',{name:'Sign in',exact:true}); await last.focus(); await p.keyboard.press('Tab'); assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)), 'focus must remain inside help dialog'); await assertTargets(dialog.locator('button')); await capture(p,'help-dialog'); await p.keyboard.press('Escape'); assert.equal(await p.getByRole('dialog').count(),0); assert.equal(await p.evaluate(()=>document.body.style.overflow),''); assert.equal(await trigger.evaluate(el=>el===document.activeElement),true)
  }))
  await check('support canvas is quiet ivory behind content', () => scenario('/love', async p => {
    await root(p).waitFor(); assert.equal(await p.locator('main').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(244, 240, 232)')
  }))
  await check('help signed-in exact open send contract and close cleanup', () => {
    const response = { thread:{id:'support-local'}, messages:[] }
    return scenario('/track', async (p, audit) => {
      await p.getByRole('button',{name:'Open help',exact:true}).click(); const dialog=p.getByRole('dialog',{name:'Ask Reloved',exact:true}); await dialog.waitFor()
      await dialog.getByRole('textbox').fill('  Local support message  '); await dialog.getByRole('button',{name:'Send message'}).click(); await dialog.getByText('Local support message',{exact:true}).waitFor()
      assert.ok(audit.requests.includes('POST /api/donor/threads/open')); assert.ok(audit.requests.includes('POST /api/donor/threads/support-local/messages'))
      await dialog.getByRole('button',{name:'Close',exact:true}).click(); assert.equal(await p.getByRole('dialog').count(),0); assert.equal(await p.evaluate(()=>document.body.style.overflow),'')
    }, { signedIn:true,fixtures:{
      'POST /api/donor/threads/open': req=>{assert.deepEqual(req.postDataJSON(),{subjectType:'support',subjectId:'me'});assert.equal(req.headers().authorization,'Bearer local-browser-fixture-only');return response},
      'POST /api/donor/threads/support-local/messages':req=>{assert.deepEqual(req.postDataJSON(),{text:'Local support message'});assert.equal(req.headers().authorization,'Bearer local-browser-fixture-only');return {...response,messages:[{id:'msg',senderRole:'donor',senderName:'Local',text:'Local support message',createdAt:null}]}},
    } })
  })
  await check('partner failure retains input and consent for retry',()=>{
    let attempts=0
    return scenario('/partner',async p=>{
      for(const [label,value] of [['Organisation Name *','Local Org'],['Contact Person *','Local'],['Mobile Phone Number *','9876543210'],['Email Address *','org@example.invalid']])await p.getByLabel(label,{exact:true}).fill(value)
      await p.getByRole('checkbox').check();await p.getByRole('button',{name:'Submit Partner Application'}).click();await p.getByRole('alert').filter({hasText:'Local application failure'}).waitFor();assert.equal(await p.getByLabel('Organisation Name *',{exact:true}).inputValue(),'Local Org');assert.equal(await p.getByRole('checkbox').isChecked(),true)
      await p.getByRole('button',{name:'Submit Partner Application'}).click();await p.getByRole('heading',{name:'Application Received'}).waitFor()
    },{fixtures:{'POST /api/partner-applications':()=>++attempts===1?fixtureResponse({error:'Local application failure'},{status:503}):{reference:'LOCAL'}},expectedErrors:[/Failed to load resource/,/Partner submission error/]})
  })
  await check('home recognition uses returned item photo and existing love destination',()=>scenario('/',async(p,audit)=>{
    const section=p.locator('.public-love-section');await section.waitFor();const img=section.getByRole('img',{name:item.title,exact:true});await img.scrollIntoViewIfNeeded();await img.evaluate(el=>el.decode());assert.equal(await img.evaluate(el=>getComputedStyle(el).objectFit),'contain');assert.equal(await section.getByRole('link',{name:'View Full Wall of Love'}).getAttribute('href'),'/love');assert.ok(!audit.requests.some(path=>path.includes('unsplash')))
  },{fixtures:{'GET /api/items':req=>({items:new URL(req.url()).searchParams.get('status')==='reloved'?[item]:[]})}}))
  await check('semantic red text retains readable contrast',()=>scenario('/standards',async p=>{
    const contrast=await root(p).locator('.text-accent-red').evaluate(el=>{
      const rgb=getComputedStyle(el).color.match(/[0-9.]+/g).slice(0,3).map(Number).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4})
      return 1.05/(rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722+.05)
    });assert.ok(contrast>=4.5,`text contrast ${contrast} must reach 4.5:1`)
  }))
  await check('visual regression 404 recovery action has readable fill',()=>scenario('/missing-local-only',async p=>{
    const action=root(p).getByRole('link',{name:'Return Home',exact:true});assert.equal(await action.evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(17, 17, 17)');assert.equal(await action.getAttribute('href'),'/')
  }))
  await check('visual regression partner fields remain clear of floating help',async()=>{
    for (const path of ['/partner', '/partner/']) await scenario(path,async p=>{
      await p.getByRole('heading',{name:'Partner Application Form'}).waitFor();assert.equal(await p.getByRole('button',{name:'Open help',exact:true}).count(),0, `${path} must suppress help over the application`)
    },{width:768})
    for (const path of ['/partnership', '/partner/not-a-route']) await scenario(path,async p=>{
      await p.getByRole('heading',{name:'404',exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:'Open help',exact:true}).count(),1, `${path} must retain its existing help behavior`)
    })
  })
  for(const path of ['/track','/faq','/about','/contact','/partner','/standards','/love','/map']) await check(`200% text ${path}`,()=>scenario(path,async p=>{ await root(p).waitFor(); await p.evaluate(()=>{ const nodes=[...document.querySelectorAll('.public-support, .public-support *')]; const sizes=nodes.map(el=>[el,getComputedStyle(el).fontSize,getComputedStyle(el).lineHeight]); for(const [el,size,line] of sizes){ el.style.fontSize=`${parseFloat(size)*2}px`; if(line!=='normal')el.style.lineHeight=`${parseFloat(line)*2}px` } }); await assertNoOverflow(p); await capture(p,`text-${path.slice(1)}`) },{width:320}))
  console.log(`${passed} supporting checks passed; ${failures.length} failed`)
  assert.deepEqual(failures,[])
})
