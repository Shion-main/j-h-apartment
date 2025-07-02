'use client';

import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { getSupabaseClient } from '@/lib/supabase/client';
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
  ExclamationTriangleIcon,
  CheckCircleIcon
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

// Memoized stat card component to prevent unnecessary re-renders
const StatCard = memo(({ title, value, subtitle, icon: Icon, color, isLoading }: {
  title: string;
  value: string | number;
  subtitle: string;
  icon: any;
  color: string;
  isLoading?: boolean;
}) => (
  <Card className="bg-white border-gray-200 hover:shadow-lg transition-shadow">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
      <CardTitle className="text-sm font-medium text-gray-600">{title}</CardTitle>
      <Icon className={`h-5 w-5 ${color}`} />
    </CardHeader>
    <CardContent>
      {isLoading ? (
        <div className="h-8 bg-gray-200 rounded animate-pulse"></div>
      ) : (
        <>
          <div className="text-2xl font-bold text-gray-900">{value}</div>
          <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
        </>
      )}
    </CardContent>
  </Card>
));

StatCard.displayName = 'StatCard';

function DashboardPage() {
  // Persistent cache for API responses
  const [dataCache, setDataCache] = useState(() => ({
    stats: null as DashboardStats | null,
    reports: new Map<string, ConsolidatedReport>(),
    lastStatsUpdate: 0
  }));
  
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
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingReport, setIsLoadingReport] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailAddresses, setEmailAddresses] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [isSendingReminders, setIsSendingReminders] = useState(false);
  
  // Create supabase client once
  const supabase = useMemo(() => getSupabaseClient(), []);
  const { toast } = useToast();

  // Memoized currency formatter
  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP'
    }).format(amount);
  }, []);

  // Cache duration constants
  const STATS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
  const REPORT_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

  // Optimized stats fetching with caching
  const fetchDashboardStats = useCallback(async () => {
    const now = Date.now();
    
    // Check if we have cached stats that are still fresh
    if (dataCache.stats && (now - dataCache.lastStatsUpdate) < STATS_CACHE_DURATION) {
      setStats(dataCache.stats);
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
        setDataCache(prev => ({
          ...prev,
          stats: newStats,
          lastStatsUpdate: now
        }));
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
  }, [selectedMonth, dataCache.stats, dataCache.lastStatsUpdate, toast]);

  // Optimized report fetching with caching
  const fetchConsolidatedReport = useCallback(async () => {
    const cacheKey = `${selectedMonth}-summary`;
    const cachedReport = dataCache.reports.get(cacheKey);
    
    // Check cache first
    if (cachedReport) {
      setConsolidatedReport(cachedReport);
      processConsolidatedData(cachedReport);
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
        processConsolidatedData(data.data);
        
        // Cache the report
        setDataCache(prev => {
          const newReports = new Map(prev.reports);
          newReports.set(cacheKey, data.data);
          return { ...prev, reports: newReports };
        });
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
  }, [selectedMonth, dataCache.reports, toast]);

  // Memoized function to process consolidated data
  const processConsolidatedData = useCallback((data: ConsolidatedReport) => {
    const totalIncome = data.overallSnapshot.reduce((sum: number, branch: any) => sum + branch.totalIncome, 0);
    const totalExpenses = data.overallSnapshot.reduce((sum: number, branch: any) => sum + branch.totalExpenses, 0);
    const rent = data.overallSnapshot.reduce((sum: number, branch: any) => sum + branch.rent, 0);
    const electricity = data.overallSnapshot.reduce((sum: number, branch: any) => sum + branch.electricity, 0);
    const water = data.overallSnapshot.reduce((sum: number, branch: any) => sum + branch.water, 0);
    const extraFees = data.overallSnapshot.reduce((sum: number, branch: any) => sum + branch.extraFees, 0);
    const penalty = data.overallSnapshot.reduce((sum: number, branch: any) => sum + branch.penalty, 0);
    const forfeitedDeposits = data.overallSnapshot.reduce((sum: number, branch: any) => sum + branch.forfeitedDeposits, 0);
    
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
  }, []);

  // Initial load - only fetch stats once
  useEffect(() => {
    fetchDashboardStats();
  }, [fetchDashboardStats]);

  // Fetch report when month changes
  useEffect(() => {
    fetchConsolidatedReport();
  }, [selectedMonth, fetchConsolidatedReport]);

  // Debounced month change handler
  const handleMonthChange = useCallback((newMonth: string) => {
    setSelectedMonth(newMonth);
  }, []);

  const sendDailyReminders = useCallback(async () => {
    setIsSendingReminders(true);
    try {
      const response = await fetch('/api/admin/daily-reminders', {
        method: 'POST'
      });

      if (!response.ok) throw new Error('Failed to send reminders');

      toast({
        title: "Success",
        description: "Daily reminders sent successfully"
      });
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
  }, [toast]);

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

  // Memoized computed values to prevent unnecessary recalculations
  const { occupancyRate, profit } = useMemo(() => {
    const rate = stats.totalRooms > 0 ? (stats.occupiedRooms / stats.totalRooms) * 100 : 0;
    const profitValue = monthlyReport?.profitLoss || 0;
    return { occupancyRate: rate, profit: profitValue };
  }, [stats.totalRooms, stats.occupiedRooms, monthlyReport?.profitLoss]);

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
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600 mt-1 sm:mt-2 text-sm sm:text-base">Overview of your property management system</p>
        </div>

        {/* Stats Grid - Using memoized components */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
          <StatCard
            title="Total Branches"
            value={stats.totalBranches}
            subtitle="Property locations"
            icon={BuildingOfficeIcon}
            color="text-blue-600"
            isLoading={isLoading}
          />
          
          <StatCard
            title="Room Occupancy"
            value={`${stats.occupiedRooms}/${stats.totalRooms}`}
            subtitle={`${occupancyRate.toFixed(1)}% occupancy rate`}
            icon={HomeIcon}
            color="text-green-600"
            isLoading={isLoading}
          />
          
          <StatCard
            title="Active Tenants"
            value={stats.activeTenants}
            subtitle="Current residents"
            icon={UsersIcon}
            color="text-purple-600"
            isLoading={isLoading}
          />
          
          <StatCard
            title="Monthly Profit"
            value={formatCurrency(profit)}
            subtitle={`${selectedMonth} profit/loss`}
            icon={profit >= 0 ? ArrowTrendingUpIcon : ArrowTrendingDownIcon}
            color={profit >= 0 ? "text-green-600" : "text-red-600"}
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
      </div>
    </div>
  );
}

export default memo(DashboardPage);
