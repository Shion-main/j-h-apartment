import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { companyExpenseSchema, validateSchema } from '@/lib/validations/schemas';
import { logExpenseOperation, logAuditEvent } from '@/lib/audit/logger';

export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { searchParams } = new URL(request.url);
    
    const month = searchParams.get('month');
    const year = searchParams.get('year');
    const category = searchParams.get('category');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let query = supabase
      .from('company_expenses')
      .select('*')
      .order('expense_date', { ascending: false })
      .range(offset, offset + limit - 1);

    // Filter by month/year if specified
    if (month && year) {
      const startDate = `${year}-${month.padStart(2, '0')}-01`;
      const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];
      query = query.gte('expense_date', startDate).lte('expense_date', endDate);
    }

    // Filter by category if specified
    if (category) {
      query = query.eq('category', category);
    }

    const { data: expenses, error } = await query;

    if (error) {
      console.error('Error fetching expenses:', error);
      return NextResponse.json({
        error: 'Failed to fetch expenses',
        success: false
      }, { status: 500 });
    }

    // Get total count for pagination
    let countQuery = supabase
      .from('company_expenses')
      .select('*', { count: 'exact', head: true });

    if (month && year) {
      const startDate = `${year}-${month.padStart(2, '0')}-01`;
      const endDate = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];
      countQuery = countQuery.gte('expense_date', startDate).lte('expense_date', endDate);
    }

    if (category) {
      countQuery = countQuery.eq('category', category);
    }

    const { count } = await countQuery;

    // Calculate totals by category for current month
    const currentMonth = month || (new Date().getMonth() + 1).toString();
    const currentYear = year || new Date().getFullYear().toString();
    const monthStart = `${currentYear}-${currentMonth.padStart(2, '0')}-01`;
    const monthEnd = new Date(parseInt(currentYear), parseInt(currentMonth), 0).toISOString().split('T')[0];

    const { data: monthlyExpenses } = await supabase
      .from('company_expenses')
      .select('category, amount')
      .gte('expense_date', monthStart)
      .lte('expense_date', monthEnd);

    const categoryTotals = monthlyExpenses?.reduce((acc, expense) => {
      acc[expense.category] = (acc[expense.category] || 0) + expense.amount;
      return acc;
    }, {} as Record<string, number>) || {};

    return NextResponse.json({
      data: {
        expenses,
        pagination: {
          total: count || 0,
          limit,
          offset,
          hasMore: (count || 0) > offset + limit
        },
        summary: {
          categoryTotals,
          monthlyTotal: Object.values(categoryTotals).reduce((sum, amount) => sum + amount, 0)
        }
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
    const { error: validationError, value } = validateSchema(companyExpenseSchema, body);
    if (validationError) {
      return NextResponse.json({
        error: validationError,
        success: false
      }, { status: 400 });
    }

    // Create expense record
    const { data: expense, error: createError } = await supabase
      .from('company_expenses')
      .insert({
        description: value.description,
        amount: value.amount,
        category: value.category,
        expense_date: value.expense_date,
        receipt_url: value.receipt_url || null,
        notes: value.notes || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (createError) {
      console.error('Error creating expense:', createError);
      return NextResponse.json({
        error: 'Failed to create expense',
        success: false
      }, { status: 500 });
    }

    // Log the expense creation
    await logExpenseOperation(
      supabase,
      user.id, 
      'CREATED', 
      expense.id, 
      {
        description: value.description,
        amount: value.amount,
        category: value.category,
      }
    );

    // Log event
    await logAuditEvent(supabase, user.id, 'EXPENSE_CREATED', 'company_expenses', expense.id, null, expense);

    return NextResponse.json({
      data: expense,
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

export async function PUT(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const body = await request.json();
    const { id, ...updateData } = body;

    // Get current user for audit logging
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({
        error: 'Unauthorized',
        success: false
      }, { status: 401 });
    }

    if (!id) {
      return NextResponse.json({
        error: 'Expense ID is required',
        success: false
      }, { status: 400 });
    }

    // Validate input
    const { error: validationError, value } = validateSchema(companyExpenseSchema, updateData);
    if (validationError) {
      return NextResponse.json({
        error: validationError,
        success: false
      }, { status: 400 });
    }

    // Get current expense for audit logging
    const { data: currentExpense, error: currentError } = await supabase
      .from('company_expenses')
      .select('*')
      .eq('id', id)
      .single();

    if (currentError || !currentExpense) {
      return NextResponse.json({
        error: 'Expense not found',
        success: false
      }, { status: 404 });
    }

    // Update expense
    const { data: updatedExpense, error: updateError } = await supabase
      .from('company_expenses')
      .update({
        description: value.description,
        amount: value.amount,
        category: value.category,
        expense_date: value.expense_date,
        receipt_url: value.receipt_url || null,
        notes: value.notes || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('Error updating expense:', updateError);
      return NextResponse.json({
        error: 'Failed to update expense',
        success: false
      }, { status: 500 });
    }

    // Log the expense update
    await logExpenseOperation(
      supabase,
      user.id, 
      'UPDATED', 
      id, 
      {
        description: value.description,
        amount: value.amount,
        category: value.category,
      }, 
      {
        description: currentExpense.description,
        amount: currentExpense.amount,
        category: currentExpense.category,
      }
    );

    // Log event
    await logAuditEvent(supabase, user.id, 'EXPENSE_UPDATED', 'company_expenses', updatedExpense.id, currentExpense, updatedExpense);

    return NextResponse.json({
      data: updatedExpense,
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

export async function DELETE(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    // Get current user for audit logging
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({
        error: 'Unauthorized',
        success: false
      }, { status: 401 });
    }

    if (!id) {
      return NextResponse.json({
        error: 'Expense ID is required',
        success: false
      }, { status: 400 });
    }

    // Get expense details for audit logging
    const { data: expense, error: expenseError } = await supabase
      .from('company_expenses')
      .select('*')
      .eq('id', id)
      .single();

    if (expenseError || !expense) {
      return NextResponse.json({
        error: 'Expense not found',
        success: false
      }, { status: 404 });
    }

    // Delete expense
    const { error: deleteError } = await supabase
      .from('company_expenses')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Error deleting expense:', deleteError);
      return NextResponse.json({
        error: 'Failed to delete expense',
        success: false
      }, { status: 500 });
    }

    // Log the expense deletion
    await logExpenseOperation(
      supabase,
      user.id, 
      'DELETED', 
      id, 
      {
        description: expense.description,
        amount: expense.amount,
        category: expense.category,
      }
    );

    // Log event
    await logAuditEvent(supabase, user.id, 'EXPENSE_DELETED', 'company_expenses', id, expense, null);

    return NextResponse.json({
      data: { message: 'Expense deleted successfully' },
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