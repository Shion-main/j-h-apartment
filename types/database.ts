// Core entity types for J&H Management System
export interface Branch {
  id: string;
  name: string;
  address: string;
  monthly_rent_rate: number; // PHP
  water_rate: number; // PHP
  electricity_rate: number; // PHP
  room_number_prefix: string;
  created_at: string;
  updated_at: string;
}

export interface Room {
  id: string;
  branch_id: string;
  room_number: string;
  monthly_rent: number; // PHP - defaults to branch rate
  is_occupied: boolean;
  created_at: string;
  updated_at: string;
  // Joined data
  branch?: Branch;
}

export interface Tenant {
  id: string;
  room_id: string | null;
  full_name: string;
  phone_number: string;
  email_address: string;
  rent_start_date: string;
  contract_start_date: string;
  contract_end_date: string;
  initial_electricity_reading: number;
  advance_payment: number;
  security_deposit: number;
  is_active: boolean;
  move_out_date: string | null;
  final_bill_status?: 'active' | 'partially_paid' | 'fully_paid' | 'refund';
  created_at: string;
  updated_at: string;
  fully_paid_bill_count?: number;
  // Joined data
  rooms?: {
    id: string;
    room_number: string;
    monthly_rent: number;
    branches?: {
      id: string;
      name: string;
      electricity_rate: number;
      water_rate: number;
    };
  };
}

export interface Bill {
  id: string;
  tenant_id: string;
  branch_id: string;
  room_id: string;
  billing_period_start: string;
  billing_period_end: string;
  previous_electricity_reading: number;
  present_electricity_reading: number;
  present_reading_date: string; // editable
  electricity_consumption: number;
  electricity_amount: number; // PHP
  water_amount: number; // PHP
  monthly_rent_amount: number; // PHP
  extra_fee: number; // PHP
  extra_fee_description: string | null;
  penalty_amount: number; // PHP
  total_amount_due: number; // PHP
  amount_paid: number; // PHP
  due_date: string;
  status: 'active' | 'partially_paid' | 'fully_paid' | 'refund' | 'final_bill';
  is_final_bill: boolean;
  advance_payment: number; // PHP - tenant's advance payment at time of bill creation
  security_deposit: number; // PHP - tenant's security deposit at time of bill creation
  advance_payment_applied?: number; // PHP - amount of advance payment applied to this bill
  security_deposit_applied?: number; // PHP - amount of security deposit applied to this bill
  forfeited_amount?: number; // PHP - amount of security deposit forfeited
  refund_amount?: number; // PHP - amount to be refunded to tenant
  created_at: string;
  updated_at: string;
  // Joined data
  tenant?: Tenant;
  tenants?: Tenant; // API sometimes returns "tenants" instead of "tenant"
  rooms?: {
    id: string;
    room_number: string;
    monthly_rent: number;
    branches?: {
      id: string;
      name: string;
      electricity_rate: number;
      water_rate: number;
    };
  };
  payments?: Payment[]; // Array of payments for this bill
  // Computed fields
  isOverdue?: boolean;
  daysOverdue?: number;
  shouldShowPenaltyWarning?: boolean;
}

export interface Payment {
  id: string;
  bill_id: string;
  amount_paid: number; // PHP
  payment_date: string; // editable
  payment_method: 'cash' | 'gcash' | 'deposit_application';
  reference_number: string | null; // GCash reference number
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  bill?: Bill;
}

export interface PaymentComponent {
  id: string;
  payment_id: string;
  bill_id: string;
  component_type: 'rent' | 'electricity' | 'water' | 'extra_fee' | 'penalty';
  amount: number; // PHP
  created_at: string;
  // Joined data
  payment?: Payment;
  bill?: Bill;
}

export interface CompanyExpense {
  id: string;
  expense_date: string;
  amount: number; // PHP
  description: string;
  category: string;
  branch_id: string | null;
  created_at: string;
  updated_at: string;
  // Joined data
  branch?: Branch;
}

export interface AuditLog {
  id: string;
  user_id: string;
  action: string;
  target_table: string;
  target_id: string;
  old_values: any; // JSON for monetary/date changes
  new_values: any; // JSON for monetary/date changes
  timestamp: string;
  // Joined data
  user?: User;
}

export interface User {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  user_id: string;
  full_name: string;
  phone_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role_id: string;
  created_at: string;
  // Joined data
  role?: Role;
}

export interface SystemSettings {
  id: string;
  key: string;
  value: string;
  description: string;
  updated_at: string;
}

// API Response types
export type ApiResponse<T> = {
  data: T | null;
  error: string | null;
  success: boolean;
};

export type ValidationError = {
  field: string;
  message: string;
};

// Business logic types
export interface BillingCycle {
  start: Date;
  end: Date;
  cycleNumber: number;
}

export interface DepositCalculation {
  availableAmount: number;
  forfeitedAmount: number;
  refundAmount: number;
  appliedAmount: number;
}

export interface FinalBillCalculation {
  proratedRent: number;
  electricityCharges: number;
  waterCharges: number;
  extraFees: number;
  outstandingBills: number;
  totalBeforeDeposits: number;
  depositApplication: DepositCalculation;
  finalTotal: number; // positive = owed, negative = refund
}

export interface MonthlyFinancials {
  totalRentCollected: number;
  totalElectricityCollected: number;
  totalWaterCollected: number;
  totalExtraFeesCollected: number;
  totalPenaltyFeesCollected: number;
  totalForfeitedDeposits: number;
  totalIncome: number;
  totalExpenses: number;
  profitLoss: number;
  month: string;
  year: string;
}

// Form types
export interface TenantMoveInForm {
  full_name: string;
  phone_number: string;
  email_address: string;
  room_id: string;
  rent_start_date: string;
  initial_electricity_reading: number;
  advance_payment_received: boolean;
  security_deposit_received: boolean;
}

export interface TenantMoveOutForm {
  move_out_date: string;
  final_electricity_reading: string;
  final_water_amount: string;
  extra_fees: string;
  extra_fee_description: string;
}

export interface BillGenerationForm {
  tenant_id: string;
  present_electricity_reading: number;
  present_reading_date: string;
  extra_fee: number | null;
  extra_fee_description: string | null;
}

export interface PaymentRecordForm {
  bill_id: string;
  amount_paid: string;
  payment_date: string;
  payment_method: 'cash' | 'gcash';
  reference_number: string;
  notes: string;
}

export interface BillEditForm {
  present_electricity_reading: number;
  present_reading_date: string;
  water_amount: number;
  extra_fee: number;
  extra_fee_description: string;
  edit_reason: string;
  allow_fully_paid_edit?: boolean;
}

export interface BranchForm {
  name: string;
  address: string;
  monthly_rent_rate: number;
  water_rate: number;
  electricity_rate: number;
  room_number_prefix: string;
  room_count?: number; // for bulk creation
}

export interface ExpenseForm {
  expense_date: string;
  amount: number;
  description: string;
  category: string;
  branch_id?: string;
}

export interface Database {
  public: {
    Tables: {
      branches: {
        Row: {
          id: string;
          name: string;
          address: string;
          monthly_rent_rate: number; // PHP
          water_rate: number;
          electricity_rate: number;
          room_number_prefix: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          address: string;
          monthly_rent_rate: number; // PHP
          water_rate: number;
          electricity_rate: number;
          room_number_prefix: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          address?: string;
          monthly_rent_rate?: number; // PHP
          water_rate?: number;
          electricity_rate?: number;
          room_number_prefix?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
      rooms: {
        Row: {
          id: string;
          branch_id: string;
          room_number: string;
          monthly_rent: number; // PHP
          is_occupied: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          branch_id: string;
          room_number: string;
          monthly_rent: number; // PHP
          is_occupied?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          branch_id?: string;
          room_number?: string;
          monthly_rent?: number; // PHP
          is_occupied?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      tenants: {
        Row: {
          id: string;
          full_name: string;
          phone_number: string;
          email_address: string;
          branch_id: string;
          room_id: string | null;
          rent_start_date: string;
          initial_electricity_reading: number;
          advance_payment: number; // PHP
          security_deposit: number; // PHP
          contract_start_date: string;
          contract_end_date: string;
          is_active: boolean;
          move_out_date: string | null;
          final_bill_status?: 'active' | 'partially_paid' | 'fully_paid' | 'refund';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          full_name: string;
          phone_number: string;
          email_address: string;
          branch_id: string;
          room_id?: string | null;
          rent_start_date: string;
          initial_electricity_reading: number;
          advance_payment: number; // PHP
          security_deposit: number; // PHP
          contract_start_date: string;
          contract_end_date: string;
          is_active?: boolean;
          move_out_date?: string | null;
          final_bill_status?: 'active' | 'partially_paid' | 'fully_paid' | 'refund';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string;
          phone_number?: string;
          email_address?: string;
          branch_id?: string;
          room_id?: string | null;
          rent_start_date?: string;
          initial_electricity_reading?: number;
          advance_payment?: number; // PHP
          security_deposit?: number; // PHP
          contract_start_date?: string;
          contract_end_date?: string;
          is_active?: boolean;
          move_out_date?: string | null;
          final_bill_status?: 'active' | 'partially_paid' | 'fully_paid' | 'refund';
          created_at?: string;
          updated_at?: string;
        };
      };
      bills: {
        Row: {
          id: string;
          tenant_id: string;
          branch_id: string;
          room_id: string;
          billing_period_start: string;
          billing_period_end: string;
          due_date: string;
          previous_electricity_reading: number;
          present_electricity_reading: number;
          present_reading_date: string;
          electricity_consumption: number;
          electricity_amount: number; // PHP
          water_amount: number; // PHP
          monthly_rent_amount: number; // PHP
          extra_fee: number; // PHP
          extra_fee_description: string | null;
          penalty_amount: number; // PHP
          total_amount_due: number; // PHP
          amount_paid: number; // PHP
          status: 'active' | 'partially_paid' | 'fully_paid' | 'refund' | 'final_bill';
          is_final_bill: boolean;
          advance_payment: number; // PHP - tenant's advance payment at time of bill creation
          security_deposit: number; // PHP - tenant's security deposit at time of bill creation
          applied_advance_payment: number; // PHP - amount of advance payment applied
          applied_security_deposit: number; // PHP - amount of security deposit applied
          forfeited_amount: number; // PHP - amount of security deposit forfeited
          refund_amount: number; // PHP - amount refunded to tenant
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          branch_id: string;
          room_id: string;
          billing_period_start: string;
          billing_period_end: string;
          due_date: string;
          previous_electricity_reading: number;
          present_electricity_reading: number;
          present_reading_date: string;
          electricity_consumption: number;
          electricity_amount: number; // PHP
          water_amount: number; // PHP
          monthly_rent_amount: number; // PHP
          extra_fee?: number; // PHP
          extra_fee_description?: string | null;
          penalty_amount?: number; // PHP
          total_amount_due: number; // PHP
          amount_paid?: number; // PHP
          status?: 'active' | 'partially_paid' | 'fully_paid' | 'refund' | 'final_bill';
          is_final_bill?: boolean;
          advance_payment?: number; // PHP
          security_deposit?: number; // PHP
          applied_advance_payment?: number; // PHP
          applied_security_deposit?: number; // PHP
          forfeited_amount?: number; // PHP
          refund_amount?: number; // PHP
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          branch_id?: string;
          room_id?: string;
          billing_period_start?: string;
          billing_period_end?: string;
          due_date?: string;
          previous_electricity_reading?: number;
          present_electricity_reading?: number;
          present_reading_date?: string;
          electricity_consumption?: number;
          electricity_amount?: number; // PHP
          water_amount?: number; // PHP
          monthly_rent_amount?: number; // PHP
          extra_fee?: number; // PHP
          extra_fee_description?: string | null;
          penalty_amount?: number; // PHP
          total_amount_due?: number; // PHP
          amount_paid?: number; // PHP
          status?: 'active' | 'partially_paid' | 'fully_paid' | 'refund' | 'final_bill';
          is_final_bill?: boolean;
          advance_payment?: number; // PHP
          security_deposit?: number; // PHP
          applied_advance_payment?: number; // PHP
          applied_security_deposit?: number; // PHP
          forfeited_amount?: number; // PHP
          refund_amount?: number; // PHP
          created_at?: string;
          updated_at?: string;
        };
      };
      payments: {
        Row: {
          id: string;
          bill_id: string;
          tenant_id: string;
          amount: number; // PHP
          payment_date: string;
          payment_method: string;
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          bill_id: string;
          tenant_id: string;
          amount: number; // PHP
          payment_date: string;
          payment_method: string;
          notes?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          bill_id?: string;
          tenant_id?: string;
          amount?: number; // PHP
          payment_date?: string;
          payment_method?: string;
          notes?: string | null;
          created_at?: string;
        };
      };
      payment_components: {
        Row: {
          id: string;
          payment_id: string;
          bill_id: string;
          component_type: 'rent' | 'electricity' | 'water' | 'extra_fee' | 'penalty';
          amount: number; // PHP
          created_at: string;
        };
        Insert: {
          id?: string;
          payment_id: string;
          bill_id: string;
          component_type: 'rent' | 'electricity' | 'water' | 'extra_fee' | 'penalty';
          amount: number; // PHP
          created_at?: string;
        };
        Update: {
          id?: string;
          payment_id?: string;
          bill_id?: string;
          component_type?: 'rent' | 'electricity' | 'water' | 'extra_fee' | 'penalty';
          amount?: number; // PHP
          created_at?: string;
        };
      };
      system_settings: {
        Row: {
          id: string;
          penalty_percentage: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          penalty_percentage: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          penalty_percentage?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      company_expenses: {
        Row: {
          id: string;
          expense_date: string;
          amount: number; // PHP
          description: string;
          category: string;
          branch_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          expense_date: string;
          amount: number; // PHP
          description: string;
          category: string;
          branch_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          expense_date?: string;
          amount?: number; // PHP
          description?: string;
          category?: string;
          branch_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      audit_logs: {
        Row: {
          id: string;
          user_id: string | null;
          action: string;
          target_table: string;
          target_id: string | null;
          old_value: any | null;
          new_value: any | null;
          ip_address: string | null;
          timestamp: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          action: string;
          target_table: string;
          target_id?: string | null;
          old_value?: any | null;
          new_value?: any | null;
          ip_address?: string | null;
          timestamp?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          action?: string;
          target_table?: string;
          target_id?: string | null;
          old_value?: any | null;
          new_value?: any | null;
          ip_address?: string | null;
          timestamp?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      roles: {
        Row: {
          id: string;
          role_name: string;
        };
        Insert: {
          id?: string;
          role_name: string;
        };
        Update: {
          id?: string;
          role_name?: string;
        };
      };
      user_roles: {
        Row: {
          user_id: string;
          role_id: string;
        };
        Insert: {
          user_id: string;
          role_id: string;
        };
        Update: {
          user_id?: string;
          role_id?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}