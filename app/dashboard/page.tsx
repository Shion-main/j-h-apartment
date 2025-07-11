'use client';

import React, { useState, useEffect, useMemo, useCallback, memo, Suspense } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { getSupabaseClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/use-toast';
import { usePageTitleEffect } from '@/lib/hooks/usePageTitleEffect';
import { 
  BuildingOfficeIcon, 
  HomeIcon, 
  UsersIcon,
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  DocumentArrowDownIcon,
  EnvelopeIcon,
  ChartBarIcon,
  TableCellsIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  PlusIcon,
  BellIcon,
  ClockIcon
} from '@heroicons/react/24/outline';

interface DashboardStats {
  totalBranches: number;
  totalRooms: number;
  occupiedRooms: number;
  activeTenants: number;
  monthlyIncome: number;
  monthlyExpenses: number;
}

interface MonthlyReport {
  totalRentCollected: number;
  totalElectricityCollected: number;
  totalWaterCollected: number;
  totalExtraFeesCollected: number;
  totalPenaltyFeesCollected: number;
  forfeitedDeposits: number;
  totalIncome: number;
  totalExpenses: number;
  profitLoss: number;
}

interface ConsolidatedReport {
  month: string;
  branches: any[];
  overallSnapshot: Array<{
    branch: string;
    rent: number;
    electricity: number;
    water: number;
    extraFees: number;
    penalty: number;
    forfeitedDeposits: number;
    totalIncome: number;
    companyExpenses: number;
    depositsRefunded: number;
    totalExpenses: number;
    netProfitLoss: number;
  }>;
  tenantRoomStatus: Array<{
    branch: string;
    activeTenants: number;
    vacantRooms: number;
    newTenants: number;
    movedOutTenants: number;
  }>;
  detailedBilling: Array<{
    branch: string;
    tenantName: string;
    roomNumber: string;
    billingPeriod: string;
    dueDate: string;
    originalTotal: number;
    totalPaid: number;
    status: string;
    paymentDate: string;
    paymentMethod: string;
    paymentAmount: number;
  }>;
  companyExpenses: Array<{
    branch: string;
    expenseDate: string;
    amount: number;
    description: string;
    category: string;
  }>;
  tenantMovement: Array<{
    branch: string;
    type: string;
    fullName: string;
    date: string;
    roomNumber?: string;
    advancePayment?: number;
    securityDeposit?: number;
    finalBillTotal?: number;
    depositsUsed?: number;
    depositsRefunded?: number;
  }>;
}

// Memoized StatCard component to prevent unnecessary re-renders
const StatCard = memo(({ 
  title, 
  value, 
  change, 
  changeType, 
  icon: Icon, 
  isLoading,
  formatValue = (val) => val.toString()
}: {
  title: string;
  value: number;
  change?: number;
  changeType?: 'increase' | 'decrease' | 'neutral';
  icon: React.ComponentType<any>;
  isLoading?: boolean;
  formatValue?: (value: number) => string;
}) => (
  <Card className="bg-white border-gray-200 hover:shadow-md transition-shadow">
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center">
              <Icon className="h-6 w-6 text-white" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-gray-600 truncate">{title}</p>
            <div className="flex items-baseline space-x-2">
              {isLoading ? (
                <div className="h-8 w-24 bg-gray-200 rounded animate-pulse" />
              ) : (
                <p className="text-2xl font-bold text-gray-900">{formatValue(value)}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
));

StatCard.displayName = 'StatCard';

// Optimized performance with React.memo and better state management
function DashboardPage() {
  // Set page title and subtitle
  usePageTitleEffect('Dashboard', 'Overview of your property management system');
  
  // Optimized state management with better initial values
  const [stats, setStats] = useState<DashboardStats>(() => ({
    totalBranches: 0,
    totalRooms: 0,
    occupiedRooms: 0,
    activeTenants: 0,
    monthlyIncome: 0,
    monthlyExpenses: 0
  }));
  
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });
  
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReport | null>(null);
  const [consolidatedReport, setConsolidatedReport] = useState<ConsolidatedReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailAddresses, setEmailAddresses] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isSendingReminders, setIsSendingReminders] = useState(false);
  
  // Add expenses states
  const [expensesDialogOpen, setExpensesDialogOpen] = useState(false);
  const [isAddingExpense, setIsAddingExpense] = useState(false);
  const [expenseForm, setExpenseForm] = useState({
    amount: '',
    description: '',
    category: '',
    expense_date: (() => {
      const today = new Date();
      return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    })(),
    branch_id: ''
  });
  const [branches, setBranches] = useState<any[]>([]);
  
  // Add new state for reminders
  const [reminderHistoryDialogOpen, setReminderHistoryDialogOpen] = useState(false);
  const [isTestingReminders, setIsTestingReminders] = useState(false);
  const [reminderHistory, setReminderHistory] = useState<any[]>([]);
  
  // Persistent cache with better structure
  const [apiCache] = useState(() => new Map<string, { data: any; timestamp: number; ttl: number }>());
  
  // Create supabase client once and memoize
  const supabase = useMemo(() => getSupabaseClient(), []);
  const { toast } = useToast();

  // Memoized currency formatter
  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }, []);

  // Cache utilities
  const getCachedData = useCallback((key: string) => {
    const cached = apiCache.get(key);
    if (cached && Date.now() - cached.timestamp < cached.ttl) {
      return cached.data;
    }
    return null;
  }, [apiCache]);

  const setCachedData = useCallback((key: string, data: any, ttl: number = 300000) => {
    apiCache.set(key, { data, timestamp: Date.now(), ttl });
  }, [apiCache]);

  // Optimized stats fetching with improved caching
  const fetchDashboardStats = useCallback(async () => {
    const cacheKey = `stats-${selectedMonth}`;
    const cached = getCachedData(cacheKey);
    
    if (cached) {
      setStats(cached);
      setIsLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/reports/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonth,
          reportType: 'summary'
        })
      });

      if (!response.ok) throw new Error('Failed to fetch stats');
      
      const data = await response.json();
      
      if (data.success && data.data) {
        const newStats = {
          totalBranches: data.data.branchCount || 0,
          totalRooms: data.data.roomCount || 0,
          occupiedRooms: data.data.occupiedRooms || 0,
          activeTenants: data.data.activeTenants || 0,
          monthlyIncome: data.data.totalIncome || 0,
          monthlyExpenses: data.data.totalExpenses || 0
        };
        
        setStats(newStats);
        setCachedData(cacheKey, newStats);
      }
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      toast({
        title: "Error",
        description: "Failed to load dashboard statistics",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedMonth, getCachedData, setCachedData, toast]);

  // Optimized report fetching with better error handling
  const fetchConsolidatedReport = useCallback(async () => {
    const cacheKey = `report-${selectedMonth}`;
    const cached = getCachedData(cacheKey);
    
    if (cached) {
      setConsolidatedReport(cached.report);
      setMonthlyReport(cached.monthlyReport);
      setIsLoadingReport(false);
      return;
    }

    setIsLoadingReport(true);
    
    try {
      const response = await fetch('/api/reports/consolidated-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonth,
          reportType: 'summary'
        })
      });

      if (!response.ok) throw new Error('Failed to fetch report');
      
      const data = await response.json();
      
      if (data.success && data.data) {
        setConsolidatedReport(data.data);
        const processedReport = processConsolidatedData(data.data);
        setMonthlyReport(processedReport);
        
        setCachedData(cacheKey, { report: data.data, monthlyReport: processedReport });
      }
    } catch (error) {
      console.error('Error fetching consolidated report:', error);
      toast({
        title: "Error",
        description: "Failed to load monthly report",
        variant: "destructive"
      });
    } finally {
      setIsLoadingReport(false);
    }
  }, [selectedMonth, getCachedData, setCachedData, toast]);

  // Memoized function to process consolidated data
  const processConsolidatedData = useCallback((data: ConsolidatedReport): MonthlyReport => {
    const snapshot = data.overallSnapshot || [];
    
    const totals = snapshot.reduce((acc, branch) => ({
      totalIncome: acc.totalIncome + (branch.totalIncome || 0),
      totalExpenses: acc.totalExpenses + (branch.totalExpenses || 0),
      rent: acc.rent + (branch.rent || 0),
      electricity: acc.electricity + (branch.electricity || 0),
      water: acc.water + (branch.water || 0),
      extraFees: acc.extraFees + (branch.extraFees || 0),
      penalty: acc.penalty + (branch.penalty || 0),
      forfeitedDeposits: acc.forfeitedDeposits + (branch.forfeitedDeposits || 0)
    }), {
      totalIncome: 0,
      totalExpenses: 0,
      rent: 0,
      electricity: 0,
      water: 0,
      extraFees: 0,
      penalty: 0,
      forfeitedDeposits: 0
    });
    
    return {
      totalRentCollected: totals.rent,
      totalElectricityCollected: totals.electricity,
      totalWaterCollected: totals.water,
      totalExtraFeesCollected: totals.extraFees,
      totalPenaltyFeesCollected: totals.penalty,
      forfeitedDeposits: totals.forfeitedDeposits,
      totalIncome: totals.totalIncome,
      totalExpenses: totals.totalExpenses,
      profitLoss: totals.totalIncome - totals.totalExpenses
    };
  }, []);

  // Add function to fetch reminder history
  const fetchReminderHistory = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('billing_reminders')
        .select(`
          *,
          tenants (
            full_name,
            rooms (
              room_number,
              branches (name)
            )
          )
        `)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setReminderHistory(data || []);
    } catch (error) {
      console.error('Error fetching reminder history:', error);
      toast({
        title: "Error",
        description: "Failed to fetch reminder history",
        variant: "destructive",
      });
    }
  }, [supabase, toast]);

  // Add function to test daily reminders
  const testDailyReminders = useCallback(async () => {
    setIsTestingReminders(true);
    try {
      const response = await fetch('/api/admin/daily-reminders', {
        method: 'POST',
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Daily Reminders Sent",
          description: `${result.data.totalEmailsSent} emails sent for ${result.data.totalTenantsRequiringReminders} tenants`,
        });
        
        // Refresh reminder history
        await fetchReminderHistory();
      } else {
        throw new Error(result.error || 'Failed to send reminders');
      }
    } catch (error) {
      console.error('Error testing daily reminders:', error);
      toast({
        title: "Error",
        description: "Failed to send daily reminders",
        variant: "destructive",
      });
    } finally {
      setIsTestingReminders(false);
    }
  }, [toast, fetchReminderHistory]);

  // Optimized effects with dependency arrays
  useEffect(() => {
    fetchDashboardStats();
  }, [fetchDashboardStats]);

  useEffect(() => {
    fetchConsolidatedReport();
  }, [fetchConsolidatedReport]);

  // Fetch branches for expense form
  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const { data, error } = await supabase
          .from('branches')
          .select('id, name')
          .order('name');
        
        if (error) {
          toast({
            title: 'Error',
            description: 'Failed to fetch branches: ' + error.message,
            variant: 'destructive'
          });
          throw error;
        }
        console.log('Fetched branches:', data);
        setBranches(data || []);
      } catch (error) {
        console.error('Error fetching branches:', error);
        toast({
          title: 'Error',
          description: 'Error fetching branches. See console for details.',
          variant: 'destructive'
        });
      }
    };
    
    fetchBranches();
  }, [supabase, toast]);

  // Debounced month change handler
  const handleMonthChange = useCallback((newMonth: string) => {
    setSelectedMonth(newMonth);
  }, []);

  const sendDailyReminders = useCallback(async () => {
    setIsSendingReminders(true);
    try {
      const response = await fetch('/api/admin/daily-reminders', {
        method: 'POST',
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: "Daily Reminders Sent",
          description: `${result.data.totalEmailsSent} emails sent for ${result.data.totalTenantsRequiringReminders} tenants`,
        });
        
        // Refresh reminder history if the function exists
        if (typeof fetchReminderHistory === 'function') {
          await fetchReminderHistory();
        }
      } else {
        throw new Error(result.error || 'Failed to send reminders');
      }
    } catch (error) {
      console.error('Error sending reminders:', error);
      toast({
        title: "Error",
        description: "Failed to send daily reminders",
        variant: "destructive"
      });
    } finally {
      setIsSendingReminders(false);
    }
  }, [toast, fetchReminderHistory]);

  const sendMonthlyReportEmail = useCallback(async () => {
    if (!emailAddresses.trim()) {
      toast({
        title: "Error",
        description: "Please enter at least one email address",
        variant: "destructive"
      });
      return;
    }

    setIsSendingEmail(true);
    try {
      const response = await fetch('/api/reports/consolidated-excel/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonth,
          reportType: 'detailed',
          emailAddresses: emailAddresses.split(',').map(email => email.trim())
        })
      });

      if (!response.ok) throw new Error('Failed to send email');

      setEmailDialogOpen(false);
      setEmailAddresses('');
      toast({
        title: "Success",
        description: "Monthly report sent successfully"
      });
    } catch (error) {
      console.error('Error sending email:', error);
      toast({
        title: "Error",
        description: "Failed to send monthly report email",
        variant: "destructive"
      });
    } finally {
      setIsSendingEmail(false);
    }
  }, [emailAddresses, selectedMonth, toast]);

  // Handle expense submission
  const handleExpenseSubmit = useCallback(async () => {
    if (!expenseForm.amount || !expenseForm.description) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }
    if (!expenseForm.branch_id) {
      toast({
        title: "Error",
        description: "Please select a branch for this expense.",
        variant: "destructive"
      });
      return;
    }

    setIsAddingExpense(true);
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error('Authentication required');
      }

      const response = await fetch('/api/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...expenseForm,
          amount: parseFloat(expenseForm.amount)
        })
      });

      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to add expense');
      }

      toast({
        title: "Success",
        description: "Expense added successfully"
      });

      // Reset form and close dialog
      setExpenseForm({
        amount: '',
        description: '',
        category: '',
        expense_date: (() => {
          const today = new Date();
          return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        })(),
        branch_id: ''
      });
      setExpensesDialogOpen(false);

      // Refresh data
      fetchDashboardStats();
      fetchConsolidatedReport();
    } catch (error) {
      console.error('Error adding expense:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : (typeof error === 'string' ? error : "Failed to add expense"),
        variant: "destructive"
      });
    } finally {
      setIsAddingExpense(false);
    }
  }, [expenseForm, supabase, toast, fetchDashboardStats, fetchConsolidatedReport]);

  // Memoized calculated values to prevent recalculation on every render
  const { occupancyRate, profit, isProfit } = useMemo(() => {
    const rate = stats.totalRooms > 0 ? (stats.occupiedRooms / stats.totalRooms) * 100 : 0;
    const profitAmount = stats.monthlyIncome - stats.monthlyExpenses;
    
    return {
      occupancyRate: rate,
      profit: profitAmount,
      isProfit: profitAmount >= 0
    };
  }, [stats.totalRooms, stats.occupiedRooms, stats.monthlyIncome, stats.monthlyExpenses]);

  // Memoized format functions
  const formatOccupancyRate = useCallback((rate: number) => `${rate.toFixed(1)}%`, []);
  const formatRoomCount = useCallback((occupied: number, total: number) => `${occupied}/${total}`, []);

  // Render expense dialog
  const renderExpenseDialog = () => (
    <Dialog open={expensesDialogOpen} onOpenChange={setExpensesDialogOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Company Expense</DialogTitle>
          <DialogDescription>
            Fill in the details below to add a new company expense. All fields marked with * are required.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="amount">Amount (PHP)</Label>
              <Input
                id="amount"
                type="number"
                min="0"
                value={expenseForm.amount}
                onChange={(e) => setExpenseForm(prev => ({ ...prev, amount: e.target.value }))}
                placeholder="2000"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="expense_date">Date</Label>
              <Input
                id="expense_date"
                type="date"
                value={expenseForm.expense_date}
                onChange={(e) => setExpenseForm(prev => ({ ...prev, expense_date: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="description">Description</Label>
            <Input
              id="description"
              value={expenseForm.description}
              onChange={(e) => setExpenseForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Expense description"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="category">Category</Label>
            <Select
              value={expenseForm.category}
              onValueChange={(value) => setExpenseForm(prev => ({ ...prev, category: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Office Supplies">Office Supplies</SelectItem>
                <SelectItem value="Utilities">Utilities</SelectItem>
                <SelectItem value="Maintenance">Maintenance</SelectItem>
                <SelectItem value="Marketing">Marketing</SelectItem>
                <SelectItem value="Legal & Professional">Legal & Professional</SelectItem>
                <SelectItem value="Insurance">Insurance</SelectItem>
                <SelectItem value="Travel">Travel</SelectItem>
                <SelectItem value="Equipment">Equipment</SelectItem>
                <SelectItem value="Software & Subscriptions">Software & Subscriptions</SelectItem>
                <SelectItem value="Miscellaneous">Miscellaneous</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="branch">Branch</Label>
            <Select 
              value={expenseForm.branch_id} 
              onValueChange={(value) => setExpenseForm(prev => ({ ...prev, branch_id: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select branch" />
              </SelectTrigger>
              <SelectContent>
                {branches.map((branch) => (
                  <SelectItem key={branch.id} value={branch.id}>
                    {branch.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-4">
          <Button
            variant="outline"
            onClick={() => setExpensesDialogOpen(false)}
            disabled={isAddingExpense}
          >
            Cancel
          </Button>
          <Button
            onClick={handleExpenseSubmit}
            disabled={isAddingExpense || !expenseForm.branch_id}
          >
            {isAddingExpense ? (
              <>
                <span className="mr-2">Adding...</span>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              </>
            ) : (
              'Add Expense'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-200 rounded w-1/4 mb-8"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-8 py-4 sm:py-6 lg:py-8">


        {/* Stats Grid - Using memoized components */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <StatCard
            title="Total Branches"
            value={stats.totalBranches}
            change={stats.totalBranches - (getCachedData(`stats-${selectedMonth}`)?.totalBranches || 0)}
            changeType={stats.totalBranches > (getCachedData(`stats-${selectedMonth}`)?.totalBranches || 0) ? 'increase' : stats.totalBranches < (getCachedData(`stats-${selectedMonth}`)?.totalBranches || 0) ? 'decrease' : 'neutral'}
            icon={BuildingOfficeIcon}
            isLoading={isLoading}
          />
          
                     <StatCard
             title="Room Occupancy"
             value={stats.occupiedRooms}
             change={stats.occupiedRooms - (getCachedData(`stats-${selectedMonth}`)?.occupiedRooms || 0)}
             changeType={stats.occupiedRooms > (getCachedData(`stats-${selectedMonth}`)?.occupiedRooms || 0) ? 'increase' : stats.occupiedRooms < (getCachedData(`stats-${selectedMonth}`)?.occupiedRooms || 0) ? 'decrease' : 'neutral'}
             icon={HomeIcon}
             formatValue={(val) => formatRoomCount(val, stats.totalRooms)}
             isLoading={isLoading}
           />
          
          <StatCard
            title="Active Tenants"
            value={stats.activeTenants}
            change={stats.activeTenants - (getCachedData(`stats-${selectedMonth}`)?.activeTenants || 0)}
            changeType={stats.activeTenants > (getCachedData(`stats-${selectedMonth}`)?.activeTenants || 0) ? 'increase' : stats.activeTenants < (getCachedData(`stats-${selectedMonth}`)?.activeTenants || 0) ? 'decrease' : 'neutral'}
            icon={UsersIcon}
            isLoading={isLoading}
          />
          
                     <StatCard
             title="Monthly Profit"
             value={profit}
             change={profit - (getCachedData(`stats-${selectedMonth}`)?.profit || 0)}
             changeType={profit > (getCachedData(`stats-${selectedMonth}`)?.profit || 0) ? 'increase' : profit < (getCachedData(`stats-${selectedMonth}`)?.profit || 0) ? 'decrease' : 'neutral'}
             icon={profit >= 0 ? ArrowTrendingUpIcon : ArrowTrendingDownIcon}
             formatValue={formatCurrency}
             isLoading={isLoading}
           />
        </div>

        {/* Quick Actions and Monthly Report */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
          <Card className="bg-white border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-gray-900">Recent Activity & Alerts</CardTitle>
              <CardDescription>Important updates and system notifications</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {/* Overdue Bills Alert */}
                <div className="flex items-start p-3 bg-red-50 border border-red-200 rounded-lg">
                  <ExclamationTriangleIcon className="h-5 w-5 text-red-600 mr-3 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-red-900">Overdue Bills Alert</div>
                    <div className="text-xs text-red-600 mt-1">
                      {stats.monthlyIncome > 0 ? 'Check billing page for overdue payments' : 'No billing data for current month'}
                    </div>
                  </div>
                </div>

                {/* Monthly Performance */}
                <div className="flex items-start p-3 bg-blue-50 border border-blue-200 rounded-lg">
                  <ArrowTrendingUpIcon className="h-5 w-5 text-blue-600 mr-3 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-blue-900">Occupancy Rate</div>
                    <div className="text-xs text-blue-600 mt-1">
                      {stats.totalRooms > 0 
                        ? `${Math.round((stats.occupiedRooms / stats.totalRooms) * 100)}% occupied (${stats.occupiedRooms}/${stats.totalRooms} rooms)`
                        : 'No rooms configured'
                      }
                    </div>
                  </div>
                </div>

                {/* Send Reminders Action */}
                <button
                  onClick={sendDailyReminders}
                  disabled={isSendingReminders}
                  className="flex items-center p-3 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg transition-colors disabled:opacity-50 w-full text-left"
                >
                  <EnvelopeIcon className="h-5 w-5 text-orange-600 mr-3 flex-shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-orange-900">
                      {isSendingReminders ? 'Sending...' : 'Send Daily Reminders'}
                    </div>
                    <div className="text-xs text-orange-600">Manual trigger for admin email reminders</div>
                  </div>
                </button>

                {/* System Status */}
                <div className="flex items-start p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircleIcon className="h-5 w-5 text-green-600 mr-3 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-green-900">System Status</div>
                    <div className="text-xs text-green-600 mt-1">
                      All systems operational • {stats.activeTenants} active tenants
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Monthly Financial Report Card */}
          <Card className="bg-white border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-gray-900">Monthly Financial Report</CardTitle>
              <CardDescription>View and send detailed financial reports</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Month Selector */}
                <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-2">
                  <label htmlFor="month-select" className="text-sm font-medium text-gray-700 whitespace-nowrap">
                    Select Month:
                  </label>
                  <div className="flex items-center space-x-2">
                    <Input
                      id="month-select"
                      type="month"
                      value={selectedMonth}
                      onChange={(e) => handleMonthChange(e.target.value)}
                      className="w-full sm:w-auto"
                    />
                    {isLoadingReport && (
                      <div className="text-xs text-gray-500 italic whitespace-nowrap">
                        Loading...
                      </div>
                    )}
                  </div>
                </div>

                {/* Financial Summary */}
                {monthlyReport && !isLoadingReport && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-gray-900 mb-3">Financial Summary</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Total Income:</span>
                        <p className="font-semibold text-green-600">{formatCurrency(monthlyReport.totalIncome)}</p>
                      </div>
                      <div>
                        <span className="text-gray-600">Total Expenses:</span>
                        <p className="font-semibold text-red-600">{formatCurrency(monthlyReport.totalExpenses)}</p>
                      </div>
                      <div className="col-span-2 pt-2 border-t border-gray-200">
                        <span className="text-gray-600">Net Profit/Loss:</span>
                        <p className={`font-bold ${monthlyReport.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatCurrency(monthlyReport.profitLoss)}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-2">
                  <Dialog open={expensesDialogOpen} onOpenChange={setExpensesDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        size="sm"
                        className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white"
                      >
                        <PlusIcon className="h-4 w-4" />
                        <span>Add Expense</span>
                      </Button>
                    </DialogTrigger>
                  </Dialog>
                  
                  <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center space-x-2"
                        disabled={isLoadingReport}
                      >
                        <EnvelopeIcon className="h-4 w-4" />
                        <span>Email Report</span>
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Send Monthly Report</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <label className="text-sm font-medium">Email Addresses (comma-separated)</label>
                          <Input
                            value={emailAddresses}
                            onChange={(e) => setEmailAddresses(e.target.value)}
                            placeholder="email1@example.com, email2@example.com"
                            className="mt-1"
                          />
                        </div>
                        <div className="flex justify-end space-x-2">
                          <Button variant="outline" onClick={() => setEmailDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button onClick={sendMonthlyReportEmail} disabled={isSendingEmail}>
                            {isSendingEmail ? 'Sending...' : 'Send Report'}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Daily Reminders Management */}
        <Card className="floating-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <BellIcon className="h-6 w-6 text-blue-600" />
                <div>
                  <CardTitle className="text-lg">Daily Billing Reminders</CardTitle>
                  <CardDescription>Automated reminders for tenant billing cycles</CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-blue-600 rounded-full"></div>
                  <span className="text-sm font-medium text-blue-900">Day 3 Notice</span>
                </div>
                <p className="text-xs text-blue-700 mt-1">Advance planning reminder</p>
              </div>
              
              <div className="bg-orange-50 p-4 rounded-lg border border-orange-200">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-orange-600 rounded-full"></div>
                  <span className="text-sm font-medium text-orange-900">Day 2 Important</span>
                </div>
                <p className="text-xs text-orange-700 mt-1">Preparation reminder</p>
              </div>
              
              <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                <div className="flex items-center space-x-2">
                  <div className="w-3 h-3 bg-red-600 rounded-full"></div>
                  <span className="text-sm font-medium text-red-900">Day 1 Urgent</span>
                </div>
                <p className="text-xs text-red-700 mt-1">Final action reminder</p>
              </div>
            </div>
            
            <div className="flex flex-col sm:flex-row gap-3">
              <Button 
                onClick={testDailyReminders}
                disabled={isTestingReminders}
                className="flex-1"
              >
                <BellIcon className="h-4 w-4 mr-2" />
                {isTestingReminders ? 'Sending...' : 'Test Daily Reminders'}
              </Button>
              
              <Button 
                variant="outline"
                onClick={() => {
                  fetchReminderHistory();
                  setReminderHistoryDialogOpen(true);
                }}
                className="flex-1"
              >
                <ClockIcon className="h-4 w-4 mr-2" />
                View History
              </Button>
            </div>
            
            <div className="text-xs text-gray-500 bg-gray-50 p-3 rounded-lg">
              <p><strong>Automated Schedule:</strong> Daily reminders are automatically sent at 9:00 AM for tenants whose billing cycles end in 3, 2, or 1 days.</p>
            </div>
          </CardContent>
        </Card>

        {/* Reminder History Dialog */}
        <Dialog open={reminderHistoryDialogOpen} onOpenChange={setReminderHistoryDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Daily Reminder History</DialogTitle>
              <DialogDescription>
                Recent daily billing reminder emails sent to administrators
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              {reminderHistory.length > 0 ? (
                <div className="space-y-3">
                  {reminderHistory.map((reminder) => (
                    <div key={reminder.id} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className={`w-3 h-3 rounded-full ${
                            reminder.reminder_day === 1 ? 'bg-red-600' :
                            reminder.reminder_day === 2 ? 'bg-orange-600' : 'bg-blue-600'
                          }`}></div>
                          <div>
                            <h4 className="font-medium">{reminder.tenants?.full_name}</h4>
                            <p className="text-sm text-gray-600">
                              {reminder.tenants?.rooms?.room_number} • {reminder.tenants?.rooms?.branches?.name}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">
                            Day {reminder.reminder_day} Reminder
                          </p>
                          <p className="text-xs text-gray-500">
                            {new Date(reminder.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      
                      <div className="text-xs text-gray-500 space-y-1">
                        <p>Cycle End: {new Date(reminder.billing_cycle_end_date).toLocaleDateString()}</p>
                        <p>Sent to: {reminder.email_sent_to?.join(', ')}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <BellIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                  <p>No reminder history found</p>
                  <p className="text-sm">Daily reminders will appear here once sent</p>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {renderExpenseDialog()}
      </div>
    </div>
  );
}

export default memo(DashboardPage);
