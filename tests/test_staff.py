from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID, uuid4
import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from app import models, staff

DAY = date(2026, 9, 29)
MONTH = '2026-09'

@pytest.fixture
def team(db, monkeypatch):
    monkeypatch.setattr(staff, 'today', lambda: date(2026, 10, 6))
    outlet = models.Outlet(name='Synthetic payroll outlet')
    other = models.Outlet(name='Synthetic other outlet')
    owner = models.User(username='synthetic-owner', password_hash='not-a-real-password', role='OWNER')
    db.add_all([outlet, other, owner]); db.commit()
    employee = staff.create_employee(staff.EmployeeInput(name='Synthetic employee',monthly_salary=12000,joined_on='2026-09-01'),db,outlet,owner)['employee']
    return outlet, other, owner, UUID(employee['id'])

def prepare(db, team, **changes):
    outlet, _, owner, employee_id = team
    return staff.save_salary(employee_id,staff.SalaryInput(**dict({'month':MONTH,'base_salary':12000},**changes)),db,outlet,owner)['salary']

def payment(salary, **changes):
    return staff.PaymentInput(**dict({'request_id':uuid4(),'salary_id':salary['id'],'date':DAY,'amount':4000,'payment_mode':'Cash'},**changes))

def test_attendance_has_no_automatic_salary_deduction(db, team):
    outlet,_,owner,e = team
    for index,status in enumerate(sorted(staff.STATUSES)):
        staff.save_attendance(staff.AttendanceInput(date=DAY-timedelta(days=index),rows=[{'employee_id':e,'status':status}]),db,outlet,owner)
    rows = staff.salary_month_view(MONTH,db,outlet)['rows']
    assert rows[0]['salary']['net_salary'] == 12000
    assert rows[0]['attendance'] == {status:1 for status in staff.STATUSES}
    assert db.query(models.Transaction).count() == 0
    staff.save_attendance(staff.AttendanceInput(date=DAY,rows=[{'employee_id':e,'status':''}]),db,outlet,owner)
    assert staff.attendance_view(DAY,db,outlet)['rows'][0]['status'] == ''
    assert db.query(models.StaffAttendance).count() == 4

@pytest.mark.parametrize('day,status',[('2026-10-07','PRESENT'),('2026-08-31','PRESENT'),('2026-09-29','invalid')])
def test_reject_invalid_attendance(db,team,day,status):
    outlet,_,owner,e=team
    with pytest.raises(HTTPException):
        staff.save_attendance(staff.AttendanceInput(date=day,rows=[{'employee_id':e,'status':status}]),db,outlet,owner)
    assert db.query(models.StaffAttendance).count()==0

def test_attendance_outlet_and_batch_validation(db,team):
    outlet,other,owner,e=team
    other_e=staff.create_employee(staff.EmployeeInput(name='Other employee',monthly_salary=5000,joined_on=DAY),db,other,owner)['employee']
    for rows in [[{'employee_id':e,'status':'PRESENT'}]*2,[{'employee_id':e,'status':'PRESENT'},{'employee_id':other_e['id'],'status':'PRESENT'}]]:
        with pytest.raises(HTTPException):
            staff.save_attendance(staff.AttendanceInput(date=DAY,rows=rows),db,outlet,owner)
        db.rollback()
        assert db.query(models.StaffAttendance).count()==0

def test_partial_payments_deduplicate_and_post_expense_only(db,team):
    outlet,other,owner,e=team
    salary=prepare(db,team,extras=500,deductions=250,notes='Bonus and agreed deduction')
    assert salary['net_salary']==12250
    first=payment(salary)
    for _ in range(2):
        result=staff.pay_salary(first,db,outlet,owner)
        assert result['salary']['paid']==4000 and result['salary']['balance']==8250
    assert db.query(models.Transaction).count()==1
    txn=db.query(models.Transaction).one()
    assert (txn.type,txn.category,txn.party_id,txn.amount,txn.date)==('EXPENSE','STAFF SALARY',None,Decimal(4000),DAY)
    with pytest.raises(HTTPException) as error:
        staff.pay_salary(first.model_copy(update={'amount':Decimal(1)}),db,outlet,owner)
    assert error.value.status_code==409
    with pytest.raises(HTTPException) as error:
        staff.pay_salary(payment(salary),db,other,owner)
    assert error.value.status_code==404
    with pytest.raises(HTTPException):
        staff.pay_salary(payment(salary,amount=8251),db,outlet,owner)
    second=staff.pay_salary(payment(salary,amount=8250,date='2026-10-05',payment_mode='Bank'),db,outlet,owner)
    assert second['salary']['balance']==0
    assert len(staff.salary_month_view(MONTH,db,outlet)['payments'])==2
    assert db.query(models.Party).count()==0

@pytest.mark.parametrize('changes',[{'deductions':13000,'notes':'too much'},{'extras':1},{'month':'2026-08'},{'month':'2026-11'},{'month':'bad'}])
def test_salary_validation(db,team,changes):
    with pytest.raises(HTTPException):prepare(db,team,**changes)
    assert db.query(models.StaffSalary).count()==0

@pytest.mark.parametrize('changes',[{'date':'2026-10-07'},{'date':'2026-08-31'},{'payment_mode':'invalid'}])
def test_payment_validation(db,team,changes):
    outlet,_,owner,_=team
    salary=prepare(db,team)
    with pytest.raises(HTTPException):staff.pay_salary(payment(salary,**changes),db,outlet,owner)
    assert db.query(models.Transaction).count()==0

@pytest.mark.parametrize('amount',['NaN','Infinity','-1','0','1.001','10000001'])
def test_payment_money_validation(amount):
    with pytest.raises(ValidationError):payment({'id':uuid4()},amount=amount)

def test_saved_month_snapshot_and_cannot_reduce_below_paid(db,team):
    outlet,_,owner,e=team
    salary=prepare(db,team)
    staff.pay_salary(payment(salary),db,outlet,owner)
    staff.update_employee(e,staff.EmployeeInput(name='Synthetic renamed employee',monthly_salary=15000,joined_on='2026-09-01',is_active=False),db,outlet,owner)
    row=staff.salary_month_view(MONTH,db,outlet)['rows'][0]
    assert row['salary']['base_salary']==12000
    assert row['salary']['paid']==4000
    with pytest.raises(HTTPException):prepare(db,team,deductions=9000,notes='Too large')
    assert staff.salary_month_view(MONTH,db,outlet)['rows'][0]['salary']['net_salary']==12000
    # Inactive staff with saved records remain visible for final settlement.
    staff.pay_salary(payment(salary,amount=8000),db,outlet,owner)
    assert staff.salary_month_view(MONTH,db,outlet)['rows'][0]['salary']['balance']==0

def test_hisab_uses_payment_date_and_outlet(db,team,endpoints):
    outlet,other,owner,_=team
    salary=prepare(db,team)
    staff.pay_salary(payment(salary),db,outlet,owner)
    staff.pay_salary(payment(salary,date='2026-10-05',amount=8000,payment_mode='Bank'),db,outlet,owner)
    scope={'mode':'single','selected':outlet}
    assert endpoints['salary_expense_total'](db,scope,DAY,DAY)==4000
    assert endpoints['salary_expense_total'](db,{'mode':'single','selected':other})==0
    dashboard=endpoints['get_dashboard'](str(DAY),db,scope)
    assert dashboard['salary_paid']==4000 and dashboard['payments_paid']==4000
    summary=endpoints['analytics_summary'](str(DAY),'2026-10-05',db,scope)
    assert summary['salary_paid']==12000 and summary['net_cash']==-12000
    modes=endpoints['payment_modes'](str(DAY),'2026-10-05',db,scope)
    assert sum(row['paid'] for row in modes)==12000
    sheet=endpoints['daily_sheet'](str(DAY),'stock',db,owner,scope)
    assert sheet['salary_hisab']['paid']==4000
    report=endpoints['export_report']('summary',file_format='json',start_date=str(DAY),end_date='2026-10-05',db=db,scope=scope)
    assert [row['Salary Paid'] for row in report['rows']]==[4000,8000]
    assert [row['Payment Paid'] for row in report['rows']]==[4000,8000]
