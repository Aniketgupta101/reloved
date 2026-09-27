import { chromium } from '../../../frontend/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';

const base = process.env.PREVIEW_URL || 'http://127.0.0.1:3191/Docs/UI_UX_PREVIEW/';
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const page = await browser.newPage({ viewport: { width: 320, height: 844 }, reducedMotion: 'reduce' });
const errors = [], external = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
page.on('request', request => {
  if (!request.url().startsWith(new URL(base).origin) && !/^(blob:|data:)/.test(request.url())) external.push(request.url());
});
const screen = name => page.selectOption('#screen-select', name);
const scenario = name => page.selectOption('#scenario-select', name);
const click = action => page.locator(`[data-action="${action}"]:visible`).click();
const overflow = async label => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, `${label}: horizontal overflow`);
let stateChecks = 0;
try {
  await page.goto(base, { waitUntil: 'networkidle' });
  // Every public core scenario can be selected, retains a main region, and fits 320px.
  for (const name of ['Home','Wall','Item detail','Give','Account','Claim detail']) {
    await screen(name);
    const options = await page.locator('#scenario-select option').allTextContents();
    for (const value of options) {
      await scenario(value);
      assert.equal(await page.locator('main').count(), 1, `${name}/${value}`);
      await overflow(`${name}/${value}`);
      stateChecks++;
      if (name === 'Account') {
        for (const tab of ['Claiming','Giving','Notifications','Profile']) {
          await page.locator(`[data-tab="${tab}"]`).click();
          await overflow(`${name}/${value}/${tab}`);
          if (value === 'Loading') assert.equal(await page.locator('[aria-label="Loading account"]').count(), 1);
          else assert.ok((await page.locator('.account-main').textContent()).trim().length > 10, `${value}/${tab}: account content`);
        }
      }
    }
  }
  await screen('Home');
  assert.equal(await page.locator('.home-hero .product-card').count(), 8);
  assert.equal(await page.locator('.home-hero h1').textContent(), 'The Digital Wall of Kindness');
  await scenario('One item');
  assert.equal(await page.locator('.home-hero .product-card').count(), 1);
  await scenario('No items');
  assert.equal(await page.locator('.home-hero .product-card').count(), 0);

  await screen('Wall');
  await page.getByRole('searchbox').fill('joggers');
  assert.equal(await page.locator('.product-card').count(), 1);
  await page.getByRole('searchbox').fill('does not exist');
  assert.equal(await page.getByRole('heading', { name: 'No items match' }).count(), 1);
  await click('clear-filter');
  await click('filters');
  await page.getByRole('dialog').getByLabel('Category', { exact: true }).selectOption('Bottoms');
  assert.equal(await page.locator('.product-card').count(), 2);
  await click('filters');
  await page.getByRole('dialog').getByLabel('Size', { exact: true }).selectOption('L');
  assert.equal(await page.locator('.product-card').count(), 0);
  await click('clear-filter');
  await scenario('Claimed only');
  assert.equal(await page.locator('.product-card').count(), 1);
  await page.locator('.product-card').click();
  assert.equal(await page.getByRole('button', { name: 'Already matched', exact: true }).isDisabled(), true);
  await screen('Wall');
  await scenario('Failure');
  await click('retry');
  assert.equal(await page.locator('.product-card').count(), 8);
  await page.locator('.product-card').first().click();
  await page.getByRole('button', { name: 'Show back photo' }).click();
  assert.match(await page.locator('#main-photo').getAttribute('src'), /tee-back/);
  await page.keyboard.press('ArrowLeft');
  assert.equal(await page.locator('.photo-counter').textContent(), '1 / 2');
  for (const [value,label] of [['Own listing','This is your listing'],['Weekly limit','Weekly claim limit reached'],['Unavailable','No longer available'],['Claimed','Already matched']]) {
    await scenario(value);
    assert.equal(await page.getByRole('button', { name: label, exact: true }).isDisabled(), true);
  }

  await screen('Give');
  await scenario('Signed in');
  for (const width of [320,390]) {
    await page.setViewportSize({ width, height: 844 });
    const targets = await page.locator('[data-action="edit-group"]').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().height));
    assert.equal(targets.length, 2);
    assert.ok(targets.every(height => height >= 44), `Edit group touch targets at ${width}px: ${targets}`);
  }
  await page.setViewportSize({ width: 320, height: 844 });
  // A toolbar jump must obey the same donor/address checks as normal progression.
  await page.selectOption('#give-step-select', '4');
  await page.locator('[data-consent="declaration"]').check();
  await page.locator('[data-consent="acceptedTerms"]').check();
  assert.equal(await page.locator('[data-review="submit"]').isDisabled(), true, 'Empty donor must block direct Post');
  await page.selectOption('#give-step-select', '2');
  await page.getByLabel('First Name *', { exact: true }).fill('Demo');
  await page.getByLabel('Mobile Number *', { exact: true }).fill('123');
  await page.selectOption('#give-step-select', '4');
  assert.equal(await page.locator('[data-review="submit"]').isDisabled(), true, 'Invalid donor mobile must block direct Post');
  await page.selectOption('#give-step-select', '2');
  await page.getByLabel('Mobile Number *', { exact: true }).fill('9876543210');
  await page.selectOption('#give-step-select', '4');
  assert.equal(await page.locator('[data-review="submit"]').isEnabled(), true, 'Complete donor permits Post');
  await page.selectOption('#give-step-select', '3');
  await click('edit-pickup');
  await page.getByLabel('Building / landmark *', { exact: true }).fill('');
  await page.selectOption('#give-step-select', '4');
  assert.equal(await page.locator('[data-review="submit"]').isDisabled(), true, 'Missing pickup must block direct Post');
  await page.selectOption('#give-step-select', '3');
  await page.getByLabel('Building / landmark *', { exact: true }).fill('Flat 12, Demo building');
  await page.selectOption('#give-step-select', '4');
  assert.equal(await page.locator('[data-review="submit"]').isDisabled(), true, 'Private flat details must block direct Post');
  await page.selectOption('#give-step-select', '3');
  await page.getByLabel('Building / landmark *', { exact: true }).fill('Demo building, Bandra West, Mumbai, 400050');
  await click('edit-pickup');
  await scenario('Guest');
  await page.selectOption('#give-step-select', '4');
  assert.equal(await page.locator('[data-review="submit"]').isDisabled(), true, 'Guest must sign in before simulated submission');
  await scenario('Saved profile');
  await page.selectOption('#give-step-select', '3');
  assert.equal(await page.locator('[data-review="submit"]').isEnabled(), true, 'Saved profile uses the complete synthetic donor fixture');
  await page.locator('[data-consent="declaration"]').uncheck();
  await page.locator('[data-consent="acceptedTerms"]').uncheck();
  await scenario('Signed in');
  await page.selectOption('#give-step-select', '2');
  await page.getByLabel('First Name *', { exact: true }).fill('');
  await page.getByLabel('Mobile Number *', { exact: true }).fill('');
  await scenario('Guest');
  await click('next-step');
  await page.getByLabel('Item Title *', { exact: true }).fill('Edited first item');
  await page.getByLabel('Condition *', { exact: true }).selectOption('Excellent');
  await page.locator('[data-detail-group="1"]').click();
  await page.getByLabel('Item Title *', { exact: true }).fill('Edited second item');
  await page.locator('[data-review="save-draft"]').click();
  await page.getByLabel('Item Title *', { exact: true }).fill('Discard this edit');
  await page.locator('[data-review="restore-draft"]').click();
  assert.equal(await page.getByLabel('Item Title *', { exact: true }).inputValue(), 'Edited second item');
  await click('next-step');
  assert.equal(await page.getByRole('heading', { name: 'Sign in to post' }).count(), 1);
  assert.equal(await page.locator('[data-action="next-step"]').isDisabled(), true);
  await page.locator('[data-review="login"]').click();
  assert.equal(await page.getByRole('heading', { name: 'Donor Details' }).count(), 1);
  await page.getByLabel('First Name *', { exact: true }).fill('Demo');
  await page.getByLabel('Mobile Number *', { exact: true }).fill('9876543210');
  await click('next-step');
  assert.match(await page.locator('.give-stage').textContent(), /Edited first item/);
  assert.match(await page.locator('.give-stage').textContent(), /Edited second item/);
  await click('next-step');
  assert.equal(await page.locator('[data-review="submit"]').isDisabled(), true);
  await page.locator('[data-consent="declaration"]').check();
  await page.locator('[data-consent="acceptedTerms"]').check();
  assert.equal(await page.locator('[data-review="submit"]').isEnabled(), true);
  await scenario('Failure');
  assert.match(await page.locator('[role="alert"]').textContent(), /Failed to submit/);
  await click('give-retry');
  assert.equal(await page.locator('[data-consent="acceptedTerms"]').isChecked(), true);
  await page.locator('[data-review="submit"]').click();
  assert.equal(await page.getByRole('heading', { name: 'Thank you for your drop.' }).count(), 1);
  assert.match(await page.locator('.review-warning').textContent(), /nothing submitted/);
  const receiptNotice = page.locator('#review-toolbar .review-context');
  assert.match(await receiptNotice.textContent(), /Simulated receipt.*Nothing was submitted.*not live/);
  assert.equal(await page.locator('#customer .receipt-simulation').count(),0,'No receipt reviewer notice inside customer layout');
  assert.equal(await page.locator('.receipt-layout .lead').textContent(), 'Your item is live on the Wall of Kindness. Claimers can request it — you Accept or Decline from your profile.');
  await receiptNotice.scrollIntoViewIfNeeded();
  const noticeBounds = await receiptNotice.boundingBox();
  assert.ok(noticeBounds.y >= 0 && noticeBounds.y + noticeBounds.height <= 844, 'Simulation notice visible in the reviewer toolbar');
  await scenario('Signed in');
  await page.selectOption('#give-step-select', '2');
  await page.getByLabel('First Name *', { exact: true }).fill('Demo');
  await page.getByLabel('Mobile Number *', { exact: true }).fill('9876543210');
  await click('next-step');
  assert.equal(await page.getByRole('heading', { name: 'Review your drop' }).count(), 1);
  await click('back-step');
  assert.equal(await page.getByLabel('First Name *', { exact: true }).inputValue(), 'Demo');
  await scenario('Saved profile');
  assert.equal(await page.locator('.give-progress .step').count(), 4);
  await click('mode-single');
  await page.locator('[data-remove="0"]').click();
  await page.locator('[data-remove="1"]').click();
  await click('next-step');
  assert.equal(await page.getByRole('heading', { name: 'Drop something. Pass it on.' }).count(), 1);
  await page.locator('[data-restore="0"]').click();
  await click('next-step');
  await page.getByLabel('Item Title *', { exact: true }).fill('');
  await click('next-step');
  assert.equal(await page.getByRole('heading', { name: 'Item Details' }).count(), 1);

  await screen('Account');
  await scenario('Action required');
  await page.locator('[data-tab="Claiming"]').click();
  await click('account-claim');
  assert.match(await page.locator('.claim-content').textContent(), /Confirm your address/);
  await click('address-demo');
  const building=page.getByLabel('Building or landmark',{exact:true});
  const pincode=page.getByLabel('Pincode *',{exact:true});
  for(const [value,pin,field,errorText] of [
    ['', '400050','building','Please add a building / landmark so the dropper can arrange handover.'],
    ['Flat 12','400050','building','Use your building or landmark only.'],
    ['Demo building','','delivery-pincode','Enter your 6-digit pincode (e.g. 400053), then update.'],
    ['Demo building','12345','delivery-pincode','Enter your 6-digit pincode (e.g. 400053), then update.'],
    ['Demo building','abcdef','delivery-pincode','Enter your 6-digit pincode (e.g. 400053), then update.'],
  ]) {
    await building.fill(value);await pincode.fill(pin);await click('save-address');
    const input=page.locator(`#${field}`),error=page.getByRole('dialog').locator(`#${field}-error`);
    assert.equal(await error.isVisible(),true,`Visible dialog error for ${value}/${pin}`);
    assert.equal(await error.textContent(),errorText);assert.equal(await error.getAttribute('role'),'alert');
    assert.equal(await input.getAttribute('aria-invalid'),'true');assert.equal(await input.getAttribute('aria-describedby'),`${field}-error`);
    assert.equal(await input.evaluate(e=>e===document.activeElement),true,'First invalid field receives focus');
    const bounds=await error.boundingBox();assert.ok(bounds.y>=0&&bounds.y+bounds.height<=844,'Error visible within viewport');
    assert.doesNotMatch(await page.locator('#review-toolbar').textContent(),/Use your building or landmark only|Enter your 6-digit pincode/);
  }
  await building.fill('');await pincode.fill('');await click('save-address');
  assert.equal(await page.getByRole('dialog').locator('[role="alert"]:visible').count(),2,'Both invalid fields have visible errors');
  await page.getByLabel('Building or landmark', { exact: true }).fill('Demo building, Bandra West');
  await page.getByLabel('Pincode *', { exact: true }).fill('400050');
  await click('save-address');
  assert.equal(await page.locator('#scenario-select').inputValue(), 'Waiting');
  assert.equal(await page.getByRole('dialog').count(),0,'Valid address closes dialog');
  assert.match(await page.locator('#review-toolbar .review-feedback').textContent(),/Simulated address confirmation/);
  assert.match(await page.locator('.claim-content').textContent(), /Demo building/);
  await scenario('Time proposed');await click('query-time');await click('save-query');
  assert.equal(await page.getByRole('dialog').count(),0,'Optional blank query follows the existing live source contract');
  assert.match(await page.locator('#review-toolbar .review-feedback').textContent(),/Simulated availability response/);
  await scenario('Time proposed');
  await click('agree-time');
  assert.equal(await page.locator('#scenario-select').inputValue(), 'Time agreed');
  await scenario('Handover');
  assert.equal(await page.locator('[data-action="cancel-demo"]').count(), 0);
  await click('receive-demo');
  assert.equal(await page.locator('#scenario-select').inputValue(), 'Completed');
  assert.equal(await page.locator('[data-action="cancel-demo"]').count(), 0);
  await scenario('Pending');
  assert.equal(await page.getByRole('button', { name: 'Chat with dropper', exact: true }).count(), 0);
  await click('cancel-demo');
  await click('confirm-cancel');
  assert.equal(await page.locator('#scenario-select').inputValue(), 'Cancelled');
  await scenario('Declined');
  assert.match(await page.locator('.claim-content').textContent(), /We couldn't match you this time/);

  await screen('Account');
  await scenario('Action required');
  await page.locator('[data-tab="Giving"]').click();
  await click('accept-demo');
  assert.match(await page.locator('.account-card .eyebrow').textContent(), /Matched/);
  await scenario('Action required');
  await click('decline-demo');
  assert.match(await page.locator('.account-card .eyebrow').textContent(), /Available/);
  await page.locator('[data-tab="Notifications"]').click();
  await click('read-notes');
  assert.equal(await page.locator('.notification-row.read').count(), 1);
  await page.locator('[data-tab="Profile"]').click();
  await click('edit-profile');
  await page.getByLabel('Full name *', { exact: true }).fill('Demo updated');
  await page.getByRole('button', { name: 'Save profile', exact: true }).click();
  assert.match(await page.locator('.profile-facts').textContent(), /Demo updated/);
  await click('edit-profile');
  await page.getByLabel('Full name *', { exact: true }).fill('Unsaved');
  await click('edit-profile');
  assert.match(await page.locator('.profile-facts').textContent(), /Demo updated/);
  assert.doesNotMatch(await page.locator('.profile-facts').textContent(), /Unsaved/);

  // Keyboard containment includes native filter selects, not only buttons.
  await screen('Wall');
  await click('filters');
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Close filters');
  await page.keyboard.press('Shift+Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.textContent), 'Clear all');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), 'Close filters');
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(await page.locator('#review-toolbar').evaluate(element => element.inert), false);
  for (const width of [390,768,1440]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const name of ['Home','Wall','Item detail','Give','Account','Claim detail']) {
      await screen(name);
      await overflow(`${name}/${width}`);
    }
  }
  assert.deepEqual(errors, [], 'Browser errors');
  assert.deepEqual(external, [], 'Unexpected external requests');
  console.log(`PASS: ${stateChecks} core scenarios at 320px; account tabs, filters, gallery, Give drafts/validation/steps, direct Post validation, receipt simulation notice, 44px Edit group targets, claim lifecycle, profile, keyboard, 390/768/1440px; zero browser errors or external requests.`);
} finally {
  await browser.close();
}
