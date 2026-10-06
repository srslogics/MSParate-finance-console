# Staff, attendance and salary

Owners can open **Staff & Salary** for one outlet at a time.

1. **Staff members:** add a name, fixed monthly salary and joining date. Phone and role are optional. Mark former employees inactive instead of deleting their records.
2. **Attendance:** choose a date, mark each staff member and save. Present, absent, half day, paid leave and weekly off are supported. Unmarked days are not treated as absence. Attendance never automatically changes salary.
3. **Monthly salary:** choose the salary month and prepare each employee's salary. Review the base salary, enter extras or deductions, and explain adjustments in notes. Save the salary before paying.
4. **Pay salary:** enter the amount actually given, payment date and Cash, Online or Bank. Partial payments are supported. The remaining amount updates after every payment.

Monthly salary is fixed: joining mid-month does not automatically prorate it. The owner can enter a deduction when appropriate. Changes to an employee's default salary affect only months that have not been prepared. Saved monthly records retain their own amounts. A net salary cannot be reduced below money already paid.

## Hisab

Each salary payment creates one `EXPENSE / STAFF SALARY` transaction atomically with its payment record. It appears on the **payment date**, even when paying for an earlier salary month. Preparing a salary or marking attendance does not create an expense.

Overview payments out, analytics cash out/payment modes, stock Daily Sheet salary hisab, transaction reports and financial summary exports include salary payments. Gross stock profit stays separate; “Gross profit less salaries paid” is explicitly a cash-basis figure, not accrued payroll profit. Salary expenses do not create customer/supplier balances or change stock.

## Access and safeguards

- The staff module and its API are owner-only and outlet-scoped. Existing financial reports include salary expenses under their existing access rules.
- Payment retries use a unique request ID. Employee-level database locks serialize payments and salary changes to prevent concurrent overpayment.
- Recorded payments cannot be edited or deleted through this module. Verify the date, amount and method before recording them. Advances against future salary months and automatic tax calculations are not included.
- Attendance is editable, including clearing a previously marked day. The latest editor and timestamp are stored; this is not a versioned attendance audit trail.
- Payroll requires an online connection. No staff records are stored in the service worker's offline cache.

## Deployment and validation

Startup creates the four new payroll tables through the existing serialized schema initialization. Existing records and tables are retained. On Supabase, the existing startup policy enables row-level security on these new tables too; access is through the authenticated backend.

Tests use synthetic data only. `tests/test_staff.py` covers salary calculations, attendance, payment deduplication, outlet isolation and hisab dates. The disposable PostgreSQL integration suite also races duplicate and distinct payments. `tests/staff_browser.cjs` exercises the staff workflow after `tests/production_api_check.py` against that same disposable local database.
