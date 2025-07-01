J&H Management System Design
This document outlines the architecture, database schema, and core functionalities for your J&H Management System, using Next.js for the frontend and Supabase (PostgreSQL, Auth, Edge Functions) for the backend.
1. Architecture Overview
The system will follow a modern web application architecture:
Frontend (Next.js):
React Components: For building the user interface (Dashboard, Tenant Management, Rooms, Billing, History, Settings, Account, Company Expenses).
Next.js API Routes: To handle server-side logic, secure interactions with Supabase, and potentially trigger Supabase Edge Functions. This ensures that sensitive operations (like direct database writes or email triggers) are not exposed directly on the client.
Supabase Client SDK: For client-side data fetching and real-time subscriptions where appropriate, especially for public data or for authenticated user-specific data.
Backend (Supabase):
PostgreSQL Database: The core data store for all system information (branches, rooms, tenants, bills, payments, history, system settings, audit logs, company expenses).
Supabase Auth: Handles user authentication and authorization (e.g., for company employees/admins). Row-Level Security (RLS) will be crucial for securing data access based on user roles.
Supabase Edge Functions (Deno): Used for serverless functions, particularly for:
Email Sending: Triggering transactional emails (welcome, bills, receipts, refunds, final bills, admin notifications) using Nodemailer. This offloads the email logic from your Next.js API routes directly.
Scheduled Tasks: For sending daily admin reminders about upcoming bills.
Complex Business Logic: Any logic that should strictly run server-side and interact with the database (e.g., penalty calculation logic, report generation).
Supabase Realtime: Can be used for live updates on the dashboard or billing pages, if real-time data changes are desired without manual refreshes.
2. Database Schema (Supabase PostgreSQL)
Here's the proposed schema for your PostgreSQL database. Each table will automatically have id (UUID, Primary Key) and created_at (timestamp with timezone, default now()) columns, which are standard best practices.
Table: branches
Stores information about each property branch.
Column Name
Data Type
Description
id
UUID (PK)
Unique identifier for the branch.
name
TEXT (UNIQUE)
Name of the branch (e.g., "Main Street Branch").
address
TEXT
Full address of the branch.
monthly_rent_rate
NUMERIC
Default monthly rent rate for rooms in this branch.
water_rate
NUMERIC
Water consumption rate for this branch.
electricity_rate
NUMERIC
Electricity consumption rate for this branch.
room_number_prefix
TEXT
Prefix for room numbers (e.g., "A-", "B-").
created_at
TIMESTAMPTZ
Timestamp of creation.
updated_at
TIMESTAMPTZ
Timestamp of last update.

Table: rooms
Stores details about individual rooms within branches.
Column Name
Data Type
Description
id
UUID (PK)
Unique identifier for the room.
branch_id
UUID (FK)
Foreign key linking to the branches table.
room_number
TEXT
Unique identifier for the room within its branch (e.g., "A-101").
monthly_rent
NUMERIC
Specific monthly rent for this room (can override branch's default).
is_occupied
BOOLEAN (DEFAULT false)
Indicates if the room is currently occupied by a tenant.
created_at
TIMESTAMPTZ
Timestamp of creation.
updated_at
TIMESTAMPTZ
Timestamp of last update.

Table: tenants
Stores information about each tenant.
Column Name
Data Type
Description
id
UUID (PK)
Unique identifier for the tenant.
full_name
TEXT
Tenant's full name.
phone_number
TEXT
Tenant's phone number.
email_address
TEXT
Tenant's email address (for notifications).
branch_id
UUID (FK)
Foreign key linking to the branches table.
room_id
UUID (FK, UNIQUE, NULLABLE)
Foreign key linking to the rooms table. Unique constraint ensures one tenant per room. Nullable when moved out.
rent_start_date
DATE
Date the tenant officially started renting. This anchors the billing cycle.
initial_electricity_reading
NUMERIC
The electricity meter reading when the tenant moved in.
advance_payment
NUMERIC
Amount paid as advance deposit.
security_deposit
NUMERIC
Amount paid as security deposit.
contract_start_date
DATE
Start date of the current contract (initially rent_start_date).
contract_end_date
DATE
End date of the current contract (contract_start_date + 6 months).
is_active
BOOLEAN (DEFAULT true)
true if the tenant is currently renting, false if moved out.
move_out_date
DATE (NULLABLE)
Date the tenant officially moved out.
created_at
TIMESTAMPTZ
Timestamp of creation.
updated_at
TIMESTAMPTZ
Timestamp of last update.

Table: bills
Records each generated bill for a tenant.
Column Name
Data Type
Description
id
UUID (PK)
Unique identifier for the bill.
tenant_id
UUID (FK)
Foreign key linking to the tenants table.
branch_id
UUID (FK)
Denormalized: Branch associated with the bill.
room_id
UUID (FK)
Denormalized: Room associated with the bill.
billing_period_start
DATE
Start date of the billing cycle (e.g., 3/17/2025).
billing_period_end
DATE
End date of the billing cycle (e.g., 4/16/2025).
due_date
DATE
Date by which the bill should be paid (e.g., 10 days after billing_period_end).
previous_electricity_reading
NUMERIC
Electricity reading from the end of the previous cycle.
present_electricity_reading
NUMERIC
Current electricity meter reading.
present_reading_date
DATE
Date when present_electricity_reading was taken (billing date). This can be customized.
electricity_consumption
NUMERIC
Calculated electricity consumption for the period.
electricity_amount
NUMERIC
Calculated cost of electricity for the period.
water_amount
NUMERIC
Fixed water charge for the period.
monthly_rent_amount
NUMERIC
Monthly rent for the period.
extra_fee
NUMERIC (DEFAULT 0)
Any additional fees.
extra_fee_description
TEXT (NULLABLE)
Description of the extra fee.
penalty_amount
NUMERIC (DEFAULT 0)
Calculated penalty fee if applicable.
total_amount_due
NUMERIC
Total amount the tenant owes for this bill (including penalty).
amount_paid
NUMERIC (DEFAULT 0)
Total amount paid towards this bill.
status
ENUM ('active', 'partially_paid', 'fully_paid', 'refund', 'final_bill')
Current status of the bill. fully_paid implies inactive.
is_final_bill
BOOLEAN (DEFAULT false)
True if this is the final bill upon tenant move-out.
created_at
TIMESTAMPTZ
Timestamp of creation.
updated_at
TIMESTAMPTZ
Timestamp of last update.

Table: payments
Records each individual payment made by a tenant towards a bill.
Column Name
Data Type
Description
id
UUID (PK)
Unique identifier for the payment.
bill_id
UUID (FK)
Foreign key linking to the bills table.
tenant_id
UUID (FK)
Foreign key linking to the tenants table (for quick lookup).
amount
NUMERIC
The amount paid in this transaction.
payment_date
TIMESTAMPTZ
Date and time the payment was recorded. This date is manually selectable and defaults to the current date.
payment_method
TEXT
Method of payment (e.g., 'cash', 'gcash').
notes
TEXT (NULLABLE)
Any specific notes about the payment.
created_at
TIMESTAMPTZ
Timestamp of creation.

Table: system_settings
Stores global system-wide settings. There should only be one row in this table.
Column Name
Data Type
Description
id
UUID (PK)
Unique identifier (should be a fixed value like '1' or a specific UUID to ensure only one row).
penalty_percentage
NUMERIC
The percentage charged as a penalty fee (e.g., 0.05 for 5%).
created_at
TIMESTAMPTZ
Timestamp of creation.
updated_at
TIMESTAMPTZ
Timestamp of last update.

Table: company_expenses (NEW)
Stores records of actual company expenditures.
Column Name
Data Type
Description
id
UUID (PK)
Unique identifier for the expense record.
expense_date
DATE
Date the expense was incurred or paid.
amount
NUMERIC
The monetary amount of the expense.
description
TEXT
A brief description of the expense.
category
TEXT
Categorization of the expense (e.g., 'Utilities', 'Maintenance', 'Salaries', 'Supplies', 'Repairs').
branch_id
UUID (FK, NULLABLE)
Optional: Foreign key linking to the branches table if the expense is specific to a branch.
created_at
TIMESTAMPTZ
Timestamp of creation.
updated_at
TIMESTAMPTZ
Timestamp of last update.

Table: audit_logs
Records significant actions performed within the system for auditing purposes.
Column Name
Data Type
Description
id
UUID (PK)
Unique identifier for the log entry.
user_id
UUID (FK)
ID of the user who performed the action.
action
TEXT
Description of the action (e.g., 'Tenant Added', 'Bill Generated', 'Room Rent Edited', 'Bill Edited', 'Payment Recorded', 'Date Changed', 'Amount Changed', 'Setting Changed', 'Report Generated', 'Expense Added', 'Expense Edited').
target_table
TEXT
The table affected by the action (e.g., 'tenants', 'bills', 'rooms', 'system_settings', 'payments', 'reports', 'company_expenses').
target_id
UUID (NULLABLE)
The ID of the record affected.
old_value
JSONB (NULLABLE)
Old data before the change (for updates, e.g., previous date or amount value).
new_value
JSONB (NULLABLE)
New data after the change (for inserts/updates, e.g., new date or amount value).
ip_address
TEXT (NULLABLE)
IP address from which the action originated.
timestamp
TIMESTAMPTZ
Timestamp of the action.

3. Core Functionalities
3.1. Authentication & Authorization (Account Management)
Admin Access: Company employees will log in. Supabase Auth will manage user accounts. Tenants will NOT have access to this system.
Row-Level Security (RLS): Implement RLS policies on all tables to ensure only authenticated users can read/write data, and potentially restrict certain actions based on roles (e.g., only admins can add branches).
Account Settings: Users can change their username, email, and password, managed through Supabase Auth's functionalities.
3.2. Dashboard
Overview: Display key aggregated metrics:
Total Branches: Count of branches in the system.
Total Active Tenants: Count of active tenants.
Total Rooms: Count of all rooms (occupied and vacant).
Business Analytics: All monetary values will be represented in Philippine Pesos (PHP).
Monthly Income (PHP): Calculate the total revenue for a selected month. This will be the sum of monthly_rent_amount, electricity_amount, water_amount, extra_fee, and penalty_amount from all fully_paid bills (or payments recorded for that month). This represents the total amount collected from tenants.
Monthly Expenses (PHP): Calculate the total expenditures for a selected month from the company_expenses table. This provides a clear view of the company's payouts.
Monthly Profit/Loss (PHP): Calculated as Total Monthly Income - Total Monthly Expenses.
Deposits in Analytics:
Deposits (advance_payment, security_deposit) are initially liabilities (funds held for tenants), not income.
They become income only when forfeited. This occurs during the final billing process (upon move-out) if the tenant's outstanding final_total_bill (after applying available deposits) results in a net amount owed by the tenant, implying that a portion or all of the deposit was used to cover the bill and thus not refunded. The final_bill status in the bills table and the calculated total_amount_due (potentially positive if tenant still owes, or negative for a refund) inherently track this. For dashboard analytics, forfeited amounts can be derived from final_bill records where total_amount_due (before applying deposits) exceeded amount_paid or the net total_amount_due is positive after deposit application.
For refunds, the amount in payments will be negative or a distinct record type, indicating a cash outflow, which could be part of a company_expenses category for "Deposit Refunds".
Branch Management:
List all branches.
Add Branch: A form to create a new branch.
Input fields: Branch name, Address, Monthly rent rate, Water rate, Electricity rate, Room number prefix.
Option to How many rooms (bulk add): Upon branch creation, automatically generate and add rooms based on the room_number_prefix and count. Each room will initially inherit the monthly_rent_rate from the branch.
Audit Logs: Display recent system actions recorded in the audit_logs table, providing a historical trail of changes and activities.
Send Report Button:
Allows admins to generate monthly reports.
Filters: User selects a specific Month and Year for the report.
Action: Triggers a Supabase Edge Function to:
Collect all relevant billing, payment, and company expense data for the selected month.
Generate a CSV file containing a summary of income, expenses, and tenant payment statuses for that period.
Send the generated CSV file as an email attachment to a specified email address(es) (e.g., admin emails, or a field where the user can input one or more recipient emails).
Report Content (CSV Structure): The CSV file for the monthly report will be structured to provide both summary and detailed information for the selected month. All monetary values will be in Philippine Pesos (PHP).
a. Summary Section (Overall Monthly Snapshot):
Total Monthly Income (PHP):
Total Rent Collected (for fully paid bills within the month).
Total Electricity Charges Collected.
Total Water Charges Collected.
Total Extra Fees Collected.
Total Penalty Fees Collected.
Total Forfeited Deposits (if any, from move-outs finalized in the month where deposits covered outstanding bills).
Grand Total Income for the Month.
Total Monthly Expenses (PHP): (Sum of amount from company_expenses for the month).
Net Profit/Loss for the Month (PHP).
Tenant Status Overview:
Number of Active Tenants at the end of the month.
Number of Vacant Rooms at the end of the month.
Number of Tenants Moved Out during the month.
Number of New Tenants Moved In during the month.
Billing Status Summary:
Number of Bills Generated in the month.
Number of Bills Fully Paid in the month.
Number of Bills Partially Paid (still active) at month-end.
Number of Overdue Bills (active/partially paid with due_date before month-end).
Deposit Movement:
Total Advance Payments Collected in the month.
Total Security Deposits Collected in the month.
Total Deposits Refunded in the month (from final bills/payments).
b. Detailed Bills & Payments (Row-by-Row Data): This section would list each relevant bill and its associated payments within the selected month.
Bill Details:
Tenant Full Name
Branch Name
Room Number
Billing Period (Start Date - End Date)
Bill Due Date
Present Reading Date
Previous Electricity Reading
Present Electricity Reading
Electricity Consumption
Electricity Amount (PHP)
Water Amount (PHP)
Monthly Rent Amount (PHP)
Extra Fee (PHP)
Extra Fee Description
Penalty Amount (PHP)
Original Total Amount Due (before payments) (PHP)
Total Amount Paid for this Bill (PHP)
Current Bill Status (active, partially_paid, fully_paid, refund, final_bill)
Payment Details (linked to Bill ID):
Payment Date
Payment Method
Amount Paid in this specific transaction (PHP)
Notes (if any)
c. Detailed Company Expenses (Row-by-Row Data):
Expense Date
Amount (PHP)
Description
Category
Branch (if applicable)
d. Tenant Movement (for the selected month):
Move-In Data:
Tenant Full Name
Rent Start Date
Branch and Room Assigned
Initial Electricity Reading
Advance Payment Collected (PHP)
Security Deposit Collected (PHP)
Move-Out Data:
Tenant Full Name
Move Out Date
Reason for Move Out (if captured, otherwise implied by final bill)
Final Bill Total Amount Due (including any net refund) (PHP)
Total Deposits Used/Forfeited (PHP)
Total Deposits Refunded (PHP)
Auditing: This action (Report Generated) will be logged in audit_logs, including the selected month/year filter and the recipient email(s).
3.3. Room Management
List Rooms: Display all rooms, filterable by branch, and showing occupancy status.
Add Room: (Individual add, not bulk)
Select branch_id.
Input room_number.
Input monthly_rent (defaults to branch rate, but editable).
Set is_occupied to false.
Edit Room:
Modify monthly_rent for an existing room. This action will be logged in audit_logs, tracking the old and new monthly_rent values.
(Internal) is_occupied status will be updated automatically when a tenant moves in or out.
3.4. Tenant Management
Add Tenant (Move-In):
Form: Full name, Phone number, Email address.
Assignment: Select branch, then an available room (from rooms where is_occupied = false).
Rental Details: Rent start date, Initial electricity reading.
Deposit Calculation:
Automatically calculate Advance payment and Security deposit based on the assigned room.monthly_rent.
Update rooms.is_occupied to true.
Contract: Set contract_start_date to rent_start_date and contract_end_date to rent_start_date + 6 months.
Action: Create new tenants entry and log the action to audit_logs.
Email: Trigger "Welcome Email" to the tenant via Supabase Edge Function.
Move Out Tenant: This process involves two main phases to ensure proper financial closure and system updates.
Phase 1: Initiate Move-Out & Calculate Final Balance
Button: A "Initiate Move Out" button will be available on a tenant's profile.
User Input: The system will prompt the administrator to confirm the move_out_date.
Calculate Final Consolidated Bill / Refund: The system will perform the following calculations for the tenant's move-out:
Determine the billing_period_start and billing_period_end for the tenant's last period of occupancy. This will be the current ongoing billing cycle based on their rent_start_date and previous bills. The billing_period_end for this final bill will be the move_out_date.
Prorated Rent Calculation:
Calculate Daily Rent = room.monthly_rent / Total Days in the Full Billing Cycle (of which the move_out_date falls).
Calculate Prorated Rent Amount = Daily Rent * Number of Days Occupied in the Current Cycle (from billing_period_start of the current cycle to move_out_date, inclusive).
Electricity: The system will capture the present_electricity_reading taken on the move_out_date. Electricity Consumption and Electricity Amount will be calculated based on this reading and the previous_electricity_reading.
Water: The system will provide an editable input for the Water Amount (PHP) for the final bill period.
Extra Fee: The system will provide an editable input for Extra Fee (PHP) and Extra Fee Description for the final bill.
Sum the Prorated Rent Amount, Electricity Amount, Water Amount, and Extra Fee for this final period. This forms the charges for the last period of occupancy.
Add this amount to any pre-existing outstanding (active or partially paid) bills for the tenant. This sum forms the final_consolidated_bill_amount.
Apply the Deposit Rules (as defined below) against this final_consolidated_bill_amount.
Determine the final total_amount_due (PHP). This amount will represent the net balance:
If total_amount_due > 0: The tenant still owes J&H Management. This is a final bill to be paid.
If total_amount_due <= 0: J&H Management owes the tenant a refund. This is a refund amount to be paid out.
Record Final Bill/Refund Bill:
A new bills entry will be created with is_final_bill = true.
The total_amount_due on this bill will reflect the calculated net balance (positive for amount owed by tenant, negative for refund owed to tenant).
The status of this bill will be set accordingly:
'active' if total_amount_due > 0 (awaiting tenant payment).
'refund' if total_amount_due <= 0 (awaiting refund processing by J&H Management).
This action will be logged in audit_logs, capturing the move-out date, the prorated rent calculation details, and the calculated final balance.
Email: Based on the total_amount_due, an email will be triggered:
"Final Bill Email" if tenant owes money.
"Refund Information Email" if tenant is owed a refund.
Phase 2: Settle Final Balance & Deactivate Tenant/Room
This phase is triggered when the is_final_bill = true bill record's status changes to fully_paid (for amounts owed by tenant) or when the refund has been processed (for amounts owed to tenant).
For positive total_amount_due (tenant owes): An admin will record a payment against this final bill using the standard payment process (3.5. Billing). Once the amount_paid matches total_amount_due, the final bill's status becomes fully_paid.
For negative total_amount_due (tenant is owed a refund): An admin will record a payout for the refund. This can be recorded in the payments table with a negative amount (e.g., -1000 PHP) linked to the is_final_bill = true bill. Once this refund payment is recorded, the final bill's status is set to fully_paid. This effectively marks the refund as processed.
System Update (After Settlement): Once the is_final_bill = true bill has a status of fully_paid (indicating settlement of all financial obligations for that tenant):
The tenant's is_active status in the tenants table MUST be set to false.
The room_id in the tenants table MUST be set to NULL to disassociate the tenant from the room.
The is_occupied status of the associated room in the rooms table MUST be set to false, making it available for new tenants.
The tenants.move_out_date will be set (if not already set in Phase 1).
All these system updates will be logged in audit_logs.
Tenant Cycle & Renewal:
Cycle Tracking (Consistency): The rent_start_date of a tenant consistently anchors their billing cycle. Each billing period (billing_period_start to billing_period_end) will typically be one month, offset from this rent_start_date. For example, if rent_start_date is March 17, 2025, cycles would be March 17 - April 16, April 17 - May 16, and so on.
Contract: Automatically set to 6 months. A "Renew Contract" button can be provided, which updates contract_end_date.
Cycle Count: The number of fully paid bills for a tenant determines how many cycles they are in.
Deposit Rules (Applied during Move-Out):
Context: final_total_bill (calculated outstanding balance from all sources), total_deposits (sum of advance_payment and security_deposit).
6 Cycles and Above: If the tenant has made 6 or more fully_paid bill payments:
Both advance_payment and security_deposit can be used.
If final_total_bill > (advance_payment + security_deposit): Tenant owes final_total_bill - (advance_payment + security_deposit).
If final_total_bill < (advance_payment + security_deposit): Tenant receives (advance_payment + security_deposit) - final_total_bill as a refund.
Below 6 Cycles: If the tenant has made fewer than 6 fully_paid bill payments:
Only advance_payment can be used. Security_deposit is forfeited.
If final_total_bill > advance_payment: Tenant owes final_total_bill - advance_payment.
If final_total_bill < advance_payment: Tenant receives advance_payment - final_total_bill as a refund. (Note: Security deposit is not refunded).
3.5. Billing
Generate Bill Page:
Display active tenants in active rooms.
"Generate Bill" Button: For each tenant.
Bill Generation Process:
Determine Current Cycle: Find the last generated bill for the tenant.
If no previous bill exists, the billing_period_start is the tenant's rent_start_date. The billing_period_end will be one month minus one day from the rent_start_date.
If a previous bill exists, the billing_period_start for the new bill will be one day after the billing_period_end of the last bill. The billing_period_end will then be one month from this new billing_period_start minus one day. This ensures continuous, one-month billing cycles.
Fetch the previous_electricity_reading (from the last bill's present_electricity_reading or tenant.initial_electricity_reading if it's the first bill).
User Input for Bill Data:
Prompt for Present electricity reading. This input, and any changes to it, will be logged in audit_logs (recording old and new values).
Prompt for Present reading date: This field will default to the current date, but will be fully editable by the user. When this date is changed, an audit_logs entry will be created, recording the old and new date values. This allows for backdating bills or adjusting the reading date as needed, which is important for historical data entry and simulating past billing scenarios.
Input fields for Extra fee and Extra fee description. Any changes to extra_fee will also be logged in audit_logs (recording old and new values).
Calculations:
electricity_consumption = present_electricity_reading - previous_electricity_reading.
electricity_amount = electricity_consumption * branch.electricity_rate.
water_amount = branch.water_rate.
monthly_rent_amount = room.monthly_rent.
Calculate due_date (10 days after billing_period_end).
total_amount_due = monthly_rent_amount + electricity_amount + water_amount + extra_fee. (Penalty applied only if payment_date is after due_date, not upon bill generation). The calculation of total_amount_due (and any subsequent re-calculations due to edits) will also be reflected in audit_logs as part of the new_value or old_value for the bill record.
Action: Create a new bills entry with status = 'active'. Log this to audit_logs, including the billing_period_start, billing_period_end, present_reading_date, and all relevant calculated amounts (electricity_amount, water_amount, monthly_rent_amount, extra_fee, total_amount_due) as part of the new_value for the audit trail.
Email: Trigger "Bill Email" to the tenant via Supabase Edge Function.
Payment & Bill Status:
"Pay" Button: On a bill's detail page.
Record Payment Form:
Allow recording payments (amount). Any changes to this amount will be logged in audit_logs (recording old and new values).
Select payment_method (e.g., 'cash', 'gcash').
Input for Payment Date: This field will default to the current date, but will be fully editable by the user. This payment_date is the crucial date that determines if a penalty applies (by comparing it to the bill.due_date). When this date is changed, an audit_logs entry will be created, recording the old and new date values. This flexibility is essential for entering historical payment data accurately.
Penalty Fee Calculation: When a payment is recorded and the form is submitted:
Check if the entered payment_date is after the bill.due_date and if the bill is not yet fully_paid.
If overdue, calculate penalty_amount = bill.total_amount_due * system_settings.penalty_percentage (using the global setting). This penalty_amount is added to the bill.total_amount_due if it hasn't been applied already. Changes to penalty_amount and total_amount_due on the bill will be logged in audit_logs.
Update Bill Status:
If amount_paid (current total paid including this new payment) is less than total_amount_due (including any applied penalty), bill.status remains active or becomes partially_paid.
If amount_paid equals or exceeds total_amount_due, bill.status becomes fully_paid.
A bill with status = 'fully_paid' is considered inactive for further payments and moves to history.
Email: Trigger "Partial Bill" or "Receipt" email to the tenant. Log payment to audit_logs, including the payment_date and amount paid in the audit trail.
3.6. History
Paid Bills:
List all bills with status = 'fully_paid' or is_final_bill = true.
Clicking a bill shows its full details.
Moved Out Tenants:
List all tenants where is_active = false.
Clicking a tenant shows their profile and a list of all bills (past and final) they had during their stay.
3.7. Settings
Branch Rate Management:
Ability to view and edit monthly_rent_rate, water_rate, and electricity_rate for individual branches. Changes to these rates will be logged in audit_logs (recording the old and new values).
Penalty Fee Percentage:
A UI to modify the penalty_percentage stored in the system_settings table. This will apply globally to all future penalty calculations. Changes to this setting will be logged in audit_logs (recording the old and new percentage values).
Payment Options:
While the payment_method in the payments table is currently TEXT, a future enhancement could involve a dedicated payment_methods lookup table where admins can add/manage allowed payment options, then link these to the payments table via a foreign key. For now, the system will accept 'cash' and 'gcash' and any other text entered.
3.8. Company Expenses Management
Add Expense: A dedicated interface (e.g., a tab or section in the Dashboard or a new main menu item) for admins to record company expenses.
Form: Input fields for Expense Date, Amount (in PHP), Description, Category (e.g., dropdown for common categories like 'Utilities', 'Maintenance', 'Salaries', 'Supplies', 'Repairs'), and an optional Branch association.
Action: Create a new entry in the company_expenses table. This action will be logged in audit_logs.
View/Edit Expenses: List all recorded company expenses, with filters by date range, category, or branch. Allow editing existing expense records. Any edits to an expense record (date, amount, description, category, branch) will be logged in audit_logs (recording old and new values).
Delete Expense: Allow deletion of expense records, also logged in audit_logs.
4. Email System (Supabase Edge Functions + Nodemailer)
This will be handled by Supabase Edge Functions, triggered by database changes or scheduled jobs. Nodemailer will be the library used within these Edge Functions to send emails via an SMTP server.
Welcome Email: Sent when a new tenant is added to the system.
Bill Email: Sent when a new bill is generated for a tenant.
Edited Bill Email: Sent if a bill's details (e.g., readings, extra fees) are modified after generation.
Partial Bill Email: Sent when a tenant makes a partial payment.
Receipt Email: Sent when a bill is fully paid.
Refund Information Email: Sent to the tenant if they have a remaining deposit balance after move-out.
Final Bill Email: Sent to the tenant if they have a payable balance after move-out.
Admin Billing Reminder Email:
A daily scheduled Supabase Edge Function will check for tenants whose next billing cycle start date is within the next 3 days.
Send a daily email to the admin listing these tenants.
Implementation Considerations
UI/UX: Focus on a clean, intuitive interface for management tasks, especially for date pickers and numerical inputs to facilitate accurate data entry and modification. Ensure the new expense management interface is user-friendly. For all monetary inputs, consider displaying "PHP" or "₱" as a visual cue to the user.
Error Handling: Implement robust error handling for all database operations and API calls.
Input Validation: Crucial for all user inputs (e.g., numbers for rates, valid dates, unique names, valid expense categories).
Testing: Thoroughly test all functionalities, especially billing calculations, penalty application (considering various payment_date scenarios), deposit rules, and all income/expense calculations for the business analytics and reports.
Security: Leverage Supabase RLS and ensure server-side validation for critical operations. Database triggers can be used to automatically populate audit_logs for certain actions, further enhancing auditability.


