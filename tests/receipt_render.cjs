const fs=require('fs');const path=require('path');const assert=require('node:assert/strict');const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try{
 const page=await browser.newPage({viewport:{width:400,height:900},deviceScaleFactor:2});
 await page.route('http://receipt.test/**',r=>r.fulfill({body:'<!doctype html><html><head></head><body></body></html>',contentType:'text/html'}));
 await page.goto('http://receipt.test');
 await page.addScriptTag({content:'function escapeHtml(value){return String(value??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll("\\\"","&quot;");}'});
 await page.addScriptTag({path:path.resolve('frontend/js/retail.js')});
 const html=await page.evaluate(()=>{
  const bill={bill_number:'TEST',date:'2026-09-29',time:'16:16:00',payment_mode:'Cash',items:[{item_name:'Chicken — regular',nag:1,weight:4,rate:44,amount:176},{item_name:'Chicken — dressed',nag:3,weight:55,rate:44,amount:2420}],total_amount:2596,paid_amount:2596};
  window.testBill=bill;return getRetailReceiptMarkup(bill);
 });
 await page.setContent(`<html><body style="margin:0;background:#eee;padding:16px">${html}</body></html>`);
 const dir=path.resolve(process.env.UI_SCREENSHOT_DIR || '../receipt-test-output');fs.mkdirSync(dir,{recursive:true});
 await page.locator('.sample-receipt').screenshot({path:path.join(dir,'bill-preview.png')});
 assert.equal(await page.locator('.sample-receipt').evaluate(n=>n.scrollWidth<=n.clientWidth),true);
 // Many rows and hostile input must remain readable without HTML execution.
 const long=await page.evaluate(()=>getRetailReceiptMarkup({...testBill,items:Array.from({length:45},(_,i)=>({item_name:`Example long item ${i+1} <script>bad</script>`,weight:.333,rate:100,amount:33.30})),total_amount:1498.5,paid_amount:1498.5}));
 await page.setContent(`<body>${long}</body>`);
 assert.equal(await page.locator('.sample-item').count(),45);
 assert.equal(await page.locator('.sample-receipt script').count(),0);
 const height=await page.locator('.sample-receipt').evaluate(n=>n.offsetHeight);assert(height>980);
 const shared=await page.evaluate(async markup=>{
  try{const file=await renderReceiptMarkupToPngFile(markup,'test-receipt');const image=await createImageBitmap(file);return {size:file.size,width:image.width,height:image.height};}
  catch(e){return {error:String(e)};}
 },long);
 console.log('Receipt share export',shared);assert(!shared.error);assert(shared.height>=height*2);
 console.log('PASS receipt visual structure, safe text, no overflow, 45-item image export');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
