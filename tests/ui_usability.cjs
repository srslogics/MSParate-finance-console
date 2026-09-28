// Browser regression checks use only synthetic API responses and never contact a database.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { chromium } = require('playwright');
const frontend = path.resolve(__dirname, '../frontend');
const MIME = {'.js':'text/javascript','.css':'text/css','.html':'text/html','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
const server = http.createServer((req,res) => {
  const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(frontend, '.' + (relative === '/' ? '/index.html' : relative));
  if (!file.startsWith(frontend + path.sep)) {res.writeHead(403).end(); return;}
  fs.readFile(file,(err,data) => {
    if (err) {res.writeHead(404).end();return;}
    res.setHeader('Content-Type',MIME[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
});
(async () => {
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin=`http://127.0.0.1:${server.address().port}`;
 const browser=await chromium.launch({headless:true,...(process.env.UI_BROWSER_CHANNEL ? {channel:process.env.UI_BROWSER_CHANNEL} : {})});
 try {
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 await context.addInitScript(() => { window.FINANCE_CONSOLE_API_URL = 'http://127.0.0.1:8000'; });
 const writes=[]; const errors=[];
 const user={id:'example-owner',username:'Demo owner',role:'OWNER',can_view_all_outlets:true,outlets:[{id:'example-outlet',name:'Demo outlet'}]};
 const bodies={
  '/auth/setup-status':{has_users:true}, '/auth/me':{user}, '/auth/login':{token:'synthetic-test-token',user},
  '/dashboard':{sales:0,purchase:0,receivable:0,payable:0},
  '/retail-bills/next-number':{bill_number:'1'}, '/payment-receipts/next-number':{receipt_number:'1'},
  '/retail-bills':{results:[],has_more:false}, '/payment-receipts':{results:[]},
  '/retail-shortcuts':{results:[]}, '/inventory/by-item':{inventory:[]},
  '/party/profile':{party:{balance:0}}, '/auth/users':{users:[]}, '/outlets':{outlets:[]},
  '/items/tracked':{items:[]}, '/daily-sheet':{}, '/dressed-stock':{results:[]},
  '/party/directory':{results:[]}, '/party/search':{results:[]}
 };
 await context.route('**/*',async route=>{
  const request=route.request();const url=new URL(request.url());
  if(url.origin===origin)return route.continue();
  if(url.origin!=='http://127.0.0.1:8000') return route.fulfill({body:'',contentType:'text/javascript'});
  let data=bodies[url.pathname] || [];
  if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'*'}});
  if(request.method()==='POST'){
   const payload=request.headers()['content-type']?.includes('application/json') ? request.postDataJSON() : request.postData();
   writes.push({path:url.pathname,query:url.search,payload});
   if(url.pathname==='/retail-bills'){
    const total=payload.items.reduce((sum,item)=>sum+item.amount,0)+payload.ice_amount;
    data={bill:{...payload,id:'example-bill',total_amount:total,outstanding_amount:total-payload.paid_amount}};
   }else if(url.pathname==='/payment-receipts')data={receipt:{...payload,id:'example-receipt'}};
   else if(url.pathname.startsWith('/entries/')||url.pathname.startsWith('/upload/'))data={rows_inserted:1,rows_skipped:0};
  }
  await route.fulfill({json:data,headers:{'Access-Control-Allow-Origin':'*'}});
 });
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto(origin);await page.locator('#authForm').waitFor();
 await page.getByLabel('Username',{exact:true}).fill('example-user');
 await page.getByLabel('Password',{exact:true}).fill('synthetic-password');
 await page.getByLabel('Password',{exact:true}).press('Enter');
 await page.locator('.quick-actions').waitFor();
 assert.equal(writes.filter(x=>x.path==='/auth/login').length,1);
 console.log('PASS login by keyboard');
 const open=async name=>{await page.evaluate(name=>loadPage(name),name);await page.waitForTimeout(500);};
 for(const width of [1440,768,390,320]){
  await page.setViewportSize({width,height:1000});
  for(const name of ['dashboard','retail','upload','ledger','reports','analytics','daily-sheet','billing-setup','access-control']){
   await open(name);
   const state=await page.evaluate(()=>({
    overflow:document.documentElement.scrollWidth>innerWidth+1,
    duplicates:[...document.querySelectorAll('[id]')].map(n=>n.id).filter((id,i,ids)=>ids.indexOf(id)!==i),
    unlabelled:[...document.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(n=>n.getClientRects().length&&!n.labels?.length&&!n.getAttribute('aria-label')).map(n=>n.id||n.className)
   }));
   assert.equal(state.overflow,false,`${name} overflows at ${width}`);
   assert.deepEqual(state.duplicates,[],`${name}: duplicate IDs`);
   assert.deepEqual(state.unlabelled,[],`${name}: controls need labels`);
  }
 }
 console.log('PASS all 9 pages at desktop, tablet, and 2 phone widths');
 await page.setViewportSize({width:390,height:900});await open('upload');
 for(const mode of ['purchases','sales','payments','stock','setup']){
  const button=page.locator(`[data-entry-tab="${mode}"]`);await button.click();
  assert.equal(await button.getAttribute('aria-selected'),'true');
  assert.equal(await page.locator(`[data-entry-panel="${mode}"]`).first().isVisible(),true);
  const rect=await button.boundingBox();assert(rect.x>=0&&rect.x+rect.width<=391,'Entry task offscreen');
 }
 await page.locator('[data-entry-tab="purchases"]').click();
 await page.locator('.dealerParty').fill('Example supplier');await page.locator('.dealerItem').fill('BB');
 await page.locator('.dealerNag').fill('5');await page.locator('.dealerWeight').fill('10');await page.locator('.dealerRate').fill('100');
 await page.getByRole('button',{name:'Save purchases',exact:true}).click();
 await page.waitForTimeout(100);assert(writes.some(x=>x.path==='/entries/dealer'));
 await page.getByText('Import purchases from a file',{exact:true}).click();
 await page.locator('#dealerFile').setInputFiles({name:'synthetic.csv',mimeType:'text/csv',buffer:Buffer.from('DATE,PARTY\n2000-01-01,Example supplier')});
 await page.getByRole('button',{name:'Preview file',exact:true}).click();await page.waitForTimeout(100);
 assert(writes.some(x=>x.path==='/upload/dealer'&&x.query.includes('preview=true')));
 assert.equal(await page.locator('#dealerFile').evaluate(n=>n.files.length),1,'Preview must retain file');
 await page.getByRole('button',{name:'Import file',exact:true}).click();await page.waitForTimeout(100);
 assert(writes.some(x=>x.path==='/upload/dealer'&&!x.query.includes('preview=true')));
 await page.locator('[data-entry-tab="purchases"]').focus();await page.keyboard.press('ArrowRight');
 assert.equal(await page.locator('[data-entry-tab="sales"]').getAttribute('aria-selected'),'true');
 console.log('PASS daily entries, visible mobile tabs, file preview/import and keyboard tabs');
 await open('dashboard');await page.getByRole('button',{name:'Record payment',exact:true}).click();
 await page.waitForFunction(()=>document.getElementById('retailModePayment')?.getAttribute('aria-selected')==='true');
 assert.equal(await page.locator('#paymentReceiptSection').isVisible(),true);
 await page.locator('#paymentReceiptPartyName').fill('Example supplier');await page.locator('#paymentReceiptAmount').fill('75');
 await page.locator('#paymentReceiptDirection').selectOption('PAID');
 await page.getByRole('button',{name:'Save Receipt',exact:true}).click();await page.waitForTimeout(150);
 assert(writes.some(x=>x.path==='/payment-receipts'&&x.payload.direction==='PAID'&&x.payload.amount===75));
 console.log('PASS payment shortcut and payment direction/amount');
 await page.locator('#retailModeRegular').click();
 await page.locator('#retailRegularRows .retailItemName').fill('Example item');
 await page.locator('#retailRegularRows .retailWeight').fill('2');
 await page.locator('#retailRegularRows .retailRate').fill('100');
 await page.locator('#retailSettlementType').selectOption('partial');
 await page.locator('#retailPaidAmount').fill('50');
 await page.locator('#retailCustomerName').fill('Example customer');
 await page.getByText('More bill details · phone, address, cashier, ice & notes',{exact:true}).click();
 await page.locator('#retailNotes').fill('Synthetic note');await page.locator('#retailIceAmount').fill('10');
 await page.getByText('More bill details · phone, address, cashier, ice & notes',{exact:true}).click();
 await page.waitForTimeout(150);
 const totals=await page.locator('#billSummary strong').allTextContents();
 assert.deepEqual(totals,['₹ 210.00','₹ 50.00','₹ 160.00']);
 await page.getByRole('button',{name:'Save Bill',exact:true}).click();await page.waitForTimeout(200);
 const bill=writes.find(x=>x.path==='/retail-bills');
 assert(bill);assert.equal(bill.payload.items[0].amount,200);assert.equal(bill.payload.paid_amount,50);
 assert.equal(bill.payload.ice_amount,10);assert.equal(bill.payload.notes,'Synthetic note');
 console.log('PASS bill totals and optional field preservation in saved payload');
 await open('reports');await page.getByRole('button',{name:'This month',exact:true}).click();
 assert((await page.locator('#reportStartDate').inputValue()).endsWith('-01'));
 await page.locator('#reportType').selectOption('inventory');
 assert.equal(await page.locator('#reportDate').isVisible(),true);assert.equal(await page.locator('#reportStartDate').isVisible(),false);
 assert.equal(await page.locator('.date-shortcuts').isVisible(),false);
 assert.equal(await page.getByRole('button',{name:'Download Excel',exact:true}).isVisible(),true);
 assert.equal(await page.getByRole('button',{name:'Download PDF',exact:true}).isVisible(),true);
 assert.equal(await page.getByRole('button',{name:'Share Image',exact:true}).isVisible(),true);
 console.log('PASS report presets, single-day fields and export/share actions');
 // Verify that the offline shell actually includes every referenced local script/style.
 const html=fs.readFileSync(path.join(frontend,'index.html'),'utf8');const sw=fs.readFileSync(path.join(frontend,'sw.js'),'utf8');
 for(const match of html.matchAll(/(?:src|href)="((?:js|css)\/[^"?]+\?v=[^"]+)"/g))assert(sw.includes('./'+match[1]),`Offline shell missing ${match[1]}`);
 assert.deepEqual(errors,[],'Browser runtime errors');
 if(process.env.UI_SCREENSHOT_DIR){
  fs.mkdirSync(process.env.UI_SCREENSHOT_DIR,{recursive:true});
  for(const [name,width] of [['dashboard',1440],['retail',1440],['upload',390]]){
   await page.setViewportSize({width,height:1000});await open(name);
   await page.screenshot({path:path.join(process.env.UI_SCREENSHOT_DIR,`${name}-${width}.png`),fullPage:true});
  }
 }
 console.log('PASS offline asset inventory and no browser runtime errors');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>server.close());
