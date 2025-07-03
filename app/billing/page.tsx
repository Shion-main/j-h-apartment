'use client';

import { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toast';
import { formatCurrency, formatDate } from '@/lib/utils';
import { billGenerationSchema, paymentRecordSchema, billEditSchema, validateSchema } from '@/lib/validations/schemas';
import type { Bill, Tenant, Branch, BillGenerationForm, BillEditForm } from '@/types/database';
import { calculateBillingPeriod } from '@/lib/calculations/billing';
import { usePageTitleEffect } from '@/lib/hooks/usePageTitleEffect';
import { 
  Receipt, 
  Plus, 
  Search, 
  Filter,
  Calendar,
  Zap,
  Droplets,
  DollarSign,
  AlertTriangle,
  Loader2,
  AlertCircle,
  CheckCircle,
  Home,
  Building2,
  Clock,
  CreditCard,
  Banknote,
  User,
  Pencil
} from 'lucide-react';
import { logAuditEvent } from '@/lib/audit/logger';
import { getSupabaseClient, invalidateCache } from '@/lib/supabase/client';
import { calculateDepositApplication } from '@/lib/calculations/billing';

interface TenantWithBilling extends Tenant {
  latest_bill?: Bill;
  days_overdue?: number;
  billing_status: 'current' | 'overdue' | 'no_bills';
  current_cycle_start?: string;
  current_cycle_end?: string;
  days_until_cycle_end?: number;
  can_generate_bill?: boolean;
}

interface BillWithTenant extends Bill {
  tenant?: {
    id: string;
    full_name: string;
    email_address: string;
    phone_number: string;
    room_id: string | null;
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
  };
}

interface PaymentForm {
  amount_paid: string;
  payment_date: string;
  payment_method: 'cash' | 'gcash';
  reference_number: string;
  notes: string;
}

// Memoized components to prevent unnecessary re-renders
const TenantBillingRow = memo(({ 
  tenant, 
  onGenerateBill, 
  getStatusColor, 
  getStatusText, 
  getActionButtonText, 
  getActionButtonColor 
}: {
  tenant: TenantWithBilling;
  onGenerateBill: (tenant: TenantWithBilling) => void;
  getStatusColor: (status: string) => string;
  getStatusText: (tenant: TenantWithBilling) => string;
  getActionButtonText: (tenant: TenantWithBilling) => string;
  getActionButtonColor: (tenant: TenantWithBilling) => string;
}) => (
  <tr className="hover:bg-gray-50 transition-colors">
    <td className="px-4 py-3">
      <div className="font-medium text-gray-900">{tenant.full_name}</div>
      <div className="text-sm text-gray-500">{tenant.phone_number}</div>
    </td>
    <td className="px-4 py-3">
      <div className="text-sm text-gray-900">
        {tenant.rooms?.room_number || 'N/A'}
      </div>
      <div className="text-xs text-gray-500">
        {tenant.rooms?.branches?.name || 'N/A'}
      </div>
    </td>
    <td className="px-4 py-3">
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(tenant.billing_status)}`}>
        {getStatusText(tenant)}
      </span>
    </td>
    <td className="px-4 py-3">
      {tenant.current_cycle_start && tenant.current_cycle_end ? (
        <div className="text-sm text-gray-900">
          {new Date(tenant.current_cycle_start).toLocaleDateString()} - {new Date(tenant.current_cycle_end).toLocaleDateString()}
        </div>
      ) : (
        <span className="text-gray-400">-</span>
      )}
    </td>
    <td className="px-4 py-3">
      <Button
        onClick={() => onGenerateBill(tenant)}
        size="sm"
        className={getActionButtonColor(tenant)}
        disabled={!tenant.can_generate_bill}
      >
        {getActionButtonText(tenant)}
      </Button>
    </td>
  </tr>
));

TenantBillingRow.displayName = 'TenantBillingRow';

// Memoized bill row component
const BillRow = memo(({ 
  bill, 
  formatCurrency, 
  getBillStatusColor, 
  getBillStatusText, 
  onEditBill, 
  onPaymentDialog 
}: {
  bill: BillWithTenant;
  formatCurrency: (amount: number) => string;
  getBillStatusColor: (status: string) => string;
  getBillStatusText: (bill: BillWithTenant) => string;
  onEditBill: (bill: BillWithTenant) => void;
  onPaymentDialog: (bill: BillWithTenant) => void;
}) => (
  <tr className="hover:bg-gray-50 transition-colors">
    <td className="px-4 py-3">
      <div className="font-medium text-gray-900">{bill.tenant?.full_name}</div>
      <div className="text-sm text-gray-500">{bill.tenant?.rooms?.room_number || 'N/A'}</div>
    </td>
    <td className="px-4 py-3">
      <div className="text-sm text-gray-900">
        {new Date(bill.billing_period_start).toLocaleDateString()} - {new Date(bill.billing_period_end).toLocaleDateString()}
      </div>
    </td>
    <td className="px-4 py-3">
      <div className="font-medium text-gray-900">{formatCurrency(bill.total_amount_due)}</div>
      <div className="text-sm text-gray-500">Paid: {formatCurrency(bill.amount_paid)}</div>
    </td>
    <td className="px-4 py-3">
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getBillStatusColor(bill.status)}`}>
        {getBillStatusText(bill)}
      </span>
    </td>
    <td className="px-4 py-3">
      <div className="flex space-x-2">
        <Button
          onClick={() => onEditBill(bill)}
          size="sm"
          variant="outline"
          className="text-blue-600 border-blue-200 hover:bg-blue-50"
        >
          Edit
        </Button>
        <Button
          onClick={() => onPaymentDialog(bill)}
          size="sm"
          className="bg-green-600 hover:bg-green-700"
        >
          Record Payment
        </Button>
      </div>
    </td>
  </tr>
));

BillRow.displayName = 'BillRow';

export default function BillingPage() {
  // Set page title and subtitle
  usePageTitleEffect('Billing', 'Generate bills and record payments');



  // Memoized Supabase client
  const supabase = useMemo(() => getSupabaseClient(), []);
  
  // Memoized currency formatter
  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }, []);

  // Memoized utility functions
  const getStatusColor = useCallback((status: string) => {
    switch (status) {
      case 'current': return 'bg-green-100 text-green-800';
      case 'overdue': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }, []);

  const getBillStatusColor = useCallback((status: string) => {
    switch (status) {
      case 'fully_paid': return 'bg-green-100 text-green-800';
      case 'partially_paid': return 'bg-yellow-100 text-yellow-800';
      case 'active': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  }, []);

  // Optimized tenant processing with memoization
  const processTenantsWithBilling = useCallback(async (tenantsData: Tenant[]): Promise<TenantWithBilling[]> => {
    // Process tenants in batches to improve performance
    const batchSize = 10;
    const results: TenantWithBilling[] = [];
    
    for (let i = 0; i < tenantsData.length; i += batchSize) {
      const batch = tenantsData.slice(i, i + batchSize);
      
      const batchPromises = batch.map(async (tenant: Tenant) => {
        try {
          // Fetch all bills for this tenant
          const allBillsResponse = await fetch(`/api/bills?tenant_id=${tenant.id}`);
          const allBillsResult = await allBillsResponse.json();
          
          const allBills = allBillsResult.success && allBillsResult.data ? allBillsResult.data : [];
          const fullyPaidBillsCount = allBills.filter((b: any) => b.status === 'fully_paid').length;
          
          // Calculate billing status efficiently
          let billingStatus: 'current' | 'overdue' | 'no_bills' = 'no_bills';
          let daysOverdue = 0;
          let latestBill = null;
          
          if (allBills.length > 0) {
            allBills.sort((a: any, b: any) => new Date(b.billing_period_start).getTime() - new Date(a.billing_period_start).getTime());
            latestBill = allBills[0];
            
            if (latestBill && (latestBill.status === 'active' || latestBill.status === 'partially_paid')) {
              const dueDate = new Date(latestBill.due_date);
              const today = new Date();
              if (today > dueDate) {
                billingStatus = 'overdue';
                daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
              } else {
                billingStatus = 'current';
              }
            } else if (latestBill && latestBill.status === 'fully_paid') {
              billingStatus = 'current';
            }
          }
          
          // Calculate current billing cycle
          const rentStartDate = new Date(tenant.rent_start_date);
          const currentCycleNumber = fullyPaidBillsCount + 1;
          const currentCycle = calculateBillingPeriod(rentStartDate, currentCycleNumber);
          
          const today = new Date();
          const daysUntilCycleEnd = Math.ceil((currentCycle.end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
          const canGenerateBill = daysUntilCycleEnd <= 3;

          return {
            ...tenant,
            latest_bill: latestBill,
            days_overdue: daysOverdue,
            billing_status: billingStatus,
            current_cycle_start: currentCycle.start.toISOString().split('T')[0],
            current_cycle_end: currentCycle.end.toISOString().split('T')[0],
            days_until_cycle_end: daysUntilCycleEnd,
            can_generate_bill: canGenerateBill,
          } as TenantWithBilling;
        } catch (error) {
          console.error(`Error processing tenant ${tenant.id}:`, error);
          return {
            ...tenant,
            billing_status: 'no_bills' as const,
            can_generate_bill: false,
          } as TenantWithBilling;
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }
    
    return results;
  }, []);

  // Optimized fetch functions with better error handling and caching
  const fetchTenantsWithBilling = useCallback(async () => {
    try {
      setIsLoadingTenants(true);
      const response = await fetch('/api/tenants?active=true');
      const result = await response.json();
      
      if (result.success) {
        const tenantsData = result.data || [];
        const tenantsWithBilling = await processTenantsWithBilling(tenantsData);
        setTenants(tenantsWithBilling);
      } else {
        addToast({
          type: 'error',
          title: 'Error',
          message: result.error || 'Failed to fetch tenants'
        });
      }
    } catch (error) {
      console.error('Error fetching tenants:', error);
      addToast({
        type: 'error',
        title: 'Error',
        message: 'Failed to fetch tenants'
      });
    } finally {
      setIsLoadingTenants(false);
    }
  }, [processTenantsWithBilling]);

  const { addToast } = useToast();
  
  // Main data states
  const [tenants, setTenants] = useState<TenantWithBilling[]>([]);
  const [bills, setBills] = useState<BillWithTenant[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeTab, setActiveTab] = useState('room-status');
  
  // Loading states
  const [isLoadingTenants, setIsLoadingTenants] = useState(true);
  const [isLoadingBills, setIsLoadingBills] = useState(true);
  
  // Search and filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('all');
  const [billStatusFilter, setBillStatusFilter] = useState('');
  
  // Dialogs and forms
  const [isGenerateDialogOpen, setIsGenerateDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isEditBillDialogOpen, setIsEditBillDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isApplyingPenalties, setIsApplyingPenalties] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<TenantWithBilling | null>(null);
  const [selectedBill, setSelectedBill] = useState<BillWithTenant | null>(null);
  
  // Form states
  const [formData, setFormData] = useState({
    tenant_id: '',
    present_electricity_reading: '',
    present_reading_date: new Date().toISOString().split('T')[0],
    extra_fee: null as number | null,
    extra_fee_description: null as string | null
  });

  const [paymentForm, setPaymentForm] = useState<PaymentForm>({
    amount_paid: '',
    payment_date: new Date().toISOString().split('T')[0],
    payment_method: 'cash',
    reference_number: '',
    notes: '',
  });

  const [editBillForm, setEditBillForm] = useState<BillEditForm>({
    present_electricity_reading: 0,
    present_reading_date: '',
    water_amount: 0,
    extra_fee: 0,
    extra_fee_description: '',
    edit_reason: '',
  });

  const [fullyPaidBillCountForEdit, setFullyPaidBillCountForEdit] = useState<number | null>(null);

  // Add state for refund dialog
  const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false);
  const [refundBill, setRefundBill] = useState<BillWithTenant | null>(null);

  // Moved this function to the top-level scope
  const handleCompleteRefund = async () => {
    if (!refundBill) return;

    console.log('Refund bill data:', refundBill);
    console.log('Refund bill tenant_id:', refundBill.tenant_id);
    console.log('Refund bill tenant:', refundBill.tenant);

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/bills/${refundBill.id}/edit`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          edit_reason: 'Refund completed and paid out to tenant',
        }),
      });
      const result = await response.json();
      if (result.success) {
        // If this is a final bill, trigger move-out completion
        if (refundBill.is_final_bill && (refundBill.status === 'refund' || refundBill.status === 'fully_paid')) {
          try {
            console.log('Calling move-out API with tenant_id:', refundBill.tenant_id);
            const moveOutResp = await fetch(`/api/tenants/${refundBill.tenant_id}/move-out`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
            });
            const moveOutResult = await moveOutResp.json();
            if (moveOutResult.success) {
              addToast({
                type: 'success',
                title: 'Tenant Moved Out',
                message: 'Tenant and room status updated. Bill moved to history.'
              });
            } else {
              addToast({
                type: 'error',
                title: 'Move-Out Error',
                message: moveOutResult.error || 'Failed to complete move-out.'
              });
            }
          } catch (moveOutError) {
            console.error('Move-out error:', moveOutError);
            addToast({
              type: 'error',
              title: 'Move-Out Error',
              message: 'An error occurred while completing move-out.'
            });
          }
        } else {
          addToast({
            type: 'success',
            title: 'Refund Completed',
            message: 'The refund has been marked as completed and removed from active bills.'
          });
        }
        
        // Immediately remove the refunded bill from local state
        setBills(prevBills => prevBills.filter(bill => bill.id !== refundBill.id));
        
        // Refresh the bills list
        fetchActiveBills();
      } else {
        addToast({
          type: 'error',
          title: 'Error',
          message: result.error || 'Failed to complete refund.'
        });
      }
    } catch (error) {
      console.error('Refund error:', error);
      addToast({
        type: 'error',
        title: 'Error',
        message: 'An unexpected error occurred.'
      });
    } finally {
      setIsSubmitting(false);
      setIsRefundDialogOpen(false);
      setRefundBill(null);
    }
  };

  useEffect(() => {
    fetchTenantsWithBilling();
    fetchActiveBills();
    fetchBranches();
  }, []);

  // Refetch bills when filters change
  useEffect(() => {
    if (activeTab === 'active-bills') {
      fetchActiveBills();
    } else if (activeTab === 'room-status') {
      fetchTenantsWithBilling();
    }
  }, [searchTerm, billStatusFilter, branchFilter, statusFilter, activeTab]);

  const fetchBranches = async () => {
    try {
      const response = await fetch('/api/branches');
      const result = await response.json();
      
      if (result.success) {
        setBranches(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching branches:', error);
    }
  };

  const fetchActiveBills = async () => {
    try {
      setIsLoadingBills(true);
      const params = new URLSearchParams({
        search: searchTerm,
        status: billStatusFilter,
        branch: branchFilter
      });
      
      const response = await fetch(`/api/bills/active?${params}`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      if (result.success) {
        console.log('Fetched bills from API:', result.data?.length || 0, 'bills'); // Debug log
        console.log('Bills data:', result.data); // Debug log
        setBills(result.data || []);
      } else {
        addToast({
          type: 'error',
          title: 'Error',
          message: result.error || 'Failed to fetch active bills'
        });
      }
    } catch (error) {
      console.error('Error fetching active bills:', error);
      addToast({
        type: 'error',
        title: 'Error',
        message: 'Failed to fetch active bills'
      });
    } finally {
      setIsLoadingBills(false);
    }
  };

  const handleGenerateBill = async (tenant?: TenantWithBilling) => {
    if (tenant) {
      setSelectedTenant(tenant);
      setFormData({
        tenant_id: tenant.id,
        present_electricity_reading: '',
        present_reading_date: new Date().toISOString().split('T')[0],
        extra_fee: null,
        extra_fee_description: null
      });
      setIsSubmitting(false); // Reset submitting state when opening dialog
    }
    setIsGenerateDialogOpen(true);
  };

  const handleSubmitBill = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent double submission
    if (isSubmitting) return;
    
    setIsSubmitting(true);

    try {
      // Prepare data for validation
      const dataToValidate = {
        ...formData,
        present_electricity_reading: parseFloat(formData.present_electricity_reading) || 0,
        extra_fee: formData.extra_fee || null,
        extra_fee_description: formData.extra_fee_description || null
      };

      // Validate form data
      const { error: validationError, value } = validateSchema(billGenerationSchema, dataToValidate);
      if (validationError) {
        addToast({
          type: 'error',
          title: 'Invalid Input',
          message: 'Please check the highlighted fields and try again.'
        });
        setIsSubmitting(false);
        return;
      }

      // Additional validation: ensure present reading is higher than previous reading
      if (selectedTenant) {
        const previousReading = selectedTenant.latest_bill?.present_electricity_reading || selectedTenant.initial_electricity_reading;
        if (parseFloat(formData.present_electricity_reading) <= previousReading) {
          addToast({
            type: 'error',
            title: 'Invalid Reading',
            message: `The new reading (${formData.present_electricity_reading} kWh) must be higher than the previous reading (${previousReading} kWh)`
          });
          setIsSubmitting(false);
          return;
        }
      }

      // Generate bill
      const response = await fetch('/api/bills', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(value),
      });

      const result = await response.json();

      if (result.success) {
        // Reset form state
        setFormData({
          tenant_id: '',
          present_electricity_reading: '',
          present_reading_date: new Date().toISOString().split('T')[0],
          extra_fee: null,
          extra_fee_description: null
        });
        setSelectedTenant(null);
        
        // Close dialog and show success message
        setIsGenerateDialogOpen(false);
        addToast({
          type: 'success',
          title: 'Bill Generated',
          message: 'The new bill has been created and an email has been sent to the tenant.'
        });

        // Handle post-generation operations in background
        try {
          // Log audit event
          const { data: { user } } = await supabase.auth.getUser();
          if (user && result.data) {
            await logAuditEvent(
              supabase,
              user.id,
              'BILL_CREATED',
              'bills',
              result.data.id,
              null,
              {
                tenant_id: result.data.tenant_id,
                total_amount_due: result.data.total_amount_due,
                billing_period_end: result.data.billing_period_end,
              }
            );
          }

          // Invalidate cache
          invalidateCache('bills');
          invalidateCache('tenants');
          invalidateCache('rooms');
          invalidateCache('available-rooms');
          
          // Refresh data with cache busting
          const timestamp = Date.now();
          
          // Set loading states for data refresh
          setIsLoadingBills(true);
          setIsLoadingTenants(true);

          try {
            // First fetch active bills
            const billsResponse = await fetch(`/api/bills/active?_cache_bust=${timestamp}`);
            const billsResult = await billsResponse.json();
            if (billsResult.success) {
              setBills(billsResult.data || []);
            }

            // Then fetch and process tenants
            const tenantsResponse = await fetch(`/api/tenants?active=true&_cache_bust=${timestamp}`);
            const tenantsResult = await tenantsResponse.json();
            if (tenantsResult.success) {
              const tenantsWithBilling = await processTenantsWithBilling(tenantsResult.data || []);
              setTenants(tenantsWithBilling);
            }
          } finally {
            // Always reset loading states
            setIsLoadingBills(false);
            setIsLoadingTenants(false);
          }
        } catch (error) {
          console.error('Post-generation operations error:', error);
          // Show a warning toast if data refresh fails
          addToast({
            type: 'warning',
            title: 'Data Refresh Warning',
            message: 'Bill was generated but there was an issue refreshing the display. Please refresh the page.'
          });
        }
      } else {
        addToast({
          type: 'error',
          title: 'Error',
          message: result.error || 'Failed to generate bill'
        });
      }
    } catch (error) {
      console.error('Error generating bill:', error);
      addToast({
        type: 'error',
        title: 'Unable to Process',
        message: 'There was a problem processing your request. Please try again.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePaymentDialog = (bill: BillWithTenant) => {
    setSelectedBill(bill);
    setIsSubmitting(false); // Ensure submitting state is reset
    const outstandingBalance = bill.total_amount_due - bill.amount_paid;
    
    setPaymentForm({
      amount_paid: outstandingBalance.toString(),
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: 'cash',
      reference_number: '',
      notes: ''
    });
    setIsPaymentDialogOpen(true);
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedBill) return;
    
    try {
      setIsSubmitting(true);
      
      const outstandingBalance = selectedBill.total_amount_due - selectedBill.amount_paid;
      const paymentAmount = parseFloat(paymentForm.amount_paid);

      if (paymentAmount <= 0) {
        addToast({
          type: 'error',
          title: 'Invalid Payment',
          message: 'Please enter a payment amount greater than zero.'
        });
        return;
      }
      
      if (paymentAmount > outstandingBalance) {
        addToast({
          type: 'warning',
          title: 'Overpayment Warning',
          message: `Payment of ₱${paymentAmount.toLocaleString()} exceeds the outstanding balance of ₱${outstandingBalance.toLocaleString()}. The bill will be marked as fully paid.`
        });
      }
      
      const { error: validationError } = validateSchema(paymentRecordSchema, {
        bill_id: selectedBill.id,
        amount_paid: parseFloat(paymentForm.amount_paid),
        payment_date: paymentForm.payment_date,
        payment_method: paymentForm.payment_method,
        reference_number: paymentForm.reference_number,
        notes: paymentForm.notes
      });
      
      if (validationError) {
        addToast({
          type: 'error',
          title: 'Invalid Input',
          message: validationError
        });
        return;
      }
      
      const response = await fetch('/api/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          bill_id: selectedBill.id,
          amount_paid: parseFloat(paymentForm.amount_paid),
          payment_date: paymentForm.payment_date,
          payment_method: paymentForm.payment_method,
          reference_number: paymentForm.reference_number,
          notes: paymentForm.notes
        }),
        // Add timeout to prevent hanging
        signal: AbortSignal.timeout(30000) // 30 second timeout
      });
      
      const result = await response.json();
      
      if (result.success) {
        addToast({
          type: 'success',
          title: 'Payment Recorded',
          message: 'The payment has been successfully recorded.'
        });
        
        // Close dialog immediately after successful payment
        setIsPaymentDialogOpen(false);
        
        // Reset form
        setPaymentForm({
          amount_paid: '',
          payment_date: new Date().toISOString().split('T')[0],
          payment_method: 'cash',
          reference_number: '',
          notes: ''
        });
        
        // Handle post-payment operations in a separate try-catch to avoid affecting the main flow
        try {
          // Log the event
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
          // Continue with other operations
        }
        
        try {
          // Invalidate cache and refresh both bills and tenants data
          invalidateCache('bills');
          invalidateCache('tenants');
          invalidateCache('payments');
          
          // Immediately remove the bill from local state if it's fully paid
          const outstandingBalance = selectedBill.total_amount_due - selectedBill.amount_paid;
          const paymentAmount = parseFloat(paymentForm.amount_paid);
          
          if (paymentAmount >= outstandingBalance) {
            // Bill is now fully paid, remove it from the bills list
            console.log(`Bill ${selectedBill.id} is now fully paid, removing from local state`);
            setBills(prevBills => {
              const filteredBills = prevBills.filter(bill => bill.id !== selectedBill.id);
              console.log(`Removed bill from local state. Bills count: ${prevBills.length} -> ${filteredBills.length}`);
              return filteredBills;
            });
            // Clear selected bill since it's now fully paid
            setSelectedBill(null);
          } else {
            // Bill is partially paid, update the amount_paid in local state
            console.log(`Bill ${selectedBill.id} is partially paid, updating local state`);
            setBills(prevBills => prevBills.map(bill => 
              bill.id === selectedBill.id 
                ? { ...bill, amount_paid: bill.amount_paid + paymentAmount, status: 'partially_paid' }
                : bill
            ));
          }
          
          // Add a small delay to ensure database transaction is committed
          await new Promise(resolve => setTimeout(resolve, 500));
          
          await Promise.all([
            fetchActiveBills(),
            fetchTenantsWithBilling()
          ]);
        } catch (refreshError) {
          console.error('Data refresh error:', refreshError);
          // As a fallback, just show a message asking user to refresh
          addToast({
            type: 'info',
            title: 'Payment Recorded',
            message: 'Payment was successful. Please refresh the page to see the updated data.'
          });
        }
      } else {
        addToast({
          type: 'error',
          title: 'Error',
          message: result.error || 'Failed to record payment'
        });
        setIsPaymentDialogOpen(false); // Close dialog on error
      }
    } catch (error) {
      console.error('Error recording payment:', error);
      addToast({
        type: 'error',
        title: 'Error',
        message: 'An unexpected error occurred while recording the payment.'
      });
      setIsPaymentDialogOpen(false); // Close dialog on error
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApplyPenalties = async () => {
    try {
      setIsApplyingPenalties(true);
      
      const response = await fetch('/api/admin/apply-penalties', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      const result = await response.json();
      
      if (result.success) {
        addToast({
          type: 'success',
          title: 'Success',
          message: result.data.penaltiesApplied > 0 
            ? `Applied penalties to ${result.data.penaltiesApplied} overdue bills`
            : 'No overdue bills found that need penalties'
        });
        
        // Invalidate cache and refresh the bills data
        invalidateCache('bills');
        invalidateCache('tenants');
        
        await Promise.all([
          fetchActiveBills(),
          fetchTenantsWithBilling()
        ]);
      } else {
        addToast({
          type: 'error',
          title: 'Error',
          message: result.error || 'Failed to apply penalties'
        });
      }
    } catch (error) {
      console.error('Error applying penalties:', error);
      addToast({
        type: 'error',
        title: 'Unable to Process',
        message: 'There was a problem processing your request. Please try again.'
      });
    } finally {
      setIsApplyingPenalties(false);
    }
  };

  const getStatusText = (tenant: TenantWithBilling) => {
    switch (tenant.billing_status) {
      case 'current': 
        return tenant.latest_bill?.status === 'fully_paid' ? 'Paid' : 'Current';
      case 'overdue': 
        return `${tenant.days_overdue} days overdue`;
      case 'no_bills': 
        return 'No Bills';
      default: 
        return 'Unknown';
    }
  };

  const getActionButtonText = (tenant: TenantWithBilling) => {
    if (!tenant.can_generate_bill && tenant.days_until_cycle_end !== undefined && tenant.days_until_cycle_end > 3) {
      return `${tenant.days_until_cycle_end} Days Until Due`;
    } else if (tenant.days_until_cycle_end !== undefined && tenant.days_until_cycle_end < 0) {
      const daysOverdue = Math.abs(tenant.days_until_cycle_end);
      return `Generate Bill (${daysOverdue} days overdue)`;
    } else if (tenant.billing_status === 'overdue') {
      return 'Generate Bill (Overdue)';
    } else if (tenant.billing_status === 'no_bills') {
      return 'Generate First Bill';
    } else if (tenant.latest_bill?.status === 'fully_paid') {
      return 'Generate Next Bill';
    } else {
      return 'Generate Bill';
    }
  };

  const getActionButtonColor = (tenant: TenantWithBilling) => {
    if (!tenant.can_generate_bill) {
      return 'btn-ghost opacity-50 cursor-not-allowed';
    } else if (tenant.billing_status === 'overdue') {
      return 'btn-destructive';
    } else if (tenant.billing_status === 'no_bills') {
      return 'btn-warning';
    } else {
      return 'btn-primary';
    }
  };

  const getBillStatusText = (bill: BillWithTenant) => {
    const today = new Date();
    const dueDate = new Date(bill.due_date);
    
    if (bill.status === 'partially_paid') {
      return 'Partially Paid';
    } else if (bill.status === 'active' && today > dueDate) {
      const daysOverdue = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
      return `${daysOverdue} days overdue`;
    } else {
      return 'Active';
    }
  };

  // Filter tenants based on search and filters
  const filteredTenants = tenants.filter(tenant => {
    const matchesSearch = searchTerm === '' || 
      tenant.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tenant.rooms?.room_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tenant.rooms?.branches?.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesBranch = branchFilter === 'all' || tenant.rooms?.branches?.id === branchFilter;
    
    return matchesSearch && matchesBranch;
  });

  // Filter bills based on search and filters
  const filteredBills = bills.filter(bill => {
    const matchesSearch = searchTerm === '' || 
      bill.tenant?.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bill.tenant?.rooms?.room_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      bill.tenant?.rooms?.branches?.name.toLowerCase().includes(searchTerm.toLowerCase());
    
    const today = new Date();
    const dueDate = new Date(bill.due_date);
    const isOverdue = today > dueDate && bill.status !== 'fully_paid';
    
    let matchesStatus = true;
    if (billStatusFilter === 'active') {
      matchesStatus = bill.status === 'active' && !isOverdue;
    } else if (billStatusFilter === 'partially_paid') {
      matchesStatus = bill.status === 'partially_paid';
    } else if (billStatusFilter === 'overdue') {
      matchesStatus = isOverdue;
    }
    
    const matchesBranch = branchFilter === 'all' || bill.tenant?.rooms?.branches?.id === branchFilter;
    
    return matchesSearch && matchesStatus && matchesBranch;
  });

  // Calculate statistics for tenants
  const totalTenants = tenants.length;
  const currentTenants = tenants.filter(t => t.billing_status === 'current').length;
  const overdueTenants = tenants.filter(t => t.billing_status === 'overdue').length;
  const noBillsTenants = tenants.filter(t => t.billing_status === 'no_bills').length;

  // Calculate statistics for bills
  const totalActiveBills = bills.length;
  const activeBillsCount = bills.filter(bill => {
    const today = new Date();
    const dueDate = new Date(bill.due_date);
    return bill.status === 'active' && today <= dueDate;
  }).length;
  const partiallyPaidBills = bills.filter(bill => bill.status === 'partially_paid').length;
  const overdueBillsCount = bills.filter(bill => {
    const today = new Date();
    const dueDate = new Date(bill.due_date);
    return today > dueDate && bill.status !== 'fully_paid';
  }).length;

  const outstandingBalance = selectedBill ? selectedBill.total_amount_due - selectedBill.amount_paid : 0;
  const paymentAmount = parseFloat(paymentForm.amount_paid) || 0;
  const willBeFullyPaid = paymentAmount >= outstandingBalance;

  // Handle edit bill dialog
  const handleEditBillDialog = async (bill: BillWithTenant) => {
    let updatedBill = bill;
    // If advance_payment or security_deposit is missing or zero, fetch full tenant info
    if (
      !bill.tenant?.advance_payment || !bill.tenant?.security_deposit
    ) {
      try {
        const res = await fetch(`/api/tenants/${bill.tenant?.id}`);
        const result = await res.json();
        if (result.success && result.data) {
          updatedBill = {
            ...bill,
            tenant: bill.tenant ? {
              ...bill.tenant,
              id: bill.tenant.id,
              full_name: bill.tenant.full_name,
              email_address: bill.tenant.email_address,
              phone_number: bill.tenant.phone_number,
              room_id: bill.tenant.room_id,
              rent_start_date: bill.tenant.rent_start_date,
              contract_start_date: bill.tenant.contract_start_date,
              contract_end_date: bill.tenant.contract_end_date,
              initial_electricity_reading: bill.tenant.initial_electricity_reading,
              advance_payment: result.data.advance_payment,
              security_deposit: result.data.security_deposit,
              is_active: bill.tenant.is_active,
              move_out_date: bill.tenant.move_out_date,
              created_at: bill.tenant.created_at,
              updated_at: bill.tenant.updated_at,
              rooms: bill.tenant.rooms
            } : undefined
          };
        }
      } catch (e) {
        // fallback: use bill as is
      }
    }
    setSelectedBill(updatedBill);
    // Format the date for the date input (YYYY-MM-DD)
    const formattedDate = updatedBill.present_reading_date ? 
      new Date(updatedBill.present_reading_date).toISOString().split('T')[0] : 
      new Date().toISOString().split('T')[0];
    const formData = {
      present_electricity_reading: updatedBill.present_electricity_reading || 0,
      present_reading_date: formattedDate,
      water_amount: updatedBill.water_amount || 0,
      extra_fee: updatedBill.extra_fee || 0,
      extra_fee_description: updatedBill.extra_fee_description || '',
      edit_reason: '',
    };
    setEditBillForm(formData);
    setIsEditBillDialogOpen(true);

    // Fetch fully paid bill count for this tenant if this is a final bill
    if (updatedBill.is_final_bill && updatedBill.tenant?.id) {
      try {
        const response = await fetch(`/api/bills?tenant_id=${updatedBill.tenant.id}&status=fully_paid`);
        const result = await response.json();
        if (result.success && Array.isArray(result.data)) {
          setFullyPaidBillCountForEdit(result.data.length);
        } else {
          setFullyPaidBillCountForEdit(0);
        }
      } catch (error) {
        setFullyPaidBillCountForEdit(0);
      }
    } else {
      setFullyPaidBillCountForEdit(null);
    }
  };

  // Handle edit bill submission
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
        addToast({
          type: 'error',
          title: 'Validation Error',
          message: validationError,
          duration: 5000
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
        addToast({
          type: 'success',
          title: 'Bill Updated',
          message: 'The bill has been updated and the tenant has been notified.',
          duration: 5000
        });
        
        // Close dialog immediately after successful update
        setIsEditBillDialogOpen(false);
        
        // Handle post-update operations in a separate try-catch to avoid affecting the main flow
        try {
          // Invalidate cache and refresh data
          invalidateCache('bills');
          invalidateCache('tenants');
          
          await Promise.all([
            fetchActiveBills(),
            fetchTenantsWithBilling()
          ]);
        } catch (refreshError) {
          console.error('Data refresh error:', refreshError);
          addToast({
            type: 'info',
            title: 'Bill Updated',
            message: 'Bill was updated successfully. Please refresh the page to see the updated data.'
          });
        }
        
        try {
          // Log the event
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
        addToast({
          type: 'error',
          title: 'Error',
          message: result.error || 'Failed to update bill',
          duration: 5000
        });
        setIsEditBillDialogOpen(false); // Close dialog on error
      }
    } catch (error) {
      console.error('Error updating bill:', error);
      addToast({
        type: 'error',
        title: 'Error',
        message: 'An unexpected error occurred. Please try again.',
        duration: 5000
      });
      setIsEditBillDialogOpen(false); // Close dialog on error
    } finally {
      setIsSubmitting(false);
    }
  };

  // Define renderActiveBills before using it
  const renderActiveBills = () => {
    if (isLoadingBills) {
      return (
        <div className="flex items-center justify-center p-12">
          <div className="loading-spinner h-8 w-8" />
        </div>
      );
    }

    if (!bills.length) {
      return (
        <div className="empty-state py-16">
          <Receipt className="empty-state-icon" />
          <h3 className="empty-state-title">No Active Bills</h3>
          <p className="empty-state-description">
            All bills have been paid in full. Great job managing your payments!
          </p>
        </div>
      );
    }

    return bills.map(bill => {
      // A bill is a refund if either:
      // 1. It has refund status
      // 2. It has a negative total_amount_due (which should match amount_paid for refunds)
      const isRefund = bill.status === 'refund' || bill.total_amount_due < 0;
      const refundAmount = Math.abs(bill.total_amount_due); // Always use absolute value for display
      
      console.log('DEBUG - Bill Display:', {
        billId: bill.id,
        status: bill.status,
        totalAmountDue: bill.total_amount_due,
        amountPaid: bill.amount_paid,
        isRefund,
        refundAmount
      });

      return (
        <Card key={bill.id} className="card-elevated mb-6 hover:scale-[1.01] transition-all duration-200">
          <CardContent className="p-6">
            <div className="flex justify-between items-start mb-6">
              <div className="flex-1 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="bg-primary/10 p-2 rounded-lg">
                    <Building2 className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg text-foreground">{bill.tenant?.rooms?.branches?.name}</h3>
                    <p className="text-sm text-muted-foreground">Room {bill.tenant?.rooms?.room_number}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <User className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{bill.tenant?.full_name}</span>
                </div>
                
                <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">
                    {formatDate(bill.billing_period_start)} - {formatDate(bill.billing_period_end)}
                  </span>
                </div>
              </div>
              
              <div className="text-right">
                <div className="text-sm font-medium text-muted-foreground mb-1">Due Date</div>
                <div className={`text-sm font-semibold ${
                  bill.isOverdue ? 'text-destructive' : 'text-foreground'
                }`}>
                  {formatDate(bill.due_date)}
                  {bill.isOverdue && (
                    <div className="text-xs text-destructive mt-1">
                      {bill.daysOverdue} days overdue
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div className="metric-card">
                <div className="metric-label mb-2">{isRefund ? 'Refund Amount' : 'Total Amount'}</div>
                <div className={`metric-value text-2xl ${isRefund ? 'text-success' : 'text-foreground'}`}>
                  {isRefund ? (
                    <>
                      <div className="flex items-center gap-2">
                        <Banknote className="h-5 w-5 text-success" />
                        <span>-₱{refundAmount.toLocaleString()}</span>
                      </div>
                      <div className="text-xs text-success mt-1 font-normal">
                        To be returned to tenant
                      </div>
                    </>
                  ) : (
                    formatCurrency(bill.total_amount_due)
                  )}
                </div>
                {bill.penalty_amount > 0 && (
                  <div className="flex items-center gap-2 mt-2 p-2 bg-destructive/10 rounded-lg">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <span className="text-sm font-medium text-destructive">
                      Penalty: {formatCurrency(bill.penalty_amount)}
                    </span>
                  </div>
                )}
              </div>
              
              {/* Only show the right column for non-refund bills */}
              {!isRefund && (
                <div className="metric-card">
                  <div className="metric-label mb-2">Amount Paid</div>
                  <div className="metric-value text-2xl text-success">
                    {formatCurrency(bill.amount_paid)}
                  </div>
                  {/* For final bills, show outstanding amount after deposits */}
                  {bill.is_final_bill && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Outstanding: {formatCurrency(bill.total_amount_due - (bill.advance_payment_applied || 0) - bill.amount_paid)}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div className="flex items-center gap-3">
                {isRefund ? (
                  <div className="status-badge status-badge-success">
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Refund Due
                  </div>
                ) : (
                  <div className={`status-badge ${
                    bill.status === 'partially_paid' ? 'status-badge-warning' : 
                    bill.status === 'fully_paid' ? 'status-badge-success' : 'status-badge-info'
                  }`}>
                    {getBillStatusText(bill)}
                  </div>
                )}
                {bill.shouldShowPenaltyWarning && !isRefund && (
                  <div className="status-badge status-badge-warning">
                    <AlertTriangle className="h-4 w-4 mr-1" />
                    Penalty may apply
                  </div>
                )}
              </div>
              
              <div className="flex flex-wrap gap-2">
                {/* Edit Bill button */}
                <Button 
                  variant="outline" 
                  onClick={() => handleEditBillDialog(bill)}
                  disabled={bill.status === 'fully_paid'}
                  className="btn-sm"
                >
                  <Pencil className="h-4 w-4 mr-2" />
                  Edit Bill
                </Button>
                
                {/* Only show Record Payment for non-refund bills */}
                {!isRefund && (
                  <Button 
                    onClick={() => handlePaymentDialog(bill)} 
                    className="btn-primary btn-sm"
                  >
                    <CreditCard className="h-4 w-4 mr-2" />
                    Record Payment
                  </Button>
                )}
                
                {/* Show Complete Refund for refund bills */}
                {isRefund && bill.total_amount_due !== 0 && (
                  <Button
                    onClick={() => { setRefundBill(bill); setIsRefundDialogOpen(true); }}
                    className="btn-success btn-sm"
                    disabled={isSubmitting}
                  >
                    <CheckCircle className="h-4 w-4 mr-2" />
                    {isSubmitting && refundBill?.id === bill.id ? 'Completing...' : 'Complete Refund'}
                  </Button>
                )}
              </div>
            </div>
            
            {isRefund && (
              <div className="mt-4 p-3 bg-success/10 rounded-lg">
                <p className="text-sm font-medium text-success">
                  Company owes tenant this refund amount
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      );
    });
  };

  if (isLoadingTenants) {
    return (
      <div className="space-y-6 px-4 sm:px-6 lg:px-8">
        <div className="page-header -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="loading-skeleton h-8 w-64 mb-2"></div>
              <div className="loading-skeleton h-4 w-96"></div>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center py-16">
          <div className="loading-spinner h-12 w-12" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 px-4 sm:px-6 lg:px-8">
      {/* Enhanced Tabs Section */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 rounded-xl bg-muted p-1">
          <TabsTrigger 
            value="room-status" 
            className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm font-medium"
          >
            <Home className="h-4 w-4 mr-2" />
            Room Status
          </TabsTrigger>
          <TabsTrigger 
            value="active-bills"
            className="rounded-lg data-[state=active]:bg-card data-[state=active]:shadow-sm font-medium"
          >
            <Receipt className="h-4 w-4 mr-2" />
            Active Bills
          </TabsTrigger>
        </TabsList>

        <TabsContent value="room-status" className="space-y-6 mt-8">
          {/* Enhanced Room Status Section */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h2 className="section-title">Room Billing Status</h2>
              <p className="text-muted-foreground">
                Overview of tenant billing cycles and bill generation timing
              </p>
            </div>
          </div>

          {/* Enhanced Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-8">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search tenants, rooms, or branches..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 input-lg"
                />
              </div>
            </div>
            
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="w-[200px] h-12">
                <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Filter by branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Enhanced Tenant Cards Grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {filteredTenants.map((tenant) => (
              <Card key={tenant.id} className="card-elevated group hover:scale-[1.02] transition-all duration-200">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center space-x-3">
                      <div className="bg-primary/10 p-2 rounded-lg">
                        <Home className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-lg font-semibold">Room {tenant.rooms?.room_number}</CardTitle>
                        <CardDescription className="text-sm">{tenant.rooms?.branches?.name}</CardDescription>
                      </div>
                    </div>
                    {/* Enhanced status badge */}
                    {typeof tenant.days_until_cycle_end === 'number' && (
                      <div className={`status-badge ${
                        tenant.days_until_cycle_end <= 0 
                          ? 'status-badge-error' 
                          : tenant.days_until_cycle_end <= 3 
                            ? 'status-badge-warning' 
                            : 'status-badge-info'
                      }`}>
                        <Clock className="h-3 w-3 mr-1" />
                        {tenant.days_until_cycle_end > 0
                          ? `${tenant.days_until_cycle_end}d left`
                          : `${Math.abs(tenant.days_until_cycle_end)}d over`}
                      </div>
                    )}
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-4">
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-muted-foreground">Tenant</span>
                      </div>
                      <span className="font-semibold text-foreground">{tenant.full_name}</span>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-muted-foreground">Current Cycle</span>
                      </div>
                      <span className="text-sm font-medium">
                        {tenant.current_cycle_start ? `${formatDate(tenant.current_cycle_start)} - ${formatDate(tenant.current_cycle_end)}` : 'N/A'}
                      </span>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium text-muted-foreground">Bill Due</span>
                      </div>
                      <span className={`text-sm font-semibold ${
                        (tenant.days_until_cycle_end ?? Infinity) <= 3 ? 'text-warning' : 'text-foreground'
                      }`}>
                        {tenant.current_cycle_end ? formatDate(tenant.current_cycle_end) : 'N/A'}
                      </span>
                    </div>
                  </div>

                  <Button 
                    className={`w-full btn-lg font-semibold ${getActionButtonColor(tenant)} group-hover:shadow-lg transition-all duration-200`}
                    onClick={() => handleGenerateBill(tenant)}
                  >
                    <Zap className="h-4 w-4 mr-2" />
                    {getActionButtonText(tenant)}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          {filteredTenants.length === 0 && (
            <div className="empty-state py-16">
              <Receipt className="empty-state-icon" />
              <h3 className="empty-state-title">No tenants found</h3>
              <p className="empty-state-description">
                {searchTerm ? 'Try adjusting your search criteria or filter settings.' : 'No active tenants are currently available for billing.'}
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="active-bills" className="space-y-6 mt-8">
          {/* Enhanced Active Bills Section */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div>
              <h2 className="section-title">Active Bills</h2>
              <p className="text-muted-foreground">
                Manage payments and track outstanding balances
              </p>
            </div>
            
            <Button 
              onClick={handleApplyPenalties}
              disabled={isApplyingPenalties}
              className="btn-destructive btn-lg font-semibold"
            >
              {isApplyingPenalties ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Applying Penalties...
                </>
              ) : (
                <>
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  Apply Penalties
                </>
              )}
            </Button>
          </div>

          {/* Enhanced Filters for Active Bills */}
          <div className="flex flex-col sm:flex-row gap-4 mb-8">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search bills by tenant, room, or amount..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 input-lg"
                />
              </div>
            </div>
            
            <Select value={billStatusFilter} onValueChange={(value: any) => setBillStatusFilter(value)}>
              <SelectTrigger className="w-[200px] h-12">
                <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Filter by bill status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="partially_paid">Partially Paid</SelectItem>
                <SelectItem value="overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
            
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger className="w-[200px] h-12">
                <Building2 className="h-4 w-4 mr-2 text-muted-foreground" />
                <SelectValue placeholder="Filter by branch" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Branches</SelectItem>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Enhanced Active Bills List */}
          <div className="space-y-4">
            {renderActiveBills()}
          </div>
        </TabsContent>
      </Tabs>

      {/* Enhanced Payment Dialog */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={(open) => {
        setIsPaymentDialogOpen(open);
        if (!open) {
          // Reset form and submitting state when dialog is closed
          setIsSubmitting(false);
          setPaymentForm({
            amount_paid: '',
            payment_date: new Date().toISOString().split('T')[0],
            payment_method: 'cash',
            reference_number: '',
            notes: ''
          });
        }
      }}>
        <DialogContent className="dialog-content sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <DialogHeader className="dialog-header">
            <DialogTitle className="dialog-title flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Record Payment
            </DialogTitle>
            <DialogDescription className="dialog-description">
              Processing payment for Bill #{selectedBill?.id?.slice(0, 8)}
            </DialogDescription>
          </DialogHeader>

          {/* Enhanced Bill Info Section */}
          <div className="metric-card mb-6">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-2 rounded-lg">
                  <Building2 className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h4 className="font-semibold">{selectedBill?.tenant?.rooms?.branches?.name}</h4>
                  <p className="text-sm text-muted-foreground">Room {selectedBill?.tenant?.rooms?.room_number}</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="bg-muted/50 p-2 rounded-lg">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>
                <span className="font-medium">{selectedBill?.tenant?.full_name}</span>
              </div>
              
              <div className="flex items-center gap-3">
                <div className="bg-muted/50 p-2 rounded-lg">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                </div>
                <span className="text-sm">
                  {formatDate(selectedBill?.billing_period_start)} - {formatDate(selectedBill?.billing_period_end)}
                </span>
              </div>
            </div>
          </div>

          {/* Enhanced Bill Summary */}
          <div className="card-elevated p-6 mb-6">
            <h4 className="section-title mb-4">Bill Summary</h4>
            <div className="space-y-4">
              <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg">
                <span className="text-sm font-medium text-muted-foreground">Total Bill Amount</span>
                <span className="font-semibold text-lg">{formatCurrency(selectedBill?.total_amount_due || 0)}</span>
              </div>
              <div className="flex justify-between items-center p-3 bg-success/10 rounded-lg">
                <span className="text-sm font-medium text-success">Already Paid</span>
                <span className="font-semibold text-lg text-success">{formatCurrency(selectedBill?.amount_paid || 0)}</span>
              </div>
              <div className="flex justify-between items-center p-4 bg-primary/10 rounded-lg border-2 border-primary/20">
                <span className="font-semibold text-primary">Outstanding Balance</span>
                <span className="font-bold text-xl text-primary">
                  {formatCurrency((selectedBill?.total_amount_due || 0) - (selectedBill?.amount_paid || 0))}
                </span>
              </div>
            </div>
          </div>

          <form onSubmit={handleSubmitPayment} className="space-y-6">
            <div className="space-y-5">
              <div>
                <Label htmlFor="amount_paid" className="text-sm font-semibold">Payment Amount (₱) *</Label>
                <Input
                  id="amount_paid"
                  type="number"
                  value={paymentForm.amount_paid}
                  onChange={(e) => {
                    const value = parseInt(e.target.value);
                    const maxAmount = (selectedBill?.total_amount_due || 0) - (selectedBill?.amount_paid || 0);
                    if (value > maxAmount) {
                      setPaymentForm({ ...paymentForm, amount_paid: maxAmount.toString() });
                    } else {
                      setPaymentForm({ ...paymentForm, amount_paid: e.target.value });
                    }
                  }}
                  min="0"
                  max={(selectedBill?.total_amount_due || 0) - (selectedBill?.amount_paid || 0)}
                  step="1"
                  placeholder="Enter payment amount"
                  required
                  disabled={isSubmitting}
                  className="input-lg"
                />
              </div>

              <div>
                <Label htmlFor="payment_date" className="text-sm font-semibold">Payment Date *</Label>
                <Input
                  id="payment_date"
                  type="date"
                  value={paymentForm.payment_date}
                  onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                  required
                  disabled={isSubmitting}
                  className="input-lg"
                />
              </div>

              <div>
                <Label htmlFor="payment_method" className="text-sm font-semibold">Payment Method *</Label>
                <Select
                  value={paymentForm.payment_method}
                  onValueChange={(value: 'cash' | 'gcash') => setPaymentForm({ ...paymentForm, payment_method: value })}
                  disabled={isSubmitting}
                >
                  <SelectTrigger className="h-12">
                    <SelectValue placeholder="Select payment method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">💵 Cash Payment</SelectItem>
                    <SelectItem value="gcash">📱 GCash Payment</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {paymentForm.payment_method === 'gcash' && (
                <div>
                  <Label htmlFor="reference_number" className="text-sm font-semibold">
                    Reference Number <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="reference_number"
                    placeholder="Enter GCash reference number"
                    value={paymentForm.reference_number}
                    onChange={(e) => setPaymentForm({ ...paymentForm, reference_number: e.target.value })}
                    required
                    disabled={isSubmitting}
                    className={`input-lg ${!paymentForm.reference_number ? 'border-destructive' : ''}`}
                  />
                  <p className="text-sm text-muted-foreground mt-2">
                    GCash reference number is required for digital payments
                  </p>
                </div>
              )}

              <div>
                <Label htmlFor="notes" className="text-sm font-semibold">Additional Notes (Optional)</Label>
                <Input
                  id="notes"
                  placeholder="Add any additional payment details..."
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  disabled={isSubmitting}
                  className="input-lg"
                />
              </div>
            </div>

            {paymentForm.amount_paid && Number(paymentForm.amount_paid) >= ((selectedBill?.total_amount_due || 0) - (selectedBill?.amount_paid || 0)) && (
              <div className="flex items-center gap-3 p-4 bg-success/10 text-success rounded-lg border border-success/20">
                <CheckCircle className="h-5 w-5" />
                <span className="font-medium">This payment will mark the bill as fully paid.</span>
              </div>
            )}

            <DialogFooter className="gap-3 pt-6">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setIsPaymentDialogOpen(false)} 
                disabled={isSubmitting}
                className="btn-md"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Recording...
                  </>
                ) : (
                  <>
                    <CreditCard className="mr-2 h-4 w-4" />
                    Record Payment
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Generate Bill Dialog */}
      <Dialog open={isGenerateDialogOpen} onOpenChange={(open) => {
        setIsGenerateDialogOpen(open);
        if (!open) {
          // Reset form and submitting state when dialog is closed
          setIsSubmitting(false);
          setFormData({
            tenant_id: '',
            present_electricity_reading: '',
            present_reading_date: new Date().toISOString().split('T')[0],
            extra_fee: null,
            extra_fee_description: null
          });
          setSelectedTenant(null);
        }
      }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSubmitBill}>
            <DialogHeader>
              <DialogTitle>Generate New Bill</DialogTitle>
              <DialogDescription>
                {selectedTenant 
                  ? `Generate a new bill for ${selectedTenant.full_name} in Room ${selectedTenant.rooms?.room_number} - ${selectedTenant.rooms?.branches?.name}`
                  : 'Create a new billing cycle for a tenant'
                }
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-3">
              {/* Tenant Selection & Bill Date */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tenant">Tenant *</Label>
                  <Select 
                    value={formData.tenant_id} 
                    onValueChange={(value) => {
                      setFormData(prev => ({ ...prev, tenant_id: value }));
                      const tenant = tenants.find(t => t.id === value);
                      if (tenant) setSelectedTenant(tenant);
                    }}
                    disabled={!!selectedTenant}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select tenant" />
                    </SelectTrigger>
                    <SelectContent>
                      {tenants.map((tenant) => (
                        <SelectItem key={tenant.id} value={tenant.id}>
                          {tenant.full_name} - Room {tenant.rooms?.room_number} ({tenant.rooms?.branches?.name})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="reading_date">
                    Bill Date / Reading Date *
                  </Label>
                  <Input
                    id="reading_date"
                    type="date"
                    value={formData.present_reading_date}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      present_reading_date: e.target.value 
                    }))}
                    required
                  />
                  <div className="text-xs text-gray-500">
                    Used as both bill date and meter reading date
                  </div>
                </div>
              </div>

              {/* Electricity Section */}
              <div className="border rounded-lg p-4 space-y-3">
                <h4 className="font-medium flex items-center">
                  <Zap className="h-4 w-4 mr-2 text-yellow-600" />
                  Electricity Reading
                </h4>
                
                {selectedTenant && (
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="space-y-1">
                      <span className="text-gray-600">Previous Reading:</span>
                      <div className="font-medium">
                        {selectedTenant.latest_bill 
                          ? selectedTenant.latest_bill.present_electricity_reading 
                          : selectedTenant.initial_electricity_reading
                        } kWh
                      </div>
                      <div className="text-xs text-gray-500">
                        {selectedTenant.latest_bill 
                          ? `From: ${formatDate(selectedTenant.latest_bill.present_reading_date)}`
                          : 'Initial reading'
                        }
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-gray-600">Rate:</span>
                      <div className="font-medium">
                        ₱{selectedTenant.rooms?.branches?.electricity_rate || 0}/kWh
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-gray-600">Billing Period:</span>
                      <div className="font-medium text-xs">
                        {selectedTenant.current_cycle_start && selectedTenant.current_cycle_end
                          ? `${formatDate(selectedTenant.current_cycle_start)} to ${formatDate(selectedTenant.current_cycle_end)}`
                          : 'N/A'
                        }
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="present_reading">Present Reading (kWh) *</Label>
                  <Input
                    id="present_reading"
                    type="number"
                    min={selectedTenant?.latest_bill?.present_electricity_reading || selectedTenant?.initial_electricity_reading || 0}
                    value={formData.present_electricity_reading}
                    onChange={(e) => {
                      setFormData(prev => ({ 
                        ...prev, 
                        present_electricity_reading: e.target.value
                      }));
                    }}
                    placeholder="Enter current meter reading"
                    required
                  />
                </div>

                {/* Show previous reading for reference */}
                {selectedTenant && (
                  <div className="text-sm text-gray-600">
                    Previous Reading: {selectedTenant.latest_bill?.present_electricity_reading || selectedTenant.initial_electricity_reading} kWh
                    <span className="text-xs block text-gray-500 mt-1">
                      From: {selectedTenant.latest_bill?.present_reading_date ? 
                        formatDate(selectedTenant.latest_bill.present_reading_date) : 
                        formatDate(selectedTenant.rent_start_date)}
                    </span>
                  </div>
                )}

                {/* Show consumption calculation only if present reading is higher */}
                {selectedTenant && parseFloat(formData.present_electricity_reading) > 0 && 
                 parseFloat(formData.present_electricity_reading) > (selectedTenant.latest_bill?.present_electricity_reading || selectedTenant.initial_electricity_reading) && (
                  <div className="bg-blue-50 p-2 rounded text-sm">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex justify-between">
                        <span>Usage:</span>
                        <span className="font-medium">
                          {parseFloat(formData.present_electricity_reading) - (selectedTenant.latest_bill?.present_electricity_reading || selectedTenant.initial_electricity_reading)} kWh
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Cost:</span>
                        <span className="font-medium">
                          ₱{((parseFloat(formData.present_electricity_reading) - (selectedTenant.latest_bill?.present_electricity_reading || selectedTenant.initial_electricity_reading)) * (selectedTenant.rooms?.branches?.electricity_rate || 0)).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Water Section */}
              <div className="border rounded-lg p-4 space-y-3">
                <h4 className="font-medium flex items-center">
                  <Droplets className="h-4 w-4 mr-2 text-blue-600" />
                  Water (Fixed Rate)
                </h4>
                
                {selectedTenant && (
                  <div className="bg-blue-50 p-2 rounded text-sm">
                    <div className="flex justify-between">
                      <span>Monthly Water Rate:</span>
                      <span className="font-medium">₱{selectedTenant.rooms?.branches?.water_rate || 0}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Monthly Rent Section */}
              <div className="border rounded-lg p-4 space-y-3">
                <h4 className="font-medium flex items-center">
                  <Home className="h-4 w-4 mr-2 text-green-600" />
                  Monthly Rent
                </h4>
                
                {selectedTenant && (
                  <div className="bg-green-50 p-2 rounded text-sm">
                    <div className="flex justify-between">
                      <span>Room Rent:</span>
                      <span className="font-medium">₱{selectedTenant.rooms?.monthly_rent || 0}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Extra Fees Section */}
              <div className="border rounded-lg p-4 space-y-3">
                <h4 className="font-medium flex items-center">
                  <DollarSign className="h-4 w-4 mr-2 text-purple-600" />
                  Extra Fees (Optional)
                </h4>
                
                <div className="grid gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="extra_fee">Amount (₱)</Label>
                    <Input
                      id="extra_fee"
                      type="number"
                      min="0"
                      value={formData.extra_fee || ''}
                      onChange={(e) => {
                        setFormData(prev => ({ 
                          ...prev, 
                          extra_fee: e.target.value ? parseInt(e.target.value) : null
                        }));
                      }}
                      placeholder="0"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="extra_fee_description">Description</Label>
                    <Input
                      id="extra_fee_description"
                      value={formData.extra_fee_description || ''}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        extra_fee_description: e.target.value
                      }))}
                      placeholder="Description of extra fee"
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              {/* Bill Summary */}
              {selectedTenant && (
                <div className="border rounded-lg p-4 space-y-3 bg-gray-50">
                  <h4 className="font-medium flex items-center">
                    <Receipt className="h-4 w-4 mr-2 text-gray-600" />
                    Bill Summary
                  </h4>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Monthly Rent:</span>
                      <span>₱{(selectedTenant.rooms?.monthly_rent || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Electricity:</span>
                      <span>₱{parseFloat(formData.present_electricity_reading) > (selectedTenant.latest_bill?.present_electricity_reading || selectedTenant.initial_electricity_reading) ? 
                        ((parseFloat(formData.present_electricity_reading) - (selectedTenant.latest_bill?.present_electricity_reading || selectedTenant.initial_electricity_reading)) * (selectedTenant.rooms?.branches?.electricity_rate || 0)).toLocaleString() : 
                        '0'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Water:</span>
                      <span>₱{(selectedTenant.rooms?.branches?.water_rate || 0).toLocaleString()}</span>
                    </div>
                    {formData.extra_fee && (
                      <div className="flex justify-between">
                        <span>Extra Fees:</span>
                        <span>₱{formData.extra_fee.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="border-t pt-2 flex justify-between font-bold">
                      <span>Total:</span>
                      <span>₱{(
                        (selectedTenant.rooms?.monthly_rent || 0) + 
                        (selectedTenant.rooms?.branches?.water_rate || 0) + 
                        (parseFloat(formData.present_electricity_reading) > (selectedTenant.latest_bill?.present_electricity_reading || selectedTenant.initial_electricity_reading) ? 
                          ((parseFloat(formData.present_electricity_reading) - (selectedTenant.latest_bill?.present_electricity_reading || selectedTenant.initial_electricity_reading)) * (selectedTenant.rooms?.branches?.electricity_rate || 0)) : 
                          0) + 
                        (formData.extra_fee || 0)
                      ).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsGenerateDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Generate Bill
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Bill Dialog */}
      <Dialog open={isEditBillDialogOpen} onOpenChange={(open) => {
        setIsEditBillDialogOpen(open);
        if (!open) {
          // Reset submitting state when dialog is closed
          setIsSubmitting(false);
          // Note: We don't reset editBillForm here as it might be needed for validation display
        }
      }}>
        <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSubmitEditBill}>
            <DialogHeader>
              <DialogTitle>Edit Bill</DialogTitle>
              <DialogDescription>
                {selectedBill && selectedBill.tenant ? (
                  <>
                    Edit bill for {selectedBill.tenant.full_name} for period {formatDate(selectedBill.billing_period_start)} to {formatDate(selectedBill.billing_period_end)}
                  </>
                ) : (
                  'Update bill details'
                )}
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-3">
              {/* Warning Notice */}
              <div className="bg-amber-50 border border-amber-200 rounded-md p-4 mb-2">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-amber-800">Important Notice</h4>
                    <p className="text-sm text-amber-700">
                      Editing this bill will send an updated bill notification to the tenant.
                      Please ensure all changes are accurate before submitting.
                    </p>
                  </div>
                </div>
              </div>

              {/* Bill Date */}
              <div className="space-y-2">
                <Label htmlFor="reading_date">
                  Bill Date / Reading Date *
                </Label>
                <Input
                  id="reading_date"
                  type="date"
                  value={editBillForm.present_reading_date}
                  onChange={(e) => setEditBillForm(prev => ({ 
                    ...prev, 
                    present_reading_date: e.target.value 
                  }))}
                  required
                />
                <div className="text-xs text-gray-500">
                  Used as both bill date and meter reading date
                </div>
              </div>

              {/* Electricity Section */}
              <div className="border rounded-lg p-4 space-y-3">
                <h4 className="font-medium flex items-center">
                  <Zap className="h-4 w-4 mr-2 text-yellow-600" />
                  Electricity Reading
                </h4>
                
                {selectedBill && (
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="space-y-1">
                      <span className="text-gray-600">Previous Reading:</span>
                      <div className="font-medium">
                        {selectedBill.previous_electricity_reading} kWh
                      </div>
                      <div className="text-xs text-gray-500">
                        From previous bill
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-gray-600">Rate:</span>
                      <div className="font-medium">
                        ₱{selectedBill.tenant?.rooms?.branches?.electricity_rate || 0}/kWh
                      </div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-gray-600">Billing Period:</span>
                      <div className="font-medium text-xs">
                        {formatDate(selectedBill.billing_period_start)} to {formatDate(selectedBill.billing_period_end)}
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="present_reading">Present Reading (kWh) *</Label>
                  <Input
                    id="present_reading"
                    type="number"
                    min={selectedBill?.previous_electricity_reading || 0}
                    value={editBillForm.present_electricity_reading}
                    onChange={(e) => setEditBillForm(prev => ({
                      ...prev,
                      present_electricity_reading: parseInt(e.target.value) || 0
                    }))}
                    placeholder="Enter current meter reading"
                    required
                  />
                </div>

                {/* Show previous reading for reference */}
                {selectedBill && (
                  <div className="text-sm text-gray-600">
                    Previous Reading: {selectedBill.previous_electricity_reading} kWh
                  </div>
                )}

                {/* Show consumption calculation */}
                {selectedBill && editBillForm.present_electricity_reading > 0 && 
                 editBillForm.present_electricity_reading > selectedBill.previous_electricity_reading && (
                  <div className="bg-blue-50 p-2 rounded text-sm">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex justify-between">
                        <span>Usage:</span>
                        <span className="font-medium">
                          {editBillForm.present_electricity_reading - selectedBill.previous_electricity_reading} kWh
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Cost:</span>
                        <span className="font-medium">
                          ₱{((editBillForm.present_electricity_reading - selectedBill.previous_electricity_reading) * 
                            (selectedBill.tenant?.rooms?.branches?.electricity_rate || 0)).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Water Section */}
              <div className="border rounded-lg p-4 space-y-3">
                <h4 className="font-medium flex items-center">
                  <Droplets className="h-4 w-4 mr-2 text-blue-600" />
                  Water (Fixed Rate)
                </h4>
                
                <div className="space-y-2">
                  <Label htmlFor="water_amount">Water Amount (PHP) *</Label>
                  <Input
                    id="water_amount"
                    type="number"
                    value={editBillForm.water_amount}
                    onChange={(e) => setEditBillForm(prev => ({
                      ...prev,
                      water_amount: parseInt(e.target.value) || 0
                    }))}
                    min="0"
                    required
                  />
                </div>
                
                {selectedBill && selectedBill.tenant?.rooms?.branches?.water_rate && (
                  <div className="bg-blue-50 p-2 rounded text-sm">
                    <div className="flex justify-between">
                      <span>Default Water Rate:</span>
                      <span className="font-medium">₱{selectedBill.tenant.rooms.branches.water_rate}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Monthly Rent Section */}
              <div className="border rounded-lg p-4 space-y-3">
                <h4 className="font-medium flex items-center">
                  <Home className="h-4 w-4 mr-2 text-green-600" />
                  Monthly Rent
                </h4>
                
                {selectedBill && (
                  <div className="bg-green-50 p-2 rounded text-sm">
                    <div className="flex justify-between">
                      <span>Room Rent:</span>
                      <span className="font-medium">₱{selectedBill.monthly_rent_amount}</span>
                    </div>
                    <div className="text-xs text-gray-600 mt-1">
                      Monthly rent amount cannot be edited
                    </div>
                  </div>
                )}
              </div>

              {/* Extra Fees Section */}
              <div className="border rounded-lg p-4 space-y-3">
                <h4 className="font-medium flex items-center">
                  <DollarSign className="h-4 w-4 mr-2 text-purple-600" />
                  Extra Fees (Optional)
                </h4>
                
                <div className="grid gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="extra_fee">Amount (₱)</Label>
                    <Input
                      id="extra_fee"
                      type="number"
                      value={editBillForm.extra_fee || ''}
                      onChange={(e) => setEditBillForm(prev => ({
                        ...prev,
                        extra_fee: e.target.value ? parseInt(e.target.value) : 0
                      }))}
                      min="0"
                      placeholder="0"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="extra_fee_description">Description</Label>
                    <Input
                      id="extra_fee_description"
                      value={editBillForm.extra_fee_description}
                      onChange={(e) => setEditBillForm(prev => ({
                        ...prev,
                        extra_fee_description: e.target.value
                      }))}
                      placeholder="e.g., Maintenance fee, Late payment charge"
                    />
                  </div>
                </div>
              </div>

              {/* Bill Summary */}
              {selectedBill && (
                <div className="border rounded-lg p-4 space-y-3 bg-gray-50">
                  <h4 className="font-medium flex items-center">
                    <Receipt className="h-4 w-4 mr-2 text-gray-600" />
                    Updated Bill Summary
                  </h4>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Monthly Rent:</span>
                      <span>₱{selectedBill.monthly_rent_amount.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Electricity:</span>
                      <span>₱{editBillForm.present_electricity_reading > selectedBill.previous_electricity_reading ? 
                        ((editBillForm.present_electricity_reading - selectedBill.previous_electricity_reading) * 
                        (selectedBill.tenant?.rooms?.branches?.electricity_rate || 0)).toLocaleString() : 
                        '0'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Water:</span>
                      <span>₱{editBillForm.water_amount.toLocaleString()}</span>
                    </div>
                    {editBillForm.extra_fee > 0 && (
                      <div className="flex justify-between">
                        <span>Extra Fees:</span>
                        <span>₱{editBillForm.extra_fee.toLocaleString()}</span>
                      </div>
                    )}
                    <div className="border-t pt-2 flex justify-between font-bold">
                      <span>Total:</span>
                      <span>₱{(
                        selectedBill.monthly_rent_amount + 
                        editBillForm.water_amount + 
                        (editBillForm.present_electricity_reading > selectedBill.previous_electricity_reading ? 
                          ((editBillForm.present_electricity_reading - selectedBill.previous_electricity_reading) * 
                          (selectedBill.tenant?.rooms?.branches?.electricity_rate || 0)) : 
                          0) + 
                        (editBillForm.extra_fee || 0)
                      ).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Reason for Edit */}
              <div className="space-y-2">
                <Label htmlFor="edit_reason">Reason for Edit *</Label>
                <Input
                  id="edit_reason"
                  value={editBillForm.edit_reason}
                  onChange={(e) => setEditBillForm(prev => ({
                    ...prev,
                    edit_reason: e.target.value
                  }))}
                  placeholder="Explain why this bill is being edited"
                  required
                />
                <div className="text-xs text-gray-500">
                  This reason will be included in the email notification to the tenant
                </div>
              </div>

              {selectedBill?.is_final_bill && (
                (() => {
                  // Calculate edited total
                  const editedTotal =
                    (selectedBill?.monthly_rent_amount || 0) +
                    (editBillForm.water_amount || 0) +
                    (editBillForm.present_electricity_reading > selectedBill.previous_electricity_reading
                      ? (editBillForm.present_electricity_reading - selectedBill.previous_electricity_reading) *
                        (selectedBill.tenant?.rooms?.branches?.electricity_rate || 0)
                      : 0) +
                    (editBillForm.extra_fee || 0);
                  // Get deposit info from bill record (not tenant)
                  const fullyPaidBillCount = fullyPaidBillCountForEdit !== null ? fullyPaidBillCountForEdit : (selectedBill?.tenant?.fully_paid_bill_count || 0);
                  const advancePayment = selectedBill?.advance_payment || 0;
                  const securityDeposit = selectedBill?.security_deposit || 0;
                  // Calculate deposit application
                  const depositApp = calculateDepositApplication(
                    fullyPaidBillCount,
                    advancePayment,
                    securityDeposit,
                    editedTotal
                  );
                  const finalBalance = editedTotal - depositApp.availableAmount;
                  return (
                    <>
                      <div className="border-t pt-2 mt-2">
                        <div className="flex justify-between text-green-600">
                          <span>Less: Advance Payment:</span>
                          <span>-₱{advancePayment.toLocaleString()}</span>
                        </div>
                        {fullyPaidBillCount >= 5 ? (
                          <div className="flex justify-between text-green-600">
                            <span>Less: Security Deposit:</span>
                            <span>-₱{securityDeposit.toLocaleString()}</span>
                          </div>
                        ) : (
                          <div className="flex justify-between text-red-600">
                            <span>Security Deposit (Forfeited):</span>
                            <span>₱{securityDeposit.toLocaleString()}</span>
                          </div>
                        )}
                        <div className="border-t pt-2 flex justify-between font-bold">
                          <span>Final Balance:</span>
                          {finalBalance < 0 ? (
                            <span className="text-green-700">Refund Due: ₱{Math.abs(finalBalance).toLocaleString()}</span>
                          ) : finalBalance > 0 ? (
                            <span className="text-red-700">Outstanding Balance: ₱{finalBalance.toLocaleString()}</span>
                          ) : (
                            <span className="text-gray-700">No Balance Due</span>
                          )}
                        </div>
                      </div>
                      {/* Deposit Information Section */}
                      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4 mt-4 flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                        <div>
                          <span className="font-medium">Advance Payment:</span> <span className="font-mono">₱{advancePayment.toLocaleString()}</span>
                        </div>
                        <div>
                          <span className="font-medium">Security Deposit:</span> <span className="font-mono">₱{securityDeposit.toLocaleString()}</span>
                          {fullyPaidBillCount < 5 && <span className="text-red-600 ml-1">(Forfeited)</span>}
                        </div>
                        <div>
                          <span className="font-medium">Billing Cycles:</span> <span className="inline-block bg-yellow-100 text-yellow-800 rounded px-2 py-0.5 text-xs font-semibold">{fullyPaidBillCount} Cycle{fullyPaidBillCount === 1 ? '' : 's'}</span>
                        </div>
                      </div>
                    </>
                  );
                })()
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsEditBillDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Pencil className="h-4 w-4 mr-2" />
                    Update Bill
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Refund Dialog */}
      <Dialog open={isRefundDialogOpen} onOpenChange={open => { setIsRefundDialogOpen(open); if (!open) setRefundBill(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark this refund as completed?</DialogTitle>
            <DialogDescription>
              This will remove it from the active bills list and log the action.
            </DialogDescription>
          </DialogHeader>
          
          {refundBill && (
            <div className="py-4 border-y">
              <div className="flex flex-col gap-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Tenant:</span>
                  <span className="font-medium">{refundBill.tenant?.full_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Room:</span>
                  <span className="font-medium">{refundBill.tenant?.rooms?.room_number} - {refundBill.tenant?.rooms?.branches?.name}</span>
                </div>
                <div className="flex justify-between text-green-700">
                  <span className="font-medium">Refund Amount:</span>
                  <span className="font-bold">₱{Math.abs(refundBill.total_amount_due).toLocaleString()}</span>
                </div>
                <div className="bg-blue-50 p-3 rounded-md text-sm text-blue-800">
                  <p className="flex items-center mb-1">
                    <AlertCircle className="h-4 w-4 mr-2" />
                    <span className="font-medium">Payment Instructions</span>
                  </p>
                  <p>Return this amount to the tenant via their preferred payment method. Mark as completed only after the refund has been issued.</p>
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button
              onClick={handleCompleteRefund}
              disabled={isSubmitting}
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {isSubmitting ? 'Completing...' : 'Mark as Completed'}
            </Button>
            <Button
              variant="outline"
              onClick={() => { setIsRefundDialogOpen(false); setRefundBill(null); }}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
} 