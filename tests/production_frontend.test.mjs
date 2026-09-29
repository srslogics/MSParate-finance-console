import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import {randomUUID} from 'node:crypto';
const source = name => fs.readFileSync(new URL(`../frontend/js/${name}.js`, import.meta.url),'utf8');
function retailContext(){
 const storage=new Map();let outlet='outlet-a';
 const ctx=vm.createContext({console,crypto:{randomUUID},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},getSelectedOutletId:()=>outlet,
 escapeHtml:value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'),setTimeout,clearTimeout});
 vm.runInContext(source('retail'),ctx);
 return {ctx,storage,setOutlet:id=>outlet=id};
}
test('uncertain document retries keep both identity and exact payload, even as clock advances',()=>{
 const {ctx}=retailContext();
 const a=ctx.attachDocumentRequest('receipt',{amount:10,time:'10:00:00'});
 const b=ctx.attachDocumentRequest('receipt',{amount:10,time:'10:00:05'});
 assert.equal(a.request_id,b.request_id);assert.equal(JSON.stringify(a),JSON.stringify(b));
 assert.notEqual(ctx.attachDocumentRequest('receipt',{amount:20}).request_id,a.request_id);
});
test('offline queues are isolated by both user and outlet',()=>{
 const {ctx,storage,setOutlet}=retailContext();
 storage.set('FINANCE_CONSOLE_AUTH_USER',JSON.stringify({id:'user-a'}));
 ctx.setPendingRetailBills([{id:'local-test'}]);assert.equal(ctx.getPendingRetailBills().length,1);
 setOutlet('outlet-b');assert.equal(ctx.getPendingRetailBills().length,0);
 setOutlet('outlet-a');storage.set('FINANCE_CONSOLE_AUTH_USER',JSON.stringify({id:'user-b'}));assert.equal(ctx.getPendingRetailBills().length,0);
});
test('double save and sync clicks share one in-flight operation',async()=>{
 const {ctx}=retailContext();
 for(const [outer,inner] of [['saveRetailBill','performSaveRetailBill'],['savePaymentReceipt','performSavePaymentReceipt'],['syncPendingRetailBills','performSyncPendingRetailBills']]){
 let calls=0;let resolve;ctx[inner]=()=>{calls++;return new Promise(r=>resolve=r);};
 const one=ctx[outer]();const two=ctx[outer]();assert.equal(one,two);assert.equal(calls,1);
 resolve('saved');assert.equal(await one,'saved');
 }
});
test('write failures are never blindly retried; deduplicated documents and reads may retry',async()=>{
 let calls=0;
 const ctx=vm.createContext({console,Map,window:{location:{protocol:'http:',origin:'http://localhost'}},fetch:async()=>{calls++;throw new Error('network');},setTimeout:fn=>fn()});
 vm.runInContext(source('api'),ctx);
 await assert.rejects(ctx.fetchWithRetry('/entries/payment',{method:'POST'}));assert.equal(calls,1);
 calls=0;await assert.rejects(ctx.fetchWithRetry('/retail-bills',{method:'POST',headers:{'Idempotency-Key':'example'}}));assert.equal(calls,3);
 calls=0;await assert.rejects(ctx.fetchWithRetry('/dashboard',{method:'GET'}));assert.equal(calls,3);
});
test('receipt follows reference, retains exact totals, escapes data and labels piece quantities',()=>{
 const {ctx}=retailContext();
 const html=ctx.getRetailReceiptMarkup({date:'2026-09-29',time:'16:16:00',bill_number:'TEST',items:[{item_name:'<img src=x onerror=alert(1)>',unit:'PCS',quantity:2,rate:5.25,amount:10.5}],total_amount:10.5,paid_amount:10.5});
 for(const text of ['M. S. PARTE','CHICKEN SHOP','FSSAI LIC. NO.','NAG','AMOUNT','NAG: 2','₹10.50','TOTAL ROUNDOFF: 0.00','WE LOOK FORWARD TO YOUR NEXT VISIT','29/09/26'])assert(html.includes(text),text);
 assert(!html.includes('<img src=x'));assert(!html.includes('TAX INVOICE'));
});
