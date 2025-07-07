# J&H Management System

A comprehensive rental property management system designed for J&H Management staff to efficiently manage branches, tenants, billing, and financial operations.

## 📋 Table of Contents

- [Overview](#overview)
- [Technology Stack](#technology-stack)
- [System Architecture](#system-architecture)
- [Database Schema](#database-schema)
- [Core Features](#core-features)
- [Business Rules](#business-rules)
- [Email System](#email-system)
- [Implementation Guidelines](#implementation-guidelines)

## 🎯 Overview

The J&H Management System is a web-based application that streamlines rental property management operations. It provides comprehensive tools for managing multiple branches, tenants, billing cycles, payments, and financial reporting - all designed for internal staff use (tenants do not have direct access).

### Key Capabilities

- **Multi-branch Management**: Handle multiple property locations with different rates
- **Tenant Lifecycle Management**: Complete move-in to move-out process
- **Automated Billing**: Consistent billing cycles with penalty calculations
- **Financial Tracking**: Income, expenses, and profit/loss reporting
- **Audit Trail**: Comprehensive logging of all system activities
- **Email Notifications**: Automated tenant communications

## 🛠 Technology Stack

### Frontend
- **Next.js 14+** with React Server Components
- **TypeScript** for type safety
- **Tailwind CSS** for styling
- **React Hook Form** for form management

### Backend
- **Supabase** (PostgreSQL database)
- **Supabase Auth** for authentication
- **Supabase Edge Functions** (Deno runtime)
- **Row-Level Security (RLS)** for data protection

### Additional Services
- **Nodemailer** for email notifications
- **Real-time subscriptions** for live updates

## 🏗 System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Next.js App   │    │   Supabase      │    │   Edge Functions │
│   (Frontend)    │◄──►│   (Database)    │◄──►│   (Email, etc.)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │                       │                       │
    React Components         PostgreSQL              Nodemailer
    API Routes              Auth System              Scheduled Tasks
    Real-time Subscriptions RLS Policies            Business Logic
```

## 🗄 Database Schema

### Core Tables

| Table | Purpose | Key Features |
|-------|---------|--------------|
| `branches` | Property locations | Default rates, room prefixes |
| `rooms` | Individual units | Occupancy tracking, custom rent |
| `tenants` | Tenant information | Contract dates, deposits |
| `bills` | Billing records | Cycle tracking, calculations |
| `payments` | Payment transactions | Method tracking, audit trail |
| `company_expenses` | Business expenses | Categorization, branch association |
| `audit_logs` | System activity | Complete change tracking |
| `system_settings` | Global configuration | Penalty rates, etc. |

### Detailed Schema

#### Branches Table
```sql
CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  address TEXT NOT NULL,
  monthly_rent_rate NUMERIC NOT NULL,
  water_rate NUMERIC NOT NULL,
  electricity_rate NUMERIC NOT NULL,
  room_number_prefix TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Tenants Table
```sql
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  email_address TEXT NOT NULL,
  room_id UUID REFERENCES rooms(id),
  rent_start_date DATE NOT NULL,
  initial_electricity_reading NUMERIC NOT NULL,
  advance_payment NUMERIC NOT NULL,
  security_deposit NUMERIC NOT NULL,
  contract_start_date DATE NOT NULL,
  contract_end_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  move_out_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Bills Table
```sql
CREATE TABLE bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id) NOT NULL,
  billing_period_start DATE NOT NULL,
  billing_period_end DATE NOT NULL,
  due_date DATE NOT NULL,
  previous_electricity_reading NUMERIC NOT NULL,
  present_electricity_reading NUMERIC NOT NULL,
  present_reading_date DATE NOT NULL,
  electricity_consumption NUMERIC NOT NULL,
  electricity_amount NUMERIC NOT NULL,
  water_amount NUMERIC NOT NULL,
  monthly_rent_amount NUMERIC NOT NULL,
  extra_fee NUMERIC DEFAULT 0,
  extra_fee_description TEXT,
  penalty_amount NUMERIC DEFAULT 0,
  total_amount_due NUMERIC NOT NULL,
  amount_paid NUMERIC DEFAULT 0,
  status TEXT CHECK (status IN ('active', 'partially_paid', 'fully_paid', 'refund', 'final_bill')),
  is_final_bill BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 🚀 Core Features

### 1. Dashboard & Analytics

**Key Metrics Display:**
- Total branches, active tenants, and rooms
- Monthly income, expenses, and profit/loss (PHP)
- Real-time occupancy rates

**Branch Management:**
- Add/edit branches with default rates
- Bulk room creation with prefixes
- Rate management per branch

**Financial Reporting:**
- Monthly CSV reports with detailed breakdowns
- Email delivery to specified recipients
- Comprehensive audit logging

### 2. Tenant Management

**Move-In Process:**
1. **Tenant Information**: Name, phone, email
2. **Room Assignment**: Select available room
3. **Contract Setup**: 6-month default contract
4. **Deposit Calculation**: Based on room rent
5. **System Updates**: Mark room occupied, create tenant record
6. **Welcome Email**: Automated notification

**Move-Out Process (Two-Phase):**

**Phase 1: Financial Calculation**
- Confirm move-out date
- Calculate prorated rent for final period
- Final electricity reading and charges
- Apply deposit rules based on payment history
- Generate final bill or refund calculation
- Send appropriate email notification

**Phase 2: Settlement & Deactivation**
- Record final payment or refund
- Deactivate tenant account
- Free up room for new tenants
- Complete audit trail

### 3. Billing System

**Bill Generation:**
- Consistent monthly cycles based on rent start date
- Automatic calculation of electricity, water, and rent
- Configurable extra fees and descriptions
- Due date calculation (10 days after cycle end)

**Payment Processing:**
- Multiple payment methods (cash, GCash)
- Penalty calculation for late payments
- Partial payment support
- Automatic status updates

**Penalty System:**
- Configurable percentage (default 5%)
- Applied only when payment is late
- Global setting affects future calculations only

### 4. History & Audit

**Comprehensive Tracking:**
- All paid bills and moved-out tenants
- Complete audit trail of system changes
- Historical data preservation
- Advanced filtering and search

**Audit Logging:**
- User actions with timestamps
- Old and new values for changes
- IP address tracking
- Target table and record identification

### 5. Settings & Configuration

**System Settings:**
- Global penalty percentage
- Branch rate management
- Payment method configuration

**User Management:**
- Role-based access control
- Account settings and security
- Password management

### 6. Company Expenses

**Expense Tracking:**
- Date, amount, description, category
- Optional branch association
- Full CRUD operations
- Audit logging for all changes

**Categories:**
- Utilities, Maintenance, Salaries
- Supplies, Repairs, Other

## 📊 Business Rules

### Billing Cycles
- **Consistent Monthly Periods**: Based on tenant's rent start date
- **Example**: If rent starts March 17, cycles are March 17-April 16, April 17-May 16, etc.
- **Due Date**: 10 days after billing period end

### Deposit Rules (Move-Out)
| Payment History | Available Deposits | Forfeited Amount |
|----------------|-------------------|------------------|
| 5+ fully paid bills | Advance + Security | None |
| 4 or fewer bills | Advance only | Security deposit |

### Penalty Calculation
- **Trigger**: Payment date > due date AND bill not fully paid
- **Formula**: `total_amount_due × penalty_percentage`
- **Application**: Added to bill total, affects future calculations only

### Contract Terms
- **Default Duration**: 6 months
- **Renewal**: Extendable via admin interface
- **Early Termination**: Handled through move-out process

## 📧 Email System

### Automated Email Types

| Email Type | Trigger | Content |
|------------|---------|---------|
| Welcome Email | Tenant move-in | Contract details, policies |
| Bill Email | Bill generation | Detailed breakdown, due date |
| Edited Bill Email | Bill modification | Updated amounts, changes |
| Partial Payment | Payment recording | Confirmation, remaining balance |
| Full Payment Receipt | Bill fully paid | Receipt, next cycle info |
| Final Bill Email | Move-out with balance | Final charges, payment deadline |
| Refund Notice | Move-out with refund | Refund amount, process timeline |
| Admin Reminders | Daily scheduled | Upcoming billing cycles |

### Email Infrastructure
- **Service**: Supabase Edge Functions with Nodemailer
- **SMTP**: Secure email delivery
- **Templates**: HTML and plain text versions
- **Error Handling**: Retry logic and failure logging

## 🔧 Implementation Guidelines

### Security Requirements
- **HTTPS/SSL**: All communications encrypted
- **Row-Level Security**: Database-level access control
- **Input Validation**: Server-side validation for all inputs
- **Audit Logging**: Complete activity tracking
- **Environment Variables**: Secure credential management

### Performance Considerations
- **Server Components**: Next.js 14+ for optimal performance
- **Database Indexing**: Optimized queries for large datasets
- **Caching**: Redis for frequently accessed data
- **Pagination**: Handle large result sets efficiently
- **Real-time Updates**: Supabase subscriptions for live data

### Development Standards
- **TypeScript**: Full type safety throughout
- **Error Handling**: Comprehensive error management
- **Testing**: Unit and integration tests
- **Code Quality**: ESLint, Prettier, pre-commit hooks
- **Documentation**: Inline comments and API documentation

### UI/UX Guidelines
- **Responsive Design**: Mobile-friendly interface
- **Intuitive Navigation**: Clear menu structure
- **Form Validation**: Real-time feedback
- **Loading States**: Progress indicators
- **Error Messages**: Clear, actionable guidance

### Testing Strategy
- **Unit Tests**: Business logic and calculations
- **Integration Tests**: API endpoints and database operations
- **End-to-End Tests**: Complete user workflows
- **Performance Tests**: Load testing for critical operations

### Deployment Considerations
- **Environment Separation**: Dev, staging, production
- **Database Migrations**: Version-controlled schema changes
- **Backup Strategy**: Automated database backups
- **Monitoring**: Application and database monitoring
- **Security Audits**: Regular security assessments

---

## 📝 Quick Start

1. **Clone the repository**
2. **Install dependencies**: `npm install`
3. **Set up environment variables**
4. **Run database migrations**
5. **Start development server**: `npm run dev`

## 🤝 Contributing

Please refer to the development standards and coding guidelines when contributing to this project.

## 📄 License

This project is proprietary software for J&H Management.


