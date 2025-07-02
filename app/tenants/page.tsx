'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, DialogClose } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatCurrency, formatDate, getTenantStatusColor, getTenantStatusText } from '@/lib/utils';
import { tenantMoveInSchema, validateSchema } from '@/lib/validations/schemas';
import type { Tenant, Room, TenantMoveInForm, TenantMoveOutForm } from '@/types/database';
import { useToast } from '@/components/ui/toast';
import { 
  Users, 
  Plus, 
  Search, 
  Filter,
  Phone,
  Mail,
  Calendar,
  Home,
  Building2,
  AlertCircle,
  Loader2,
  Pencil,
  RefreshCw,
  CircleDot,
  Zap,
  Droplets,
  DollarSign,
  Receipt
} from 'lucide-react';
import { logAuditEvent } from '@/lib/audit/logger';
import { getSupabaseClient, invalidateCache } from '@/lib/supabase/client';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

const editTenantSchema = z.object({
  full_name: z.string().min(2, 'Full name is required'),
  email_address: z.string().email('Invalid email address'),
  phone_number: z.string().min(1, 'Phone number is required'),
  room_id: z.string().uuid('A room must be selected'),
});
type EditTenantFormData = z.infer<typeof editTenantSchema>;

interface TenantWithBilling extends Tenant {
  billing_status: string;
  completed_cycles: number;
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

export default function TenantsPage() {
  const supabase = getSupabaseClient();
  const { addToast } = useToast();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [availableRooms, setAvailableRooms] = useState<Room[]>([]);
  const [branches, setBranches] = useState<{ id: string; name: string }[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [availableRoomsForRelocation, setAvailableRoomsForRelocation] = useState<Room[]>([]);
  const [tenantCycles, setTenantCycles] = useState<Record<string, number>>({});
  const [isRenewingContract, setIsRenewingContract] = useState(false);
  const [renewingTenantId, setRenewingTenantId] = useState<string | null>(null);
  const [isMoveOutSubmitting, setIsMoveOutSubmitting] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState<TenantMoveInForm>({
    full_name: '',
    phone_number: '',
    email_address: '',
    room_id: '',
    rent_start_date: '',
    initial_electricity_reading: 0,
    advance_payment_received: false,
    security_deposit_received: false
  });

  const { 
    register: registerEdit, 
    handleSubmit: handleSubmitEdit, 
    formState: { errors: editErrors }, 
    reset: resetEdit,
    setValue: setEditValue,
  } = useForm<EditTenantFormData>({
    resolver: zodResolver(editTenantSchema),
  });

  // --- STATE FOR MOVE OUT DIALOG ---
  const [isMoveOutDialogOpen, setIsMoveOutDialogOpen] = useState(false);
  const [moveOutTenant, setMoveOutTenant] = useState<Tenant | null>(null);
  const [moveOutTenantDetails, setMoveOutTenantDetails] = useState<any>(null); // For extra info (room, branch, prev reading, etc)
  const [isRoomTransfer, setIsRoomTransfer] = useState(false);
  const [moveOutForm, setMoveOutForm] = useState<TenantMoveOutForm>({
    move_out_date: '',
    final_electricity_reading: '',
    final_water_amount: '',
    extra_fees: '',
    extra_fee_description: '',
  });

  // Add local state for Add Tenant modal branch selection
  const [addTenantBranchId, setAddTenantBranchId] = useState<string | null>(null);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);

  useEffect(() => {
    fetchTenants();
    fetchAvailableRooms();
    fetchBranches();
  }, []);

  // Filter rooms when branch is selected
  useEffect(() => {
    if (selectedBranchId) {
      setFormData(prev => ({ ...prev, room_id: '' })); // Reset room selection when branch changes
    }
  }, [selectedBranchId]);

  // Fetch rooms when add tenant branch is selected
  useEffect(() => {
    if (addTenantBranchId) {
      setIsLoadingRooms(true);
      // Invalidate cache to ensure fresh data
      invalidateCache('rooms');
      invalidateCache('available-rooms');
      
      fetchAvailableRooms(addTenantBranchId).finally(() => {
        setIsLoadingRooms(false);
      });
      // Reset room selection when branch changes
      setFormData(prev => ({ ...prev, room_id: '' }));
    }
  }, [addTenantBranchId]);

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

  const fetchTenants = async () => {
    try {
      setIsLoading(true);
      const response = await fetch('/api/tenants');
      const result = await response.json();
      
      if (result.success) {
        setTenants(result.data || []);
        // Fetch cycle counts for each tenant
        fetchTenantCycles(result.data);
      } else {
        console.error('Failed to fetch tenants:', result.error);
      }
    } catch (error) {
      console.error('Error fetching tenants:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Function to fetch cycle counts for each tenant
  const fetchTenantCycles = async (tenants: Tenant[]) => {
    try {
      const cycles: Record<string, number> = {};
      
      // For each tenant, get their fully paid bills count
      for (const tenant of tenants) {
        if (tenant.is_active) {
          const response = await fetch(`/api/bills?tenant_id=${tenant.id}&status=fully_paid`);
          const result = await response.json();
          
          if (result.success) {
            cycles[tenant.id] = result.data?.length || 0;
          }
        }
      }
      
      setTenantCycles(cycles);
    } catch (error) {
      console.error('Error fetching tenant cycles:', error);
    }
  };

  const fetchAvailableRooms = async (branchId?: string | null) => {
    try {
      // Invalidate room cache before fetching to ensure fresh data
      invalidateCache('rooms');
      invalidateCache('available-rooms');
      
      const url = new URL('/api/rooms', window.location.origin);
      url.searchParams.append('available', 'true');
      if (branchId) {
        url.searchParams.append('branch_id', branchId);
      }

      console.log('Fetching rooms from:', url.toString()); // Debug log

      const response = await fetch(url.toString());
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const result = await response.json();
      
      console.log('Rooms API response:', result); // Debug log
      
      if (result.success) {
        setAvailableRooms(result.data || []);
        console.log('Available rooms set:', result.data); // Debug log
      } else {
        console.error('API returned error:', result.error);
        addToast({
          type: 'error',
          title: 'Error',
          message: result.error || 'Failed to fetch available rooms',
          duration: 5000
        });
      }
    } catch (error) {
      console.error('Error fetching available rooms:', error);
      addToast({
        type: 'error',
        title: 'Network Error',
        message: 'Unable to load available rooms. Please try again.',
        duration: 5000
      });
    }
  };

  // Update rooms when branch selection changes
  useEffect(() => {
    fetchAvailableRooms(selectedBranchId);
  }, [selectedBranchId]);

  // Reset room selection when branch changes
  useEffect(() => {
    if (selectedBranchId) {
      setFormData(prev => ({ ...prev, room_id: '' }));
    }
  }, [selectedBranchId]);

  const handleAddTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Validate form data
      const { error: validationError } = validateSchema(tenantMoveInSchema, formData);
      if (validationError) {
        addToast({
          type: 'error',
          title: 'Validation Error',
          message: validationError,
          duration: 5000
        });
        setIsSubmitting(false);
        return;
      }

      const response = await fetch('/api/tenants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (result.success) {
        // Reset form and close dialog
        setFormData({
          full_name: '',
          phone_number: '',
          email_address: '',
          room_id: '',
          rent_start_date: '',
          initial_electricity_reading: 0,
          advance_payment_received: false,
          security_deposit_received: false
        });
        setAddTenantBranchId(null); // Reset branch selection
        setIsAddDialogOpen(false);
        
        // Show success toast
        addToast({
          type: 'success',
          title: 'Success',
          message: 'New tenant has been successfully added.',
          duration: 5000
        });
        
        // Invalidate caches and refresh data
        invalidateCache('tenants');
        invalidateCache('rooms');
        invalidateCache('available-rooms');
        
        await fetchTenants();
        await fetchAvailableRooms();

        // Log the move-in event
        const { data: { user } } = await supabase.auth.getUser();
        if (user && result.data) {
          await logAuditEvent(
            supabase,
            user.id,
            'TENANT_MOVE_IN',
            'tenants',
            result.data.id,
            null,
            {
              full_name: result.data.full_name,
              email_address: result.data.email_address,
              phone_number: result.data.phone_number,
              room_id: result.data.room_id,
              rent_start_date: result.data.rent_start_date,
              initial_electricity_reading: result.data.initial_electricity_reading,
            }
          );
        }
      } else {
        // Show error toast with specific message
        addToast({
          type: 'error',
          title: 'Error',
          message: result.error || 'An unexpected error occurred. Please try again.',
          duration: 7000
        });
      }
    } catch (error) {
      console.error('Error adding tenant:', error);
      addToast({
        type: 'error',
        title: 'Error',
        message: 'Failed to process your request. Please try again later.',
        duration: 7000
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditTenantClick = async (tenant: Tenant) => {
    setEditingTenant(tenant);
    resetEdit({
      full_name: tenant.full_name,
      email_address: tenant.email_address,
      phone_number: tenant.phone_number,
      room_id: tenant.room_id || '',
    });
    
    // Fetch all rooms that are not occupied OR are occupied by the current tenant
    const { data, error } = await supabase
      .from('rooms')
      .select('*, branches(name)')
      .or(`is_occupied.eq.false,id.eq.${tenant.room_id}`);
      
    if (data) setAvailableRoomsForRelocation(data);
    
    setIsEditDialogOpen(true);
  };

  const handleUpdateTenant = async (data: EditTenantFormData) => {
    if (!editingTenant) return;

    try {
      const response = await fetch(`/api/tenants/${editingTenant.id}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error);
      }

      addToast({
        type: 'success',
        title: 'Tenant Updated',
        message: `${data.full_name}'s information has been updated.`,
      });

      setIsEditDialogOpen(false);
      fetchTenants(); // Refresh the main tenant list
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Update Failed',
        message: error.message,
      });
    }
  };

  // Function to handle contract renewal
  const handleRenewContract = async (tenantId: string) => {
    setRenewingTenantId(tenantId);
    setIsRenewingContract(true);
    
    try {
      const response = await fetch(`/api/tenants/${tenantId}/renew`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      
      const result = await response.json();
      
      if (result.success) {
        addToast({
          type: 'success',
          title: 'Contract Renewed',
          message: 'The tenant\'s contract has been successfully renewed for 6 more months.',
          duration: 5000
        });
        
        // Refresh tenant data
        fetchTenants();
      } else {
        addToast({
          type: 'error',
          title: 'Renewal Failed',
          message: result.error || 'Failed to renew the contract. Please try again.',
          duration: 5000
        });
      }
    } catch (error) {
      console.error('Error renewing contract:', error);
      addToast({
        type: 'error',
        title: 'Renewal Failed',
        message: 'An unexpected error occurred. Please try again later.',
        duration: 5000
      });
    } finally {
      setIsRenewingContract(false);
      setRenewingTenantId(null);
    }
  };

  // Function to get cycle color based on count
  const getCycleColor = (count: number): string => {
    if (count >= 5) return 'bg-green-100 text-green-800'; // 5+ cycles (6th cycle or beyond)
    if (count >= 3) return 'bg-blue-100 text-blue-800';   // 3-4 cycles
    return 'bg-amber-100 text-amber-800';                 // 0-2 cycles
  };

  // Helper function to calculate estimated prorated rent for frontend display
  const calculateEstimatedProratedRent = (moveOutDate: string, tenantDetails: any): number => {
    if (!moveOutDate || !tenantDetails) return 0;
    
    // Parse dates
    const moveOut = new Date(moveOutDate);
    const billingStart = new Date(tenantDetails.billing_period_start);
    const billingEnd = new Date(tenantDetails.billing_period_end);
    
    // Calculate total days in cycle
    const totalDays = Math.ceil((billingEnd.getTime() - billingStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    // Calculate days occupied (from billing start to move-out date)
    const daysOccupied = Math.ceil((moveOut.getTime() - billingStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    
    // Calculate prorated amount
    const monthlyRent = tenantDetails.monthly_rent || 0;
    const dailyRate = monthlyRent / totalDays;
    return Math.round(dailyRate * Math.max(0, daysOccupied));
  };

  // Helper to calculate deposit application
  const calculateDepositApplication = (fullyPaidBillCount: number, advancePayment: number, securityDeposit: number, outstandingBalance: number, isRoomTransferLocal = false) => {
    // For room transfers, always make both deposits available (no forfeiture)
    if (isRoomTransferLocal || fullyPaidBillCount >= 5) {
      const availableAmount = advancePayment + securityDeposit;
      const appliedAmount = Math.min(availableAmount, outstandingBalance);
      return {
        availableAmount,
        forfeitedAmount: 0,
        refundAmount: availableAmount - appliedAmount,
        appliedAmount
      };
    } else {
      const appliedAmount = Math.min(advancePayment, outstandingBalance);
      return {
        availableAmount: advancePayment,
        forfeitedAmount: securityDeposit,
        refundAmount: advancePayment - appliedAmount,
        appliedAmount
      };
    }
  };

  // Filter tenants based on search and status
  const filteredTenants = tenants.filter(tenant => {
    const matchesSearch = searchTerm === '' ||
      tenant.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tenant.rooms?.room_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tenant.rooms?.branches?.name.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesBranch = !selectedBranchId || tenant.rooms?.branches?.id === selectedBranchId;

    return matchesSearch && matchesBranch;
  });

  // Filter rooms by selected branch
  const filteredRooms = availableRooms.filter(room => 
    !selectedBranchId || room.branch?.id === selectedBranchId
  );

  // --- HANDLER TO OPEN MOVE OUT DIALOG ---
  const handleOpenMoveOutDialog = async (tenant: Tenant) => {
    setMoveOutTenant(tenant);
    setIsRoomTransfer(false); // Reset room transfer flag
    setMoveOutForm({
      move_out_date: '',
      final_electricity_reading: '',
      final_water_amount: '',
      extra_fees: '',
      extra_fee_description: '',
    });
    setIsMoveOutDialogOpen(true);
    // Fetch extra details for modal
    const resp = await fetch(`/api/tenants/${tenant.id}/move-out?info=1`); // Assume GET returns info for modal
    const result = await resp.json();
    if (result.success) {
      setMoveOutTenantDetails(result.data);
    } else {
      setMoveOutTenantDetails(null);
    }
  };

  // --- HANDLER TO CONFIRM MOVE OUT ---
  const handleConfirmMoveOut = async () => {
    if (!moveOutTenant || !moveOutTenant.id) return;
    setIsMoveOutSubmitting(true);
    try {
      // Ensure extra_fees is properly handled as optional
      const formDataToSubmit = {
        ...moveOutForm,
        // Convert empty strings to default values
        extra_fees: moveOutForm.extra_fees === '' ? 0 : parseFloat(moveOutForm.extra_fees),
        extra_fee_description: moveOutForm.extra_fee_description || '',
        final_water_amount: moveOutForm.final_water_amount === '' ? 0 : parseFloat(moveOutForm.final_water_amount),
        final_electricity_reading: moveOutForm.final_electricity_reading === '' ? moveOutTenantDetails?.previous_electricity_reading : parseFloat(moveOutForm.final_electricity_reading),
        is_room_transfer: isRoomTransfer
      };
      
      const response = await fetch(`/api/tenants/${moveOutTenant.id}/move-out`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formDataToSubmit),
      });
      const result = await response.json();
      if (result.success) {
        addToast({ type: 'success', title: 'Move-Out Initiated', message: 'Final bill generated. Proceed to settlement.' });
        setIsMoveOutDialogOpen(false);
        setMoveOutTenant(null);
        fetchTenants();
      } else {
        addToast({ type: 'error', title: 'Move-Out Failed', message: result.error || 'Failed to process move-out.' });
      }
    } catch (error) {
      console.error('Move-out error:', error);
      addToast({ type: 'error', title: 'Move-Out Error', message: 'Could not process move-out.' });
    } finally {
      setIsMoveOutSubmitting(false);
    }
  };

  // --- HANDLER TO COMPLETE REFUND ---
  const handleCompleteRefund = async (tenantId: string) => {
    try {
      const response = await fetch(`/api/tenants/${tenantId}/move-out`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
      });
      const result = await response.json();
      
      if (result.success) {
        addToast({
          type: 'success',
          title: 'Move-Out Complete',
          message: 'Tenant has been successfully moved out.',
        });
        fetchTenants(); // Refresh the tenant list
      } else {
        addToast({
          type: 'error',
          title: 'Move-Out Error',
          message: result.error || 'Failed to complete move-out process.',
        });
      }
    } catch (error) {
      console.error('Error completing move-out:', error);
      addToast({
        type: 'error',
        title: 'Move-Out Error',
        message: 'Could not complete move-out process.',
      });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight">Tenants</h1>
        </div>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 px-3 sm:px-0">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Tenants</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Manage active tenant information and move-in processes
          </p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-2" />
              Add Tenant
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto mx-4">
            <form onSubmit={handleAddTenant}>
              <DialogHeader>
                <DialogTitle>Add New Tenant (Move-In)</DialogTitle>
                <DialogDescription>
                  Complete the tenant move-in process. This will establish a 6-month contract.
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-1">
                    <Label htmlFor="full_name">Full Name *</Label>
                    <Input
                      id="full_name"
                      value={formData.full_name}
                      onChange={(e) => setFormData({...formData, full_name: e.target.value})}
                      placeholder="Enter tenant's full name"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone_number">Phone Number *</Label>
                    <div className="relative flex items-center">
                      <span className="absolute left-0 flex items-center justify-center w-10 h-9 text-sm text-gray-500 border-r bg-gray-50 rounded-l-md">+63</span>
                      <Input
                        id="phone_number"
                        value={formData.phone_number.replace('+63', '')}
                        onChange={(e) => {
                          const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                          setFormData({...formData, phone_number: value ? `+63${value}` : ''});
                        }}
                        className="pl-11"
                        placeholder="9XX XXX XXXX"
                        required
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <Label htmlFor="email_address">Email Address *</Label>
                  <Input
                    id="email_address"
                    type="email"
                    value={formData.email_address}
                    onChange={(e) => setFormData({...formData, email_address: e.target.value})}
                    placeholder="Enter email address"
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="branch">Branch *</Label>
                    <Select
                      value={addTenantBranchId || "placeholder"}
                      onValueChange={(value) => setAddTenantBranchId(value === "placeholder" ? null : value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a branch" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="placeholder">Select a branch</SelectItem>
                        {branches.map((branch) => (
                          <SelectItem key={branch.id} value={branch.id}>
                            {branch.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="room">Room Assignment *</Label>
                    <Select
                      value={formData.room_id || "placeholder"}
                      onValueChange={(value) => setFormData({...formData, room_id: value === "placeholder" ? "" : value})}
                      disabled={!addTenantBranchId || isLoadingRooms}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={
                          !addTenantBranchId 
                            ? "Select a branch first" 
                            : isLoadingRooms 
                              ? "Loading rooms..." 
                              : "Select a room"
                        } />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="placeholder">
                          {isLoadingRooms ? "Loading..." : "Select a room"}
                        </SelectItem>
                        {!isLoadingRooms && availableRooms
                          .filter(room => addTenantBranchId && room.branch?.id === addTenantBranchId)
                          .map((room) => (
                            <SelectItem key={room.id} value={room.id}>
                              {room.room_number} - ₱{room.monthly_rent.toLocaleString()}
                            </SelectItem>
                          ))
                        }
                      </SelectContent>
                    </Select>
                    {addTenantBranchId && !isLoadingRooms && (
                      <div className="mt-2 text-sm text-muted-foreground">
                        {availableRooms.filter(room => room.branch?.id === addTenantBranchId).length === 0 ? (
                          <span className="text-orange-600">No available rooms in this branch</span>
                        ) : (
                          <span>
                            {availableRooms.filter(room => room.branch?.id === addTenantBranchId).length} available room(s) in selected branch
                          </span>
                        )}
                      </div>
                    )}
                    {isLoadingRooms && (
                      <div className="mt-2 text-sm text-muted-foreground flex items-center">
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        Loading available rooms...
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="rent_start_date">Rent Start Date *</Label>
                    <Input
                      type="date"
                      id="rent_start_date"
                      value={formData.rent_start_date}
                      onChange={(e) => setFormData({ ...formData, rent_start_date: e.target.value })}
                      max={new Date().toISOString().split('T')[0]}
                    />
                  </div>
                  <div>
                    <Label htmlFor="initial_electricity_reading">Initial Electricity Reading *</Label>
                    <Input
                      type="number"
                      id="initial_electricity_reading"
                      value={formData.initial_electricity_reading}
                      onChange={(e) => {
                        const value = e.target.value;
                        setFormData({
                          ...formData,
                          initial_electricity_reading: value === '' ? 0 : Number(value)
                        });
                      }}
                      min="0"
                      step="1"
                      placeholder="Enter initial reading"
                    />
                  </div>
                </div>

                {formData.room_id && (
                  <>
                    <div className="bg-blue-50 p-4 rounded-lg space-y-4">
                      <h4 className="font-medium text-blue-900">Required Deposits</h4>
                      <p className="text-sm text-blue-700">
                        Both deposits are equal to one month's rent (₱{availableRooms.find(r => r.id === formData.room_id)?.monthly_rent.toLocaleString()})
                      </p>
                      
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-blue-900">Advance Payment</Label>
                            <p className="text-sm text-blue-700">First month's rent payment</p>
                          </div>
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id="advance_payment_received"
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              checked={formData.advance_payment_received}
                              onChange={(e) => setFormData({...formData, advance_payment_received: e.target.checked})}
                              required
                            />
                            <Label htmlFor="advance_payment_received" className="text-sm font-medium text-blue-900">
                              Received
                            </Label>
                          </div>
                        </div>

                        <div className="flex items-center justify-between">
                          <div>
                            <Label className="text-blue-900">Security Deposit</Label>
                            <p className="text-sm text-blue-700">Refundable based on contract terms</p>
                          </div>
                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id="security_deposit_received"
                              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                              checked={formData.security_deposit_received}
                              onChange={(e) => setFormData({...formData, security_deposit_received: e.target.checked})}
                              required
                            />
                            <Label htmlFor="security_deposit_received" className="text-sm font-medium text-blue-900">
                              Received
                            </Label>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-4 bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-medium text-gray-900">Move-In Summary</h4>
                      <div className="mt-2 space-y-2 text-sm text-gray-600">
                        <p className="flex items-center">
                          <Calendar className="h-4 w-4 mr-2" />
                          6-month contract duration
                        </p>
                        <p className="flex items-center">
                          <Building2 className="h-4 w-4 mr-2" />
                          {availableRooms.find(r => r.id === formData.room_id)?.branch?.name} - Room {availableRooms.find(r => r.id === formData.room_id)?.room_number}
                        </p>
                        <p className="flex items-center">
                          <Mail className="h-4 w-4 mr-2" />
                          Welcome email will be sent automatically
                        </p>
                      </div>
                    </div>
                  </>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => { 
                  setIsAddDialogOpen(false); 
                  setAddTenantBranchId(null);
                  setFormData({
                    full_name: '',
                    phone_number: '',
                    email_address: '',
                    room_id: '',
                    rent_start_date: '',
                    initial_electricity_reading: 0,
                    advance_payment_received: false,
                    security_deposit_received: false
                  });
                }}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    'Add Tenant'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6 py-6 items-center">
            <div className="flex-1 w-full">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search tenants, rooms, or branches..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedBranchId || 'all'} onValueChange={(value) => setSelectedBranchId(value === 'all' ? null : value)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Branches" />
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
          </div>

          {/* Tenants Table */}
          <div className="rounded-md border">
            <div className="max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-white z-10">
                  <TableRow>
                    <TableHead>Tenant</TableHead>
                    <TableHead>Room & Branch</TableHead>
                    <TableHead>Contract</TableHead>
                    <TableHead>Rent</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                {filteredTenants.length > 0 ? (
                  filteredTenants.map((tenant) => (
                    <TableRow key={tenant.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{tenant.full_name}</div>
                          <div className="flex items-center text-sm text-muted-foreground">
                            <Mail className="h-3 w-3 mr-1" />
                            {tenant.email_address}
                          </div>
                          <div className="flex items-center text-sm text-muted-foreground">
                            <Phone className="h-3 w-3 mr-1" />
                            {tenant.phone_number}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="flex items-center font-medium">
                            <Home className="h-3 w-3 mr-1" />
                            {tenant.rooms?.room_number}
                          </div>
                          <div className="flex items-center text-sm text-muted-foreground">
                            <Building2 className="h-3 w-3 mr-1" />
                            {tenant.rooms?.branches?.name}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          <div className="flex items-center">
                            <Calendar className="h-3 w-3 mr-1" />
                            {formatDate(tenant.rent_start_date)}
                          </div>
                          <div className="text-muted-foreground">
                            to {formatDate(tenant.contract_end_date)}
                          </div>
                          {tenant.is_active && (
                            <div className="mt-1">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${getCycleColor(tenantCycles[tenant.id] || 0)}`}>
                                <CircleDot className="h-3 w-3 mr-1" />
                                {tenantCycles[tenant.id] || 0} {tenantCycles[tenant.id] === 1 ? 'Cycle' : 'Cycles'}
                              </span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {formatCurrency(tenant.rooms?.monthly_rent || 0)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          PHP/month
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {tenant.is_active && (
                            <Button 
                              variant="outline" 
                              size="sm"
                              onClick={() => handleRenewContract(tenant.id)}
                              disabled={isRenewingContract && renewingTenantId === tenant.id}
                            >
                              {isRenewingContract && renewingTenantId === tenant.id ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4 mr-2" />
                              )}
                              Renew Contract
                            </Button>
                          )}
                          <Button variant="outline" size="sm" onClick={() => handleEditTenantClick(tenant)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Edit
                          </Button>
                          {tenant.is_active && (
                            <Button variant="outline" size="sm" onClick={() => handleOpenMoveOutDialog(tenant)}>
                              Move Out
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      {searchTerm || selectedBranchId !== 'all' 
                        ? 'No tenants match your filters' 
                        : 'No tenants found. Add your first tenant to get started.'
                      }
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      {editingTenant && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Edit Tenant: {editingTenant.full_name}</DialogTitle>
              <DialogDescription>Update tenant details or relocate them to a new room.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmitEdit(handleUpdateTenant)} className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="full_name" className="text-right">Full Name</Label>
                <Input id="full_name" {...registerEdit('full_name')} className="col-span-3" />
                {editErrors.full_name && <p className="col-span-4 text-red-500 text-sm">{editErrors.full_name.message}</p>}
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="email_address" className="text-right">Email</Label>
                <Input id="email_address" {...registerEdit('email_address')} className="col-span-3" />
                {editErrors.email_address && <p className="col-span-4 text-red-500 text-sm">{editErrors.email_address.message}</p>}
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="phone_number" className="text-right">Phone</Label>
                <Input id="phone_number" {...registerEdit('phone_number')} className="col-span-3" />
                {editErrors.phone_number && <p className="col-span-4 text-red-500 text-sm">{editErrors.phone_number.message}</p>}
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="room_id" className="text-right">Room</Label>
                <div className="col-span-3">
                  <Select onValueChange={(value) => setEditValue('room_id', value)} defaultValue={editingTenant.room_id || undefined}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a new room" />
                    </SelectTrigger>
                    <SelectContent>
                      {availableRoomsForRelocation.map(room => (
                        <SelectItem key={room.id} value={room.id}>
                          {room.branch?.name} - {room.room_number} {room.id === editingTenant.room_id ? '(Current)' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {editErrors.room_id && <p className="text-red-500 text-sm mt-1">{editErrors.room_id.message}</p>}
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild>
                  <Button type="button" variant="secondary">Cancel</Button>
                </DialogClose>
                <Button type="submit">Save Changes</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}

      {isMoveOutDialogOpen && moveOutTenant && (
        <Dialog open={isMoveOutDialogOpen} onOpenChange={setIsMoveOutDialogOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <form onSubmit={e => { e.preventDefault(); handleConfirmMoveOut(); }}>
              <DialogHeader>
                <DialogTitle>Move Out: {moveOutTenant.full_name}</DialogTitle>
                <DialogDescription>
                  Phase 1: Calculate final bill and preview charges before confirming move-out for Room {moveOutTenant.rooms?.room_number} - {moveOutTenant.rooms?.branches?.name}
                </DialogDescription>
              </DialogHeader>

              <div className="grid gap-4 py-3">
                {/* Tenant & Room Information - Moved to top */}
                {moveOutTenantDetails && (
                  <div className="border rounded-lg p-4 space-y-3 bg-blue-50">
                    <h4 className="font-medium flex items-center">
                      <Home className="h-4 w-4 mr-2 text-green-600" />
                      Tenant & Room Information
                    </h4>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="space-y-2">
                        <div>
                          <span className="text-gray-600">Room:</span>
                          <span className="font-medium ml-2">{moveOutTenantDetails.room_number}</span>
                        </div>
                        <div>
                          <span className="text-gray-600">Branch:</span>
                          <span className="font-medium ml-2">{moveOutTenantDetails.branches?.name}</span>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        <div>
                          <span className="text-gray-600">Contract Period:</span>
                          <span className="font-medium ml-2 text-xs">
                            {formatDate(moveOutTenantDetails.contract_start_date)} to {formatDate(moveOutTenantDetails.contract_end_date)}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">Current Billing Period:</span>
                          <span className="font-medium ml-2 text-xs">
                            {formatDate(moveOutTenantDetails.billing_period_start)} to {formatDate(moveOutTenantDetails.billing_period_end)}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-600">Outstanding Balance:</span>
                          <span className="font-medium ml-2">₱{moveOutTenantDetails.outstanding_balance?.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Move-Out Date Section */}
                <div className="border rounded-lg p-4 space-y-3">
                  <h4 className="font-medium flex items-center">
                    <Calendar className="h-4 w-4 mr-2 text-blue-600" />
                    Move-Out Date
                  </h4>
                  
                  <div className="space-y-2">
                    <Label htmlFor="move_out_date">Move-Out Date *</Label>
                    <Input
                      type="date"
                      id="move_out_date"
                      value={moveOutForm.move_out_date}
                      onChange={e => setMoveOutForm(f => ({ ...f, move_out_date: e.target.value }))}
                      max={new Date().toISOString().split('T')[0]}
                      required
                    />
                    <div className="text-xs text-gray-500">
                      Date when tenant officially moves out of the room
                    </div>
                  </div>
                </div>

                {/* Monthly Rent Section - New section in center */}
                {moveOutTenantDetails && (
                  <div className="border rounded-lg p-4 space-y-3">
                    <h4 className="font-medium flex items-center">
                      <Home className="h-4 w-4 mr-2 text-green-600" />
                      Monthly Rent
                    </h4>
                    
                    <div className="bg-green-50 p-2 rounded text-sm">
                      <div className="flex justify-between">
                        <span>Room Rent:</span>
                        <span className="font-medium">₱{moveOutTenantDetails.monthly_rent?.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Electricity Section */}
                <div className="border rounded-lg p-4 space-y-3">
                  <h4 className="font-medium flex items-center">
                    <Zap className="h-4 w-4 mr-2 text-yellow-600" />
                    Final Electricity Reading
                  </h4>

                  {moveOutTenantDetails && (
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="space-y-1">
                        <span className="text-gray-600">Previous Reading:</span>
                        <div className="font-medium">
                          {moveOutTenantDetails.previous_electricity_reading} kWh
                        </div>
                      </div>
                      <div className="space-y-1">
                        <span className="text-gray-600">Rate:</span>
                        <div className="font-medium">
                          ₱{moveOutTenantDetails.rooms?.branches?.electricity_rate?.toLocaleString()}/kWh
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="final_electricity_reading">Final Reading (kWh) *</Label>
                    <Input
                      type="number"
                      id="final_electricity_reading"
                      value={moveOutForm.final_electricity_reading}
                      onChange={e => setMoveOutForm(f => ({ ...f, final_electricity_reading: e.target.value }))}
                      min={moveOutTenantDetails?.previous_electricity_reading || 0}
                      step="1"
                      required
                      placeholder="Enter final meter reading"
                    />
                  </div>

                  {/* Show consumption calculation if reading is provided */}
                  {moveOutForm.final_electricity_reading && parseFloat(moveOutForm.final_electricity_reading) > (moveOutTenantDetails?.previous_electricity_reading || 0) && (
                    <div className="bg-yellow-50 p-2 rounded text-sm">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex justify-between">
                          <span>Usage:</span>
                          <span className="font-medium">
                            {parseFloat(moveOutForm.final_electricity_reading) - (moveOutTenantDetails?.previous_electricity_reading || 0)} kWh
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span>Cost:</span>
                          <span className="font-medium">
                            ₱{((parseFloat(moveOutForm.final_electricity_reading) - (moveOutTenantDetails?.previous_electricity_reading || 0)) * (moveOutTenantDetails.rooms?.branches?.electricity_rate || 0)).toLocaleString()}
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
                    Final Water Amount
                  </h4>

                  {moveOutTenantDetails && (
                    <div className="bg-blue-50 p-2 rounded text-sm">
                      <div className="flex justify-between">
                        <span>Branch Water Rate:</span>
                        <span className="font-medium">₱{moveOutTenantDetails.rooms?.branches?.water_rate?.toLocaleString()}</span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label htmlFor="final_water_amount">Final Water Amount (₱) *</Label>
                    <Input
                      type="number"
                      id="final_water_amount"
                      value={moveOutForm.final_water_amount}
                      onChange={e => setMoveOutForm(f => ({ ...f, final_water_amount: e.target.value }))}
                      min="0"
                      step="1"
                      required
                      placeholder="Enter final water amount"
                    />
                    <div className="text-xs text-gray-500">
                      You can adjust this amount if needed for the final period
                    </div>
                  </div>
                </div>

                {/* Extra Fees Section */}
                <div className="border rounded-lg p-4 space-y-3">
                  <h4 className="font-medium flex items-center">
                    <DollarSign className="h-4 w-4 mr-2 text-purple-600" />
                    Extra Fees (Optional)
                  </h4>
                  
                  <div className="grid gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="extra_fees">Amount (₱)</Label>
                      <Input
                        type="number"
                        id="extra_fees"
                        value={moveOutForm.extra_fees}
                        onChange={e => setMoveOutForm(f => ({ ...f, extra_fees: e.target.value }))}
                        min="0"
                        step="1"
                        placeholder="0"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="extra_fee_description">Description</Label>
                      <Input
                        id="extra_fee_description"
                        value={moveOutForm.extra_fee_description}
                        onChange={e => setMoveOutForm(f => ({ ...f, extra_fee_description: e.target.value }))}
                        placeholder="e.g., Cleaning fee, Damages, Key replacement"
                      />
                    </div>
                  </div>
                </div>

                {/* Current Total Section - Shows running calculation */}
                {moveOutTenantDetails && (moveOutForm.move_out_date || moveOutForm.final_electricity_reading || moveOutForm.final_water_amount || moveOutForm.extra_fees) && (
                  <div className="border rounded-lg p-4 space-y-3 bg-slate-50">
                    <h4 className="font-medium flex items-center">
                      <Receipt className="h-4 w-4 mr-2 text-slate-600" />
                      Current Total Calculation
                    </h4>
                    
                    <div className="space-y-2 text-sm">
                      {moveOutForm.move_out_date && (
                        <div className="flex flex-col gap-1 w-full">
                          <div className="flex justify-between">
                            <span>Prorated Rent (estimate):</span>
                            <span>₱{calculateEstimatedProratedRent(moveOutForm.move_out_date, moveOutTenantDetails).toLocaleString()}</span>
                          </div>
                          {/* Prorated Rent Calculation Breakdown */}
                          <div className="text-xs text-gray-500 pl-2">
                            <div>
                              Daily Rate: <span className="font-mono">₱{((moveOutTenantDetails.monthly_rent || 0) / (() => {
                                const billingStart = new Date(moveOutTenantDetails.billing_period_start);
                                const billingEnd = new Date(moveOutTenantDetails.billing_period_end);
                                return Math.ceil((billingEnd.getTime() - billingStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                              })()).toFixed(2)}</span>
                            </div>
                            <div>
                              Days Occupied: <span className="font-mono">{(() => {
                                const billingStart = new Date(moveOutTenantDetails.billing_period_start);
                                const moveOut = new Date(moveOutForm.move_out_date);
                                return Math.ceil((moveOut.getTime() - billingStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                              })()} of {(() => {
                                const billingStart = new Date(moveOutTenantDetails.billing_period_start);
                                const billingEnd = new Date(moveOutTenantDetails.billing_period_end);
                                return Math.ceil((billingEnd.getTime() - billingStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                              })()} days</span>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {moveOutForm.final_electricity_reading && parseFloat(moveOutForm.final_electricity_reading) > (moveOutTenantDetails.previous_electricity_reading || 0) && (
                        <div className="flex justify-between">
                          <span>Electricity ({parseFloat(moveOutForm.final_electricity_reading) - (moveOutTenantDetails.previous_electricity_reading || 0)} kWh):</span>
                          <span>₱{((parseFloat(moveOutForm.final_electricity_reading) - (moveOutTenantDetails.previous_electricity_reading || 0)) * (moveOutTenantDetails.rooms?.branches?.electricity_rate || 0)).toLocaleString()}</span>
                        </div>
                      )}
                      
                      {moveOutForm.final_water_amount && (
                        <div className="flex justify-between">
                          <span>Water:</span>
                          <span>₱{parseFloat(moveOutForm.final_water_amount || '0').toLocaleString()}</span>
                        </div>
                      )}
                      
                      {moveOutForm.extra_fees && parseFloat(moveOutForm.extra_fees) > 0 && (
                        <div className="flex justify-between">
                          <span>Extra Fees:</span>
                          <span>₱{parseFloat(moveOutForm.extra_fees).toLocaleString()}</span>
                        </div>
                      )}
                      
                      {moveOutTenantDetails.outstanding_balance > 0 && (
                        <div className="flex justify-between">
                          <span>Outstanding Bills:</span>
                          <span>₱{moveOutTenantDetails.outstanding_balance?.toLocaleString()}</span>
                        </div>
                      )}
                      
                      <div className="border-t pt-2 flex justify-between font-bold">
                        <span>Estimated Total:</span>
                        <span>₱{(
                          (moveOutForm.move_out_date ? calculateEstimatedProratedRent(moveOutForm.move_out_date, moveOutTenantDetails) : 0) +
                          (moveOutForm.final_electricity_reading && parseFloat(moveOutForm.final_electricity_reading) > (moveOutTenantDetails.previous_electricity_reading || 0) ? 
                            ((parseFloat(moveOutForm.final_electricity_reading) - (moveOutTenantDetails.previous_electricity_reading || 0)) * (moveOutTenantDetails.rooms?.branches?.electricity_rate || 0)) : 
                            0) +
                          (moveOutForm.final_water_amount ? parseFloat(moveOutForm.final_water_amount) : 0) +
                          (moveOutForm.extra_fees ? parseFloat(moveOutForm.extra_fees) : 0) +
                          (moveOutTenantDetails.outstanding_balance || 0)
                        ).toLocaleString()}</span>
                      </div>
                      
                      {/* After Estimated Total, show deposit application and final balance */}
                      {moveOutTenantDetails && (
                        <div className="border-t pt-2">
                          <div className="flex justify-between text-green-600">
                            <span>Less: Advance Payment:</span>
                            <span>-₱{calculateDepositApplication(moveOutTenantDetails.cycle_count, moveOutTenantDetails.advance_payment || 0, moveOutTenantDetails.security_deposit || 0, moveOutTenantDetails.outstanding_balance || 0, isRoomTransfer).availableAmount.toLocaleString()}</span>
                          </div>
                          {calculateDepositApplication(moveOutTenantDetails.cycle_count, moveOutTenantDetails.advance_payment || 0, moveOutTenantDetails.security_deposit || 0, moveOutTenantDetails.outstanding_balance || 0, isRoomTransfer).forfeitedAmount > 0 && (
                            <div className="flex justify-between text-red-600">
                              <span>Security Deposit (Forfeited):</span>
                              <span>₱{calculateDepositApplication(moveOutTenantDetails.cycle_count, moveOutTenantDetails.advance_payment || 0, moveOutTenantDetails.security_deposit || 0, moveOutTenantDetails.outstanding_balance || 0, isRoomTransfer).forfeitedAmount.toLocaleString()}</span>
                            </div>
                          )}
                        </div>
                      )}
                      
                      {/* Calculate final balance after deposits */}
                      {moveOutTenantDetails && (
                        <div className="border-t pt-2 flex justify-between font-bold">
                          <span>Final Balance:</span>
                          {(() => {
                            const estimatedTotal = (
                              (moveOutForm.move_out_date ? calculateEstimatedProratedRent(moveOutForm.move_out_date, moveOutTenantDetails) : 0) +
                              (moveOutForm.final_electricity_reading && parseFloat(moveOutForm.final_electricity_reading) > (moveOutTenantDetails.previous_electricity_reading || 0) ? 
                                ((parseFloat(moveOutForm.final_electricity_reading) - (moveOutTenantDetails.previous_electricity_reading || 0)) * (moveOutTenantDetails.rooms?.branches?.electricity_rate || 0)) : 0) +
                              (moveOutForm.final_water_amount ? parseFloat(moveOutForm.final_water_amount) : 0) +
                              (moveOutForm.extra_fees ? parseFloat(moveOutForm.extra_fees) : 0) +
                              (moveOutTenantDetails.outstanding_balance || 0)
                            );
                            const depositApp = calculateDepositApplication(moveOutTenantDetails.cycle_count, moveOutTenantDetails.advance_payment || 0, moveOutTenantDetails.security_deposit || 0, moveOutTenantDetails.outstanding_balance || 0, isRoomTransfer);
                            let finalBalance = estimatedTotal - depositApp.availableAmount;
                            finalBalance = Number(finalBalance.toFixed(2)); // Round to 2 decimal places to fix floating point issue
                            return finalBalance < 0 ? (
                              <span className="text-green-700">Refund: ₱{Math.abs(finalBalance).toLocaleString()}</span>
                            ) : finalBalance > 0 ? (
                              <span className="text-red-700">Outstanding Balance: ₱{finalBalance.toLocaleString()}</span>
                            ) : (
                              <span className="text-gray-700">No Balance Due</span>
                            );
                          })()}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Deposit Information - Keep at bottom */}
                {moveOutTenantDetails && (
                  <div className="border rounded-lg p-4 space-y-3 bg-amber-50">
                    <h4 className="font-medium flex items-center">
                      <DollarSign className="h-4 w-4 mr-2 text-amber-600" />
                      Deposit Information
                    </h4>
                    
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Advance Payment:</span>
                        <span className="font-medium ml-2">₱{moveOutTenantDetails.advance_payment?.toLocaleString()}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Security Deposit:</span>
                        <span className="font-medium ml-2">
                          ₱{moveOutTenantDetails.security_deposit?.toLocaleString()}
                          {moveOutTenantDetails.security_deposit_forfeited ? 
                            <span className="text-red-600 text-xs ml-1">(Forfeited)</span> : 
                            <span className="text-green-600 text-xs ml-1">(Available)</span>
                          }
                        </span>
                      </div>
                    </div>
                    
                    <div className="text-center">
                      <span className="text-gray-600">Billing Cycles:</span>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ml-2 ${getCycleColor(moveOutTenantDetails.cycle_count)}`}>
                        {moveOutTenantDetails.cycle_count} {moveOutTenantDetails.cycle_count === 1 ? 'Cycle' : 'Cycles'}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <DialogFooter className="flex-col sm:flex-row gap-2">
                {/* Room Transfer Toggle */}
                <div className="flex items-center space-x-2 mr-auto">
                  <input 
                    type="checkbox" 
                    id="roomTransfer" 
                    checked={isRoomTransfer}
                    onChange={(e) => setIsRoomTransfer(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="roomTransfer" className="text-sm text-gray-700">
                    Moving to Another Room 
                    <span className="text-xs text-blue-600 block">
                      (Security deposit will be applied to final bill, not forfeited)
                    </span>
                  </label>
                </div>
                
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setIsMoveOutDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isMoveOutSubmitting}>
                    {isMoveOutSubmitting ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>
                        <Calendar className="h-4 w-4 mr-2" />
                        {isRoomTransfer ? 'Process Room Transfer' : 'Confirm Move-Out'}
                      </>
                    )}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}