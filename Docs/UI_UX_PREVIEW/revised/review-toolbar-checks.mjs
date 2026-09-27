import assert from 'node:assert/strict';

/** Scrolled feedback must be in the viewport, focused, and outside customer content. */
export async function checkReviewToolbar(page, base, capture) {
  const results=[];
  for (const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:844});
    for (const kind of ['item','give']) {
      await page.goto(`${base}?screen=${kind==='item'?'Item%20detail':'Give'}`,{waitUntil:'networkidle'});
      if(kind==='give') {
        await page.selectOption('#give-step-select','1');
        await page.getByLabel('Item Title *',{exact:true}).fill('');
      }
      const action=page.locator(`[data-action="${kind==='item'?'claim-demo':'next-step'}"]`);
      await action.scrollIntoViewIfNeeded();
      // Exercise a genuinely scrolled page even on the wide, shorter customer layout.
      if(await page.evaluate(()=>scrollY)<100) await page.evaluate(()=>scrollTo(0,150));
      await action.scrollIntoViewIfNeeded();
      const before=await page.evaluate(()=>scrollY);
      assert.ok(before>100,`${width}/${kind}: reproduction must scroll the customer page`);
      await action.click();
      const facts=await page.locator('.review-feedback').evaluate(e=>{
        const r=e.getBoundingClientRect(),bar=document.querySelector('#review-toolbar').getBoundingClientRect();
        const x=r.left+r.width/2,y=r.top+r.height/2;
        return {top:r.top,bottom:r.bottom,height:r.height,barBottom:bar.bottom,scrollY,
          inViewport:r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth,
          unobscured:e.contains(document.elementFromPoint(x,y)),focused:document.activeElement===e,
          live:e.getAttribute('aria-live'),outsideCustomer:!e.closest('#customer'),text:e.textContent};
      });
      assert.ok(facts.inViewport&&facts.unobscured,`${width}/${kind}: feedback must intersect real viewport without occlusion`);
      assert.ok(facts.focused&&facts.live==='polite'&&facts.outsideCustomer,`${width}/${kind}: external feedback accessible`);
      assert.ok(facts.scrollY>100&&Math.abs(facts.scrollY-before)<=facts.height+32,`${width}/${kind}: feedback must not hijack customer scrolling (${before} → ${facts.scrollY})`);
      assert.match(facts.text,kind==='item'?/No claim is submitted/:/each item needs a title/);
      if(capture&&[390,1440].includes(width)) await capture(`scrolled-feedback-${kind}-${width}.png`,false);
      // Moving back to the customer action by keyboard must reveal it below the sticky region.
      await action.focus();
      const clear=await action.evaluate(e=>{const r=e.getBoundingClientRect(),bar=document.querySelector('#review-toolbar').getBoundingClientRect();return r.top>=bar.bottom&&r.bottom<=innerHeight&&e.contains(document.elementFromPoint(r.left+r.width/2,r.top+r.height/2))});
      assert.ok(clear,`${width}/${kind}: customer action covered by reviewer controls`);
      results.push({width,kind,before,...facts});
    }
  }
  // Only claim historical captures that actually resolve locally.
  for(const name of ['Track','FAQ','Our Story','Contact','Impact Map','Wall of Love','Standards','Partner']) {
    await page.selectOption('#screen-select',name);
    const href=await page.getByRole('link',{name:'Existing baseline',exact:true}).getAttribute('href');
    const response=await page.request.get(new URL(href,base).href);
    assert.equal(response.status(),200,`${name}: historical baseline exists`);
  }
  await page.selectOption('#screen-select','System States');
  assert.equal(await page.getByRole('link',{name:'Existing baseline',exact:true}).count(),0);
  await page.selectOption('#scenario-select','Missing URL / not found');
  assert.equal(await page.getByRole('link',{name:'Existing baseline',exact:true}).getAttribute('href'),'evidence/unknown-route-phone-viewport.png');
  await page.selectOption('#screen-select','Impact Map');
  assert.equal(await page.locator('.locality-pin').first().evaluate(e=>getComputedStyle(e).boxShadow),'none');
  return results;
}
