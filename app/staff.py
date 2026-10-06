"""Owner-managed attendance and fixed monthly payroll; paid salary posts to hisab."""
from datetime import date, datetime
from decimal import Decimal
from uuid import UUID, uuid4
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from app import models

STATUSES = {"PRESENT", "ABSENT", "HALF_DAY", "PAID_LEAVE", "WEEKLY_OFF"}
MODES = {"Cash", "Online", "Bank"}
ZERO = Decimal("0.00")


def today():
    return datetime.now(ZoneInfo("Asia/Kolkata")).date()


def month_date(value):
    try:
        result = date.fromisoformat(value + "-01")
        if len(value) != 7:
            raise ValueError()
        return result
    except (ValueError, TypeError):
        raise HTTPException(422, "Choose a valid salary month")


def next_month(value):
    return date(value.year + (value.month == 12), value.month % 12 + 1, 1)


class EmployeeInput(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    phone: str = Field(default="", max_length=30)
    designation: str = Field(default="", max_length=100)
    monthly_salary: Decimal = Field(ge=0, le=10000000, decimal_places=2)
    joined_on: date
    is_active: bool = True


class AttendanceRow(BaseModel):
    employee_id: UUID
    status: str
    notes: str = Field(default="", max_length=300)


class AttendanceInput(BaseModel):
    date: date
    rows: list[AttendanceRow] = Field(min_length=1, max_length=500)


class SalaryInput(BaseModel):
    month: str
    base_salary: Decimal = Field(ge=0, le=10000000, decimal_places=2)
    extras: Decimal = Field(default=0, ge=0, le=10000000, decimal_places=2)
    deductions: Decimal = Field(default=0, ge=0, le=10000000, decimal_places=2)
    notes: str = Field(default="", max_length=500)


class PaymentInput(BaseModel):
    request_id: UUID
    salary_id: UUID
    date: date
    amount: Decimal = Field(gt=0, le=10000000, decimal_places=2)
    payment_mode: str
    notes: str = Field(default="", max_length=500)


def employee_dict(employee):
    return {"id": str(employee.id), "name": employee.name, "phone": employee.phone or "",
            "designation": employee.designation or "", "monthly_salary": float(employee.monthly_salary),
            "joined_on": str(employee.joined_on), "is_active": employee.is_active == "true"}


def salary_paid(db, salary_id):
    return Decimal(db.query(func.coalesce(func.sum(models.StaffSalaryPayment.amount), 0)).filter_by(salary_id=salary_id).scalar() or 0)


def salary_dict(salary, paid=ZERO):
    net = salary.base_salary + salary.extras - salary.deductions
    return {"id": str(salary.id), "month": salary.month.strftime("%Y-%m"),
            "base_salary": float(salary.base_salary), "extras": float(salary.extras),
            "deductions": float(salary.deductions), "notes": salary.notes or "",
            "net_salary": float(net), "paid": float(paid), "balance": float(net - paid)}


def payment_dict(payment, employee, salary):
    return {"id": str(payment.id), "employee_id": str(employee.id), "name": employee.name,
            "month": salary.month.strftime("%Y-%m"), "date": str(payment.date),
            "amount": float(payment.amount), "payment_mode": payment.payment_mode, "notes": payment.notes or ""}


def get_employee(db, employee_id, outlet_id, lock=False):
    query = db.query(models.Employee).filter_by(id=employee_id, outlet_id=outlet_id)
    if lock:
        query = query.with_for_update()
    employee = query.first()
    if not employee:
        raise HTTPException(404, "Staff member not found in this outlet")
    return employee


def create_employee(payload, db, outlet, user):
    if not payload.name.strip():
        raise HTTPException(422, "Enter the staff member's name")
    employee = models.Employee(id=uuid4(), outlet_id=outlet.id, name=payload.name.strip(),
        phone=payload.phone.strip(), designation=payload.designation.strip(), monthly_salary=payload.monthly_salary,
        joined_on=payload.joined_on, is_active="true" if payload.is_active else "false")
    db.add(employee)
    db.commit()
    return {"employee": employee_dict(employee)}


def update_employee(employee_id, payload, db, outlet, user):
    employee = get_employee(db, employee_id, outlet.id, lock=True)
    if payload.joined_on != employee.joined_on:
        raise HTTPException(422, "Joining date cannot change after staff creation")
    if not payload.name.strip():
        raise HTTPException(422, "Enter the staff member's name")
    employee.name = payload.name.strip()
    employee.phone = payload.phone.strip()
    employee.designation = payload.designation.strip()
    employee.monthly_salary = payload.monthly_salary
    employee.is_active = "true" if payload.is_active else "false"
    db.commit()
    return {"employee": employee_dict(employee)}


def attendance_view(day, db, outlet):
    if day > today():
        raise HTTPException(422, "Attendance cannot be marked for a future date")
    employees = db.query(models.Employee).filter_by(outlet_id=outlet.id).filter(models.Employee.joined_on <= day).order_by(models.Employee.name).all()
    records = {row.employee_id: row for row in db.query(models.StaffAttendance).join(models.Employee).filter(models.Employee.outlet_id == outlet.id, models.StaffAttendance.date == day).all()}
    return {"date": str(day), "rows": [{"employee": employee_dict(e), "status": records[e.id].status if e.id in records else "",
              "notes": records[e.id].notes or "" if e.id in records else ""} for e in employees if e.is_active == "true" or e.id in records]}


def save_attendance(payload, db, outlet, user):
    if payload.date > today():
        raise HTTPException(422, "Attendance cannot be marked for a future date")
    if len({r.employee_id for r in payload.rows}) != len(payload.rows):
        raise HTTPException(422, "Each staff member can appear only once")
    # Lock employees in a stable order; validate every row before writing anything.
    employees = {}
    for row in sorted(payload.rows, key=lambda r: str(r.employee_id)):
        e = get_employee(db, row.employee_id, outlet.id, lock=True)
        if payload.date < e.joined_on or row.status not in STATUSES | {""}:
            raise HTTPException(422, "Invalid attendance status or date before joining")
        employees[e.id] = e
    for row in payload.rows:
        record = db.query(models.StaffAttendance).filter_by(employee_id=row.employee_id, date=payload.date).first()
        if not row.status:
            if record:
                db.delete(record)
            continue
        if not record:
            record = models.StaffAttendance(employee_id=row.employee_id, date=payload.date)
        record.status, record.notes, record.recorded_by = row.status, row.notes.strip(), user.id
        db.add(record)
    db.commit()
    return {"status": "saved"}


def salary_month_view(month, db, outlet):
    start = month_date(month)
    end = next_month(start)
    employees = db.query(models.Employee).filter_by(outlet_id=outlet.id).filter(models.Employee.joined_on < end).order_by(models.Employee.name).all()
    salaries = {s.employee_id: s for s in db.query(models.StaffSalary).join(models.Employee).filter(models.Employee.outlet_id == outlet.id, models.StaffSalary.month == start).all()}
    paid = dict(db.query(models.StaffSalaryPayment.salary_id, func.sum(models.StaffSalaryPayment.amount)).join(models.StaffSalary).join(models.Employee).filter(models.Employee.outlet_id == outlet.id, models.StaffSalary.month == start).group_by(models.StaffSalaryPayment.salary_id).all())
    attendance = {}
    for employee_id, status, count in db.query(models.StaffAttendance.employee_id, models.StaffAttendance.status, func.count()).join(models.Employee).filter(models.Employee.outlet_id == outlet.id, models.StaffAttendance.date >= start, models.StaffAttendance.date < end).group_by(models.StaffAttendance.employee_id, models.StaffAttendance.status).all():
        attendance.setdefault(employee_id, {})[status] = count
    rows = []
    for e in employees:
        if e.is_active != "true" and e.id not in salaries and e.id not in attendance:
            continue
        salary = salaries.get(e.id)
        data = salary_dict(salary, Decimal(paid.get(salary.id, 0))) if salary else {
            "id": None, "month": month, "base_salary": float(e.monthly_salary), "extras": 0,
            "deductions": 0, "notes": "", "net_salary": float(e.monthly_salary), "paid": 0,
            "balance": float(e.monthly_salary)}
        rows.append({"employee": employee_dict(e), "salary": data, "attendance": attendance.get(e.id, {})})
    payments = db.query(models.StaffSalaryPayment, models.Employee, models.StaffSalary).join(models.StaffSalary, models.StaffSalaryPayment.salary_id == models.StaffSalary.id).join(models.Employee, models.StaffSalary.employee_id == models.Employee.id).filter(models.Employee.outlet_id == outlet.id, models.StaffSalary.month == start).order_by(models.StaffSalaryPayment.date.desc(), models.StaffSalaryPayment.created_at.desc()).all()
    return {"month": month, "rows": rows, "payments": [payment_dict(p, e, s) for p, e, s in payments]}


def save_salary(employee_id, payload, db, outlet, user):
    month = month_date(payload.month)
    e = get_employee(db, employee_id, outlet.id, lock=True)
    if next_month(month) <= e.joined_on:
        raise HTTPException(422, "Salary month is before the staff member joined")
    if month > today().replace(day=1):
        raise HTTPException(422, "Choose the current month or an earlier salary month")
    net = payload.base_salary + payload.extras - payload.deductions
    if net < 0:
        raise HTTPException(422, "Deductions cannot exceed salary plus extras")
    if (payload.extras or payload.deductions) and not payload.notes.strip():
        raise HTTPException(422, "Explain the extras or deductions in the notes")
    salary = db.query(models.StaffSalary).filter_by(employee_id=e.id, month=month).first()
    paid = salary_paid(db, salary.id) if salary else ZERO
    if net < paid:
        raise HTTPException(409, "Net salary cannot be less than the amount already paid")
    if not salary:
        salary = models.StaffSalary(id=uuid4(), employee_id=e.id, month=month)
    salary.base_salary, salary.extras, salary.deductions = payload.base_salary, payload.extras, payload.deductions
    salary.notes, salary.recorded_by = payload.notes.strip(), user.id
    db.add(salary)
    db.commit()
    return {"salary": salary_dict(salary, paid)}


def pay_salary(payload, db, outlet, user):
    salary = db.query(models.StaffSalary).join(models.Employee).filter(models.StaffSalary.id == payload.salary_id, models.Employee.outlet_id == outlet.id).first()
    if not salary:
        raise HTTPException(404, "Save this month's salary before recording payment")
    e = get_employee(db, salary.employee_id, outlet.id, lock=True)
    db.refresh(salary)  # A concurrent worksheet change may have preceded this lock.
    previous = db.get(models.StaffSalaryPayment, payload.request_id)
    if previous:
        if (previous.salary_id, previous.date, previous.amount, previous.payment_mode, previous.notes or "") != (payload.salary_id, payload.date, payload.amount, payload.payment_mode, payload.notes.strip()):
            raise HTTPException(409, "This payment request was already used with different details")
        return {"payment": payment_dict(previous, e, salary), "salary": salary_dict(salary, salary_paid(db, salary.id))}
    if payload.date > today() or payload.date < e.joined_on or payload.date < salary.month:
        raise HTTPException(422, "Choose a payment date from the salary month through today, after joining")
    if payload.payment_mode not in MODES:
        raise HTTPException(422, "Choose Cash, Online or Bank")
    paid = salary_paid(db, salary.id)
    net = salary.base_salary + salary.extras - salary.deductions
    if payload.amount > net - paid:
        raise HTTPException(409, "Payment exceeds the remaining salary; refresh the month")
    payment = models.StaffSalaryPayment(id=payload.request_id, salary_id=salary.id, date=payload.date,
        amount=payload.amount, payment_mode=payload.payment_mode, notes=payload.notes.strip(), recorded_by=user.id)
    db.add(payment)
    db.add(models.Transaction(date=payload.date, outlet_id=outlet.id, type="EXPENSE", category="STAFF SALARY",
        item_type=f"{e.name} — salary {salary.month:%Y-%m}", amount=payload.amount, payment_mode=payload.payment_mode,
        bill_number=f"SAL-{str(payment.id)[:8].upper()}", source_ref=f"staff-salary:{payment.id}"))
    db.commit()
    return {"payment": payment_dict(payment, e, salary), "salary": salary_dict(salary, paid + payload.amount)}


def make_router(get_db, get_current_outlet, require_owner):
    router = APIRouter(prefix="/staff", tags=["Staff"], dependencies=[Depends(require_owner)])

    @router.get("/employees")
    def employees(db: Session = Depends(get_db), outlet=Depends(get_current_outlet)):
        return {"employees": [employee_dict(e) for e in db.query(models.Employee).filter_by(outlet_id=outlet.id).order_by(models.Employee.name).all()]}

    @router.post("/employees")
    def add(payload: EmployeeInput, db: Session = Depends(get_db), outlet=Depends(get_current_outlet), user=Depends(require_owner)):
        return create_employee(payload, db, outlet, user)

    @router.put("/employees/{employee_id}")
    def edit(employee_id: UUID, payload: EmployeeInput, db: Session = Depends(get_db), outlet=Depends(get_current_outlet), user=Depends(require_owner)):
        return update_employee(employee_id, payload, db, outlet, user)

    @router.get("/attendance")
    def attendance(date: date, db: Session = Depends(get_db), outlet=Depends(get_current_outlet)):
        return attendance_view(date, db, outlet)

    @router.put("/attendance")
    def record_attendance(payload: AttendanceInput, db: Session = Depends(get_db), outlet=Depends(get_current_outlet), user=Depends(require_owner)):
        return save_attendance(payload, db, outlet, user)

    @router.get("/salaries")
    def salaries(month: str, db: Session = Depends(get_db), outlet=Depends(get_current_outlet)):
        return salary_month_view(month, db, outlet)

    @router.put("/salaries/{employee_id}")
    def salary(employee_id: UUID, payload: SalaryInput, db: Session = Depends(get_db), outlet=Depends(get_current_outlet), user=Depends(require_owner)):
        return save_salary(employee_id, payload, db, outlet, user)

    @router.post("/payments")
    def payment(payload: PaymentInput, db: Session = Depends(get_db), outlet=Depends(get_current_outlet), user=Depends(require_owner)):
        return pay_salary(payload, db, outlet, user)

    return router
