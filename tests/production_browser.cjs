// Run after production_api_check.py against the same disposable local app.
const assert=require('node:assert/strict');const {chromium}=require('playwright');
(async()=>{
 const origin=process.env.AUDIT_BASE_URL || 'http://127.0.0.1:8019';
 assert(['127.0.0.1','localhost'].includes(new URL(origin).hostname));
 const browser=await chromium.launch({headless:true,channel:process.env.UI_BROWSER_CHANNEL || 'chrome'});
 try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Synthetic audit account created by the companion integration test only.
 await page.goto(origin);await page.getByLabel('Username',{exact:true}).fill('audit_owner');
 await page.getByLabel('Password',{exact:true}).fill('local-test-password');await page.getByLabel('Password',{exact:true}).press('Enter');
 await page.locator('.quick-actions').waitFor();
 for(const name of ['dashboard','retail','upload','ledger','reports','analytics','daily-sheet','billing-setup','access-control']){
  await page.evaluate(name=>loadPage(name),name);await page.waitForTimeout(300);
 }
 await page.evaluate(()=>loadPage('retail'));await page.waitForTimeout(700);await page.locator('#retailRegularRows .retailItemName').fill('Synthetic weight-only item');
 await page.locator('#retailRegularRows .retailWeight').fill('0.100');
 await page.locator('#retailRegularRows .retailRate').fill('100');
 await page.locator('#retailSettlementType').selectOption('paid');
 const response=page.waitForResponse(r=>r.url().endsWith('/retail-bills')&&r.request().method()==='POST');
 await page.getByRole('button',{name:'Save Bill',exact:true}).click();const saved=await(await response).json();
 assert(saved.bill,saved.error);assert.equal(saved.bill.total_amount,10);assert.equal(saved.bill.paid_amount,10);
 const download=page.waitForEvent('download');await page.evaluate(()=>downloadTemplate('vendor'));
 assert.equal((await download).suggestedFilename(),'vendor_template.csv');
 assert.deepEqual(errors,[]);
 console.log('PASS real browser login, all 9 screens, weight-only bill save and authenticated template download');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
