// Synthetic payroll workflow; run after production_api_check.py on its disposable DB.
const assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const origin=process.env.AUDIT_BASE_URL||'http://127.0.0.1:8019';
 assert(['localhost','127.0.0.1'].includes(new URL(origin).hostname));
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
  const page=await browser.newPage({viewport:{width:390,height:900}});
  const employeeName='Synthetic browser employee '+Date.now();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);await page.getByLabel('Username',{exact:true}).fill('audit_owner');
  await page.getByLabel('Password',{exact:true}).fill('local-test-password');await page.getByLabel('Password',{exact:true}).press('Enter');
  await page.locator('.quick-actions').waitFor();
  const before=await page.evaluate(async()=>{const day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());return (await apiCall('/dashboard?date='+day)).salary_paid;});
  await page.evaluate(()=>loadPage('staff'));
  await page.getByRole('button',{name:'Staff members',exact:true}).click();
  await page.getByLabel('Staff name',{exact:true}).fill(employeeName);
  await page.getByLabel('Fixed monthly salary (₹)',{exact:true}).fill('10000');
  await page.getByLabel('Joining date',{exact:true}).fill('2026-09-01');
  await page.getByRole('button',{name:'Save staff member',exact:true}).click();
  await page.getByText('Staff member saved.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Attendance',exact:true}).click();
  await page.getByLabel('Attendance for '+employeeName,{exact:true}).selectOption('HALF_DAY');
  await page.getByRole('button',{name:'Save attendance',exact:true}).click();
  await page.getByText('Attendance saved.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Monthly salary',exact:true}).click();
  await page.getByRole('button',{name:'Prepare salary for '+employeeName,exact:true}).click();
  await page.getByLabel('Extras (₹)',{exact:true}).fill('500');
  await page.getByLabel('Deductions (₹)',{exact:true}).fill('200');
  await page.getByLabel('Notes for extras or deductions',{exact:true}).fill('Synthetic monthly adjustment');
  await page.getByRole('button',{name:'Save salary',exact:true}).click();
  await page.getByText('Salary saved. Use Pay salary when you give the money.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Pay salary to '+employeeName,exact:true}).click();
  await page.getByLabel('Amount paid (₹)',{exact:true}).fill('3000');
  await page.getByRole('button',{name:'Record salary payment',exact:true}).click();
  await page.getByText('Salary payment recorded in hisab.',{exact:true}).waitFor();
  const row=page.locator('#staffSalaryList .staff-summary-row').filter({hasText:employeeName});
  assert.match(await row.innerText(),/7,300/);
  await page.getByRole('button',{name:'Pay salary to '+employeeName,exact:true}).click();
  assert.equal(await page.getByLabel('Amount paid (₹)',{exact:true}).inputValue(),'7300');
  await page.getByLabel('Paid by',{exact:true}).selectOption('Bank');
  await page.getByRole('button',{name:'Record salary payment',exact:true}).click();
  await page.getByText('Salary payment recorded in hisab.',{exact:true}).waitFor();
  assert.equal(await row.getByRole('button',{name:/Pay salary/}).count(),0);
  for (const width of [320,390,768,1440]) {
   await page.setViewportSize({width,height:900});
   for(const tab of ['Attendance','Monthly salary','Staff members']) {
    await page.getByRole('button',{name:tab,exact:true}).click();await page.waitForTimeout(150);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${tab} overflow at ${width}`);
   }
  }
  await page.evaluate(()=>loadPage('daily-sheet'));await page.getByText('Salary hisab',{exact:true}).waitFor();
  const expected=await page.evaluate(amount=>formatMoneyCompact(amount),before+10300);
  assert((await page.locator('#content').innerText()).includes(expected));
  assert.deepEqual(errors,[]);
  console.log('PASS staff creation, attendance, salary adjustments, two partial payments, hisab and responsive staff screens');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
