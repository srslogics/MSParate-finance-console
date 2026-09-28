import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = name => fs.readFileSync(new URL(`../frontend/${name}`, import.meta.url), 'utf8');
test('hosted frontend uses its own origin even with old browser configuration', () => {
 const context = {window:{location:{protocol:'https:',origin:'https://example.invalid'}},localStorage:{getItem:()=> 'https://old.invalid'}};
 vm.createContext(context);vm.runInContext(source('js/api.js'),context);
 assert.equal(vm.runInContext('BASE_URL',context),'https://example.invalid');
});
test('service worker leaves business and auth responses out of caches', () => {
 const handlers = {};
 const context = {URL,self:{location:{origin:'https://example.invalid'},addEventListener:(name,fn)=>handlers[name]=fn}};
 vm.createContext(context);vm.runInContext(source('sw.js'),context);
 for(const pathname of ['/dashboard','/auth/me','/retail-bills','/party/ledger','/reports/export','/healthz']){
  handlers.fetch({request:{method:'GET',url:'https://example.invalid'+pathname,mode:'navigate',headers:{get:()=> 'text/html'}},respondWith:()=>assert.fail('API response intercepted')});
 }
});
