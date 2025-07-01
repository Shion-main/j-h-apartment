'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useToast } from '@/components/ui/use-toast';
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
  MagnifyingGlassIcon
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

interface DetailedReport {
  month: string;
  period: {
    start: string;
    end: string;
  };
  summary: {
    totalBills: number;
    totalBilled: number;
    totalCollected: number;
    totalOutstanding: number;
    fullyPaidBills: number;
    partiallyPaidBills: number;
    activeBills: number;
    finalBills: number;
    totalExpenses: number;
    newTenants: number;
    movedOutTenants: number;
    activeTenantsAtMonthEnd: number;
  };
  branchBreakdown: Array<{
    name: string;
    address: string;
    totalBilled: number;
    totalCollected: number;
    totalOutstanding: number;
    billCount: number;
    fullyPaidCount: number;
    partiallyPaidCount: number;
    activeCount: number;
    finalBillCount: number;
    collectionRate: number;
    incomeBreakdown: {
      rentCollected: number;
      electricityCollected: number;
      waterCollected: number;
      extraFeesCollected: number;
      penaltyFeesCollected: number;
      forfeitedDeposits: number;
    };
    detailedBills: Array<{
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
  }>;
  detailedExpenses: Array<{
    id: string;
    expenseDate: string;
    amount: number;
    description: string;
    category: string;
    branchName: string;
  }>;
  tenantMovements: Array<{
    id: string;
    fullName: string;
    rentStartDate: string;
    moveOutDate: string;
    isActive: boolean;
    roomNumber: string;
    branchName: string;
    movementType: string;
  }>;
  detailedBills: Array<{
    id: string;
    billingPeriod: string;
    dueDate: string;
    tenantName: string;
    tenantEmail: string;
    tenantPhone: string;
    branchName: string;
    roomNumber: string;
    monthlyRent: number;
    electricityAmount: number;
    waterAmount: number;
    extraFee: number;
    extraFeeDescription: string;
    penaltyAmount: number;
    totalAmountDue: number;
    amountPaid: number;
    outstandingAmount: number;
    status: string;
    isFinalBill: boolean;
    advancePayment: number;
    securityDeposit: number;
    appliedAdvancePayment: number;
    appliedSecurityDeposit: number;
    forfeitedAmount: number;
    refundAmount: number;
    payments: Array<{
      id: string;
      amount: number;
      paymentDate: string;
      paymentMethod: string;
      notes: string;
      referenceNumber: string;
    }>;
  }>;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    totalBranches: 0,
    totalRooms: 0,
    occupiedRooms: 0,
    activeTenants: 0,
    monthlyIncome: 0,
    monthlyExpenses: 0
  });
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });
  const [monthlyReport, setMonthlyReport] = useState<MonthlyReport | null>(null);
  const [consolidatedReport, setConsolidatedReport] = useState<ConsolidatedReport | null>(null);
  const [detailedReport, setDetailedReport] = useState<DetailedReport | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [isLoadingDetailedReport, setIsLoadingDetailedReport] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailAddresses, setEmailAddresses] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isSendingReminders, setIsSendingReminders] = useState(false);
  const [reportType, setReportType] = useState<'summary' | 'detailed'>('summary');
  const supabase = createClientComponentClient();
  const { toast } = useToast();

  useEffect(() => {
    fetchDashboardStats();
    fetchConsolidatedReport();
  }, [selectedMonth, reportType]);

  const fetchConsolidatedReport = async () => {
    setIsLoadingReport(true);
    setIsLoadingDetailedReport(true);
    try {
      const [year, month] = selectedMonth.split('-');
      const response = await fetch(`/api/reports/consolidated-json?month=${month}&year=${year}`);
      
      if (response.ok) {
        const data = await response.json();
        setConsolidatedReport(data.data);
        
        // Create summary data compatible with existing monthlyReport interface
        const totalIncome = data.data.overallSnapshot.reduce((sum: number, branch: any) => sum + branch.totalIncome, 0);
        const totalExpenses = data.data.overallSnapshot.reduce((sum: number, branch: any) => sum + branch.totalExpenses, 0);
        const rent = data.data.overallSnapshot.reduce((sum: number, branch: any) => sum + branch.rent, 0);
        const electricity = data.data.overallSnapshot.reduce((sum: number, branch: any) => sum + branch.electricity, 0);
        const water = data.data.overallSnapshot.reduce((sum: number, branch: any) => sum + branch.water, 0);
        const extraFees = data.data.overallSnapshot.reduce((sum: number, branch: any) => sum + branch.extraFees, 0);
        const penalty = data.data.overallSnapshot.reduce((sum: number, branch: any) => sum + branch.penalty, 0);
        const forfeitedDeposits = data.data.overallSnapshot.reduce((sum: number, branch: any) => sum + branch.forfeitedDeposits, 0);
        
        setMonthlyReport({
          totalRentCollected: rent,
          totalElectricityCollected: electricity,
          totalWaterCollected: water,
          totalExtraFeesCollected: extraFees,
          totalPenaltyFeesCollected: penalty,
          forfeitedDeposits: forfeitedDeposits,
          totalIncome: totalIncome,
          totalExpenses: totalExpenses,
          profitLoss: totalIncome - totalExpenses
        });
        
        // Update detailedReport with compatible data structure
        setDetailedReport({
          month: data.data.month,
          period: {
            start: `${year}-${month.padStart(2, '0')}-01`,
            end: new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0]
          },
          summary: {
            totalBills: data.data.detailedBilling.length,
            totalBilled: data.data.detailedBilling.reduce((sum: number, bill: any) => sum + bill.originalTotal, 0),
            totalCollected: data.data.detailedBilling.reduce((sum: number, bill: any) => sum + bill.totalPaid, 0),
            totalOutstanding: data.data.detailedBilling.reduce((sum: number, bill: any) => sum + (bill.originalTotal - bill.totalPaid), 0),
            fullyPaidBills: data.data.detailedBilling.filter((bill: any) => bill.status === 'fully_paid').length,
            partiallyPaidBills: data.data.detailedBilling.filter((bill: any) => bill.status === 'partially_paid').length,
            activeBills: data.data.detailedBilling.filter((bill: any) => bill.status === 'active').length,
            finalBills: 0, // Not available in new API
            totalExpenses: data.data.overallSnapshot.reduce((sum: number, branch: any) => sum + branch.totalExpenses, 0),
            newTenants: data.data.tenantRoomStatus.reduce((sum: number, branch: any) => sum + branch.newTenants, 0),
            movedOutTenants: data.data.tenantRoomStatus.reduce((sum: number, branch: any) => sum + branch.movedOutTenants, 0),
            activeTenantsAtMonthEnd: data.data.tenantRoomStatus.reduce((sum: number, branch: any) => sum + branch.activeTenants, 0)
          },
          branchBreakdown: data.data.branches.map((branch: any) => {
            const branchSnapshot = data.data.overallSnapshot.find((snap: any) => snap.branch === branch.name) || {};
            const branchBills = data.data.detailedBilling.filter((bill: any) => bill.branch === branch.name);
            const branchStatus = data.data.tenantRoomStatus.find((status: any) => status.branch === branch.name) || {};
            
            return {
              name: branch.name,
              address: branch.address || '',
              totalBilled: branchBills.reduce((sum: number, bill: any) => sum + bill.originalTotal, 0),
              totalCollected: branchBills.reduce((sum: number, bill: any) => sum + bill.totalPaid, 0),
              totalOutstanding: branchBills.reduce((sum: number, bill: any) => sum + (bill.originalTotal - bill.totalPaid), 0),
              billCount: branchBills.length,
              fullyPaidCount: branchBills.filter((bill: any) => bill.status === 'fully_paid').length,
              partiallyPaidCount: branchBills.filter((bill: any) => bill.status === 'partially_paid').length,
              activeCount: branchBills.filter((bill: any) => bill.status === 'active').length,
              finalBillCount: 0,
              collectionRate: branchBills.length > 0 ? (branchBills.reduce((sum: number, bill: any) => sum + bill.totalPaid, 0) / branchBills.reduce((sum: number, bill: any) => sum + bill.originalTotal, 0)) * 100 : 0,
              incomeBreakdown: {
                rentCollected: branchSnapshot.rent || 0,
                electricityCollected: branchSnapshot.electricity || 0,
                waterCollected: branchSnapshot.water || 0,
                extraFeesCollected: branchSnapshot.extraFees || 0,
                penaltyFeesCollected: branchSnapshot.penalty || 0,
                forfeitedDeposits: branchSnapshot.forfeitedDeposits || 0
              },
              detailedBills: branchBills.map((bill: any) => ({
                tenantName: bill.tenantName,
                roomNumber: bill.roomNumber,
                billingPeriod: bill.billingPeriod,
                dueDate: bill.dueDate,
                originalTotal: bill.originalTotal,
                totalPaid: bill.totalPaid,
                status: bill.status,
                paymentDate: bill.paymentDate || '',
                paymentMethod: bill.paymentMethod || '',
                paymentAmount: bill.paymentAmount || 0
              }))
            };
          }),
          detailedExpenses: data.data.companyExpenses.map((expense: any) => ({
            id: Math.random().toString(),
            expenseDate: expense.expenseDate,
            amount: expense.amount,
            description: expense.description,
            category: expense.category,
            branchName: expense.branch
          })),
          tenantMovements: data.data.tenantMovement.map((movement: any) => ({
            id: Math.random().toString(),
            fullName: movement.fullName,
            rentStartDate: movement.type === 'Move In' ? movement.date : '',
            moveOutDate: movement.type === 'Move Out' ? movement.date : '',
            isActive: movement.type === 'Move In',
            roomNumber: movement.roomNumber || '',
            branchName: movement.branch,
            movementType: movement.type
          })),
          detailedBills: data.data.detailedBilling.map((bill: any) => ({
            id: Math.random().toString(),
            billingPeriod: bill.billingPeriod,
            dueDate: bill.dueDate,
            tenantName: bill.tenantName,
            tenantEmail: '',
            tenantPhone: '',
            branchName: bill.branch,
            roomNumber: bill.roomNumber,
            monthlyRent: 0, // Not available in new structure
            electricityAmount: 0, // Not broken down in new structure
            waterAmount: 0, // Not broken down in new structure
            extraFee: 0, // Not broken down in new structure
            extraFeeDescription: '',
            penaltyAmount: 0, // Not broken down in new structure
            totalAmountDue: bill.originalTotal,
            amountPaid: bill.totalPaid,
            outstandingAmount: bill.originalTotal - bill.totalPaid,
            status: bill.status,
            isFinalBill: false,
            advancePayment: 0,
            securityDeposit: 0,
            appliedAdvancePayment: 0,
            appliedSecurityDeposit: 0,
            forfeitedAmount: 0,
            refundAmount: 0,
            payments: bill.paymentAmount > 0 ? [{
              id: Math.random().toString(),
              amount: bill.paymentAmount,
              paymentDate: bill.paymentDate || '',
              paymentMethod: bill.paymentMethod || '',
              notes: '',
              referenceNumber: ''
            }] : []
          }))
        });
      } else {
        console.error('Failed to fetch consolidated report');
        setConsolidatedReport(null);
        setMonthlyReport(null);
        setDetailedReport(null);
        
        if (response.status === 404) {
          toast({
            title: "No Data Found",
            description: `No financial data found for ${selectedMonth}. Try selecting a different month or check if bills and payments exist.`,
            variant: "destructive"
          });
        }
      }
    } catch (error) {
      console.error('Error fetching consolidated report:', error);
      setConsolidatedReport(null);
      setMonthlyReport(null);
      setDetailedReport(null);
      toast({
        title: "Error",
        description: "Failed to fetch reports. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoadingReport(false);
      setIsLoadingDetailedReport(false);
    }
  };

  const fetchDashboardStats = async () => {
    try {
      // Fetch branches and rooms
      const { data: branches } = await supabase
        .from('branches')
        .select(`
          id,
          rooms (
            id,
            is_occupied
          )
        `);

      // Fetch active tenants
      const { data: activeTenants } = await supabase
        .from('tenants')
        .select('id')
        .eq('is_active', true);

      // Use consolidated report data for financial stats if available
      let monthlyIncome = 0;
      let monthlyExpenses = 0;

      if (consolidatedReport) {
        monthlyIncome = consolidatedReport.overallSnapshot.reduce((sum, branch) => sum + branch.totalIncome, 0);
        monthlyExpenses = consolidatedReport.overallSnapshot.reduce((sum, branch) => sum + branch.totalExpenses, 0);
      } else {
        // Fallback to API call if consolidated report not yet loaded
        const [year, month] = selectedMonth.split('-');
        const response = await fetch(`/api/reports/consolidated-json?month=${month}&year=${year}`);
        
        if (response.ok) {
          const data = await response.json();
          if (data.data) {
            monthlyIncome = data.data.overallSnapshot.reduce((sum: number, branch: any) => sum + branch.totalIncome, 0);
            monthlyExpenses = data.data.overallSnapshot.reduce((sum: number, branch: any) => sum + branch.totalExpenses, 0);
          }
        }
      }

      setStats({
        totalBranches: branches?.length || 0,
        totalRooms: branches?.reduce((total, branch) => total + (branch.rooms?.length || 0), 0) || 0,
        occupiedRooms: branches?.reduce((total, branch) => total + (branch.rooms?.filter(room => room.is_occupied)?.length || 0), 0) || 0,
        activeTenants: activeTenants?.length || 0,
        monthlyIncome,
        monthlyExpenses
      });

      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      setIsLoading(false);
    }
  };

  const sendDailyReminders = async () => {
    setIsSendingReminders(true);
    try {
      const response = await fetch('/api/admin/daily-reminders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Success",
          description: `Daily reminders sent to ${data.data.emailsSent} admin(s). ${data.data.tenantsRequiringBills} tenant(s) need bills generated.`
        });
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.error || "Failed to send daily reminders",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error sending daily reminders:', error);
      toast({
        title: "Error", 
        description: "Failed to send daily reminders",
        variant: "destructive"
      });
    } finally {
      setIsSendingReminders(false);
    }
  };

  const sendMonthlyReportEmail = async () => {
    if (!emailAddresses.trim()) {
      toast({
        title: "Error",
        description: "Please enter at least one email address",
        variant: "destructive"
      });
      return;
    }

    if (!monthlyReport && !consolidatedReport) {
      toast({
        title: "Error", 
        description: "No report data available for the selected month",
        variant: "destructive"
      });
      return;
    }

    setIsSendingEmail(true);
    try {
      const emails = emailAddresses.split(',').map(email => email.trim()).filter(Boolean);
      const [year, month] = selectedMonth.split('-');
      
      const response = await fetch('/api/reports/consolidated-excel/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          emails,
          month: month,
          year: year
        })
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: `Monthly report sent to ${emails.length} recipient(s)`
        });
        setEmailDialogOpen(false);
        setEmailAddresses('');
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.error || "Failed to send email",
          variant: "destructive"
        });
      }
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
  };

  const findDataAvailability = async () => {
    try {
      const response = await fetch('/api/reports/debug');
      if (response.ok) {
        const data = await response.json();
        const debug = data.debug;
        
        // Find months with data
        const monthsWithData = Object.entries(debug.testQueries || {})
          .filter(([month, data]: [string, any]) => data.paymentComponents > 0 || data.bills > 0)
          .map(([month, data]: [string, any]) => `${month} (${data.paymentComponents} payments, ${data.bills} bills)`);
        
        if (monthsWithData.length > 0) {
          toast({
            title: "Data Available",
            description: `Found data in: ${monthsWithData.join(', ')}. Total bills: ${debug.queries.bills?.count || 0}, Total payments: ${debug.queries.payments?.count || 0}`
          });
        } else {
          toast({
            title: "No Data Found",
            description: `System has ${debug.queries.bills?.count || 0} bills and ${debug.queries.payments?.count || 0} payments, but no data in tested months. You may need to add tenants and generate bills first.`,
            variant: "destructive"
          });
        }
      }
    } catch (error) {
      console.error('Error checking data availability:', error);
      toast({
        title: "Error",
        description: "Failed to check data availability",
        variant: "destructive"
      });
    }
  };

  const occupancyRate = stats.totalRooms > 0 ? (stats.occupiedRooms / stats.totalRooms) * 100 : 0;
  const profit = monthlyReport?.profitLoss || 0;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP'
    }).format(amount);
  };

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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-2">Overview of your property management system</p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {/* Total Branches */}
          <Card className="bg-white border-gray-200 hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Total Branches</CardTitle>
              <BuildingOfficeIcon className="h-5 w-5 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{stats.totalBranches}</div>
              <p className="text-xs text-gray-500 mt-1">Property locations</p>
            </CardContent>
          </Card>

          {/* Room Occupancy */}
          <Card className="bg-white border-gray-200 hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Room Occupancy</CardTitle>
              <HomeIcon className="h-5 w-5 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">
                {stats.occupiedRooms}/{stats.totalRooms}
              </div>
              <p className="text-xs text-gray-500 mt-1">
                {occupancyRate.toFixed(1)}% occupancy rate
              </p>
            </CardContent>
          </Card>

          {/* Active Tenants */}
          <Card className="bg-white border-gray-200 hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Active Tenants</CardTitle>
              <UsersIcon className="h-5 w-5 text-purple-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-gray-900">{stats.activeTenants}</div>
              <p className="text-xs text-gray-500 mt-1">Current residents</p>
            </CardContent>
          </Card>

          {/* Monthly Profit */}
          <Card className="bg-white border-gray-200 hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
              <CardTitle className="text-sm font-medium text-gray-600">Monthly Profit</CardTitle>
              {profit >= 0 ? (
                <ArrowTrendingUpIcon className="h-5 w-5 text-green-600" />
              ) : (
                <ArrowTrendingDownIcon className="h-5 w-5 text-red-600" />
              )}
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(profit)}
              </div>
              <p className="text-xs text-gray-500 mt-1">{selectedMonth} profit/loss</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions and Monthly Report */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card className="bg-white border-gray-200">
            <CardHeader>
              <CardTitle className="text-lg font-semibold text-gray-900">Quick Actions</CardTitle>
              <CardDescription>Common tasks and shortcuts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <a
                  href="/branches"
                  className="flex items-center p-3 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                >
                  <BuildingOfficeIcon className="h-5 w-5 text-blue-600 mr-3" />
                  <div>
                    <div className="text-sm font-medium text-blue-900">Manage Branches</div>
                    <div className="text-xs text-blue-600">Add, edit, or view branch details</div>
                  </div>
                </a>
                <a
                  href="/tenants"
                  className="flex items-center p-3 bg-green-50 hover:bg-green-100 rounded-lg transition-colors"
                >
                  <UsersIcon className="h-5 w-5 text-green-600 mr-3" />
                  <div>
                    <div className="text-sm font-medium text-green-900">Manage Tenants</div>
                    <div className="text-xs text-green-600">Add new tenants or update existing ones</div>
                  </div>
                </a>
                <a
                  href="/billing"
                  className="flex items-center p-3 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
                >
                  <CurrencyDollarIcon className="h-5 w-5 text-purple-600 mr-3" />
                  <div>
                    <div className="text-sm font-medium text-purple-900">Generate Bills</div>
                    <div className="text-xs text-purple-600">Create and manage billing cycles</div>
                  </div>
                </a>
                <button
                  onClick={sendDailyReminders}
                  disabled={isSendingReminders}
                  className="flex items-center p-3 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors disabled:opacity-50 w-full text-left"
                >
                  <EnvelopeIcon className="h-5 w-5 text-orange-600 mr-3" />
                  <div>
                    <div className="text-sm font-medium text-orange-900">
                      {isSendingReminders ? 'Sending...' : 'Send Daily Reminders'}
                    </div>
                    <div className="text-xs text-orange-600">Manual trigger for admin email reminders</div>
                  </div>
                </button>
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
                <div className="flex items-center space-x-2">
                  <label htmlFor="month-select" className="text-sm font-medium text-gray-700">
                    Select Month:
                  </label>
                  <Input
                    id="month-select"
                    type="month"
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="w-auto"
                  />
                </div>

                {/* Report Type Selector */}
                <div className="flex items-center space-x-4">
                  <label className="text-sm font-medium text-gray-700">Report Type:</label>
                  <div className="flex space-x-2">
                    <Button
                      variant={reportType === 'summary' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setReportType('summary')}
                      className="flex items-center space-x-1"
                    >
                      <ChartBarIcon className="h-4 w-4" />
                      <span>Summary</span>
                    </Button>
                    <Button
                      variant={reportType === 'detailed' ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setReportType('detailed')}
                      className="flex items-center space-x-1"
                    >
                      <TableCellsIcon className="h-4 w-4" />
                      <span>Detailed</span>
                    </Button>
                  </div>
                </div>

                {/* Report Summary */}
                {isLoadingReport || isLoadingDetailedReport ? (
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2"></div>
                  </div>
                ) : reportType === 'summary' && monthlyReport ? (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Total Income:</span>
                      <span className="font-semibold text-green-600">
                        {formatCurrency(monthlyReport.totalIncome)}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Total Expenses:</span>
                      <span className="font-semibold text-red-600">
                        {formatCurrency(monthlyReport.totalExpenses)}
                      </span>
                    </div>
                    <hr className="my-2" />
                    <div className="flex justify-between text-sm">
                      <span className="font-medium text-gray-700">Net Profit/Loss:</span>
                      <span className={`font-bold ${monthlyReport.profitLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(monthlyReport.profitLoss)}
                      </span>
                    </div>
                  </div>
                ) : reportType === 'detailed' && detailedReport ? (
                  <div className="space-y-3">
                    {/* Summary Stats */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total Bills:</span>
                        <span className="font-semibold">{detailedReport.summary.totalBills}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total Billed:</span>
                        <span className="font-semibold text-green-600">
                          {formatCurrency(detailedReport.summary.totalBilled)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total Collected:</span>
                        <span className="font-semibold text-blue-600">
                          {formatCurrency(detailedReport.summary.totalCollected)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Outstanding:</span>
                        <span className="font-semibold text-red-600">
                          {formatCurrency(detailedReport.summary.totalOutstanding)}
                        </span>
                      </div>
                    </div>
                    
                    {/* Branch Breakdown Preview */}
                    {detailedReport.branchBreakdown.length > 0 && (
                      <div className="mt-3">
                        <div className="text-xs font-medium text-gray-700 mb-2">Branch Breakdown:</div>
                        <div className="space-y-1">
                          {detailedReport.branchBreakdown.slice(0, 3).map((branch, index) => (
                            <div key={index} className="flex justify-between text-xs">
                              <span className="text-gray-600 truncate">{branch.name}:</span>
                              <span className="font-semibold">{formatCurrency(branch.totalCollected)}</span>
                            </div>
                          ))}
                          {detailedReport.branchBreakdown.length > 3 && (
                            <div className="text-xs text-gray-500">
                              +{detailedReport.branchBreakdown.length - 3} more branches
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-500">
                    <div className="text-sm">No data available</div>
                    <div className="text-xs mt-1">Select a different month</div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-wrap space-x-2 pt-4 gap-y-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const [year, month] = selectedMonth.split('-');
                      window.open(`/api/reports/consolidated-excel?month=${month}&year=${year}`, '_blank');
                    }}
                    disabled={!monthlyReport && !detailedReport}
                    className="flex items-center space-x-1"
                  >
                    <DocumentArrowDownIcon className="h-4 w-4" />
                    <span>Download CSV</span>
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={findDataAvailability}
                    className="flex items-center space-x-1"
                  >
                    <MagnifyingGlassIcon className="h-4 w-4" />
                    <span>Find Data</span>
                  </Button>

                  <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!monthlyReport && !detailedReport}
                        className="flex items-center space-x-1"
                      >
                        <EnvelopeIcon className="h-4 w-4" />
                        <span>Send Email</span>
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Send Monthly Report</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <label htmlFor="email-addresses" className="block text-sm font-medium text-gray-700 mb-2">
                            Email Addresses (separate multiple emails with commas)
                          </label>
                          <Input
                            id="email-addresses"
                            type="text"
                            placeholder="admin@example.com, manager@example.com"
                            value={emailAddresses}
                            onChange={(e) => setEmailAddresses(e.target.value)}
                          />
                        </div>
                        <div className="flex justify-end space-x-2">
                          <Button
                            variant="outline"
                            onClick={() => setEmailDialogOpen(false)}
                            disabled={isSendingEmail}
                          >
                            Cancel
                          </Button>
                          <Button
                            onClick={sendMonthlyReportEmail}
                            disabled={isSendingEmail}
                          >
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
      </div>
    </div>
  );
} 