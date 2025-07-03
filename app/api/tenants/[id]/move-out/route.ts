import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { tenantMoveOutSchema, validateSchema } from '@/lib/validations/schemas';
import { 
  calculateProratedRent, 
  calculateDepositApplication, 
  calculateBillingPeriod 
} from '@/lib/calculations/billing';
import { logTenantMoveOut } from '@/lib/audit/logger';
import { EmailService } from '@/lib/services/emailService';
import { 
  allocatePaymentToComponents, 
  createPaymentComponents, 
  validatePaymentAllocation 
} from '@/lib/calculations/payment-allocation';

// Phase 1: Calculate final bill and determine deposit application
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const tenantId = params.id;

    // Validate tenant ID
    if (!tenantId || typeof tenantId !== 'string' || tenantId === 'undefined') {
      return NextResponse.json({
        error: 'Invalid tenant ID',
        success: false
      }, { status: 400 });
    }

    const body = await request.json();
    const isPreview = body.preview === true;

    // Get current user for audit logging
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({
        error: 'Unauthorized',
        success: false
      }, { status: 401 });
    }

    // Validate input
    const { error: validationError, value } = validateSchema(tenantMoveOutSchema, body);
    if (validationError) {
      return NextResponse.json({
        error: validationError,
        success: false
      }, { status: 400 });
    }
    
    // Set defaults for optional fields if they're missing from the body
    if (value.extra_fees === undefined) value.extra_fees = 0;
    if (value.extra_fee_description === undefined) value.extra_fee_description = '';

    // Get tenant details
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select(`
        *,
        rooms (
          id,
          room_number,
          monthly_rent,
          branches (
            id,
            name,
            electricity_rate,
            water_rate
          )
        )
      `)
      .eq('id', tenantId)
      .eq('is_active', true)
      .single();

    if (tenantError || !tenant || !tenant.rooms || !tenant.rooms.branches) {
      console.error('Tenant lookup error:', tenantError);
      return NextResponse.json({
        error: 'Active tenant not found or missing room/branch information',
        success: false
      }, { status: 404 });
    }

    // Check if final bill already exists
    const { data: existingFinalBill } = await supabase
      .from('bills')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('is_final_bill', true)
      .single();

    if (existingFinalBill) {
      return NextResponse.json({
        error: 'Final bill already exists for this tenant',
        success: false
      }, { status: 400 });
    }

    // Get count of fully paid bills
    const { data: fullyPaidBills, error: billsError } = await supabase
      .from('bills')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('status', 'fully_paid');

    if (billsError) {
      console.error('Error fetching fully paid bills:', billsError);
      return NextResponse.json({
        error: 'Failed to fetch bill history',
        success: false
      }, { status: 500 });
    }

    const fullyPaidBillCount = fullyPaidBills?.length || 0;

    // Get all outstanding bills
    const { data: outstandingBills, error: outstandingError } = await supabase
      .from('bills')
      .select('id, total_amount_due, amount_paid')
      .eq('tenant_id', tenantId)
      .neq('status', 'fully_paid');

    if (outstandingError) {
      console.error('Error fetching outstanding bills:', outstandingError);
      return NextResponse.json({
        error: 'Failed to fetch outstanding bills',
        success: false
      }, { status: 500 });
    }

    // Calculate outstanding balance
    const outstandingBalance = outstandingBills?.reduce(
      (sum, bill) => sum + (bill.total_amount_due - bill.amount_paid), 0
    ) || 0;

    // Get last fully paid bill for previous electricity reading
    const { data: lastFullyPaidBill } = await supabase
      .from('bills')
      .select('present_electricity_reading, billing_period_end')
      .eq('tenant_id', tenantId)
      .eq('status', 'fully_paid')
      .order('billing_period_end', { ascending: false })
      .limit(1)
      .single();
    
    // Use last fully paid bill reading, or initial reading if no bills
    const previousReading = lastFullyPaidBill?.present_electricity_reading ?? tenant.initial_electricity_reading;

    // Calculate current billing cycle based on rent start date and paid bills count
    const rentStartDate = new Date(tenant.rent_start_date);
    const currentDate = new Date();
    
    // Calculate the current cycle using the same method as the billing page
    const currentCycleNumber = fullyPaidBillCount + 1; // Next cycle to bill
    const currentCycleStart = new Date(rentStartDate);
    currentCycleStart.setMonth(currentCycleStart.getMonth() + fullyPaidBillCount);
    
    const currentCycleEnd = new Date(currentCycleStart);
    currentCycleEnd.setMonth(currentCycleEnd.getMonth() + 1);
    currentCycleEnd.setDate(currentCycleEnd.getDate() - 1);

    // Calculate prorated rent for the current billing period up to move-out date
    const moveOutDate = new Date(value.move_out_date);
    
    console.log('DEBUG - Move-Out Final Bill Calculation:');
    console.log('Full Billing Cycle Start:', currentCycleStart.toISOString().split('T')[0]);
    console.log('Full Billing Cycle End:', currentCycleEnd.toISOString().split('T')[0]);
    console.log('Tenant Move-Out Date:', moveOutDate.toISOString().split('T')[0]);
    console.log('Monthly Rent:', tenant.rooms.monthly_rent);
    
    const proratedRent = calculateProratedRent(
      tenant.rooms.monthly_rent,
      currentCycleStart,
      currentCycleEnd,
      moveOutDate
    );
    
    console.log('Calculated Prorated Rent:', proratedRent);

    // Calculate final electricity charges
    const presentElectricityReading = value.final_electricity_reading || previousReading;
    const electricityCharges = (presentElectricityReading - previousReading) * tenant.rooms.branches.electricity_rate;

    // Calculate final water charges (editable amount)
    const finalWaterCharges = value.final_water_amount ?? tenant.rooms.branches.water_rate;

    // Calculate extra fees
    const extraFees = value.extra_fees || 0;

    // Calculate total final bill amount
    const finalBillAmount = proratedRent + electricityCharges + finalWaterCharges + extraFees + outstandingBalance;

    // Apply deposit rules based on fully paid bill count and room transfer flag
    const isRoomTransfer = value.is_room_transfer || false;
    const depositApplication = calculateDepositApplication(
      fullyPaidBillCount,
      tenant.advance_payment,
      tenant.security_deposit,
      finalBillAmount,
      isRoomTransfer
    );

    // Determine final balance
    const finalBalance = finalBillAmount - depositApplication.availableAmount;

    // If this is a preview request, return calculation without creating actual bill
    if (isPreview) {
      return NextResponse.json({
        data: {
          deposit_application: depositApplication,
          final_balance: finalBalance,
          fully_paid_bills: fullyPaidBillCount,
          breakdown: {
            prorated_rent: proratedRent,
            electricity_charges: electricityCharges,
            water_charges: finalWaterCharges,
            extra_fees: extraFees,
            outstanding_balance: outstandingBalance,
          },
          billing_period: {
            start: currentCycleStart.toISOString().split('T')[0],
            end: currentCycleEnd.toISOString().split('T')[0],
            total_days: Math.ceil((currentCycleEnd.getTime() - currentCycleStart.getTime()) / (1000 * 60 * 60 * 24)) + 1,
            days_occupied: Math.ceil((moveOutDate.getTime() - currentCycleStart.getTime()) / (1000 * 60 * 60 * 24)) + 1,
          },
          next_step: finalBalance < 0 ? 'process_refund' : 'collect_payment',
        },
        success: true
      });
    }

    // Create final bill
    let totalAmountDue = finalBillAmount;
    let amountPaid = depositApplication.availableAmount;
    let billStatus = finalBalance < 0 ? 'refund' : (depositApplication.availableAmount >= finalBillAmount ? 'fully_paid' : 'active');

    // If refund is due, store as negative value for both total_amount_due and amount_paid
    if (finalBalance < 0) {
      totalAmountDue = -Math.abs(finalBalance);
      amountPaid = -Math.abs(finalBalance);
    }

    const finalBillData = {
      tenant_id: tenantId,
      branch_id: tenant.rooms.branches.id,
      room_id: tenant.rooms.id,
      billing_period_start: currentCycleStart.toISOString().split('T')[0],
      billing_period_end: currentCycleEnd.toISOString().split('T')[0], // ✅ FIXED: Use proper cycle end, not move-out date
      previous_electricity_reading: previousReading,
      present_electricity_reading: presentElectricityReading,
      present_reading_date: value.move_out_date,
      electricity_consumption: presentElectricityReading - previousReading,
      electricity_amount: electricityCharges,
      water_amount: finalWaterCharges,
      monthly_rent_amount: proratedRent,
      extra_fee: extraFees,
      extra_fee_description: value.extra_fee_description || null,
      penalty_amount: 0,
      total_amount_due: totalAmountDue,
      amount_paid: amountPaid,
      due_date: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // +10 days
      status: billStatus,
      is_final_bill: true,
      advance_payment: tenant.advance_payment,
      security_deposit: tenant.security_deposit,
      // Enhanced deposit tracking
      applied_advance_payment: depositApplication.availableAmount >= finalBillAmount ? 
        Math.min(depositApplication.availableAmount, tenant.advance_payment) : 
        depositApplication.availableAmount,
      applied_security_deposit: depositApplication.availableAmount > tenant.advance_payment ? 
        depositApplication.availableAmount - tenant.advance_payment : 0,
      forfeited_amount: depositApplication.forfeitedAmount,
      refund_amount: finalBalance < 0 ? Math.abs(finalBalance) : 0,
    };

    // Create the final bill
    const { data: finalBill, error: finalBillError } = await supabase
      .from('bills')
      .insert(finalBillData)
      .select()
      .single();

    if (finalBillError) {
      console.error('Error creating final bill:', finalBillError);
      return NextResponse.json({
        error: 'Failed to create final bill',
        success: false
      }, { status: 500 });
    }

    // Create deposit application payment if deposits are being applied
    if (depositApplication.availableAmount > 0) {
      const { data: depositPayment, error: depositPaymentError } = await supabase
        .from('payments')
        .insert({
          bill_id: finalBill.id,
          tenant_id: tenantId,
          amount: depositApplication.availableAmount,
          payment_date: value.move_out_date,
          payment_method: 'deposit_application',
          notes: 'Automated application of tenant deposits on move-out.',
        })
        .select()
        .single();

      if (depositPaymentError) {
        console.error('Error creating deposit payment:', depositPaymentError);
        // Don't fail the entire process for this, but log it
      } else {
        // Create payment components for the deposit application
        const billComponents = {
          penalty_amount: 0, // Final bills typically don't have penalties
          extra_fee: extraFees,
          electricity_amount: electricityCharges,
          water_amount: finalWaterCharges,
          monthly_rent_amount: proratedRent
        };

        const paymentComponents = allocatePaymentToComponents(
          depositApplication.availableAmount, 
          billComponents
        );

        const { error: componentsError } = await createPaymentComponents(
          supabase,
          depositPayment.id,
          finalBill.id,
          paymentComponents
        );

        if (componentsError) {
          console.error('Error creating deposit payment components:', componentsError);
          // Don't fail the entire process for this, but log it
        }
      }
    }

    // Send appropriate email based on final balance
    try {
      if (finalBalance < 0) {
        // Send refund notice email (Note: this email doesn't include forfeited_amount)
        await EmailService.sendRefundNoticeEmail({
          email: tenant.email_address,
          full_name: tenant.full_name,
          room_number: tenant.rooms.room_number,
          branch_name: tenant.rooms.branches.name,
          move_out_date: value.move_out_date,
          prorated_rent: proratedRent,
          electricity_amount: electricityCharges,
          water_amount: finalWaterCharges,
          extra_fee: extraFees,
          outstanding_bills: outstandingBalance,
          total_charges: finalBillAmount,
          advance_payment_available: tenant.advance_payment,
          security_deposit_available: tenant.security_deposit,
          refund_amount: Math.abs(finalBalance)
        });
      } else {
        // Send final bill email
        await EmailService.sendFinalBillEmail({
          email: tenant.email_address,
          full_name: tenant.full_name,
          room_number: tenant.rooms.room_number,
          branch_name: tenant.rooms.branches.name,
          move_out_date: value.move_out_date,
          prorated_rent: proratedRent,
          electricity_amount: electricityCharges,
          water_amount: finalWaterCharges,
          extra_fee: extraFees,
          outstanding_bills: outstandingBalance,
          subtotal: finalBillAmount,
          advance_payment_applied: depositApplication.availableAmount,
          security_deposit_applied: depositApplication.appliedAmount,
          security_deposit_forfeited: depositApplication.forfeitedAmount,
          final_amount_due: finalBalance
        });
      }
    } catch (emailError) {
      console.error('Error sending final bill email:', emailError);
      // Don't return error, just log it since the bill was created successfully
    }

    // Update tenant status
    const { error: tenantUpdateError } = await supabase
      .from('tenants')
      .update({
        move_out_date: value.move_out_date
      })
      .eq('id', tenantId);

    if (tenantUpdateError) {
      console.error('Error updating tenant status:', tenantUpdateError);
      return NextResponse.json({
        error: 'Failed to update tenant status',
        success: false
      }, { status: 500 });
    }

    // Log the move-out
    await logTenantMoveOut(supabase, user.id, tenantId, 'PHASE_1', {
      move_out_date: value.move_out_date,
      final_bill_id: finalBill.id,
      final_balance: finalBalance,
      deposit_application: depositApplication,
      is_room_transfer: isRoomTransfer
    });

    return NextResponse.json({
      data: {
        final_bill_id: finalBill.id,
        final_balance: finalBalance,
        deposit_application: depositApplication,
        next_step: finalBalance < 0 ? 'process_refund' : 'collect_payment'
      },
      success: true
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      success: false
    }, { status: 500 });
  }
}

// Phase 2: Complete move-out process after final settlement
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const tenantId = params.id;

    // Validate tenant ID
    if (!tenantId || typeof tenantId !== 'string' || tenantId === 'undefined') {
      return NextResponse.json({
        error: 'Invalid tenant ID',
        success: false
      }, { status: 400 });
    }

    // Get current user for audit logging
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({
        error: 'Unauthorized',
        success: false
      }, { status: 401 });
    }

    // Get tenant with room and branch details
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select(`
        *,
        rooms (
          id,
          room_number,
          branches (
            id,
            name
          )
        )
      `)
      .eq('id', tenantId)
      .single();

    if (tenantError || !tenant) {
      console.error('Tenant lookup error:', tenantError);
      return NextResponse.json({
        error: 'Tenant not found',
        success: false
      }, { status: 404 });
    }

    // Get the final bill
    const { data: finalBill, error: finalBillError } = await supabase
      .from('bills')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_final_bill', true)
      .single();

    if (finalBillError || !finalBill) {
      console.error('Final bill lookup error:', finalBillError);
      return NextResponse.json({
        error: 'Final bill not found. Please initiate move-out process first.',
        success: false
      }, { status: 404 });
    }

    // Check if final bill is settled
    if (finalBill.status !== 'fully_paid' && finalBill.status !== 'refund') {
      return NextResponse.json({
        error: 'Final bill must be fully settled before completing move-out',
        success: false
      }, { status: 400 });
    }

    // If the bill was a refund, update its status to fully_paid to close it out
    if (finalBill.status === 'refund') {
      const { error: updateBillError } = await supabase
        .from('bills')
        .update({ status: 'fully_paid', amount_paid: 0, total_amount_due: 0 })
        .eq('id', finalBill.id);

      if (updateBillError) {
        console.error('Error updating final bill status:', updateBillError);
        // Log this error but don't block the move-out completion
      }
    }

    // Update tenant status (only if not already inactive)
    if (tenant.is_active) {
      const { error: tenantUpdateError } = await supabase
        .from('tenants')
        .update({
          is_active: false,
        })
        .eq('id', tenantId);

      if (tenantUpdateError) {
        console.error('Error updating tenant:', tenantUpdateError);
        return NextResponse.json({
          error: 'Failed to update tenant status',
          success: false
        }, { status: 500 });
      }
    }

    // Update room availability (only if room is still occupied)
    if (tenant.room_id) {
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('is_occupied')
        .eq('id', tenant.room_id)
        .single();

      if (!roomError && room && room.is_occupied) {
        const { error: roomUpdateError } = await supabase
          .from('rooms')
          .update({ is_occupied: false })
          .eq('id', tenant.room_id);

        if (roomUpdateError) {
          console.error('Error updating room:', roomUpdateError);
          return NextResponse.json({
            error: 'Failed to update room availability',
            success: false
          }, { status: 500 });
        }
      }
    }

    // Log the move-out completion
    await logTenantMoveOut(
      supabase,
      user.id,
      tenantId,
      'PHASE_2',
      {
        completed_date: new Date().toISOString(),
        final_bill_status: finalBill.status,
      }
    );

    // Send farewell email
    try {
      await EmailService.sendFarewellEmail({
        email: tenant.email_address,
        full_name: tenant.full_name,
        room_number: tenant.rooms?.room_number || '',
        branch_name: tenant.rooms?.branches?.name || '',
        move_out_date: tenant.move_out_date || new Date().toISOString().split('T')[0],
      });
    } catch (emailError) {
      console.error('Failed to send farewell email:', emailError);
      // Don't fail the process if email fails
    }

    return NextResponse.json({
      data: {
        message: 'Move-out process completed successfully',
        tenant_status: 'inactive',
        room_available: true,
        final_bill_status: finalBill.status,
      },
      success: true
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json({
      error: 'Internal server error',
      success: false
    }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const tenantId = params.id;

    // Validate tenant ID
    if (!tenantId || typeof tenantId !== 'string' || tenantId === 'undefined') {
      return NextResponse.json({ error: 'Invalid tenant ID', success: false }, { status: 400 });
    }

    // Get tenant details
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select(`
        *,
        rooms (
          id,
          room_number,
          monthly_rent,
          branches (
            id,
            name,
            electricity_rate,
            water_rate
          )
        )
      `)
      .eq('id', tenantId)
      .eq('is_active', true)
      .single();

    if (tenantError || !tenant) {
      console.error('Tenant lookup error:', tenantError);
      return NextResponse.json({ error: 'Active tenant not found', success: false }, { status: 404 });
    }

    // Get last fully paid bill for previous electricity reading
    const { data: lastFullyPaidBill } = await supabase
      .from('bills')
      .select('present_electricity_reading, billing_period_end')
      .eq('tenant_id', tenantId)
      .eq('status', 'fully_paid')
      .order('billing_period_end', { ascending: false })
      .limit(1)
      .single();
    const previousReading = lastFullyPaidBill?.present_electricity_reading ?? tenant.initial_electricity_reading;

    // Calculate current billing cycle based on rent start date and paid bills count
    const rentStartDate = new Date(tenant.rent_start_date);
    const currentDate = new Date();

    // Get outstanding bills
    const { data: outstandingBills } = await supabase
      .from('bills')
      .select('id, total_amount_due, amount_paid')
      .eq('tenant_id', tenantId)
      .neq('status', 'fully_paid');
    const outstandingBalance = outstandingBills?.reduce(
      (sum, bill) => sum + (bill.total_amount_due - bill.amount_paid), 0
    ) || 0;

    // Get cycle count (fully paid bills)
    const { data: fullyPaidBills } = await supabase
      .from('bills')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('status', 'fully_paid');
    const cycleCount = fullyPaidBills?.length || 0;

    // Calculate billing cycle based on fully paid bills count
    const fullyPaidBillsCount = cycleCount;
    
    // Calculate the current cycle using the same method as the billing page
    const currentCycleNumber = fullyPaidBillsCount + 1; // Next cycle to bill
    const currentCycleStart = new Date(rentStartDate);
    currentCycleStart.setMonth(currentCycleStart.getMonth() + fullyPaidBillsCount);
    
    const currentCycleEnd = new Date(currentCycleStart);
    currentCycleEnd.setMonth(currentCycleEnd.getMonth() + 1);
    currentCycleEnd.setDate(currentCycleEnd.getDate() - 1);
    
    // Calculate days until cycle end
    const today = new Date();
    const daysUntilCycleEnd = Math.ceil((currentCycleEnd.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // Deposit rules
    const depositApplication = calculateDepositApplication(
      cycleCount,
      tenant.advance_payment,
      tenant.security_deposit,
      0 // outstanding balance not needed for forfeiture status
    );
    const securityDepositForfeited = cycleCount <= 4;

    return NextResponse.json({
      data: {
        room_number: tenant.rooms?.room_number,
        branch_name: tenant.rooms?.branches?.name,
        monthly_rent: tenant.rooms?.monthly_rent,
        contract_start_date: tenant.contract_start_date,
        contract_end_date: tenant.contract_end_date,
        previous_electricity_reading: previousReading,
        billing_period_start: currentCycleStart.toISOString().split('T')[0],
        billing_period_end: currentCycleEnd.toISOString().split('T')[0],
        outstanding_balance: outstandingBalance,
        advance_payment: tenant.advance_payment,
        security_deposit: tenant.security_deposit,
        security_deposit_forfeited: securityDepositForfeited,
        cycle_count: cycleCount,
        rooms: {
          monthly_rent: tenant.rooms?.monthly_rent,
          branches: {
            name: tenant.rooms?.branches?.name,
            electricity_rate: tenant.rooms?.branches?.electricity_rate,
            water_rate: tenant.rooms?.branches?.water_rate
          }
        }
      },
      success: true
    });
  } catch (error) {
    console.error('GET move-out error:', error);
    return NextResponse.json({ error: 'Internal server error', success: false }, { status: 500 });
  }
} 