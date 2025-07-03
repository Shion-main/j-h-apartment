import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { SupabaseClient } from '@supabase/supabase-js';

// Remove the global supabase client since we'll pass it in from the components/API routes
// const supabase = createClientComponentClient();

/**
 * Log audit events for all critical actions
 * Especially important for monetary amounts and dates
 */
export async function logAuditEvent(
  supabase: SupabaseClient,
  userId: string,
  action: string,
  targetTable: string,
  targetId?: string | null,
  oldValues?: any,
  newValues?: any
) {
  try {
    // Create timestamp in Philippine Time (UTC+8)
    const now = new Date();
    const phTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' }));
    
    const { error } = await supabase.from('audit_logs').insert({
      user_id: userId,
      action,
      target_table: targetTable,
      target_id: targetId,
      old_value: oldValues,
      new_value: newValues,
      timestamp: phTime.toISOString() // Store in ISO format but with PH time
    });

    if (error) {
      console.error('Failed to log audit event:', {
        message: error.message,
        details: error.details,
        code: error.code,
      });
      // Do not re-throw, as audit logging should not break primary functionality
    }
  } catch (error) {
    console.error('Unexpected error in logAuditEvent:', error);
  }
}

/**
 * Log tenant move-in
 */
export async function logTenantMoveIn(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  tenantData: any
) {
  await logAuditEvent(
    supabase,
    userId,
    'TENANT_MOVE_IN',
    'tenants',
    tenantId,
    null,
    {
      full_name: tenantData.full_name,
      room_id: tenantData.room_id,
      rent_start_date: tenantData.rent_start_date,
      advance_payment: tenantData.advance_payment,
      security_deposit: tenantData.security_deposit
    }
  );
}

/**
 * Log tenant move-out
 */
export async function logTenantMoveOut(
  supabase: SupabaseClient,
  userId: string,
  tenantId: string,
  phase: 'PHASE_1' | 'PHASE_2',
  data: any
) {
  await logAuditEvent(
    supabase,
    userId,
    `TENANT_MOVE_OUT_${phase}`,
    'tenants',
    tenantId,
    null,
    data
  );
}

/**
 * Log bill generation
 */
export async function logBillGeneration(
  supabase: SupabaseClient,
  userId: string,
  billId: string,
  billData: any
) {
  await logAuditEvent(
    supabase,
    userId,
    'BILL_GENERATED',
    'bills',
    billId,
    null,
    {
      tenant_id: billData.tenant_id,
      billing_period_start: billData.billing_period_start,
      billing_period_end: billData.billing_period_end,
      present_electricity_reading: billData.present_electricity_reading,
      present_reading_date: billData.present_reading_date,
      total_amount_due: billData.total_amount_due,
      extra_fee: billData.extra_fee
    }
  );
}

/**
 * Log bill modification
 */
export async function logBillModification(
  supabase: SupabaseClient,
  userId: string,
  billId: string,
  oldValues: any,
  newValues: any
) {
  await logAuditEvent(
    supabase,
    userId,
    'BILL_MODIFIED',
    'bills',
    billId,
    oldValues,
    newValues
  );
}

/**
 * Get payment record action string
 */
export function getPaymentAction(paymentStatus: string): string {
  return paymentStatus === 'fully_paid'
    ? 'PAYMENT_COMPLETED'
    : 'PAYMENT_PARTIAL';
}

/**
 * Log payment recording
 */
export async function logPaymentRecord(
  supabase: SupabaseClient,
  userId: string,
  paymentId: string,
  paymentData: any
) {
  const action = getPaymentAction(paymentData.new_status);

  await logAuditEvent(
    supabase,
    userId,
    action,
    'payments',
    paymentId,
    null,
    {
      bill_id: paymentData.bill_id,
      amount_paid: paymentData.amount_paid,
      payment_date: paymentData.payment_date,
      payment_method: paymentData.payment_method,
      payment_status: paymentData.new_status
    }
  );
}

/**
 * Log settings changes (critical for penalty percentage)
 */
export async function logSettingsChange(
  supabase: SupabaseClient,
  userId: string,
  settingKey: string,
  oldValue: any,
  newValue: any
) {
  await logAuditEvent(
    supabase,
    userId,
    'SETTINGS_CHANGED',
    'system_settings',
    settingKey,
    { [settingKey]: oldValue },
    { [settingKey]: newValue }
  );
}

/**
 * Log branch rate changes
 */
export async function logBranchRateChange(
  supabase: SupabaseClient,
  userId: string,
  branchId: string,
  oldRates: any,
  newRates: any
) {
  await logAuditEvent(
    supabase,
    userId,
    'BRANCH_RATES_CHANGED',
    'branches',
    branchId,
    oldRates,
    newRates
  );
}

/**
 * Log company expense operations
 */
export async function logExpenseOperation(
  supabase: SupabaseClient,
  userId: string,
  action: 'CREATED' | 'UPDATED' | 'DELETED',
  expenseId: string,
  expenseData: any,
  oldData?: any
) {
  await logAuditEvent(
    supabase,
    userId,
    `EXPENSE_${action}`,
    'company_expenses',
    expenseId,
    oldData || null,
    expenseData
  );
}

/**
 * Log user management operations
 */
export async function logUserOperation(
  supabase: SupabaseClient,
  adminUserId: string,
  action: 'CREATED' | 'UPDATED' | 'DELETED',
  targetUserId: string,
  userData: any,
  oldData?: any
) {
  await logAuditEvent(
    supabase,
    adminUserId,
    `USER_${action}`,
    'users',
    targetUserId,
    oldData || null,
    userData
  );
}

/**
 * Log user authentication events
 * @param supabase - An active Supabase client instance
 * @param userId - The ID of the user
 * @param action - The specific auth action
 */
export async function logAuthEvent(
  supabase: SupabaseClient,
  userId: string,
  action: 'LOGIN' | 'LOGOUT' | 'PASSWORD_CHANGE' | 'EMAIL_CHANGE'
) {
  await logAuditEvent(
    supabase,
    userId,
    `AUTH_${action}`,
    'auth.users',
    userId,
    null,
    { timestamp: new Date().toISOString() }
  );
} 