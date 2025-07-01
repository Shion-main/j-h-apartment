'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle, 
  DialogTrigger,
  DialogFooter,
  DialogClose
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/toast';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { 
  BuildingOfficeIcon, 
  HomeIcon, 
  PlusIcon,
  TrashIcon,
  PencilIcon,
  MapPinIcon,
  CurrencyDollarIcon,
  EyeIcon,
  EyeSlashIcon,
  UsersIcon,
  Cog6ToothIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { logAuditEvent } from '@/lib/audit/logger';
// import { motion, AnimatePresence } from 'framer-motion';

// Schemas
const addBranchSchema = z.object({
  name: z.string().min(2, 'Please enter a branch name (minimum 2 characters)'),
  address: z.string().min(5, 'Please provide a complete address'),
  monthly_rent_rate: z.number().min(0.01, 'Monthly rent must be greater than zero'),
  water_rate: z.number().min(0, 'Water rate cannot be negative'),
  electricity_rate: z.number().min(0, 'Electricity rate cannot be negative'),
  room_number_prefix: z.string(),
  numberOfRooms: z.number().int().min(1, 'Please add at least one room').max(100, 'Cannot create more than 100 rooms at once').default(1),
});

const editBranchSchema = z.object({
  name: z.string().min(2, 'Please enter a branch name (minimum 2 characters)'),
  address: z.string().min(5, 'Please provide a complete address'),
  monthly_rent_rate: z.number().min(0.01, 'Monthly rent must be greater than zero'),
  water_rate: z.number().min(0, 'Water rate cannot be negative'),
  electricity_rate: z.number().min(0, 'Electricity rate cannot be negative'),
  room_number_prefix: z.string(),
});

const roomSchema = z.object({
  room_number: z.string().min(1, 'Room number is required'),
  monthly_rent: z.number().min(0, 'Monthly rent cannot be negative'),
});

type AddBranchFormData = z.infer<typeof addBranchSchema>;
type EditBranchFormData = z.infer<typeof editBranchSchema>;
type RoomFormData = z.infer<typeof roomSchema>;

// Interfaces
interface Branch {
  id: string;
  name: string;
  address: string;
  monthly_rent_rate: number;
  water_rate: number;
  electricity_rate: number;
  room_number_prefix: string;
  created_at: string;
  total_rooms?: number;
  occupied_rooms?: number;
  rooms?: Room[];
}

interface Room {
  id: string;
  branch_id: string;
  room_number: string;
  monthly_rent: number;
  is_occupied: boolean;
  created_at: string;
}

// Sub-components
const BranchRooms = ({ branch, onRoomsUpdate }: { branch: Branch; onRoomsUpdate: () => void }) => {
  const [rooms, setRooms] = useState<Room[]>(branch.rooms || []);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const { addToast } = useToast();
  const supabase = createClientComponentClient();

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset, setValue } = useForm<RoomFormData>({
    resolver: zodResolver(roomSchema),
    defaultValues: {
      monthly_rent: branch.monthly_rent_rate
    }
  });

  useEffect(() => {
    setRooms(branch.rooms || []);
  }, [branch.rooms]);

  const fetchRooms = async () => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('rooms')
        .select('*')
        .eq('branch_id', branch.id)
        .order('room_number');

      if (error) throw error;
      setRooms(data || []);
      onRoomsUpdate(); // Refresh the parent component
    } catch (error) {
      console.error('Error fetching rooms:', error);
      addToast({
        type: 'error',
        title: 'Failed to Load Rooms',
        message: 'Unable to fetch room data for this branch.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = async (data: RoomFormData) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();

      if (editingRoom) {
        // Update existing room
        const { data: updatedRoom, error } = await supabase
          .from('rooms')
          .update({
            room_number: data.room_number,
            monthly_rent: data.monthly_rent
          })
          .eq('id', editingRoom.id)
          .select()
          .single();

        if (error) throw error;
        if (!updatedRoom) throw new Error('Failed to update room.');

        if (user) {
          await logAuditEvent(
            supabase,
            user.id,
            'ROOM_UPDATED',
            'rooms',
            editingRoom.id,
            { room_number: editingRoom.room_number, monthly_rent: editingRoom.monthly_rent },
            data
          );
        }

        addToast({
          type: 'success',
          title: 'Room Updated',
          message: `Room ${data.room_number} has been updated successfully.`
        });
      } else {
        // Create new room
        const { data: newRoom, error } = await supabase
          .from('rooms')
          .insert({
            branch_id: branch.id,
            room_number: data.room_number,
            monthly_rent: data.monthly_rent,
            is_occupied: false
          })
          .select()
          .single();

        if (error) throw error;
        if (!newRoom) throw new Error('Failed to create room.');

        if (user) {
          await logAuditEvent(
            supabase,
            user.id,
            'ROOM_CREATED',
            'rooms',
            newRoom.id,
            null,
            data
          );
        }

        addToast({
          type: 'success',
          title: 'Room Created',
          message: `Room ${data.room_number} has been created successfully.`
        });
      }

      await fetchRooms();
      setIsDialogOpen(false);
      setEditingRoom(null);
      reset();
    } catch (error: any) {
      console.error('Error saving room:', error);
      addToast({
        type: 'error',
        title: 'Failed to Save Room',
        message: error.message || 'An unexpected error occurred.'
      });
    }
  };

  const deleteRoom = async (room: Room) => {
    try {
      const { error } = await supabase.from('rooms').delete().eq('id', room.id);
      if (error) throw error;

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await logAuditEvent(
          supabase,
          user.id,
          'ROOM_DELETED',
          'rooms',
          room.id,
          { room_number: room.room_number, branch_id: room.branch_id },
          null
        );
      }

      addToast({
        type: 'success',
        title: 'Room Deleted',
        message: `Room ${room.room_number} has been deleted.`,
      });
      fetchRooms(); // Refresh the list
    } catch (error: any) {
      console.error('Error deleting room:', error);
      addToast({
        type: 'error',
        title: 'Failed to Delete Room',
        message: error.message,
      });
    }
  };

  const openEditDialog = (room: Room) => {
    setEditingRoom(room);
    setValue('room_number', room.room_number);
    setValue('monthly_rent', room.monthly_rent);
    setIsDialogOpen(true);
  };

  const openCreateDialog = () => {
    setEditingRoom(null);
    reset({
      room_number: '',
      monthly_rent: branch.monthly_rent_rate
    });
    setIsDialogOpen(true);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'PHP',
    }).format(amount);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h4 className="text-lg font-semibold text-gray-800 flex items-center">
          <HomeIcon className="h-6 w-6 mr-2 text-primary"/>
          Rooms in {branch.name} ({rooms.length})
        </h4>
        <Button onClick={openCreateDialog} size="sm" className="flex items-center gap-2">
          <PlusIcon className="h-4 w-4" /> Add Room
        </Button>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingRoom ? 'Edit Room' : 'Add New Room'}</DialogTitle>
            <DialogDescription>
              {editingRoom ? `Update details for room ${editingRoom.room_number}.` : `Add a new room to ${branch.name}.`}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="room_number">Room Number</Label>
              <Input id="room_number" {...register('room_number')} placeholder="e.g., A101" />
              {errors.room_number && <p className="text-sm text-red-600">{errors.room_number.message}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="monthly_rent">Monthly Rent</Label>
              <Input id="monthly_rent" type="number" {...register('monthly_rent', { valueAsNumber: true })} placeholder="e.g., 5000" />
              <p className="text-xs text-muted-foreground">Defaults to branch rate if empty.</p>
              {errors.monthly_rent && <p className="text-sm text-red-600">{errors.monthly_rent.message}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Saving...' : (editingRoom ? 'Save Changes' : 'Create Room')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      
      {isLoading ? (
        <p>Loading rooms...</p>
      ) : rooms.length === 0 ? (
        <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
          <HomeIcon className="h-12 w-12 mx-auto text-gray-300 mb-4" />
          <p className="font-medium">No rooms found in this branch</p>
          <p className="text-sm">Click "Add Room" to create the first room.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {rooms.map((room) => (
            <Card key={room.id} className="shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                <div className="flex justify-between items-start">
                  <div className="flex items-center space-x-3">
                     <div className={`p-2 rounded-lg ${room.is_occupied ? 'bg-red-100' : 'bg-green-100'}`}>
                       <HomeIcon className={`h-5 w-5 ${room.is_occupied ? 'text-red-600' : 'text-green-600'}`} />
                     </div>
                     <div>
                        <p className="font-semibold text-gray-900">{room.room_number}</p>
                        <p className={`text-sm ${room.is_occupied ? 'text-red-600' : 'text-green-600'}`}>
                           {room.is_occupied ? 'Occupied' : 'Available'}
                        </p>
                     </div>
                  </div>
                  <div className="flex space-x-1">
                     <Button variant="ghost" size="icon" onClick={() => openEditDialog(room)} className="h-8 w-8 text-gray-600 hover:text-primary">
                       <PencilIcon className="h-4 w-4" />
                     </Button>
                     <AlertDialog>
                       <AlertDialogTrigger asChild>
                         <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50">
                           <TrashIcon className="h-4 w-4" />
                         </Button>
                       </AlertDialogTrigger>
                       <AlertDialogContent>
                         <AlertDialogHeader>
                           <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                           <AlertDialogDescription>
                             This action cannot be undone. This will permanently delete Room {room.room_number} and all associated data.
                           </AlertDialogDescription>
                         </AlertDialogHeader>
                         <AlertDialogFooter>
                           <AlertDialogCancel>Cancel</AlertDialogCancel>
                           <AlertDialogAction onClick={async () => {
                              try {
                                 const { error } = await supabase.from('rooms').delete().eq('id', room.id);
                                 if (error) throw error;
                                 addToast({ type: 'success', title: 'Room Deleted', message: `Room ${room.room_number} has been deleted.` });
                                 await fetchRooms();
                               } catch (error: any) {
                                 addToast({ type: 'error', title: 'Delete Failed', message: error.message });
                               }
                         }}>Continue</AlertDialogAction>
                         </AlertDialogFooter>
                       </AlertDialogContent>
                     </AlertDialog>
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-gray-100">
                    <p className="text-sm text-gray-500">Monthly Rent</p>
                    <p className="text-lg font-semibold text-gray-800">{formatCurrency(room.monthly_rent)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

const EditBranchDialog = ({ branch, branches, onUpdate }: { branch: Branch; branches: Branch[]; onUpdate: () => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { addToast } = useToast();
  const supabase = createClientComponentClient();
  const [showRateUpdateConfirm, setShowRateUpdateConfirm] = useState(false);
  const [newRates, setNewRates] = useState<Partial<EditBranchFormData>>({});

  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<EditBranchFormData>({
    resolver: zodResolver(editBranchSchema),
    defaultValues: {
      name: branch.name,
      address: branch.address,
      monthly_rent_rate: branch.monthly_rent_rate,
      water_rate: branch.water_rate,
      electricity_rate: branch.electricity_rate,
      room_number_prefix: branch.room_number_prefix,
    },
  });

  const onSubmit = async (data: EditBranchFormData) => {
    const rentChanged = data.monthly_rent_rate !== branch.monthly_rent_rate;
    
    if (rentChanged) {
      setNewRates(data);
      setShowRateUpdateConfirm(true);
    } else {
      await updateBranch(data);
    }
  };

  const updateBranch = async (data: EditBranchFormData, updateRooms: boolean = false) => {
    try {
      // Log the change
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Find the original values for comparison
        const originalBranch = branches.find(b => b.id === branch.id);
        const oldValues = {
          name: originalBranch?.name,
          address: originalBranch?.address,
          monthly_rent_rate: originalBranch?.monthly_rent_rate,
          water_rate: originalBranch?.water_rate,
          electricity_rate: originalBranch?.electricity_rate,
          room_number_prefix: originalBranch?.room_number_prefix,
        };

        await logAuditEvent(
          supabase,
          user.id,
          'BRANCH_UPDATED',
          'branches',
          branch.id,
          oldValues,
          data
        );
      }

      const { error } = await supabase
        .from('branches')
        .update({ ...data })
        .eq('id', branch.id);

      if (error) throw error;
      
      if (updateRooms) {
        const { error: roomUpdateError } = await supabase
          .from('rooms')
          .update({ monthly_rent: data.monthly_rent_rate })
          .eq('branch_id', branch.id)
          .eq('monthly_rent', branch.monthly_rent_rate);
        
        if (roomUpdateError) throw roomUpdateError;
      }

      addToast({
        type: 'success',
        title: 'Branch Updated',
        message: `${branch.name} has been updated.`,
      });
      onUpdate();
      setIsOpen(false);
      setShowRateUpdateConfirm(false);
    } catch (error: any) {
      addToast({
        type: 'error',
        title: 'Unable to Update Branch',
        message: 'Please check your input and try again.',
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="flex items-center gap-2">
          <PencilIcon className="h-4 w-4" /> Edit Branch
        </Button>
      </DialogTrigger>
      <DialogContent>
        {!showRateUpdateConfirm ? (
          <>
            <DialogHeader>
              <DialogTitle>Edit Branch: {branch.name}</DialogTitle>
              <DialogDescription>Update the details for this branch.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 py-4">
               {/* Form fields for editing a branch */}
              <div className="space-y-2">
                <Label htmlFor="name">Branch Name</Label>
                <Input id="name" {...register('name')} />
                {errors.name && <p className="text-sm text-red-600">{errors.name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input id="address" {...register('address')} />
                {errors.address && <p className="text-sm text-red-600">{errors.address.message}</p>}
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="monthly_rent_rate">Default Rent</Label>
                  <Input
                    id="monthly_rent_rate"
                    type="number"
                    {...register('monthly_rent_rate', { valueAsNumber: true })}
                    placeholder="0"
                    className="mt-1"
                  />
                   {errors.monthly_rent_rate && <p className="text-sm text-red-600">{errors.monthly_rent_rate.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="water_rate">Water Rate</Label>
                  <Input id="water_rate" type="number" {...register('water_rate', { valueAsNumber: true })} />
                  {errors.water_rate && <p className="text-sm text-red-600">{errors.water_rate.message}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="electricity_rate">Electricity Rate</Label>
                  <Input id="electricity_rate" type="number" {...register('electricity_rate', { valueAsNumber: true })} />
                  {errors.electricity_rate && <p className="text-sm text-red-600">{errors.electricity_rate.message}</p>}
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isSubmitting}>Update Branch</Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center">
                <ExclamationTriangleIcon className="h-6 w-6 text-yellow-500 mr-2" />
                Confirm Rent Rate Change
              </DialogTitle>
              <DialogDescription>
                You've changed the default monthly rent from <strong>{branch.monthly_rent_rate}</strong> to <strong>{newRates.monthly_rent_rate}</strong>.
                Do you want to apply this new rate to all rooms in this branch that currently use the old rate?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => updateBranch(newRates as EditBranchFormData, false)}>No, Update Branch Only</Button>
              <Button onClick={() => updateBranch(newRates as EditBranchFormData, true)}>Yes, Update All</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

// Main Component
export default function BranchManager() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [expandedBranchId, setExpandedBranchId] = useState<string | null>(null);
  const { addToast } = useToast();
  const supabase = createClientComponentClient();

  const { register: registerBranch, handleSubmit: handleSubmitBranch, formState: { errors: branchErrors, isSubmitting: isBranchSubmitting }, reset: resetBranch } = useForm<AddBranchFormData>({
    resolver: zodResolver(addBranchSchema),
  });
  
  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const { data: branchesData, error: branchesError } = await supabase
        .from('branches')
        .select(`
          *,
          rooms (*)
        `)
        .order('name');

      if (branchesError) throw branchesError;

      const branchesWithStats = branchesData?.map(branch => ({
        ...branch,
        total_rooms: branch.rooms?.length || 0,
        occupied_rooms: branch.rooms?.filter((room: any) => room.is_occupied).length || 0
      })) || [];

      setBranches(branchesWithStats);

      // Fetch system settings to get default rates
      const { data: settingsData, error: settingsError } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', ['default_monthly_rent_rate', 'default_water_rate', 'default_electricity_rate']);

      if (settingsError) throw settingsError;

      const defaultRates = settingsData.reduce((acc, setting) => {
        if (setting.key === 'default_monthly_rent_rate') acc.monthly_rent_rate = parseFloat(setting.value || '0');
        if (setting.key === 'default_water_rate') acc.water_rate = parseFloat(setting.value || '0');
        if (setting.key === 'default_electricity_rate') acc.electricity_rate = parseFloat(setting.value || '0');
        return acc;
      }, {} as any);

      // Set the default values for the form
      resetBranch(defaultRates);

    } catch (error: any) {
      console.error('Error fetching data:', error);
      addToast({
        type: 'error',
        title: 'Failed to Load Data',
        message: error.message || 'Unable to fetch branch or settings data.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const onSubmit = async (data: AddBranchFormData) => {
    try {
      const { numberOfRooms, room_number_prefix, ...branchData } = data;
      
      // Create branch first
      const { data: newBranch, error: branchError } = await supabase
        .from('branches')
        .insert(branchData)
        .select()
        .single();

      if (branchError) throw branchError;

      // Log branch creation
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await logAuditEvent(
          supabase,
          user.id,
          'BRANCH_CREATED',
          'branches',
          newBranch.id,
          null,
          {
            name: newBranch.name,
            address: newBranch.address,
            monthly_rent_rate: newBranch.monthly_rent_rate,
            water_rate: newBranch.water_rate,
            electricity_rate: newBranch.electricity_rate,
            room_number_prefix: newBranch.room_number_prefix
          }
        );
      }

      // Prepare rooms with the new branch_id
      const newRooms = [];
      for (let i = 1; i <= numberOfRooms; i++) {
        const roomNumber = room_number_prefix
          ? `${room_number_prefix}${String(i).padStart(2, '0')}`
          : String(i);
        newRooms.push({
          branch_id: newBranch.id,
          room_number: roomNumber,
          monthly_rent: branchData.monthly_rent_rate,
          is_occupied: false,
        });
      }

      // Create rooms with the correct branch_id
      const { data: createdRooms, error: roomsError } = await supabase
        .from('rooms')
        .insert(newRooms)
        .select();

      if (roomsError) throw roomsError;

      // Log room creation
      if (user && createdRooms) {
        await logAuditEvent(
          supabase,
          user.id,
          'ROOMS_CREATED',
          'rooms',
          newBranch.id,
          null,
          {
            branch_id: newBranch.id,
            number_of_rooms: numberOfRooms,
            room_numbers: createdRooms.map(room => room.room_number)
          }
        );
      }

      addToast({
        type: 'success',
        title: 'Branch Created',
        message: `${newBranch.name} has been created with ${numberOfRooms} rooms.`
      });

      await fetchData();
      setIsAddDialogOpen(false);
      resetBranch();
    } catch (error: any) {
      console.error('Error creating branch:', error);
      addToast({
        type: 'error',
        title: 'Unable to Create Branch',
        message: 'Please check your input and try again.',
      });
    }
  };

  const deleteBranch = async (branchId: string, branchName: string) => {
    // This will now be handled by the AlertDialog in the JSX
  };

  const toggleRooms = (branchId: string) => {
    setExpandedBranchId(prevId => (prevId === branchId ? null : branchId));
  };
  
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-6 px-3 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Branches & Rooms</h1>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2 w-full sm:w-auto">
              <PlusIcon className="h-5 w-5" /> Add New Branch
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Branch</DialogTitle>
              <DialogDescription>
                Create a new branch location with default rates and rooms.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmitBranch(onSubmit)} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Label htmlFor="name" className="text-sm font-medium text-gray-700">
                    Branch Name *
                  </Label>
                  <Input
                    id="name"
                    {...registerBranch('name')}
                    placeholder="Enter branch name"
                    className="mt-1"
                  />
                  {branchErrors.name && (
                    <p className="text-sm text-red-600 mt-1">{branchErrors.name.message}</p>
                  )}
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="address" className="text-sm font-medium text-gray-700">
                    Address *
                  </Label>
                  <Input
                    id="address"
                    {...registerBranch('address')}
                    placeholder="Enter full address"
                    className="mt-1"
                  />
                  {branchErrors.address && (
                    <p className="text-sm text-red-600 mt-1">{branchErrors.address.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="monthly_rent_rate" className="text-sm font-medium text-gray-700">
                    Monthly Rent Rate (PHP) *
                  </Label>
                  <Input
                    id="monthly_rent_rate"
                    type="number"
                    {...registerBranch('monthly_rent_rate', { valueAsNumber: true })}
                    placeholder="0"
                    className="mt-1"
                  />
                  {branchErrors.monthly_rent_rate && (
                    <p className="text-sm text-red-600 mt-1">{branchErrors.monthly_rent_rate.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="water_rate" className="text-sm font-medium text-gray-700">
                    Water Rate (PHP) *
                  </Label>
                  <Input
                    id="water_rate"
                    type="number"
                    {...registerBranch('water_rate', { valueAsNumber: true })}
                    placeholder="0"
                    className="mt-1"
                  />
                  {branchErrors.water_rate && (
                    <p className="text-sm text-red-600 mt-1">{branchErrors.water_rate.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="electricity_rate" className="text-sm font-medium text-gray-700">
                    Electricity Rate (PHP/kWh) *
                  </Label>
                  <Input
                    id="electricity_rate"
                    type="number"
                    {...registerBranch('electricity_rate', { valueAsNumber: true })}
                    placeholder="0"
                    className="mt-1"
                  />
                  {branchErrors.electricity_rate && (
                    <p className="text-sm text-red-600 mt-1">{branchErrors.electricity_rate.message}</p>
                  )}
                </div>
                <div>
                  <Label htmlFor="numberOfRooms" className="text-sm font-medium text-gray-700">
                    Number of Rooms *
                  </Label>
                  <Input
                    id="numberOfRooms"
                    type="number"
                    {...registerBranch('numberOfRooms', { valueAsNumber: true })}
                    placeholder="1"
                    className="mt-1"
                  />
                  {branchErrors.numberOfRooms && (
                    <p className="text-sm text-red-600 mt-1">{branchErrors.numberOfRooms.message}</p>
                  )}
                </div>
                <div className="col-span-2">
                  <Label htmlFor="room_number_prefix" className="text-sm font-medium text-gray-700">
                    Room Number Prefix (Optional)
                  </Label>
                  <Input
                    id="room_number_prefix"
                    {...registerBranch('room_number_prefix')}
                    placeholder="e.g., A, B, 1, etc."
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    If provided, rooms will be numbered like: A01, A02, etc.
                  </p>
                  {branchErrors.room_number_prefix && (
                    <p className="text-sm text-red-600 mt-1">{branchErrors.room_number_prefix.message}</p>
                  )}
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <Button 
                  type="submit" 
                  disabled={isBranchSubmitting}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {isBranchSubmitting ? 'Creating...' : 'Create Branch'}
                </Button>
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsAddDialogOpen(false)}
                  className="flex-1"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      
      {isLoading && <p>Loading branches...</p>}

      {!isLoading && branches.length === 0 && (
          <p>No branches found. Add one to get started.</p>
      )}

      <div className="space-y-8">
        {branches.map((branch) => (
          <Card key={branch.id} className="overflow-hidden shadow-lg">
            <CardHeader className="bg-gray-50 p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-4">
                  <div className="flex-shrink-0 h-14 w-14 bg-primary/10 rounded-lg flex items-center justify-center">
                    <BuildingOfficeIcon className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">{branch.name}</h2>
                    <p className="text-md text-gray-600 flex items-center">
                      <MapPinIcon className="h-5 w-5 mr-1.5 flex-shrink-0" />
                      {branch.address}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => toggleRooms(branch.id)} className="flex items-center gap-2 transition-all duration-200">
                    <div className={`transition-transform duration-300 ${expandedBranchId === branch.id ? 'rotate-180' : 'rotate-0'}`}>
                      {expandedBranchId === branch.id ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                    </div>
                    {expandedBranchId === branch.id ? 'Hide Rooms' : 'Show Rooms'}
                  </Button>
                  <EditBranchDialog branch={branch} branches={branches} onUpdate={fetchData} />
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="destructive" size="sm">
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This will permanently delete the <strong>{branch.name}</strong> branch, including all of its rooms and billing history. This action cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={async () => {
                            try {
                              // Get current user for audit logging
                              const { data: { user } } = await supabase.auth.getUser();
                              if (!user) throw new Error('User not authenticated');

                              // Log the deletion event before actually deleting
                              await logAuditEvent(
                                supabase,
                                user.id,
                                'BRANCH_DELETED',
                                'branches',
                                branch.id,
                                {
                                  name: branch.name,
                                  address: branch.address,
                                  monthly_rent_rate: branch.monthly_rent_rate,
                                  water_rate: branch.water_rate,
                                  electricity_rate: branch.electricity_rate,
                                  room_number_prefix: branch.room_number_prefix,
                                  total_rooms: branch.total_rooms,
                                  occupied_rooms: branch.occupied_rooms
                                },
                                null
                              );

                              // Proceed with deletion
                              const { error } = await supabase.from('branches').delete().eq('id', branch.id);
                              if (error) throw error;
                              
                              addToast({ type: 'success', title: 'Branch Deleted', message: `${branch.name} has been deleted.` });
                              fetchData();
                            } catch (error: any) {
                              addToast({ type: 'error', title: 'Unable to Delete Branch', message: 'Please try again or contact support if the problem persists.' });
                            }
                        }}>Delete Branch</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 text-left">
                  {/* Stats */}
                  <div>
                    <p className="text-sm text-gray-500 flex items-center"><HomeIcon className="h-4 w-4 mr-1"/> Rooms Total</p>
                    <p className="text-xl font-semibold text-gray-800">{branch.total_rooms || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500 flex items-center"><UsersIcon className="h-4 w-4 mr-1"/> Occupied</p>
                    <p className="text-xl font-semibold text-gray-800">{branch.occupied_rooms || 0}</p>
                  </div>
                  {/* Rates */}
                   <div>
                    <p className="text-sm text-gray-500">Default Rent</p>
                    <p className="text-xl font-semibold text-gray-800">{formatCurrency(branch.monthly_rent_rate)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Water Rate</p>
                    <p className="text-xl font-semibold text-gray-800">{formatCurrency(branch.water_rate)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Electricity Rate</p>
                    <p className="text-xl font-semibold text-gray-800">{formatCurrency(branch.electricity_rate)}/kWh</p>
                  </div>
              </div>
            </CardHeader>
            
            <div 
              className="overflow-hidden transition-all duration-300 ease-in-out"
              style={{
                maxHeight: expandedBranchId === branch.id ? '2000px' : '0px',
                opacity: expandedBranchId === branch.id ? 1 : 0
              }}
            >
              <div className="p-6 bg-white">
                <BranchRooms branch={branch} onRoomsUpdate={fetchData} />
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}