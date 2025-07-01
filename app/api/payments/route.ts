import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { paymentRecordSchema, validateSchema } from '@/lib/validations/schemas';
import { logAuditEvent, getPaymentAction } from '@/lib/audit/logger';
import { EmailService } from '@/lib/services/emailService';
import { 
  allocatePaymentToComponents, 
  createPaymentComponents, 
  validatePaymentAllocation 
} from '@/lib/calculations/payment-allocation';

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { searchParams } = new URL(request.url);
    const billId = searchParams.get('bill_id');

    let query = supabase
      .from('payments')
      .select(`
        *,
        bills (
          id,
          total_amount_due,
          tenants (
            full_name,
            rooms (
              room_number,
              branches (
                name
              )
            )
          )
        )
      `)
      .order('payment_date', { ascending: false });

    // Filter by bill if specified
    if (billId) {
      query = query.eq('bill_id', billId);
    }

    const { data: payments, error } = await query;

    if (error) {
      console.error('Error fetching payments:', error);
      return NextResponse.json({
        error: 'Failed to fetch payments',
        success: false
      }, { status: 500 });
    }

    return NextResponse.json({
      data: payments,
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

export async function POST(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
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
    const { error: validationError, value } = validateSchema(paymentRecordSchema, body);
    if (validationError) {
      return NextResponse.json({
        error: validationError,
        success: false
      }, { status: 400 });
    }

    // Get bill details with tenant information for email
    const { data: bill, error: billError } = await supabase
      .from('bills')
      .select(`
        *,
        tenants (
          id,
          full_name,
          email_address,
          rooms (
            room_number,
            branches (
              name,
              electricity_rate
            )
          )
        )
      `)
      .eq('id', value.bill_id)
      .single();

    if (billError || !bill) {
      return NextResponse.json({
        error: 'Bill not found',
        success: false
      }, { status: 404 });
    }

    if (bill.status === 'fully_paid') {
      return NextResponse.json({
        error: 'Bill is already fully paid',
        success: false
      }, { status: 400 });
    }

    // Calculate new totals (without penalty)
    const newAmountPaid = bill.amount_paid + value.amount_paid;
    const newTotalAmountDue = bill.total_amount_due; // No change to total due from this transaction
    
    // Determine new status
    let newStatus = bill.status;
    if (newAmountPaid >= newTotalAmountDue) {
      newStatus = 'fully_paid';
    } else if (newAmountPaid > 0) {
      newStatus = 'partially_paid';
    }

    // Calculate payment allocation to components
    const billComponents = {
      penalty_amount: bill.penalty_amount || 0,
      extra_fee: bill.extra_fee || 0,
      electricity_amount: bill.electricity_amount || 0,
      water_amount: bill.water_amount || 0,
      monthly_rent_amount: bill.monthly_rent_amount || 0
    };

    const paymentComponents = allocatePaymentToComponents(value.amount_paid, billComponents);

    // Validate allocation
    if (!validatePaymentAllocation(paymentComponents, value.amount_paid)) {
      return NextResponse.json({
        error: 'Payment allocation validation failed',
        success: false
      }, { status: 400 });
    }

    // Start transaction - record payment and update bill
    const { data: payment, error: paymentError } = await supabase
      .from('payments')
      .insert({
        bill_id: value.bill_id,
        tenant_id: bill.tenants.id,
        amount: value.amount_paid,
        payment_date: value.payment_date,
        payment_method: value.payment_method,
        reference_number: value.reference_number || null,
        notes: value.notes || null,
      })
      .select()
      .single();

    if (paymentError) {
      console.error('Error recording payment:', paymentError);
      return NextResponse.json({
        error: 'Failed to record payment',
        success: false
      }, { status: 500 });
    }

    // Create payment component records
    const { error: componentsError } = await createPaymentComponents(
      supabase,
      payment.id,
      value.bill_id,
      paymentComponents
    );

    if (componentsError) {
      console.error('Error creating payment components:', componentsError);
      // Rollback - delete the payment
      await supabase.from('payments').delete().eq('id', payment.id);
      
      return NextResponse.json({
        error: 'Failed to create payment components',
        success: false
      }, { status: 500 });
    }

    // Update bill with payment (NO penalty)
    const { error: billUpdateError } = await supabase
      .from('bills')
      .update({
        amount_paid: newAmountPaid,
        status: newStatus
      })
      .eq('id', value.bill_id);

    if (billUpdateError) {
      console.error('Error updating bill:', billUpdateError);
      // Rollback - delete the payment
      await supabase.from('payments').delete().eq('id', payment.id);
      
      return NextResponse.json({
        error: 'Failed to update bill status',
        success: false
      }, { status: 500 });
    }

    // Log the payment recording
    const action = getPaymentAction(newStatus);
    await logAuditEvent(
      supabase,
      user.id,
      action,
      'payments',
      payment.id,
      null,
      {
        bill_id: value.bill_id,
        amount_paid: value.amount_paid,
        payment_date: value.payment_date,
        payment_method: value.payment_method,
        payment_status: newStatus
      }
    );

    // If the bill is a final bill and is now fully paid, complete the move-out process
    if (newStatus === 'fully_paid' && bill.is_final_bill) {
      // Deactivate tenant and free up the room
      await supabase
        .from('tenants')
        .update({ is_active: false })
        .eq('id', bill.tenants.id);
      
      await supabase
        .from('rooms')
        .update({ is_occupied: false })
        .eq('id', bill.room_id);

      // Log the final move-out event
      await logAuditEvent(
        supabase,
        user.id,
        'TENANT_MOVE_OUT_COMPLETED',
        'tenants',
        bill.tenants.id,
        { is_active: true },
        { is_active: false, room_id: null }
      );
    }

    // Send payment confirmation email
    try {
      if (newStatus === 'fully_paid') {
        if (bill.is_final_bill) {
          // Send farewell email for completed move-out
          await EmailService.sendFarewellEmail({
            email: bill.tenants.email_address,
            full_name: bill.tenants.full_name,
            room_number: bill.tenants.rooms.room_number,
            branch_name: bill.tenants.rooms.branches.name,
            move_out_date: bill.tenants.move_out_date || new Date().toISOString().split('T')[0],
          });
        } else {
          // Send standard full payment receipt for regular bills
          const fullPaymentEmailData = {
            email: bill.tenants.email_address,
            full_name: bill.tenants.full_name,
            room_number: bill.tenants.rooms.room_number,
            branch_name: bill.tenants.rooms.branches.name,
            billing_period_start: bill.billing_period_start,
            billing_period_end: bill.billing_period_end,
            final_payment_amount: value.amount_paid,
            total_amount_due: bill.total_amount_due,
            payment_date: value.payment_date
          };
          await EmailService.sendFullPaymentReceiptEmail(fullPaymentEmailData);
        }
      } else {
        const partialPaymentEmailData = {
          email: bill.tenants.email_address,
          full_name: bill.tenants.full_name,
          amount_paid: value.amount_paid,
          payment_date: value.payment_date,
          payment_method: value.payment_method,
          notes: value.notes || '',
          total_amount_due: bill.total_amount_due,
          total_paid: newAmountPaid,
          remaining_balance: bill.total_amount_due - newAmountPaid,
          due_date: bill.due_date
        };
        await EmailService.sendPartialPaymentEmail(partialPaymentEmailData);
      }
    } catch (error) {
      console.error('Failed to send payment confirmation email:', error);
      // Continue execution - don't fail the payment recording if email fails
    }

    return NextResponse.json({
      data: {
        payment,
        bill_status: newStatus,
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