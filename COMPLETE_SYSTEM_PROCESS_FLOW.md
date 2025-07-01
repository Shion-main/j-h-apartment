# J&H Management System - Complete Process Flow Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [Phase 1: Tenant Move-In Process](#phase-1-tenant-move-in-process)
3. [Phase 2: Billing Cycle Management](#phase-2-billing-cycle-management)
4. [Phase 3: Payment Processing](#phase-3-payment-processing)
5. [Phase 4: Tenant Move-Out Process](#phase-4-tenant-move-out-process)
6. [Email Notification System](#email-notification-system)
7. [Audit Trail and History](#audit-trail-and-history)
8. [Business Rules Summary](#business-rules-summary)

---

## System Overview

The J&H Management System is a comprehensive rental property management application designed specifically for J&H Management staff. The system handles the complete lifecycle of tenant management from initial move-in through final move-out, including billing, payment processing, and comprehensive audit tracking.

### Key System Entities
- **Branches**: Physical locations with default rental rates
- **Rooms**: Individual rental units within branches
- **Tenants**: Active and historical tenant records
- **Bills**: Monthly billing records with detailed calculations
- **Payments**: Payment transactions against bills
- **Company Expenses**: Business expense tracking
- **Audit Logs**: Comprehensive system activity tracking

### Core Business Principles
- **6-Month Contract Terms**: All tenants start with a 6-month contract
- **Consistent Billing Cycles**: Monthly billing based on rent start date
- **Deposit Protection Rules**: Different rules based on tenant payment history
- **Comprehensive Audit Trail**: All financial and tenant actions are logged
- **Automated Email Notifications**: System-triggered communications

---

## Phase 1: Tenant Move-In Process

### 1.1 Prerequisites
Before a tenant can be added to the system:
- ✅ Available room in desired branch
- ✅ Advance payment received (equal to monthly rent)
- ✅ Security deposit received (equal to monthly rent)
- ✅ Initial electricity reading recorded
- ✅ Tenant contact information collected

### 1.2 Move-In Data Collection

#### Required Information
```typescript
interface TenantMoveInForm {
  full_name: string;           // Minimum 2 characters
  phone_number: string;        // Valid phone number format
  email_address: string;       // Valid email address
  room_id: string;            // Selected available room
  rent_start_date: string;    // Tenant's first day
  initial_electricity_reading: number;  // Starting meter reading
  advance_payment_received: boolean;    // Must be true
  security_deposit_received: boolean;   // Must be true
}
```

#### Business Logic Validations
- **Room Availability**: Selected room must not be occupied
- **Deposit Confirmation**: Both advance payment and security deposit must be confirmed received
- **Contact Uniqueness**: Email and phone number should be unique in the system
- **Reading Validation**: Initial electricity reading must be non-negative

### 1.3 Contract Calculation

When a tenant moves in, the system automatically calculates:

```typescript
// Contract dates are calculated automatically
const rentStartDate = new Date(value.rent_start_date);
const contractStartDate = rentStartDate;  // Same as rent start
const contractEndDate = addMonths(contractStartDate, 6);  // 6 months later

// Deposit amounts
const advancePayment = room.monthly_rent;   // Equal to monthly rent
const securityDeposit = room.monthly_rent;  // Equal to monthly rent
```

### 1.4 System Updates During Move-In

#### Database Changes
1. **Create Tenant Record**
   ```sql
   INSERT INTO tenants (
     full_name, email_address, phone_number,
     room_id, branch_id,
     rent_start_date, contract_start_date, contract_end_date,
     initial_electricity_reading,
     advance_payment, security_deposit,
     is_active
   ) VALUES (...)
   ```

2. **Update Room Status**
   ```sql
   UPDATE rooms 
   SET is_occupied = true 
   WHERE id = room_id
   ```

3. **Create Audit Log**
   ```sql
   INSERT INTO audit_logs (
     user_id, action, target_table, target_id,
     new_value, timestamp
   ) VALUES (...)
   ```

### 1.5 Welcome Email Automation

Immediately after successful move-in, the system automatically sends a welcome email containing:

#### Email Content
- **Welcome message** with tenant name
- **Lease details**: room number, branch name, contract dates
- **Important information**:
  - 6-month contract duration
  - Billing cycle explanation (based on rent start date)
  - Payment methods (Cash, GCash with QR code)
  - Penalty information (5% of total amount due for late payments)
  - Due date calculation (billing period end + 10 days)
- **Management contact information**

#### Technical Implementation
```typescript
await EmailService.sendWelcomeEmail({
  email: tenant.email_address,
  full_name: tenant.full_name,
  room_number: room.room_number,
  branch_name: branch.name,
  contract_start_date: tenant.contract_start_date,
  contract_end_date: tenant.contract_end_date,
  rent_start_date: tenant.rent_start_date,
  monthly_rent: room.monthly_rent,
  electricity_rate: branch.electricity_rate,
  water_rate: branch.water_rate
});
```

---

## Phase 2: Billing Cycle Management

### 2.1 Billing Cycle Calculation

The J&H system uses **consistent monthly billing cycles** based on each tenant's `rent_start_date`. This ensures fair and predictable billing regardless of when the tenant moved in.

#### Cycle Calculation Logic
```typescript
// Example: rent_start_date = 2025-03-17
// Cycle 1: 2025-03-17 to 2025-04-16  (1st month)
// Cycle 2: 2025-04-17 to 2025-05-16  (2nd month)
// Cycle 3: 2025-05-17 to 2025-06-16  (3rd month)
// ... and so on

function calculateBillingPeriod(rentStartDate: Date, cycleNumber: number): BillingCycle {
  const anchorDay = rentStartDate.getDate();
  
  // Calculate start date for this cycle
  let start = new Date(rentStartDate);
  start.setMonth(start.getMonth() + (cycleNumber - 1));
  
  // Calculate end date (day before next cycle starts)
  let end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  end.setDate(end.getDate() - 1);
  
  return { start, end, cycleNumber };
}
```

### 2.2 Bill Generation Timing

#### Automatic Generation Rules
- **Trigger Point**: 3 days before billing cycle end OR after cycle end
- **Prevention**: Cannot generate bill if one already exists for the period
- **Sequence**: Bills are generated in chronological order (cannot skip cycles)

#### Manual Generation via UI
Staff can generate bills through the Billing page when:
- ✅ Tenant has no active/partial bills
- ✅ Current date is within 3 days of cycle end
- ✅ All required readings are provided

### 2.3 Bill Component Calculations

#### 2.3.1 Monthly Rent
```typescript
const monthlyRent = room.monthly_rent; // Fixed amount per room
```

#### 2.3.2 Electricity Charges
```typescript
const electricityConsumption = presentReading - previousReading;
const electricityAmount = electricityConsumption * branch.electricity_rate;

// Previous reading sources:
// - Last bill's present_electricity_reading (if exists)
// - OR tenant's initial_electricity_reading (for first bill)
```

#### 2.3.3 Water Charges
```typescript
const waterAmount = branch.water_rate; // Fixed monthly rate per branch
```

#### 2.3.4 Extra Fees (Optional)
```typescript
const extraFee = value.extra_fee || 0; // User-defined amount
const extraFeeDescription = value.extra_fee_description || '';
```

#### 2.3.5 Total Calculation
```typescript
const totalBeforePenalty = monthlyRent + electricityAmount + waterAmount + extraFee;
const dueDate = addDays(billingPeriodEnd, 10); // Due 10 days after period end
```

### 2.4 Bill Record Creation

```sql
INSERT INTO bills (
  tenant_id, branch_id, room_id,
  billing_period_start, billing_period_end, due_date,
  previous_electricity_reading, present_electricity_reading,
  present_reading_date,
  electricity_consumption, electricity_amount,
  water_amount, monthly_rent_amount,
  extra_fee, extra_fee_description,
  total_amount_due, status
) VALUES (...)
```

### 2.5 Bill Generation Email

After bill creation, the system automatically sends a detailed bill email:

#### Email Content
- **Bill breakdown**: All components itemized
- **Billing period**: Start and end dates
- **Due date**: Calculated date (period end + 10 days)
- **Payment instructions**: Cash and GCash options
- **GCash QR code**: Attached image for mobile payments
- **Penalty warning**: 5% fee for late payments

---

## Phase 3: Payment Processing

### 3.1 Payment Recording Interface

The system provides a comprehensive payment recording interface accessible from the Billing page.

#### Payment Form Fields
```typescript
interface PaymentForm {
  amount_paid: string;      // Payment amount (can be partial)
  payment_date: string;     // Editable date (defaults to today)
  payment_method: 'cash' | 'gcash';
  reference_number: string; // Required for GCash
  notes: string;           // Optional notes
}
```

### 3.2 Payment Processing Logic

#### 3.2.1 Validation Checks
- **Bill exists** and is not already fully paid
- **Payment amount** is positive and reasonable
- **Payment date** is valid (can be backdated)
- **GCash reference** provided when payment method is GCash

#### 3.2.2 Payment Calculation
```typescript
// Calculate new payment totals
const newAmountPaid = bill.amount_paid + paymentAmount;
const remainingBalance = bill.total_amount_due - newAmountPaid;

// Determine new bill status
let newStatus: BillStatus;
if (newAmountPaid >= bill.total_amount_due) {
  newStatus = 'fully_paid';
} else if (newAmountPaid > 0) {
  newStatus = 'partially_paid';
} else {
  newStatus = 'active';
}
```

### 3.3 Database Updates

#### 3.3.1 Create Payment Record
```sql
INSERT INTO payments (
  bill_id, tenant_id,
  amount, payment_date, payment_method,
  reference_number, notes
) VALUES (...)
```

#### 3.3.2 Update Bill Status
```sql
UPDATE bills 
SET 
  amount_paid = amount_paid + payment_amount,
  status = new_status,
  updated_at = NOW()
WHERE id = bill_id
```

### 3.4 Penalty System

#### 3.4.1 Penalty Calculation Rules
- **Trigger**: Payment date > due date AND bill not fully paid
- **Rate**: Configurable percentage (default 5%) of total_amount_due
- **Application**: Applied automatically when late payment is recorded
- **Configuration**: Global setting modifiable by administrators

#### 3.4.2 Penalty Implementation
```typescript
function calculatePenalty(
  totalAmount: number,
  paymentDate: Date,
  dueDate: Date,
  penaltyPercentage: number
): number {
  if (paymentDate <= dueDate) return 0;
  return (totalAmount * penaltyPercentage) / 100;
}

// Penalty is added to bill total when applied
const penaltyAmount = calculatePenalty(bill.total_amount_due, paymentDate, bill.due_date, 5);
```

### 3.5 Payment Confirmation Emails

#### 3.5.1 Partial Payment Email
Sent when payment doesn't fully cover the bill:
- **Payment confirmation** details
- **Remaining balance** clearly displayed
- **Due date reminder**
- **Next payment encouragement**

#### 3.5.2 Full Payment Receipt Email
Sent when bill reaches 'fully_paid' status:
- **Complete payment confirmation**
- **"Paid in Full" status**
- **Receipt details**
- **Next billing cycle information**

---

## Phase 4: Tenant Move-Out Process

The move-out process is designed as a **two-phase system** to ensure proper financial settlement and clean tenant transitions.

### 4.1 Move-Out Prerequisites

Before initiating move-out:
- ✅ Tenant must be currently active
- ✅ No existing final bill for the tenant
- ✅ Final electricity reading obtained
- ✅ Move-out date determined

### 4.2 Phase 1: Final Bill Calculation

#### 4.2.1 Data Collection
```typescript
interface TenantMoveOutForm {
  move_out_date: string;              // Tenant's last day
  final_electricity_reading: string;  // Final meter reading
  final_water_amount: string;         // Final water charges (editable)
  extra_fees: string;                // Any additional charges
  extra_fee_description: string;     // Description of extra fees
}
```

#### 4.2.2 Billing Period Calculation

The system calculates the current billing cycle and prorates rent based on actual occupancy:

```typescript
// Calculate current billing cycle
const fullyPaidBillCount = getFullyPaidBillCount(tenantId);
const currentCycleNumber = fullyPaidBillCount + 1;
const currentCycle = calculateBillingPeriod(rentStartDate, currentCycleNumber);

// Prorate rent for partial month
const proratedRent = calculateProratedRent(
  monthlyRent,
  currentCycle.start,
  currentCycle.end,
  moveOutDate
);
```

#### 4.2.3 Final Bill Components

```typescript
// 1. Prorated monthly rent (days occupied in current cycle)
const proratedRent = calculateProratedRent(...);

// 2. Final electricity charges
const electricityCharges = (finalReading - previousReading) * electricityRate;

// 3. Final water charges (editable)
const finalWaterCharges = finalWaterAmount || defaultWaterRate;

// 4. Extra fees (optional)
const extraFees = extraFeeAmount || 0;

// 5. Outstanding bills (any unpaid balances)
const outstandingBalance = sumOfUnpaidBills(tenantId);

// 6. Total before deposits
const totalBeforeDeposits = 
  proratedRent + electricityCharges + finalWaterCharges + extraFees + outstandingBalance;
```

#### 4.2.4 Deposit Application Rules

The system applies different deposit rules based on tenant payment history:

```typescript
function calculateDepositApplication(
  fullyPaidBillCount: number,
  advancePayment: number,
  securityDeposit: number,
  outstandingBalance: number
): DepositCalculation {
  
  if (fullyPaidBillCount >= 5) {
    // 5+ fully paid bills = 6th cycle or beyond
    // Both deposits available for outstanding balances
    const availableAmount = advancePayment + securityDeposit;
    const appliedAmount = Math.min(availableAmount, outstandingBalance);
    
    return {
      availableAmount,
      forfeitedAmount: 0,
      refundAmount: availableAmount - appliedAmount,
      appliedAmount
    };
  } else {
    // 4 or fewer fully paid bills = 5th cycle or below
    // Only advance payment available, security deposit forfeited
    const appliedAmount = Math.min(advancePayment, outstandingBalance);
    
    return {
      availableAmount: advancePayment,
      forfeitedAmount: securityDeposit,
      refundAmount: advancePayment - appliedAmount,
      appliedAmount
    };
  }
}
```

#### 4.2.5 Final Balance Determination

```typescript
const finalBalance = totalBeforeDeposits - depositApplication.availableAmount;

// Possible outcomes:
// finalBalance > 0  : Tenant owes money
// finalBalance = 0  : Deposits exactly cover charges
// finalBalance < 0  : Tenant gets refund
```

#### 4.2.6 Final Bill Creation

```sql
INSERT INTO bills (
  tenant_id, branch_id, room_id,
  billing_period_start, billing_period_end,
  monthly_rent_amount,    -- Prorated amount
  electricity_amount,     -- Final consumption charges
  water_amount,          -- Final water charges
  extra_fee,             -- Any additional fees
  total_amount_due,      -- Final balance (+ or -)
  amount_paid,           -- Deposits applied
  status,                -- 'active', 'fully_paid', or 'refund'
  is_final_bill,         -- true
  advance_payment,       -- Stored for transparency
  security_deposit       -- Stored for transparency
) VALUES (...)
```

#### 4.2.7 Move-Out Emails

Based on the final balance, the system sends appropriate emails:

**If Final Balance > 0 (Tenant Owes Money)**:
- **Final Bill Email** with detailed breakdown
- **Payment deadline** and instructions
- **Deposit application** explanation

**If Final Balance < 0 (Tenant Gets Refund)**:
- **Refund Notice Email** with calculation details
- **Refund amount** clearly stated
- **Process timeline** for refund

### 4.3 Phase 2: Final Settlement

#### 4.3.1 Settlement Options

**Option A: Outstanding Payment**
If the tenant owes money after deposits:
- Record final payment through normal payment system
- Final bill status changes to 'fully_paid'
- Automatic progression to tenant deactivation

**Option B: Refund Processing**
If the tenant is owed a refund:
- Staff processes refund externally (cash/bank transfer)
- Mark refund as completed in system
- Automatic progression to tenant deactivation

#### 4.3.2 Tenant Deactivation

Once the final bill is settled (either paid or refunded), the system automatically:

```sql
-- Update tenant status
UPDATE tenants 
SET 
  is_active = false,
  updated_at = NOW()
WHERE id = tenant_id;

-- Free up the room
UPDATE rooms 
SET is_occupied = false
WHERE id = room_id;

-- Update final bill status if refund
UPDATE bills 
SET 
  status = 'fully_paid',
  amount_paid = 0,
  total_amount_due = 0
WHERE id = final_bill_id AND status = 'refund';
```

#### 4.3.3 Farewell Email

After successful move-out completion:
- **Thank you message** for tenancy
- **Final confirmation** of move-out completion
- **Contact information** for future inquiries
- **Lease termination** confirmation

---

## Email Notification System

### 5.1 Automated Email Triggers

The system provides comprehensive email automation throughout the tenant lifecycle:

#### 5.1.1 Welcome Email (Move-In)
- **Trigger**: After successful tenant move-in
- **Content**: Welcome message, lease details, important policies
- **Attachments**: None

#### 5.1.2 Bill Generated Email
- **Trigger**: After bill creation
- **Content**: Detailed bill breakdown, due date, payment instructions
- **Attachments**: GCash QR code image

#### 5.1.3 Bill Edited Email
- **Trigger**: When existing bill is modified
- **Content**: Updated bill details, explanation of changes
- **Attachments**: None

#### 5.1.4 Partial Payment Confirmation
- **Trigger**: After partial payment recording
- **Content**: Payment confirmation, remaining balance
- **Attachments**: None

#### 5.1.5 Full Payment Receipt
- **Trigger**: When bill reaches 'fully_paid' status
- **Content**: Complete payment confirmation, receipt details
- **Attachments**: None

#### 5.1.6 Final Bill Email (Move-Out)
- **Trigger**: Phase 1 move-out with outstanding balance
- **Content**: Final bill breakdown, deposit application details
- **Attachments**: None

#### 5.1.7 Refund Notice Email (Move-Out)
- **Trigger**: Phase 1 move-out with refund due
- **Content**: Refund calculation, process timeline
- **Attachments**: None

#### 5.1.8 Farewell Email (Move-Out Complete)
- **Trigger**: Phase 2 move-out completion
- **Content**: Thank you message, move-out confirmation
- **Attachments**: None

### 5.2 Email Template Structure

All emails follow a consistent structure:
- **Header**: J&H Management branding
- **Personalized Greeting**: Tenant name
- **Main Content**: Email-specific information
- **Footer**: Contact information, automated disclaimer

### 5.3 Technical Implementation

#### SMTP Configuration
```typescript
const transporter = nodemailer.createTransporter({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USERNAME,
    pass: process.env.SMTP_PASSWORD
  }
});
```

#### Email Service Usage
```typescript
// Example: Send bill email
await EmailService.sendBillEmail({
  email: tenant.email_address,
  full_name: tenant.full_name,
  room_number: room.room_number,
  branch_name: branch.name,
  // ... bill details
});
```

---

## Audit Trail and History

### 6.1 Comprehensive Audit Logging

The system maintains detailed audit logs for all significant actions:

#### 6.1.1 Logged Actions
- **Tenant Management**: Move-in, move-out, profile updates
- **Billing Operations**: Bill generation, editing, penalty application
- **Payment Processing**: Payment recording, status changes
- **System Settings**: Rate changes, penalty percentage updates
- **User Actions**: Login attempts, role changes

#### 6.1.2 Audit Log Structure
```sql
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY,
  user_id uuid,           -- Who performed the action
  action text,            -- What action was performed
  target_table text,      -- Which table was affected
  target_id uuid,         -- Which record was affected
  old_value jsonb,        -- Previous state (for updates)
  new_value jsonb,        -- New state (for updates/creates)
  ip_address text,        -- User's IP address
  timestamp timestamptz   -- When the action occurred
);
```

#### 6.1.3 Audit Examples

**Tenant Move-In**:
```json
{
  "action": "TENANT_MOVE_IN",
  "target_table": "tenants",
  "new_value": {
    "full_name": "John Doe",
    "room_id": "uuid-here",
    "rent_start_date": "2025-01-15",
    "advance_payment": 5000,
    "security_deposit": 5000
  }
}
```

**Payment Recording**:
```json
{
  "action": "PAYMENT_RECORDED",
  "target_table": "payments",
  "new_value": {
    "bill_id": "uuid-here",
    "amount": 2500,
    "payment_method": "gcash",
    "payment_date": "2025-01-20"
  }
}
```

### 6.2 Historical Data Access

#### 6.2.1 History Page Features
- **Comprehensive Search**: Filter by date range, action type, user
- **Fully Paid Bills**: Complete history of settled bills
- **Moved-Out Tenants**: Historical tenant records
- **System Activity**: All audit log entries
- **Export Capabilities**: CSV download for reporting

#### 6.2.2 Data Retention
- **Active Data**: Immediately accessible
- **Historical Data**: Permanently retained for business records
- **Audit Logs**: Indefinite retention for compliance

---

## Business Rules Summary

### 7.1 Contract and Lease Rules
- ✅ **Default Contract Duration**: 6 months from rent start date
- ✅ **Advance Payment**: Equal to monthly rent, paid at move-in
- ✅ **Security Deposit**: Equal to monthly rent, paid at move-in
- ✅ **Room Occupancy**: One active tenant per room maximum

### 7.2 Billing and Payment Rules
- ✅ **Billing Cycles**: Monthly, based on rent start date
- ✅ **Due Date**: Billing period end + 10 days
- ✅ **Penalty Rate**: 5% of total amount due (configurable)
- ✅ **Penalty Trigger**: Payment received after due date
- ✅ **Payment Methods**: Cash and GCash accepted

### 7.3 Deposit Rules (Move-Out)
- ✅ **5+ Fully Paid Bills**: Both deposits available for outstanding balances
- ✅ **4 or Fewer Fully Paid Bills**: Only advance payment available, security deposit forfeited
- ✅ **Refund Processing**: External handling with system tracking

### 7.4 Email Notification Rules
- ✅ **Automatic Triggers**: All major system actions trigger appropriate emails
- ✅ **Template Consistency**: Standardized format and branding
- ✅ **Delivery Tracking**: Success/failure logging for all emails

### 7.5 System Security Rules
- ✅ **Role-Based Access**: Different permission levels for staff
- ✅ **Comprehensive Auditing**: All actions logged with user attribution
- ✅ **Data Integrity**: Validation and business rule enforcement
- ✅ **Financial Accuracy**: Precise calculations with audit trails

---

## Conclusion

The J&H Management System provides a comprehensive, automated solution for rental property management that ensures:

- **Accurate Financial Management**: Precise billing calculations and payment tracking
- **Streamlined Operations**: Automated processes reduce manual work and errors
- **Complete Audit Trail**: Full accountability and historical tracking
- **Professional Communication**: Automated, consistent tenant communications
- **Fair and Transparent Policies**: Clear rules applied consistently to all tenants

This system design ensures that J&H Management can efficiently handle all aspects of tenant lifecycle management while maintaining accurate financial records and providing excellent tenant service through automated communications and transparent processes.