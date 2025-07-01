import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { billEditSchema, validateSchema } from '@/lib/validations/schemas';
import { logBillModification, logAuditEvent } from '@/lib/audit/logger';
import { 
  calculateElectricityCharge, 
  calculatePenalty,
  calculateFinalBill,
  calculateDepositApplication,
  calculateProratedRent
} from '@/lib/calculations/billing';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const billId = params.id;
    const body = await request.json();

    // Get current user for audit logging
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({
        error: 'Unauthorized',
        success: false
      }, { status: 401 });
    }

    // Validate input
    const { error: validationError, value } = validateSchema(billEditSchema, {
      ...body,
      bill_id: billId
    });
    if (validationError) {
      return NextResponse.json({
        error: validationError,
        success: false
      }, { status: 400 });
    }

    // Get current bill data with all necessary joins
    const { data: currentBill, error: billError } = await supabase
      .from('bills')
      .select(`
        *,
        tenants!inner(
          id,
          full_name,
          email_address,
          room_id,
          advance_payment,
          security_deposit,
          move_out_date,
          rooms!inner(
            room_number,
            monthly_rent,
            branches!inner(
              name,
              electricity_rate,
              water_rate
            )
          )
        )
      `)
      .eq('id', billId)
      .single();

    if (billError || !currentBill) {
      return NextResponse.json({
        error: 'Bill not found',
        success: false
      }, { status: 404 });
    }

    // Check if bill can be edited
    if (currentBill.status === 'fully_paid' && !value.allow_fully_paid_edit) {
      return NextResponse.json({
        error: 'Cannot edit a fully paid bill',
        success: false
      }, { status: 400 });
    }

    // Store old values for audit logging
    const oldValues = { ...currentBill };
    let updateData: any = {};
    let newValues: any = {};

    // **FINAL BILL REGENERATION LOGIC**
    if (currentBill.is_final_bill) {
      console.log('Regenerating final bill completely...');
      
      // 1. Get all outstanding bills for this tenant (excluding current bill)
      const { data: outstandingBills } = await supabase
        .from('bills')
        .select('total_amount_due, amount_paid')
        .eq('tenant_id', currentBill.tenant_id)
        .neq('id', billId)
        .in('status', ['active', 'partially_paid']);

      const totalOutstandingAmount = outstandingBills 
        ? outstandingBills.reduce((sum, bill) => sum + (bill.total_amount_due - bill.amount_paid), 0)
        : 0;

      // 2. Get fully paid bill count for deposit calculation
      const { data: paidBills } = await supabase
        .from('bills')
        .select('id')
        .eq('tenant_id', currentBill.tenant_id)
        .eq('status', 'fully_paid');
      const fullyPaidBillCount = paidBills ? paidBills.length : 0;

      // 3. Use edited values or fall back to current values
      const editedValues = {
        present_electricity_reading: value.present_electricity_reading ?? currentBill.present_electricity_reading,
        present_reading_date: value.present_reading_date ?? currentBill.present_reading_date,
        water_amount: value.water_amount ?? currentBill.water_amount,
        extra_fee: value.extra_fee ?? currentBill.extra_fee,
        extra_fee_description: value.extra_fee_description ?? currentBill.extra_fee_description
      };

      // 4. Recalculate ALL components from scratch
      
      // Electricity calculation
      const electricityAmount = calculateElectricityCharge(
        editedValues.present_electricity_reading,
        currentBill.previous_electricity_reading,
        currentBill.tenants.rooms.branches.electricity_rate
      );
      const electricityConsumption = editedValues.present_electricity_reading - currentBill.previous_electricity_reading;

      // Prorated rent calculation (for final bills, rent is usually prorated to move-out date)
      const moveOutDate = new Date(currentBill.tenants.move_out_date || currentBill.billing_period_end);
      const billingPeriodStart = new Date(currentBill.billing_period_start);
      const billingPeriodEnd = new Date(currentBill.billing_period_end);
      const proratedRent = calculateProratedRent(
        currentBill.tenants.rooms.monthly_rent,
        billingPeriodStart,
        billingPeriodEnd,
        moveOutDate
      );

      // 5. Calculate final bill using the calculation function
      const finalBillCalculation = calculateFinalBill(
        currentBill.tenants.rooms.monthly_rent,
        billingPeriodStart,
        billingPeriodEnd,
        moveOutDate,
        electricityAmount,
        editedValues.water_amount,
        editedValues.extra_fee,
        totalOutstandingAmount,
        fullyPaidBillCount,
        currentBill.tenants.advance_payment,
        currentBill.tenants.security_deposit
      );

      console.log('DEBUG - Bill Components:', {
        monthlyRent: currentBill.tenants.rooms.monthly_rent,
        proratedRent: proratedRent,
        electricityAmount,
        waterAmount: editedValues.water_amount,
        extraFee: editedValues.extra_fee,
        totalOutstanding: totalOutstandingAmount,
        fullyPaidBillCount,
        advancePayment: currentBill.tenants.advance_payment,
        securityDeposit: currentBill.tenants.security_deposit
      });

      console.log('DEBUG - Final Bill Calculation:', {
        totalBeforeDeposits: finalBillCalculation.totalBeforeDeposits,
        depositsApplied: finalBillCalculation.depositApplication.appliedAmount,
        finalTotal: finalBillCalculation.finalTotal,
        depositBreakdown: {
          advancePayment: currentBill.tenants.advance_payment,
          securityDeposit: currentBill.tenants.security_deposit,
          appliedAmount: finalBillCalculation.depositApplication.appliedAmount,
          forfeitedAmount: finalBillCalculation.depositApplication.forfeitedAmount,
          refundAmount: finalBillCalculation.depositApplication.refundAmount
        }
      });

      // 6. Determine status and amounts based on final balance
       let finalStatus: string;
       let finalTotalAmountDue: number;
       let finalAmountPaid: number;

       // Deposit breakdown for storage
       let appliedAdvancePayment = 0;
       let appliedSecurityDeposit = 0;
       if (fullyPaidBillCount >= 5) {
         appliedAdvancePayment = Math.min(currentBill.tenants.advance_payment, finalBillCalculation.depositApplication.appliedAmount);
         appliedSecurityDeposit = Math.max(0, finalBillCalculation.depositApplication.appliedAmount - appliedAdvancePayment);
       } else {
         appliedAdvancePayment = Math.min(currentBill.tenants.advance_payment, finalBillCalculation.depositApplication.appliedAmount);
         appliedSecurityDeposit = 0;
       }

       // If there's a refund amount, we should set the bill as a refund
       const hasRefund = finalBillCalculation.depositApplication.refundAmount > 0;
       
       if (hasRefund) {
         // Tenant gets refund - set negative amounts to indicate refund
         finalStatus = 'refund';
         // For refunds, both total_amount_due and amount_paid should be NEGATIVE
         finalTotalAmountDue = -Math.abs(finalBillCalculation.depositApplication.refundAmount);
         finalAmountPaid = -Math.abs(finalBillCalculation.depositApplication.refundAmount);
         
         console.log('DEBUG - Refund Calculation:', {
           refundAmount: finalBillCalculation.depositApplication.refundAmount,
           status: finalStatus,
           totalAmountDue: finalTotalAmountDue,
           amountPaid: finalAmountPaid,
           isRefund: true
         });
       } else if (finalBillCalculation.finalTotal === 0) {
         // Deposits exactly cover the bill
         finalStatus = 'fully_paid';
         finalTotalAmountDue = finalBillCalculation.totalBeforeDeposits;
         finalAmountPaid = finalBillCalculation.depositApplication.appliedAmount;
         
         console.log('DEBUG - Zero Balance:', {
           status: finalStatus,
           totalAmountDue: finalTotalAmountDue,
           amountPaid: finalAmountPaid,
           isFullyPaid: true
         });
       } else {
         // Still money owed after deposits
         finalStatus = 'active';
         finalTotalAmountDue = finalBillCalculation.totalBeforeDeposits;
         finalAmountPaid = finalBillCalculation.depositApplication.appliedAmount;
         
         console.log('DEBUG - Outstanding Balance:', {
           status: finalStatus,
           totalAmountDue: finalTotalAmountDue,
           amountPaid: finalAmountPaid,
           isActive: true
         });
       }

       // 7. **COMPLETE REGENERATION** - Overwrite ALL calculated fields
       updateData = {
         // User-editable fields
         present_electricity_reading: editedValues.present_electricity_reading,
         present_reading_date: editedValues.present_reading_date,
         water_amount: editedValues.water_amount,
         extra_fee: editedValues.extra_fee,
         extra_fee_description: editedValues.extra_fee_description,
         
         // Completely recalculated fields
         electricity_consumption: electricityConsumption,
         electricity_amount: electricityAmount,
         monthly_rent_amount: proratedRent,
         penalty_amount: 0, // Reset penalty for final bills
         total_amount_due: finalTotalAmountDue, // Use the correct amount based on refund/payment status
       
       // Deposit information (for transparency)
       advance_payment: currentBill.tenants.advance_payment,
       security_deposit: currentBill.tenants.security_deposit,
       applied_advance_payment: appliedAdvancePayment,
       applied_security_deposit: appliedSecurityDeposit,
       forfeited_amount: finalBillCalculation.depositApplication.forfeitedAmount,
       refund_amount: finalBillCalculation.depositApplication.refundAmount,
       
       // Status and amount_paid based on final calculation
       status: finalStatus,
       amount_paid: finalAmountPaid,
       
       updated_at: new Date().toISOString()
     };

    // Set new values for audit
    newValues = {
      ...editedValues,
      total_amount_due: updateData.total_amount_due,
      status: updateData.status,
      amount_paid: updateData.amount_paid,
      monthly_rent_amount: updateData.monthly_rent_amount,
      electricity_amount: updateData.electricity_amount,
      final_total_after_deposits: finalBillCalculation.finalTotal,
      deposits_applied: finalBillCalculation.depositApplication.appliedAmount,
      regenerated: true // Flag to indicate this was a complete regeneration
    };

  } else {
    // **REGULAR BILL EDIT LOGIC** (Keep existing logic for non-final bills)
    console.log('Editing regular bill...');

    // Initialize updateData with current values, then override with new values if provided
    updateData = {
      monthly_rent_amount: currentBill.monthly_rent_amount,
      electricity_amount: currentBill.electricity_amount,
      water_amount: currentBill.water_amount,
      extra_fee: currentBill.extra_fee,
      extra_fee_description: currentBill.extra_fee_description,
      present_electricity_reading: currentBill.present_electricity_reading,
      present_reading_date: currentBill.present_reading_date,
      electricity_consumption: currentBill.electricity_consumption,
      penalty_amount: currentBill.penalty_amount, // Keep existing penalty
      total_amount_due: currentBill.total_amount_due, // Will be recalculated
      status: currentBill.status, // Will be recalculated
      amount_paid: currentBill.amount_paid, // Will be recalculated
      updated_at: new Date().toISOString(),
    };

    // Handle electricity reading update
    if (value.present_electricity_reading !== undefined) {
      const newElectricityCharge = calculateElectricityCharge(
        value.present_electricity_reading,
        currentBill.previous_electricity_reading,
        currentBill.tenants.rooms.branches.electricity_rate
      );
      updateData.present_electricity_reading = value.present_electricity_reading;
      updateData.electricity_consumption = value.present_electricity_reading - currentBill.previous_electricity_reading;
      updateData.electricity_amount = newElectricityCharge;
    }

    // Handle other field updates
    if (value.present_reading_date !== undefined) {
      updateData.present_reading_date = value.present_reading_date;
    }
    if (value.water_amount !== undefined) {
      updateData.water_amount = value.water_amount;
    }
    if (value.extra_fee !== undefined) {
      updateData.extra_fee = value.extra_fee;
    }
    if (value.extra_fee_description !== undefined) {
      updateData.extra_fee_description = value.extra_fee_description;
    }

    // Recalculate total amount due for regular bills using the potentially updated values in updateData
    const newTotalBeforePenalty =
      updateData.monthly_rent_amount +
      updateData.electricity_amount +
      updateData.water_amount +
      updateData.extra_fee;

    updateData.total_amount_due = newTotalBeforePenalty + (updateData.penalty_amount || 0);

    // Update status based on payments for regular bills
    if (updateData.total_amount_due < 0) {
      updateData.status = 'refund';
    } else if (currentBill.amount_paid >= updateData.total_amount_due) {
      updateData.status = 'fully_paid';
    } else if (currentBill.amount_paid > 0) {
      updateData.status = 'partially_paid';
    } else {
      updateData.status = 'active';
    }
  }

  // Update the bill in database
  const { data: updatedBill, error: updateError } = await supabase
    .from('bills')
    .update(updateData)
    .eq('id', billId)
    .select(`
      *,
      tenants!inner(
        id,
        full_name,
        email_address,
        room_id,
        rooms!inner(
          room_number,
          branches!inner(
            name,
            electricity_rate
          )
        )
      )
    `)
    .single();

  if (updateError) {
    console.error('Error updating bill:', updateError);
    return NextResponse.json({
      error: 'Failed to update bill',
      success: false
    }, { status: 500 });
  }

  // Log the bill modification
  await logBillModification(
    supabase,
    user.id,
    billId,
    oldValues,
    {
      ...newValues,
      edit_reason: value.edit_reason
    }
  );

  // Log the audit event
  await logAuditEvent(
    supabase,
    user.id,
    currentBill.is_final_bill ? 'FINAL_BILL_REGENERATED' : 'BILL_UPDATED',
    'bills',
    billId,
    currentBill,
    updatedBill
  );

  // Send appropriate email notification
  try {
    const { EmailService } = await import('@/lib/services/emailService');
    const changedFields = Object.keys(updateData).filter(key => 
      !['status', 'updated_at', 'amount_paid'].includes(key)
    );
    
    if (changedFields.length > 0) {
      if (updatedBill.is_final_bill) {
        // Calculate deposit application and breakdown for the email
        const { data: paidBills } = await supabase
          .from('bills')
          .select('id')
          .eq('tenant_id', updatedBill.tenant_id)
          .eq('status', 'fully_paid');
        const fullyPaidBillCount = paidBills ? paidBills.length : 0;
        
        const depositApp = calculateDepositApplication(
          fullyPaidBillCount,
          updatedBill.advance_payment || updatedBill.tenants.advance_payment,
          updatedBill.security_deposit || updatedBill.tenants.security_deposit,
          updatedBill.total_amount_due
        );
        
        // Map deposit application for email
        const advancePayment = updatedBill.advance_payment || updatedBill.tenants.advance_payment || 0;
        const securityDeposit = updatedBill.security_deposit || updatedBill.tenants.security_deposit || 0;
        let advance_payment_applied = 0;
        let security_deposit_applied = 0;
        
        if (fullyPaidBillCount >= 5) {
          advance_payment_applied = Math.min(advancePayment, depositApp.appliedAmount);
          security_deposit_applied = Math.max(0, depositApp.appliedAmount - advance_payment_applied);
        } else {
          advance_payment_applied = Math.min(advancePayment, depositApp.appliedAmount);
          security_deposit_applied = 0;
        }
        
        await EmailService.sendFinalBillEditedEmail({
          email: updatedBill.tenants.email_address,
          full_name: updatedBill.tenants.full_name,
          room_number: updatedBill.tenants.rooms.room_number,
          branch_name: updatedBill.tenants.rooms.branches.name,
          move_out_date: updatedBill.billing_period_end,
          prorated_rent: updatedBill.monthly_rent_amount,
          electricity_amount: updatedBill.electricity_amount,
          water_amount: updatedBill.water_amount,
          extra_fee: updatedBill.extra_fee,
          outstanding_bills: 0,
          subtotal: updatedBill.total_amount_due,
          advance_payment_applied,
          security_deposit_applied,
          security_deposit_forfeited: depositApp.forfeitedAmount,
          final_amount_due: Math.max(0, updatedBill.total_amount_due - updatedBill.amount_paid),
          edit_reason: value.edit_reason
        });
      } else {
        // Send regular bill edited email
        await EmailService.sendBillEditedEmail({
          email: updatedBill.tenants.email_address,
          full_name: updatedBill.tenants.full_name,
          room_number: updatedBill.tenants.rooms.room_number,
          branch_name: updatedBill.tenants.rooms.branches.name,
          billing_period_start: updatedBill.billing_period_start,
          billing_period_end: updatedBill.billing_period_end,
          monthly_rent_amount: updatedBill.monthly_rent_amount,
          electricity_amount: updatedBill.electricity_amount,
          electricity_consumption: updatedBill.electricity_consumption,
          water_amount: updatedBill.water_amount,
          extra_fee: updatedBill.extra_fee,
          penalty_amount: updatedBill.penalty_amount,
          total_amount_due: updatedBill.total_amount_due,
          due_date: updatedBill.due_date,
          edit_reason: value.edit_reason
        });
      }
    }
  } catch (emailError) {
    console.error('Failed to send bill edited email:', emailError);
  }

  // --- DEPOSIT APPLICATION PAYMENT COMPONENTS LOGIC ---
  if (updatedBill.is_final_bill) {
    // 1. Find or create the deposit_application payment for this bill
    const depositAmount = (updatedBill.applied_advance_payment || 0) + (updatedBill.applied_security_deposit || 0);
    let depositPayment: any = null;
    if (depositAmount > 0) {
      const { data: existingDepositPayment } = await supabase
        .from('payments')
        .select('*')
        .eq('bill_id', billId)
        .eq('payment_method', 'deposit_application')
        .single();
      if (existingDepositPayment) {
        // Update payment amount if changed
        if (existingDepositPayment.amount !== depositAmount) {
          await supabase
            .from('payments')
            .update({ amount: depositAmount })
            .eq('id', existingDepositPayment.id);
        }
        depositPayment = existingDepositPayment;
      } else {
        // Create new deposit_application payment
        const { data: newPayment } = await supabase
          .from('payments')
          .insert({
            bill_id: billId,
            tenant_id: updatedBill.tenant_id,
            amount: depositAmount,
            payment_date: new Date().toISOString(),
            payment_method: 'deposit_application',
            notes: 'Auto-generated on final bill edit'
          })
          .select()
          .single();
        depositPayment = newPayment;
      }
      // 2. Delete old payment_components for this payment
      if (depositPayment) {
        await supabase
          .from('payment_components')
          .delete()
          .eq('payment_id', depositPayment.id);
        // 3. Allocate deposit to bill components
        const { allocatePaymentToComponents } = await import('@/lib/calculations/payment-allocation');
        const allocation = allocatePaymentToComponents(depositAmount, {
          penalty_amount: updatedBill.penalty_amount || 0,
          extra_fee: updatedBill.extra_fee || 0,
          electricity_amount: updatedBill.electricity_amount || 0,
          water_amount: updatedBill.water_amount || 0,
          monthly_rent_amount: updatedBill.monthly_rent_amount || 0
        });
        // 4. Insert new payment_components
        if (allocation.length > 0) {
          const componentRecords = allocation.map(component => ({
            payment_id: depositPayment.id,
            bill_id: billId,
            component_type: component.component_type,
            amount: component.amount
          }));
          await supabase.from('payment_components').insert(componentRecords);
        }
      }
    }
  }

  return NextResponse.json({
    data: updatedBill,
    success: true,
    message: currentBill.is_final_bill ? 
      'Final bill completely regenerated with new values' : 
      'Bill updated successfully'
  });

} catch (error) {
  console.error('API error:', error);
  return NextResponse.json({
    error: 'Internal server error',
    success: false
  }, { status: 500 });
}
} 