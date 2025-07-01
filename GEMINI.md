# J&H Management System - Business Logic Rules

## Tenant Management Business Rules

### Move-In Process
1. **Advance Payment** = Room's monthly rent (PHP)
2. **Security Deposit** = Room's monthly rent (PHP)
3. **Contract Duration** = 6 months from rent_start_date
4. **Initial Setup**: Record initial_electricity_reading, set tenant as active, mark room as occupied

### Move-Out Process (Two-Phase)

#### Phase 1: Calculate Final Balance
- Confirm move_out_date
- Calculate **Final Consolidated Bill**:
  - **Prorated Rent**: (room.monthly_rent ÷ total_days_in_cycle) × days_occupied_in_current_cycle
  - **Electricity Charges**: (present_electricity_reading - previous_reading) × branch.electricity_rate
  - **Water Charges**: Editable amount for final period
  - **Extra Fees**: Editable amount and description
  - **Outstanding Bills**: Sum of all active/partially paid bills
- Apply **Deposit Rules** based on fully paid bill count (5+ bills = both deposits available, 4 or fewer = security deposit forfeited)
- Create final bill with is_final_bill = true
- Send appropriate email (final bill or refund notification)

#### Phase 2: Settlement & Deactivation
- Record payment or refund against final bill
- When final bill reaches 'fully_paid' status:
  - Set tenant.is_active = false
  - Set tenant.room_id = NULL
  - Set room.is_occupied = false

## Billing Calculations

### Billing Cycle Determination
```javascript
// Example: rent_start_date = 2025-03-17
// Cycle 1: 2025-03-17 to 2025-04-16
// Cycle 2: 2025-04-17 to 2025-05-16
// Cycle 3: 2025-05-17 to 2025-06-16
```

### Bill Components
1. **Monthly Rent**: Use room's specific monthly_rent (may differ from branch default)
2. **Electricity**: (present_reading - previous_reading) × branch.electricity_rate
3. **Water**: Fixed branch.water_rate
4. **Extra Fees**: Editable amount + description
5. **Total Before Penalty**: Sum of above
6. **Due Date**: billing_period_end + 10 days

### Penalty System
- **Trigger**: payment_date > due_date AND bill not fully paid
- **Amount**: Configurable percentage (default 5%) of total_amount_due (before penalty)
- **Configuration**: Admins can modify penalty percentage globally via Settings (FR-SETT-002)
- **Application**: Add to total_amount_due, update bill status
- **Note**: Penalty percentage changes affect only FUTURE calculations, not existing bills

### Payment Status Logic
- **Active**: Newly generated, no payments
- **Partially Paid**: 0 < amount_paid < total_amount_due
- **Fully Paid**: amount_paid ≥ total_amount_due
- **Refund**: For final bills where tenant deposit exceeds balance

## Deposit Rules on Move-Out

### Cycle Count Determination
Count bills with status = 'fully_paid' for the tenant

### Rule Application
- **5+ Fully Paid Bills** (6th cycle or beyond): 
  - Available: advance_payment + security_deposit
  - Apply to: outstanding balance
  - Refund: remaining amount if any
- **4 or Fewer Fully Paid Bills** (5th cycle or below):
  - Available: advance_payment only
  - Forfeited: security_deposit (becomes company income)
  - Apply: advance_payment to outstanding balance
  - Refund: remaining advance_payment if any

## Financial Reporting Logic

### Monthly Income Calculation
- **Rent Collected**: Sum of rent payments for the month
- **Electricity Collected**: Sum of electricity payments for the month
- **Water Collected**: Sum of water payments for the month
- **Extra Fees Collected**: Sum of extra fee payments for the month
- **Penalty Fees Collected**: Sum of penalty payments for the month
- **Forfeited Deposits**: Security deposits from tenants with < 6 cycles who moved out

### Monthly Expenses
- Sum of all company_expenses for the selected month

### Profit/Loss
- **Profit/Loss** = Total Monthly Income - Total Monthly Expenses

## Email Trigger Rules

### Automatic Triggers
1. **Welcome Email**: After tenant move-in
2. **Bill Email**: After bill generation
3. **Edited Bill Email**: After bill modification
4. **Partial Payment Email**: After partial payment recording
5. **Full Payment Receipt**: After bill reaches fully_paid status
6. **Final Bill Email**: For move-out with balance due
7. **Refund Notice**: For move-out with refund due
8. **Daily Reminders**: 3 days before billing cycle end for each active tenant

## Audit Requirements

### Mandatory Logging Actions
- User authentication events
- Tenant move-in/move-out
- Bill generation and modifications
- Payment recording
- Settings changes (rates, penalty percentage)
- Company expense CRUD operations

### Critical Value Tracking
For monetary amounts and dates, log both old_values and new_values:
- present_reading_date
- payment_date
- monthly_rent rates
- electricity_rate, water_rate
- **penalty_percentage** (critical for audit - changes affect all future penalty calculations)
- present_electricity_reading
- extra_fee amounts
- payment amounts
- expense amounts

# J&H Management System - Database Design

## Core Entities & Relationships

### Primary Tables
- **branches** - Branch locations with default rates
- **rooms** - Individual rental units within branches
- **tenants** - Tenant information and lease details
- **bills** - Billing records with calculations
- **payments** - Payment transactions against bills
- **company_expenses** - Business expense tracking
- **audit_logs** - System activity tracking

## Key Entity Patterns

### Branches
```sql
- id (PK)
- name (Branch Name)
- address
- monthly_rent_rate (PHP)
- water_rate (PHP)
- electricity_rate (PHP)
- room_number_prefix
```

### Rooms
```sql
- id (PK)
- branch_id (FK)
- room_number
- monthly_rent (PHP, defaults to branch rate)
- is_occupied (boolean)
```

### Tenants
```sql
- id (PK)
- room_id (FK, nullable for moved-out tenants)
- full_name
- phone_number
- email_address
- rent_start_date
- contract_start_date
- contract_end_date
- initial_electricity_reading
- advance_payment (PHP)
- security_deposit (PHP)
- is_active (boolean)
- move_out_date (nullable)
```

### Bills
```sql
- id (PK)
- tenant_id (FK)
- billing_period_start
- billing_period_end
- previous_electricity_reading
- present_electricity_reading
- present_reading_date (editable)
- electricity_consumption
- electricity_amount (PHP)
- water_amount (PHP)
- monthly_rent_amount (PHP)
- extra_fee (PHP)
- extra_fee_description
- penalty_fee (PHP)
- total_amount_due (PHP)
- amount_paid (PHP)
- due_date
- status ('active', 'partially_paid', 'fully_paid', 'refund')
- is_final_bill (boolean)
```

### Payments
```sql
- id (PK)
- bill_id (FK)
- amount_paid (PHP)
- payment_date (editable)
- payment_method ('cash', 'gcash')
- notes
```

### Audit Logs
```sql
- id (PK)
- user_id (FK)
- action
- target_table
- target_id
- old_values (JSON for monetary/date changes)
- new_values (JSON for monetary/date changes)
- timestamp
```

## Critical Business Logic

### Billing Cycle Calculation
- Based on tenant's `rent_start_date`
- Consistent monthly periods (e.g., 3/17 to 4/16, then 4/17 to 5/16)
- Due date = billing_period_end + 10 days

### Penalty Calculation
- Configurable percentage (default 5%) of `total_amount_due` (before penalty)
- Stored in system settings table for global configuration
- Applied when payment_date > due_date
- Only for bills not yet fully paid
- Setting changes affect future penalty calculations only

### Deposit Rules (Move-Out)
- **5+ fully paid bills** (6th cycle or beyond): Both advance payment and security deposit available for outstanding balances
- **4 or fewer fully paid bills** (5th cycle or below): Only advance payment available, security deposit forfeited

### Final Bill Calculation
- Prorated monthly rent based on days occupied
- Final electricity reading and consumption
- Final water charges (editable)
- Extra fees (editable)
- All outstanding bill balances
- Deposit application based on cycle rules

# J&H Management System - Development Standards

## Code Organization & Structure

### Next.js Project Structure
```
j-h-apartment-management/
├── app/                    # Next.js 14+ App Router with Server Components
│   ├── (auth)/            # Auth group routes
│   ├── dashboard/         # Dashboard, branch & expense management
│   │   ├── branches/     # Branch management components
│   │   └── expenses/     # Expense tracking components
│   ├── tenants/          # Tenant management
│   ├── billing/          # Billing system
│   ├── history/          # Historical data & audit logs
│   ├── settings/         # System settings
│   └── api/              # API routes
├── components/            # Reusable React components
│   ├── ui/               # Base UI components
│   ├── forms/            # Form components
│   ├── tables/           # Data table components
│   └── layout/           # Layout components
├── lib/                  # Utility functions
│   ├── supabase/         # Supabase client and utilities
│   ├── validations/      # Joi/Zod validation schemas
│   ├── calculations/     # Business logic calculations
│   └── utils/            # General utilities
├── hooks/                # Custom React hooks
├── types/                # TypeScript type definitions
├── supabase/             # Database migrations and functions
│   ├── migrations/       # SQL migration files
│   └── functions/        # Edge functions
└── public/               # Static assets
```

### Component Naming Conventions
- **PascalCase** for component files: `TenantList.tsx`, `BillGenerator.tsx`
- **camelCase** for utility functions: `calculateBill()`, `validatePayment()`
- **kebab-case** for route segments: `/billing/generate-bill`
- **UPPER_SNAKE_CASE** for constants: `PENALTY_PERCENTAGE`, `DEFAULT_CONTRACT_MONTHS`

## TypeScript Standards

### Type Definitions
```typescript
// Core entity types
interface Tenant {
  id: string;
  room_id: string | null;
  full_name: string;
  email_address: string;
  phone_number: string;
  rent_start_date: string;
  contract_start_date: string;
  contract_end_date: string;
  initial_electricity_reading: number;
  advance_payment: number; // PHP
  security_deposit: number; // PHP
  is_active: boolean;
  move_out_date: string | null;
}

interface Bill {
  id: string;
  tenant_id: string;
  billing_period_start: string;
  billing_period_end: string;
  monthly_rent_amount: number; // PHP
  electricity_amount: number; // PHP
  water_amount: number; // PHP
  extra_fee: number; // PHP
  penalty_fee: number; // PHP
  total_amount_due: number; // PHP
  amount_paid: number; // PHP
  status: 'active' | 'partially_paid' | 'fully_paid' | 'refund';
  is_final_bill: boolean;
}
```

### Error Handling Types
```typescript
type ApiResponse<T> = {
  data: T | null;
  error: string | null;
  success: boolean;
};

type ValidationError = {
  field: string;
  message: string;
};
```

## Business Logic Implementation

### Calculation Functions
```typescript
// lib/calculations/billing.ts
export function calculateElectricityCharge(
  presentReading: number,
  previousReading: number,
  rate: number
): number {
  const consumption = presentReading - previousReading;
  return consumption * rate;
}

export function calculatePenalty(
  totalAmount: number,
  paymentDate: Date,
  dueDate: Date,
  penaltyPercentage: number // Retrieved from system settings, not hardcoded
): number {
  if (paymentDate <= dueDate) return 0;
  return (totalAmount * penaltyPercentage) / 100;
}

export function calculateBillingPeriod(
  rentStartDate: Date,
  cycleNumber: number
): { start: Date; end: Date } {
  // Implementation of consistent monthly billing cycles
}
```

### Deposit Rules Implementation
```typescript
// lib/calculations/deposits.ts
export function calculateDepositApplication(
  tenantId: string,
  fullyPaidBillCount: number,
  advancePayment: number,
  securityDeposit: number,
  outstandingBalance: number
): {
  availableAmount: number;
  forfeitedAmount: number;
  refundAmount: number;
} {
  if (fullyPaidBillCount >= 5) { // 5+ fully paid bills = 6th cycle or beyond
    const availableAmount = advancePayment + securityDeposit;
    const appliedAmount = Math.min(availableAmount, outstandingBalance);
    return {
      availableAmount,
      forfeitedAmount: 0,
      refundAmount: availableAmount - appliedAmount
    };
  } else { // 4 or fewer fully paid bills = 5th cycle or below
    const appliedAmount = Math.min(advancePayment, outstandingBalance);
    return {
      availableAmount: advancePayment,
      forfeitedAmount: securityDeposit,
      refundAmount: advancePayment - appliedAmount
    };
  }
}
```

## Database Interaction Patterns

### Supabase Client Usage
```typescript
// lib/supabase/client.ts
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export const supabase = createClientComponentClient();

// Typed query example
export async function getTenantBills(tenantId: string): Promise<Bill[]> {
  const { data, error } = await supabase
    .from('bills')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('billing_period_start', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}
```

### Audit Logging Pattern
```typescript
// lib/audit/logger.ts
export async function logAuditEvent(
  userId: string,
  action: string,
  targetTable: string,
  targetId: string,
  oldValues?: any,
  newValues?: any
) {
  await supabase.from('audit_logs').insert({
    user_id: userId,
    action,
    target_table: targetTable,
    target_id: targetId,
    old_values: oldValues,
    new_values: newValues,
    timestamp: new Date().toISOString()
  });
}
```

## Form Validation Standards

### Validation Schema Patterns
```typescript
// lib/validations/tenant.ts
import Joi from 'joi';

export const tenantMoveInSchema = Joi.object({
  full_name: Joi.string().min(2).max(100).required(),
  email_address: Joi.string().email().required(),
  phone_number: Joi.string().pattern(/^[0-9+\-\s()]+$/).required(),
  room_id: Joi.string().uuid().required(),
  rent_start_date: Joi.date().required(),
  initial_electricity_reading: Joi.number().min(0).required()
});

export const billGenerationSchema = Joi.object({
  tenant_id: Joi.string().uuid().required(),
  present_electricity_reading: Joi.number().min(0).required(),
  present_reading_date: Joi.date().required(),
  extra_fee: Joi.number().min(0).default(0),
  extra_fee_description: Joi.string().optional()
});
```

## API Route Standards

### Error Handling Middleware
```typescript
// lib/middleware/error-handler.ts
export function withErrorHandling(handler: any) {
  return async (req: Request, res: Response) => {
    try {
      return await handler(req, res);
    } catch (error) {
      console.error('API Error:', error);
      return res.status(500).json({
        error: 'Internal server error',
        success: false
      });
    }
  };
}
```

### API Response Patterns
```typescript
// app/api/tenants/route.ts
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { error, value } = tenantMoveInSchema.validate(body);
    
    if (error) {
      return Response.json({
        error: error.details[0].message,
        success: false
      }, { status: 400 });
    }

    // Business logic here
    const tenant = await createTenant(value);

    return Response.json({
      data: tenant,
      success: true
    });
  } catch (error) {
    return Response.json({
      error: 'Failed to create tenant',
      success: false
    }, { status: 500 });
  }
}
```

## Email Function Standards

### Edge Function Structure
```typescript
// supabase/functions/send-email/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import nodemailer from 'npm:nodemailer';

serve(async (req) => {
  try {
    const { emailType, recipientData, templateData } = await req.json();
    
    const transporter = nodemailer.createTransporter({
      host: Deno.env.get('SMTP_HOST'),
      port: parseInt(Deno.env.get('SMTP_PORT') || '587'),
      auth: {
        user: Deno.env.get('SMTP_USERNAME'),
        pass: Deno.env.get('SMTP_PASSWORD')
      }
    });

    const emailContent = await generateEmailContent(emailType, templateData);
    
    await transporter.sendMail({
      from: Deno.env.get('FROM_EMAIL'),
      to: recipientData.email,
      subject: emailContent.subject,
      html: emailContent.html
    });

    return new Response(JSON.stringify({ success: true }));
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500
    });
  }
});
```

## Performance Standards

### Server-Side Rendering & Performance
- Use Next.js 14+ Server Components for optimal performance
- Implement React Server Components (RSC) for data-heavy components
- Utilize Streaming SSR for faster Time to First Byte (TTFB)
- Implement Partial Prerendering (PPR) for static content
- Use Suspense boundaries strategically for loading states
- Enable Edge Runtime for API routes where possible

### Database Query Optimization
- Use appropriate indexes on frequently queried columns
- Implement pagination with cursor-based navigation
- Use RLS policies efficiently with optimized policy conditions
- Implement Redis caching for frequently accessed data
- Use materialized views for complex aggregations
- Optimize Supabase realtime subscriptions

### Frontend Performance
- Implement React Server Components by default
- Use Client Components only when necessary (interactivity)
- Implement proper loading and error boundaries
- Use Image component with automatic optimization
- Enable HTTP/2 and compression
- Implement progressive enhancement
- Use dynamic imports for large third-party libraries
- Optimize and lazy load below-the-fold content
- Implement infinite scroll with virtualization
- Use optimistic updates for better UX

### Caching Strategy
- Implement stale-while-revalidate pattern
- Use React Cache for server-side data fetching
- Implement HTTP caching headers
- Use edge caching for static assets
- Cache expensive calculations server-side

## Testing Standards

### Unit Test Patterns
```typescript
// __tests__/calculations/billing.test.ts
import { calculateElectricityCharge, calculatePenalty } from '@/lib/calculations/billing';

describe('Billing Calculations', () => {
  test('calculates electricity charge correctly', () => {
    const charge = calculateElectricityCharge(150, 100, 10);
    expect(charge).toBe(500); // (150-100) * 10
  });

  test('calculates penalty for late payment', () => {
    const paymentDate = new Date('2025-01-20');
    const dueDate = new Date('2025-01-10');
    const penalty = calculatePenalty(1000, paymentDate, dueDate, 5);
    expect(penalty).toBe(50); // 5% of 1000
  });
});
```

## Code Quality Standards

### ESLint Configuration
```json
{
  "extends": ["next/core-web-vitals", "@typescript-eslint/recommended"],
  "rules": {
    "no-console": "warn",
    "@typescript-eslint/no-unused-vars": "error",
    "prefer-const": "error",
    "no-var": "error"
  }
}
```

### Pre-commit Hooks
- ESLint for code quality
- Prettier for code formatting
- TypeScript type checking
- Unit test execution

## Documentation Standards

### Code Documentation
- JSDoc comments for complex functions
- README files for major modules
- API documentation for public endpoints
- Database schema documentation

### Inline Comments
- Explain business logic, not obvious code
- Document why, not what
- Include references to BRD requirements
- Explain complex calculations and formulas

# J&H Management System - Email Notification System

## Email Infrastructure

### Technical Stack
- **Service**: Nodemailer within Supabase Edge Functions
- **Runtime**: Deno environment
- **Triggers**: Automated based on system events
- **Configuration**: SMTP credentials stored as environment variables

### Security Requirements
- SMTP credentials stored securely in environment variables
- Never expose email configuration client-side
- Use secure SMTP connections (TLS/SSL)

## Automated Email Triggers

### 1. Welcome Email (FR-EMAIL-001)
- **Trigger**: After tenant move-in process completion
- **Recipient**: New tenant
- **Content**: 
  - Welcome message
  - Lease details (room, branch, contract dates)
  - Contact information for management
  - Important policies and procedures

### 2. Bill Generated Email (FR-EMAIL-002)
- **Trigger**: After bill generation
- **Recipient**: Tenant associated with the bill
- **Content**:
  - Detailed bill breakdown (rent, electricity, water, extra fees)
  - Billing period dates
  - Due date
  - Payment instructions
  - Total amount due

### 3. Bill Edited Email (FR-EMAIL-003)
- **Trigger**: When existing bill details are modified
- **Recipient**: Tenant associated with the bill
- **Content**:
  - Updated bill details
  - Explanation of changes
  - New total amount due
  - Updated due date if applicable

### 4. Partial Payment Confirmation (FR-EMAIL-004)
- **Trigger**: After partial payment recording
- **Recipient**: Tenant who made payment
- **Content**:
  - Payment confirmation details (amount, date, method)
  - Remaining balance
  - Next payment due date

### 5. Full Payment Receipt (FR-EMAIL-005)
- **Trigger**: When bill reaches 'fully_paid' status
- **Recipient**: Tenant who completed payment
- **Content**:
  - Payment completion confirmation
  - Receipt details
  - "Paid in Full" status
  - Next billing cycle information

### 6. Final Bill Email (FR-EMAIL-007)
- **Trigger**: During move-out Phase 1, when tenant owes money
- **Recipient**: Moving-out tenant
- **Content**:
  - Final consolidated bill breakdown
  - Deposit application details
  - Outstanding balance owed
  - Payment deadline and instructions

### 7. Refund Information Email (FR-EMAIL-006)
- **Trigger**: During move-out Phase 1, when tenant is owed refund
- **Recipient**: Moving-out tenant
- **Content**:
  - Final bill calculation
  - Deposit application breakdown
  - Refund amount details
  - Refund process timeline

### 8. Daily Admin Reminders (FR-EMAIL-008)
- **Trigger**: Daily automated check (3 days before billing cycle end)
- **Recipient**: System administrators
- **Content**:
  - List of tenants requiring bill generation
  - Billing cycle end dates
  - Pending billing actions

## Email Template Structure

### Standard Email Components
1. **Header**: J&H Management branding and logo
2. **Greeting**: Personalized with tenant name
3. **Main Content**: Specific to email type
4. **Footer**: Contact information, unsubscribe options
5. **Attachments**: PDF bills, CSV reports where applicable

### Data Requirements for Templates
```javascript
// Example data structure for bill email
{
  tenant: {
    full_name: string,
    email_address: string,
    room_number: string,
    branch_name: string
  },
  bill: {
    billing_period_start: date,
    billing_period_end: date,
    monthly_rent_amount: number,
    electricity_amount: number,
    water_amount: number,
    extra_fee: number,
    extra_fee_description: string,
    total_amount_due: number,
    due_date: date
  }
}
```

## Report Email System (FR-DASH-003)

### Monthly Report Generation
- **Trigger**: Manual - Dashboard "Send Report" button
- **Recipient**: User-specified email addresses (multiple allowed)
- **Content**:
  - Monthly financial summary
  - CSV attachment with detailed data
  - Selected month/year in subject line

### CSV Report Format
```csv
Type,Description,Amount (PHP),Date
Income,Total Rent Collected,50000.00,2025-03
Income,Total Electricity Charges,15000.00,2025-03
Income,Total Water Charges,5000.00,2025-03
Income,Total Extra Fees,2000.00,2025-03
Income,Total Penalty Fees,1500.00,2025-03
Income,Forfeited Deposits,3000.00,2025-03
Expense,Office Supplies,2500.00,2025-03
Expense,Utilities,8000.00,2025-03
```

## Edge Function Implementation Patterns

### Email Function Structure
```javascript
// Supabase Edge Function pattern
export async function sendEmail(emailType, recipientData, templateData) {
  // Configure Nodemailer with environment variables
  // Select appropriate email template
  // Populate template with data
  // Send email and log result
  // Return success/failure status
}
```

### Email Templates
- Store templates in Edge Function assets or external storage
- Support for both HTML and plain text versions
- Dynamic content insertion using template engines
- Responsive design for mobile email clients

## Error Handling

### Delivery Failures
- Log email send attempts and results
- Retry logic for temporary failures
- Admin notification for persistent failures
- Fallback communication methods

### Template Errors
- Validate template data before sending
- Graceful degradation for missing data
- Error logging for debugging
- Default templates for critical communications

## Compliance & Best Practices

### Email Best Practices
- Clear, professional subject lines
- Mobile-friendly responsive design
- Unsubscribe options where required
- Spam-compliant content formatting

### Data Privacy
- Only send emails to verified tenant addresses
- Secure transmission of sensitive financial data
- Audit logging of email activities
- Retention policies for email logs

## Testing & Monitoring

### Email Testing
- Development environment test addresses
- Template rendering verification
- Link and attachment testing
- Cross-client compatibility

### Monitoring
- Email delivery success rates
- Bounce and error tracking
- Performance monitoring (send times)
- User engagement metrics where appropriate

# J&H Management System - Security & Authentication

## Authentication System

### Authentication Provider
- **Primary**: Supabase Auth
- **Method**: Username/password authentication
- **Password Security**: Bcrypt hashing with salt
- **Session Management**: JWT tokens with automatic refresh

### User Account Management (FR-AUTH-001 to FR-AUTH-003)

#### User Registration/Creation
- Admin-controlled user creation (no self-registration)
- Required fields: username, email, password, role
- Email verification for new accounts
- Strong password requirements enforcement

#### User Profile Management
- Users can update: username, email address, password
- Email change requires verification
- Password change requires current password confirmation
- Profile audit logging for security tracking

### Role-Based Access Control (FR-AUTH-002)

#### User Roles Structure
```sql
roles:
- super_admin: Full system access
- admin: Most operations, limited settings access
- branch_manager: Branch-specific operations
- accountant: Financial data access, limited modifications
- staff: Basic operations, read-mostly access
```

#### Permission Matrix
- **Super Admin**: All CRUD operations, system settings, user management
- **Admin**: Tenant management, billing, expenses, reports (no user management)
- **Branch Manager**: Limited to assigned branch operations
- **Accountant**: Financial reports, expense management, payment recording
- **Staff**: View-only access, basic data entry

## Row-Level Security (RLS)

### Supabase RLS Implementation
- Enable RLS on all sensitive tables
- Policy-based access control
- User context awareness
- Branch-specific data isolation where applicable

### RLS Policy Examples
```sql
-- Example: Branch managers can only access their branch data
CREATE POLICY branch_manager_access ON rooms
  FOR ALL USING (
    auth.jwt() ->> 'role' = 'super_admin' OR
    auth.jwt() ->> 'role' = 'admin' OR
    (auth.jwt() ->> 'role' = 'branch_manager' AND 
     branch_id = auth.jwt() ->> 'assigned_branch_id')
  );
```

## Data Security Requirements

### Encryption Standards (NFR-SEC-003)
- **In Transit**: HTTPS/TLS 1.3 for all communications
- **At Rest**: Database encryption via Supabase
- **Sensitive Data**: Additional encryption for PII where required
- **API Communications**: Encrypted request/response payloads

### Environment Variables (NFR-SEC-004)
```bash
# Required secure environment variables
SMTP_HOST=
SMTP_PORT=
SMTP_USERNAME=
SMTP_PASSWORD=
DATABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
JWT_SECRET=
```

### Security Headers
```javascript
// Required HTTP security headers
{
  "Content-Security-Policy": "default-src 'self'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()"
}
```

## Input Validation & Sanitization

### SQL Injection Prevention (NFR-SEC-005)
- Use Supabase client parameterized queries
- Never concatenate user input into SQL strings
- Input validation at API boundaries
- Type checking and sanitization

### XSS Prevention
- HTML entity encoding for user-generated content
- CSP headers to restrict script execution
- Input sanitization for all form fields
- Output encoding in templates

### Input Validation Patterns
```javascript
// Example validation schemas
const tenantSchema = {
  full_name: Joi.string().min(2).max(100).required(),
  email_address: Joi.string().email().required(),
  phone_number: Joi.string().pattern(/^[0-9+\-\s()]+$/),
  monthly_rent: Joi.number().positive().precision(2)
};
```

## Session Management

### JWT Token Security
- Short-lived access tokens (15 minutes)
- Refresh token rotation
- Secure token storage (httpOnly cookies)
- Token blacklist for logout

### Session Policies
- Automatic logout after inactivity
- Single session per user (optional)
- Device/location tracking for suspicious activity
- Password change forces re-authentication

## Audit & Monitoring

### Security Event Logging
- Authentication attempts (success/failure)
- Permission elevation attempts
- Sensitive data access
- Configuration changes
- Failed authorization attempts

### Monitoring Alerts
- Multiple failed login attempts
- Unusual access patterns
- Privilege escalation attempts
- Data export activities
- After-hours system access

## API Security

### Rate Limiting
- Login attempt rate limiting (5 attempts per 15 minutes)
- API endpoint rate limiting
- IP-based restrictions for admin functions
- CAPTCHA for repeated failures

### API Authentication
```javascript
// Example API security middleware
async function authenticateRequest(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const { user, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  req.user = user;
  next();
}
```

## Data Privacy & GDPR Considerations

### Personal Data Handling
- Minimal data collection principle
- Clear data retention policies
- User consent for data processing
- Right to data portability
- Right to erasure (with business constraints)

### Financial Data Security
- PCI DSS compliance considerations
- Secure payment method storage
- Financial data access logging
- Regular security audits

## Backup & Recovery Security

### Backup Encryption
- Encrypted database backups
- Secure backup storage (Supabase managed)
- Access controls on backup systems
- Regular restore testing

### Disaster Recovery
- Documented recovery procedures
- RTO/RPO targets defined
- Regular disaster recovery testing
- Security controls in recovery environment

## Development Security

### Code Security Practices
- Regular dependency vulnerability scanning
- Static code analysis
- Security code reviews
- Environment separation (dev/staging/prod)

### Deployment Security
- Automated security testing in CI/CD
- Environment variable validation
- Secure deployment pipelines
- Post-deployment security verification

## Compliance Requirements

### Internal Compliance
- Regular security assessments
- User access reviews (quarterly)
- Security policy documentation
- Staff security training

### External Compliance
- Industry best practices adherence
- Regular penetration testing (annually)
- Third-party security assessments
- Compliance documentation maintenance

# J&H Management System - Architecture & Tech Stack

## Overview
The J&H Management System is a web-based rental property management application designed for J&H Management staff (tenants do NOT have direct access).

## Technology Stack
- **Frontend**: Next.js 14+ (React-based web application)
  - React Server Components (RSC) for optimal performance
  - Streaming SSR and Partial Prerendering
  - Edge Runtime for API routes
  - Server Actions for form handling
- **Backend**: Supabase Enterprise
  - Database: PostgreSQL 15+ with Row-Level Security (RLS)
  - Redis caching for high-performance data access
  - Authentication: Supabase Auth with JWT
  - Serverless Functions: Supabase Edge Functions (Deno runtime)
  - Real-time subscriptions for live updates
  - Point-in-time recovery and automated backups
- **Email Service**: Nodemailer within Supabase Edge Functions
- **Currency**: All monetary values in Philippine Pesos (PHP)
- **Performance Features**:
  - HTTP/2 and compression enabled
  - Edge caching for static assets
  - Materialized views for complex queries
  - Cursor-based pagination
  - Optimistic updates for better UX

## Core System Modules
1. **Authentication & Authorization** - User account management with role-based access
2. **Dashboard & Analytics** - Business metrics, financial reporting, audit logs
3. **Branch Management** - Multi-branch operations with default rates
4. **Room Management** - Individual room tracking and occupancy status
5. **Tenant Management** - Move-in, move-out, contract renewal processes
6. **Billing System** - Automated billing cycles with flexible calculations
7. **Payment Processing** - Payment recording with penalty calculations
8. **Company Expenses** - Manual expense tracking and categorization
9. **Email Notifications** - Automated tenant communications
10. **History & Audit** - Comprehensive tracking and audit trails

## Key Business Rules
- **Billing Cycles**: Consistent monthly cycles based on tenant's rent_start_date
- **Contract Terms**: Default 6-month contracts with renewal options
- **Deposit Rules**: Different rules for tenants with 5+ vs 4 or fewer fully paid bills
- **Penalty System**: Configurable penalty percentage (default 5%) for payments more than 10 days after due date
- **Move-Out Process**: Two-phase process with final bill calculation and settlement

## Security Requirements
- HTTPS/SSL encryption for all communications
- Row-Level Security (RLS) implementation
- Environment variables for sensitive data (SMTP credentials)
- Protection against SQL injection and XSS
- Role-based access control


# J&H Management System - UI/UX Guidelines

## General Design Principles

### Target Users
- J&H Management staff (administrators, branch managers, accounting personnel)
- **NOT** tenant-facing - system is for internal use only
- Must be intuitive for non-technical staff

### Core UX Requirements
- **Intuitive Navigation**: Clear menu structure for all system modules
- **Fast Loading**: Critical pages load within 3 seconds
- **Clear Visual Hierarchy**: Important actions and information prominently displayed
- **Consistent Layout**: Standardized component patterns across modules

## Form Design Standards

### Date Inputs
- **User-friendly date pickers** for all date fields
- **Editable dates**: present_reading_date and payment_date must be fully editable (not just current date)
- **Default behavior**: Default to current date but allow backdating/future dating
- **Clear labeling**: Indicate purpose (e.g., "Present Reading Date", "Payment Date")

### Monetary Fields
- **PHP Currency Display**: All monetary values clearly marked as Philippine Pesos (₱ or PHP)
- **Number formatting**: Use appropriate decimal places (2 for currency)
- **Input validation**: Prevent negative values where inappropriate
- **Clear calculations**: Show breakdown of bill components, penalties, totals

### Required vs Optional Fields
- **Visual indicators**: Clear marking of required fields
- **Smart defaults**: Pre-populate with sensible defaults where possible
- **Progressive disclosure**: Show additional fields only when needed

## Navigation Structure

### Main Menu Sections
1. **Dashboard** - Overview metrics, analytics, branch management, and expense tracking
   - Branch management and room creation integrated directly in dashboard
   - Company expense tracking and reporting integrated in dashboard
   - expense operations
2. **Tenants** - Active tenant list and management
3. **Billing** - Bill generation and payment recording
4. **History** - Comprehensive historical data
   - Fully paid bills
   - Moved-out tenants
   - Complete audit trail and system activity logs
   - Advanced filtering and search capabilities
5. **Settings** - System configuration and user management

### Breadcrumb Navigation
- Show current location within system hierarchy
- Enable quick navigation back to parent sections

## Data Display Patterns

### List Views
- **Filtering options**: By branch, status, date ranges
- **Sorting capabilities**: Key columns sortable
- **Pagination**: For large datasets
- **Quick actions**: Common actions accessible from list items

### Detail Views
- **Comprehensive information**: All relevant data for the entity
- **Action buttons**: Primary actions prominently displayed
- **Edit capabilities**: In-line editing where appropriate
- **History tracking**: Show related history (bills for tenants, payments for bills)

## Dashboard Design

### Key Metrics Display
- **Summary cards**: Total branches, active tenants, room occupancy
- **Financial overview**: Monthly income, expenses, profit/loss for selected month
- **Visual indicators**: Color coding for positive/negative values
- **Quick filters**: Month/year selection for financial data

### Recent Activity
- **Audit log preview**: Recent system activities
- **Pending actions**: Tenants needing bills, overdue payments
- **Quick actions**: Generate reports, send reminders

## Billing Interface

### Bill Generation Form
- **Tenant selection**: Clear display of tenant and room information
- **Reading inputs**: Previous reading display, current reading input
- **Automatic calculations**: Real-time calculation of charges
- **Extra fees section**: Optional additional charges with descriptions
- **Review before generate**: Summary of bill components before creation

### Payment Recording
- **Bill summary**: Show current bill details and balance
- **Payment fields**: Amount, method, date (editable), notes
- **Penalty warnings**: Alert if payment date triggers penalty
- **Receipt generation**: Immediate confirmation of payment recorded

## Move-Out Process Interface

### Two-Phase Design
- **Phase 1 Interface**: Move-out date selection, final bill calculation preview
- **Phase 2 Interface**: Final settlement recording and tenant deactivation
- **Clear progress indicators**: Show which phase user is in
- **Confirmation dialogs**: Important actions require confirmation

## Error Handling

### Error Messages
- **Clear language**: Avoid technical jargon
- **Actionable guidance**: Tell user how to fix the issue
- **Contextual placement**: Show errors near relevant fields
- **Success feedback**: Confirm when actions complete successfully

### Validation Patterns
- **Real-time validation**: Immediate feedback on form fields
- **Business rule validation**: Check against system rules (deposit amounts, billing cycles)
- **Data consistency**: Prevent conflicting data entry

## Responsive Design

### Mobile Considerations
- **Touch-friendly**: Adequate tap targets for mobile devices
- **Essential functions**: Core functionality accessible on mobile
- **Simplified layouts**: Streamlined interface for smaller screens

## Performance Indicators

### Loading States
- **Progress indicators**: Show system is processing
- **Skeleton screens**: For data-heavy pages
- **Timeout handling**: Clear messaging for slow operations

### Critical Performance Targets
- **Dashboard load**: < 3 seconds
- **Bill generation**: < 2 seconds
- **Payment recording**: < 2 seconds
- **Report generation**: < 10 seconds

## Email Interface

### Email Composition
- **Template previews**: Show email content before sending
- **Recipient management**: Multiple email addresses for reports
- **Attachment handling**: CSV reports, bill attachments
- **Send confirmations**: Verify emails were sent successfully













