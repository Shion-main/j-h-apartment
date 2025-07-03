'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { getSupabaseClientOrThrow } from '@/lib/supabase/client';
import { logAuditEvent } from '@/lib/audit/logger';
import { validateSchema } from '@/lib/validations/schemas';
import { billEditSchema } from '@/lib/validations/schemas';
import { usePerformanceMonitor } from '@/lib/utils/performance';
import { BillingPageSkeleton, TenantCardSkeleton, BillCardSkeleton } from '@/components/ui/skeleton';

interface Bill {
  id: string;
  tenant_id: string;
  billing_period_start: string;
  billing_period_end: string;
  monthly_rent_amount: number;
  electricity_amount: number;
  water_amount: number;
  extra_fee: number;
  extra_fee_description: string | null;
  total_amount_due: number;
  amount_paid: number;
  status: 'active' | 'partially_paid' | 'fully_paid' | 'refund';
  tenant?: Tenant;
  present_electricity_reading?: number;
  present_reading_date?: string;
}

interface Tenant {
  id: string;
  full_name: string;
  room_id: string;
  room_number: string;
  branch_name: string;
  billing_status: 'current' | 'due' | 'overdue';
  latest_bill?: Bill;
}

interface PaymentForm {
  amount_paid: string;
  payment_date: string;
  payment_method: 'cash' | 'gcash';
  reference_number: string;
  notes: string;
}

interface EditBillForm {
  present_electricity_reading: number;
  present_reading_date: string;
  water_amount: number;
  extra_fee: number;
  extra_fee_description: string;
  edit_reason: string;
}

export default function BillingPageClient() {
  const { toast } = useToast();
  const { startTimer, endTimer } = usePerformanceMonitor();
  const [isLoading, setIsLoading] = useState(true);
  const [bills, setBills] = useState<Bill[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isEditBillDialogOpen, setIsEditBillDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentForm, setPaymentForm] = useState<PaymentForm>({
    amount_paid: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'cash',
    reference_number: '',
    notes: ''
  });
  const [editBillForm, setEditBillForm] = useState<EditBillForm>({
    present_electricity_reading: 0,
    present_reading_date: new Date().toISOString().split('T')[0],
    water_amount: 0,
    extra_fee: 0,
    extra_fee_description: '',
    edit_reason: ''
  });

  // Performance monitoring
  useEffect(() => {
    startTimer('billing-page');
    return () => {
      endTimer('billing-page');
    };
  }, [startTimer, endTimer]);

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [billsResponse, tenantsResponse] = await Promise.all([
          fetch('/api/bills/active'),
          fetch('/api/tenants/with-billing')
        ]);

        const [billsResult, tenantsResult] = await Promise.all([
          billsResponse.json(),
          tenantsResponse.json()
        ]);

        if (billsResult.success) {
          setBills(billsResult.data || []);
        }

        if (tenantsResult.success) {
          setTenants(tenantsResult.data || []);
        }
      } catch (error) {
        console.error('Error loading data:', error);
        toast({
          variant: 'destructive',
          title: 'Error',
          description: 'Failed to load billing data. Please refresh the page.'
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, []);

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedBill) return;
    
    try {
      setIsSubmitting(true);
      
      const outstandingBalance = selectedBill.total_amount_due - selectedBill.amount_paid;
      const paymentAmount = parseFloat(paymentForm.amount_paid);

      if (paymentAmount <= 0) {
        toast({
          variant: 'destructive',
          title: 'Invalid Payment',
          description: 'Please enter a payment amount greater than zero.'
        });
        return;
      }
      
      // Optimistically update UI before API call
      const isFullyPaid = paymentAmount >= outstandingBalance;
      const updatedBill: Bill = {
        ...selectedBill,
        amount_paid: selectedBill.amount_paid + paymentAmount,
        status: isFullyPaid ? 'fully_paid' : 'partially_paid'
      };

      // Optimistically update bills list
      setBills(prevBills => {
        if (isFullyPaid) {
          return prevBills.filter(bill => bill.id !== selectedBill.id);
        }
        return prevBills.map(bill => 
          bill.id === selectedBill.id ? updatedBill : bill
        );
      });

      // Optimistically update tenants list
      setTenants(prevTenants => 
        prevTenants.map(tenant => {
          if (tenant.id === selectedBill.tenant?.id) {
            return {
              ...tenant,
              latest_bill: updatedBill,
              billing_status: isFullyPaid ? 'current' : tenant.billing_status
            };
          }
          return tenant;
        })
      );
      
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bill_id: selectedBill.id,
          amount_paid: paymentAmount,
          payment_date: paymentForm.payment_date,
          payment_method: paymentForm.payment_method,
          reference_number: paymentForm.reference_number,
          notes: paymentForm.notes
        }),
        signal: AbortSignal.timeout(30000)
      });
      
      const result = await response.json();
      
      if (result.success) {
        toast({
          variant: 'default',
          title: 'Payment Recorded',
          description: 'The payment has been successfully recorded.'
        });
        
        setIsPaymentDialogOpen(false);
        setPaymentForm({
          amount_paid: '',
          payment_date: new Date().toISOString().split('T')[0],
          payment_method: 'cash',
          reference_number: '',
          notes: ''
        });
        
        // Clear selected bill if fully paid
        if (isFullyPaid) {
          setSelectedBill(null);
        }

        // Log audit event
        try {
          const supabase = getSupabaseClientOrThrow();
          const { data: { user } } = await supabase.auth.getUser();
          if (user && result.data) {
            await logAuditEvent(
              supabase,
              user.id,
              'PAYMENT_CREATED',
              'payments',
              result.data.id,
              null,
              {
                bill_id: result.data.bill_id,
                amount: result.data.amount,
                payment_date: result.data.payment_date,
              }
            );
          }
        } catch (auditError) {
          console.error('Audit logging error:', auditError);
          // Continue execution - don't fail the payment if audit logging fails
        }
      } else {
        // Revert optimistic updates on error
        toast({
          variant: 'destructive',
          title: 'Payment Failed',
          description: result.error || 'Failed to record payment. Please try again.'
        });

        // Revert bills list
        setBills(prevBills => {
          if (isFullyPaid) {
            return [...prevBills, selectedBill];
          }
          return prevBills.map(bill => 
            bill.id === selectedBill.id ? selectedBill : bill
          );
        });

        // Revert tenants list
        setTenants(prevTenants => 
          prevTenants.map(tenant => {
            if (tenant.id === selectedBill.tenant?.id) {
              return {
                ...tenant,
                latest_bill: selectedBill,
                billing_status: tenant.billing_status
              };
            }
            return tenant;
          })
        );
      }
    } catch (error) {
      console.error('Payment error:', error);
      toast({
        variant: 'destructive',
        title: 'Payment Failed',
        description: 'An error occurred while recording the payment. Please try again.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitEditBill = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedBill) return;
    
    setIsSubmitting(true);
    
    try {
      // Validate form data
      const { error: validationError } = validateSchema(billEditSchema, {
        ...editBillForm,
        bill_id: selectedBill.id
      });
      
      if (validationError) {
        toast({
          variant: 'destructive',
          title: 'Validation Error',
          description: validationError
        });
        return;
      }
      
      // Send request to update bill
      const response = await fetch(`/api/bills/${selectedBill.id}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editBillForm),
      });
      
      const result = await response.json();
      
      if (result.success) {
        // Show success message
        toast({
          variant: 'default',
          title: 'Bill Updated',
          description: 'The bill has been updated and the tenant has been notified.'
        });
        
        // Close dialog immediately after successful update
        setIsEditBillDialogOpen(false);
        
        // Optimistically update the bills list with the updated bill
        const updatedBill = result.data;
        if (updatedBill) {
          setBills(prevBills => 
            prevBills.map(bill => 
              bill.id === selectedBill.id ? updatedBill : bill
            )
          );
          // Update selected bill to reflect new status
          setSelectedBill(updatedBill);
        }

        // Log audit event
        try {
          const supabase = getSupabaseClientOrThrow();
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await logAuditEvent(
              supabase,
              user.id,
              'BILL_EDITED',
              'bills',
              selectedBill.id,
              {
                present_electricity_reading: selectedBill.present_electricity_reading,
                present_reading_date: selectedBill.present_reading_date,
                water_amount: selectedBill.water_amount,
                extra_fee: selectedBill.extra_fee,
                extra_fee_description: selectedBill.extra_fee_description
              },
              {
                ...editBillForm,
                edit_reason: editBillForm.edit_reason
              }
            );
          }
        } catch (auditError) {
          console.error('Audit logging error:', auditError);
          // Continue execution - don't fail the bill update if audit logging fails
        }
      } else {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: result.error || 'Failed to update bill'
        });
        setIsEditBillDialogOpen(false); // Close dialog on error
      }
    } catch (error) {
      console.error('Error updating bill:', error);
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'An unexpected error occurred. Please try again.'
      });
      setIsEditBillDialogOpen(false); // Close dialog on error
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return <BillingPageSkeleton />;
  }

  return (
    <div className="container mx-auto p-4 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Tenants Section */}
        <section>
          <h2 className="text-2xl font-bold mb-4">Tenants</h2>
          <div className="space-y-4">
            {tenants.map(tenant => (
              <Card key={tenant.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle>{tenant.full_name}</CardTitle>
                  <CardDescription>
                    Room {tenant.room_number} - {tenant.branch_name}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p>Status: {tenant.billing_status}</p>
                    {tenant.latest_bill && (
                      <Button
                        onClick={() => {
                          setSelectedBill(tenant.latest_bill!);
                          setIsPaymentDialogOpen(true);
                        }}
                      >
                        Record Payment
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Bills Section */}
        <section>
          <h2 className="text-2xl font-bold mb-4">Active Bills</h2>
          <div className="space-y-4">
            {bills.map(bill => (
              <Card key={bill.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <CardTitle>
                    {bill.tenant?.full_name} - Room {bill.tenant?.room_number}
                  </CardTitle>
                  <CardDescription>
                    Period: {new Date(bill.billing_period_start).toLocaleDateString()} to{' '}
                    {new Date(bill.billing_period_end).toLocaleDateString()}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <p>Total Amount: ₱{bill.total_amount_due.toFixed(2)}</p>
                    <p>Amount Paid: ₱{bill.amount_paid.toFixed(2)}</p>
                    <p>Status: {bill.status}</p>
                    <div className="space-x-2">
                      <Button
                        onClick={() => {
                          setSelectedBill(bill);
                          setIsPaymentDialogOpen(true);
                        }}
                      >
                        Record Payment
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSelectedBill(bill);
                          setEditBillForm({
                            present_electricity_reading: bill.present_electricity_reading || 0,
                            present_reading_date: bill.present_reading_date || new Date().toISOString().split('T')[0],
                            water_amount: bill.water_amount || 0,
                            extra_fee: bill.extra_fee || 0,
                            extra_fee_description: bill.extra_fee_description || '',
                            edit_reason: ''
                          });
                          setIsEditBillDialogOpen(true);
                        }}
                      >
                        Edit Bill
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>

      {/* Payment Dialog */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitPayment} className="space-y-4">
            <div>
              <Label htmlFor="amount_paid">Amount</Label>
              <Input
                id="amount_paid"
                type="number"
                step="0.01"
                value={paymentForm.amount_paid}
                onChange={e => setPaymentForm(prev => ({ ...prev, amount_paid: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="payment_date">Payment Date</Label>
              <Input
                id="payment_date"
                type="date"
                value={paymentForm.payment_date}
                onChange={e => setPaymentForm(prev => ({ ...prev, payment_date: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="payment_method">Payment Method</Label>
              <Select
                value={paymentForm.payment_method}
                onValueChange={(value: 'cash' | 'gcash') => setPaymentForm(prev => ({ ...prev, payment_method: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select payment method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="gcash">GCash</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {paymentForm.payment_method === 'gcash' && (
              <div>
                <Label htmlFor="reference_number">Reference Number</Label>
                <Input
                  id="reference_number"
                  type="text"
                  value={paymentForm.reference_number}
                  onChange={e => setPaymentForm(prev => ({ ...prev, reference_number: e.target.value }))}
                  required
                />
              </div>
            )}
            <div>
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                type="text"
                value={paymentForm.notes}
                onChange={e => setPaymentForm(prev => ({ ...prev, notes: e.target.value }))}
              />
            </div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Recording...' : 'Record Payment'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Bill Dialog */}
      <Dialog open={isEditBillDialogOpen} onOpenChange={setIsEditBillDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Bill</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmitEditBill} className="space-y-4">
            <div>
              <Label htmlFor="present_electricity_reading">Present Electricity Reading</Label>
              <Input
                id="present_electricity_reading"
                type="number"
                value={editBillForm.present_electricity_reading}
                onChange={e => setEditBillForm(prev => ({ ...prev, present_electricity_reading: parseFloat(e.target.value) }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="present_reading_date">Reading Date</Label>
              <Input
                id="present_reading_date"
                type="date"
                value={editBillForm.present_reading_date}
                onChange={e => setEditBillForm(prev => ({ ...prev, present_reading_date: e.target.value }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="water_amount">Water Amount</Label>
              <Input
                id="water_amount"
                type="number"
                step="0.01"
                value={editBillForm.water_amount}
                onChange={e => setEditBillForm(prev => ({ ...prev, water_amount: parseFloat(e.target.value) }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="extra_fee">Extra Fee</Label>
              <Input
                id="extra_fee"
                type="number"
                step="0.01"
                value={editBillForm.extra_fee}
                onChange={e => setEditBillForm(prev => ({ ...prev, extra_fee: parseFloat(e.target.value) }))}
                required
              />
            </div>
            <div>
              <Label htmlFor="extra_fee_description">Extra Fee Description</Label>
              <Input
                id="extra_fee_description"
                type="text"
                value={editBillForm.extra_fee_description}
                onChange={e => setEditBillForm(prev => ({ ...prev, extra_fee_description: e.target.value }))}
              />
            </div>
            <div>
              <Label htmlFor="edit_reason">Reason for Edit</Label>
              <Input
                id="edit_reason"
                type="text"
                value={editBillForm.edit_reason}
                onChange={e => setEditBillForm(prev => ({ ...prev, edit_reason: e.target.value }))}
                required
              />
            </div>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Updating...' : 'Update Bill'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
} 