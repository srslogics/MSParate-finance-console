/* Owner-managed fixed monthly salary. Attendance never changes pay automatically. */
function renderStaffPage(content) {
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money = value => Number(value || 0).toLocaleString('en-IN', {style:'currency', currency:'INR'});
  const today = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Kolkata',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const statuses = {'':'Not marked',PRESENT:'Present',ABSENT:'Absent',HALF_DAY:'Half day',PAID_LEAVE:'Paid leave',WEEKLY_OFF:'Weekly off'};
  let employees = [], monthData = {rows:[],payments:[]}, editing = null, selectedSalary = null, paymentAttempt = null;
  let requestVersion = 0, busy = false;
  content.innerHTML = `<div class="staff-page">
    <div class="staff-intro"><h2>Your team, in one place</h2><p>Mark attendance, review monthly salary and record payments in hisab.</p></div>
    <nav class="staff-tabs" aria-label="Staff sections"><button type="button" data-staff-tab="attendance" aria-pressed="true">Attendance</button><button type="button" data-staff-tab="salary" aria-pressed="false">Monthly salary</button><button type="button" data-staff-tab="team" aria-pressed="false">Staff members</button></nav>
    <p class="staff-message" role="status" aria-live="polite"></p>
    <section data-staff-panel="attendance" class="staff-card"><div class="staff-heading"><div><h3>Daily attendance</h3><p>Unmarked days remain unmarked. Attendance does not deduct salary.</p></div><label>Attendance date<input id="staffDay" type="date" value="${today}" max="${today}" required></label></div>
      <form id="staffAttendance"><div id="staffAttendanceRows">Loading staff…</div><button class="staff-primary" type="submit">Save attendance</button></form></section>
    <section data-staff-panel="salary" hidden><div class="staff-card staff-heading"><div><h3>Monthly salary</h3><p>Fixed salary + extras − deductions. Record each payment when it is given.</p></div><label>Salary month<input id="staffMonth" type="month" value="${today.slice(0,7)}" max="${today.slice(0,7)}" required></label></div>
      <div id="staffSalaryList" class="staff-card"></div>
      <form id="staffSalaryForm" class="staff-card" hidden><h3 id="staffSalaryTitle">Review salary</h3><p id="staffSalaryAttendance"></p><div class="staff-fields"><label>Monthly salary (₹)<input name="base_salary" type="number" min="0" max="10000000" step="0.01" required></label><label>Extras (₹)<input name="extras" type="number" min="0" max="10000000" step="0.01" required></label><label>Deductions (₹)<input name="deductions" type="number" min="0" max="10000000" step="0.01" required></label><label class="staff-wide">Notes for extras or deductions<textarea name="notes" maxlength="500" rows="2"></textarea></label></div><p id="staffNetPreview"></p><button type="submit" class="staff-primary">Save salary</button></form>
      <form id="staffPayForm" class="staff-card" hidden><h3 id="staffPayTitle">Record salary payment</h3><p>Only record money actually given. This adds a salary expense to hisab on the payment date.</p><div class="staff-fields"><label>Amount paid (₹)<input name="amount" type="number" min="0.01" step="0.01" required></label><label>Payment date<input name="date" type="date" value="${today}" max="${today}" required></label><label>Paid by<select name="payment_mode" aria-label="Paid by"><option>Cash</option><option>Online</option><option>Bank</option></select></label><label class="staff-wide">Payment note (optional)<textarea name="notes" maxlength="500" rows="2"></textarea></label></div><button type="submit" class="staff-primary">Record salary payment</button></form>
      <div class="staff-card"><h3>Payments for this salary month</h3><div id="staffPaymentHistory"></div></div>
    </section>
    <section data-staff-panel="team" hidden><form id="staffEmployeeForm" class="staff-card"><h3 id="staffEmployeeTitle">Add a staff member</h3><div class="staff-fields"><label>Staff name<input name="name" maxlength="100" required></label><label>Phone (optional)<input name="phone" type="tel" maxlength="30"></label><label>Role (optional)<input name="designation" maxlength="100" placeholder="e.g. Counter staff"></label><label>Fixed monthly salary (₹)<input name="monthly_salary" type="number" min="0" max="10000000" step="0.01" required></label><label>Joining date<input name="joined_on" type="date" value="${today}" required></label><label class="staff-check"><input name="is_active" type="checkbox" checked>Currently working</label></div><div class="staff-actions"><button class="staff-primary" type="submit">Save staff member</button><button id="staffCancelEdit" type="button" hidden>Cancel edit</button></div><p>Changing the fixed salary applies to months that have not been saved yet. Saved salary records stay unchanged.</p></form><div class="staff-card"><h3>Staff members</h3><div id="staffTeamList"></div></div></section>
  </div>`;
  const root = content.querySelector('.staff-page');
  const $ = selector => root.querySelector(selector);
  const alive = () => root.isConnected;
  const message = (text, error=false) => { if (alive()) { $('.staff-message').textContent = text; $('.staff-message').classList.toggle('is-error',error); } };
  const api = (path, method='GET', body=null) => apiCall('/staff'+path,method,body ? JSON.stringify(body) : null,{'Content-Type':'application/json'});
  const field = (form, name) => form.elements.namedItem(name);
  function resetEmployee() { editing = null; $('#staffEmployeeForm').reset(); field($('#staffEmployeeForm'),'joined_on').disabled=false; $('#staffEmployeeTitle').textContent='Add a staff member'; $('#staffCancelEdit').hidden=true; }
  async function save(action, success) {
    if (busy) return;
    busy = true;
    message('Saving…');
    root.querySelectorAll('button,input,select,textarea').forEach(el => {el.dataset.staffDisabled = String(el.disabled); el.disabled=true;});
    try { await action(); clearOperationalCaches(); message(success); }
    catch (error) { message(error.message || 'Could not save. Please try again.',true); }
    finally { busy=false; if(alive()) {root.querySelectorAll('[data-staff-disabled]').forEach(el=>{el.disabled=el.dataset.staffDisabled==='true';delete el.dataset.staffDisabled;});field($('#staffEmployeeForm'),'joined_on').disabled=!!editing;} }
  }
  async function loadAttendance() {
    const version=++requestVersion;
    $('#staffAttendanceRows').textContent='Loading attendance…';
    $('#staffAttendance button').disabled=true;
    const data=await api('/attendance?date='+$('#staffDay').value);
    if(!alive() || version!==requestVersion)return;
    $('#staffAttendanceRows').innerHTML=data.rows.length ? data.rows.map(row=>`<div class="staff-attendance-row" data-employee="${esc(row.employee.id)}"><strong>${esc(row.employee.name)}</strong><label><span class="staff-sr">Attendance for ${esc(row.employee.name)}</span><select data-status aria-label="Attendance for ${esc(row.employee.name)}">${Object.entries(statuses).map(([value,label])=>`<option value="${value}" ${row.status===value?'selected':''}>${label}</option>`).join('')}</select></label><label><span class="staff-sr">Note for ${esc(row.employee.name)}</span><input data-note value="${esc(row.notes)}" maxlength="300" placeholder="Note (optional)"></label></div>`).join('') : '<p>Add a staff member to start marking attendance. Only staff who have joined by this date appear here.</p>';
    $('#staffAttendance button').disabled=!data.rows.length;
  }
  async function loadTeam() {
    const data=await api('/employees');if(!alive())return;employees=data.employees;
    $('#staffTeamList').innerHTML=employees.length ? employees.map(e=>`<div class="staff-summary-row"><div><strong>${esc(e.name)}</strong><p>${esc(e.designation || 'Staff')} · ${e.is_active?'Working':'Inactive'}${e.phone?' · '+esc(e.phone):''}</p></div><div><strong>${money(e.monthly_salary)} / month</strong><button type="button" data-edit="${esc(e.id)}">Edit <span class="staff-sr">${esc(e.name)}</span></button></div></div>`).join('') : '<p>No staff members yet. Add your first staff member above.</p>';
  }
  function hideSalaryForms(){selectedSalary=null;$('#staffSalaryForm').hidden=true;$('#staffPayForm').hidden=true;paymentAttempt=null;}
  async function loadSalaries() {
    const version=++requestVersion, month=$('#staffMonth').value;
    $('#staffSalaryList').textContent='Loading salaries…';
    $('#staffPaymentHistory').textContent='Loading payments…';
    const data=await api('/salaries?month='+month);if(!alive()||version!==requestVersion)return;
    monthData=data;hideSalaryForms();
    $('#staffSalaryList').innerHTML=data.rows.length ? data.rows.map(({employee:e,salary:s})=>`<div class="staff-summary-row"><div><strong>${esc(e.name)}</strong><p>${s.id?'Saved salary':'Not prepared'} · Net ${money(s.net_salary)}</p><p>Paid ${money(s.paid)} · <strong>Remaining ${money(s.balance)}</strong></p></div><div class="staff-actions"><button type="button" data-salary="${esc(e.id)}">${s.id?'Review':'Prepare'} salary<span class="staff-sr"> for ${esc(e.name)}</span></button>${s.id&&s.balance>0?`<button type="button" class="staff-primary" data-pay="${esc(e.id)}">Pay salary<span class="staff-sr"> to ${esc(e.name)}</span></button>`:''}</div></div>`).join('') : '<p>No staff members for this month. Add a staff member under Staff members.</p>';
    $('#staffPaymentHistory').innerHTML=data.payments.length ? data.payments.map(p=>`<div class="staff-summary-row"><div><strong>${esc(p.name)}</strong><p>${esc(p.date)} · ${esc(p.payment_mode)}</p>${p.notes?`<p>${esc(p.notes)}</p>`:''}</div><strong>${money(p.amount)}</strong></div>`).join('') : '<p>No salary payments recorded for this month.</p>';
  }
  async function showTab(tab) {
    root.querySelectorAll('[data-staff-tab]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.staffTab===tab)));
    root.querySelectorAll('[data-staff-panel]').forEach(panel=>panel.hidden=panel.dataset.staffPanel!==tab);
    message('');++requestVersion;
    try { if(tab==='attendance') await loadAttendance(); else if(tab==='team') await loadTeam(); else await loadSalaries(); }
    catch(error){message(error.message,true);}
  }
  root.querySelectorAll('[data-staff-tab]').forEach(button=>button.onclick=()=>showTab(button.dataset.staffTab));
  $('#staffDay').onchange=()=>loadAttendance().catch(error=>message(error.message,true));
  $('#staffMonth').onchange=()=>{hideSalaryForms();loadSalaries().catch(error=>message(error.message,true));};
  $('#staffCancelEdit').onclick=resetEmployee;
  $('#staffEmployeeForm').onsubmit=event=>{event.preventDefault();const form=event.currentTarget;const payload=Object.fromEntries(new FormData(form));payload.joined_on=field(form,'joined_on').value;payload.is_active=field(form,'is_active').checked;
    save(async()=>{await api(editing?'/employees/'+editing:'/employees',editing?'PUT':'POST',payload);resetEmployee();await loadTeam();},'Staff member saved.');};
  $('#staffTeamList').onclick=event=>{const button=event.target.closest('[data-edit]');if(!button)return;const e=employees.find(e=>e.id===button.dataset.edit);editing=e.id;const form=$('#staffEmployeeForm');for(const key of ['name','phone','designation','monthly_salary','joined_on'])field(form,key).value=e[key];field(form,'is_active').checked=e.is_active;field(form,'joined_on').disabled=true;$('#staffEmployeeTitle').textContent='Edit '+e.name;$('#staffCancelEdit').hidden=false;form.scrollIntoView({block:'start',behavior:'smooth'});};
  $('#staffAttendance').onsubmit=event=>{event.preventDefault();const payload={date:$('#staffDay').value,rows:[...root.querySelectorAll('[data-employee]')].map(row=>({employee_id:row.dataset.employee,status:row.querySelector('[data-status]').value,notes:row.querySelector('[data-note]').value}))};if(!payload.rows.length)return;save(()=>api('/attendance','PUT',payload),'Attendance saved.');};
  function previewNet(){const form=$('#staffSalaryForm');const net=Number(field(form,'base_salary').value)+Number(field(form,'extras').value)-Number(field(form,'deductions').value);$('#staffNetPreview').textContent='Net salary: '+money(net);field(form,'notes').required=Number(field(form,'extras').value)>0||Number(field(form,'deductions').value)>0;}
  $('#staffSalaryForm').oninput=previewNet;
  $('#staffSalaryList').onclick=event=>{const button=event.target.closest('[data-salary],[data-pay]');if(!button)return;const row=monthData.rows.find(row=>row.employee.id===(button.dataset.salary||button.dataset.pay));hideSalaryForms();selectedSalary=row;const {employee:e,salary:s}=row;
    if(button.dataset.salary){const form=$('#staffSalaryForm');form.hidden=false;$('#staffSalaryTitle').textContent='Salary for '+e.name;for(const key of ['base_salary','extras','deductions','notes'])field(form,key).value=s[key];$('#staffSalaryAttendance').textContent='Attendance this month: '+(Object.entries(row.attendance).map(([status,count])=>`${statuses[status]} ${count}`).join(' · ')||'Not marked')+'. No automatic deductions.';previewNet();form.scrollIntoView({block:'start',behavior:'smooth'});}
    else{const form=$('#staffPayForm');form.reset();form.hidden=false;$('#staffPayTitle').textContent='Pay '+e.name+' · Remaining '+money(s.balance);field(form,'amount').value=s.balance;field(form,'amount').max=s.balance;field(form,'date').min=e.joined_on>monthData.month+'-01'?e.joined_on:monthData.month+'-01';form.scrollIntoView({block:'start',behavior:'smooth'});}
  };
  $('#staffSalaryForm').onsubmit=event=>{event.preventDefault();const payload={...Object.fromEntries(new FormData(event.currentTarget)),month:monthData.month};const id=selectedSalary.employee.id;save(async()=>{await api('/salaries/'+id,'PUT',payload);await loadSalaries();},'Salary saved. Use Pay salary when you give the money.');};
  $('#staffPayForm').onsubmit=event=>{event.preventDefault();const payload={...Object.fromEntries(new FormData(event.currentTarget)),salary_id:selectedSalary.salary.id};const fingerprint=JSON.stringify(payload);if(!paymentAttempt||paymentAttempt.fingerprint!==fingerprint)paymentAttempt={fingerprint,request_id:crypto.randomUUID()};payload.request_id=paymentAttempt.request_id;
    save(async()=>{await api('/payments','POST',payload);await loadSalaries();},'Salary payment recorded in hisab.');};
  showTab('attendance');
}
