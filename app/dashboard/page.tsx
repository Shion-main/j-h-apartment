'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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

function DashboardPage() {
  // Cache for API responses to avoid unnecessary re-fetching
  const [reportCache, setReportCache] = useState<Map<string, ConsolidatedReport>>(new Map());
  const [statsCache, setStatsCache] = useState<DashboardStats | null>(null);
  
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
  // Fixed to summary view only for dashboard
  const reportType = 'summary';
  const supabase = createClientComponentClient();
  const { toast } = useToast();

  // Debounced month selection to prevent rapid API calls
  const [tempSelectedMonth, setTempSelectedMonth] = useState(selectedMonth);
  
  // Debounce month changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (tempSelectedMonth !== selectedMonth) {
        setSelectedMonth(tempSelectedMonth);
      }
    }, 300); // 300ms debounce
    
    return () => clearTimeout(timeoutId);
  }, [tempSelectedMonth, selectedMonth]);

  // Separate useEffect for dashboard stats (only run once or when stats are invalidated)
  useEffect(() => {
    if (!statsCache) {
      fetchDashboardStats();
    } else {
      setStats(statsCache);
      setIsLoading(false);
    }
  }, [statsCache]); // Remove fetchDashboardStats dependency to avoid circular reference

  // Separate useEffect for reports (with caching)
  useEffect(() => {
    const cacheKey = `${selectedMonth}-${reportType}`;
    const cachedReport = reportCache.get(cacheKey);
    
    if (cachedReport) {
      // Use cached data immediately
      setConsolidatedReport(cachedReport);
      processConsolidatedData(cachedReport, selectedMonth);
      setIsLoadingReport(false);
    } else {
      // Fetch new data
      fetchConsolidatedReport();
    }
  }, [selectedMonth, reportType, reportCache]);

  // Memoized function to process consolidated data
  const processConsolidatedData = useCallback((data: ConsolidatedReport, selectedMonth: string) => {
    const [year, month] = selectedMonth.split('-');
    
    // Create summary data compatible with existing monthlyReport interface
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

    setReportCache(prev => {
      const newCache = new Map(prev);
      newCache.set(selectedMonth, data);
      return newCache;
    });
  }, []);

  const fetchConsolidatedReport = useCallback(async () => {
    const cacheKey = `${selectedMonth}-${reportType}`;
    
    setIsLoadingReport(true);
    try {
      const [year, month] = selectedMonth.split('-');
      const response = await fetch(`/api/reports/consolidated-json?month=${month}&year=${year}`);
      
      if (response.ok) {
        const data = await response.json();
        const consolidatedData = data.data;
        
        // Cache the response
        setReportCache(prev => new Map(prev).set(cacheKey, consolidatedData));
        setConsolidatedReport(consolidatedData);
        
        processConsolidatedData(consolidatedData, selectedMonth);
      } else {
        console.error('Failed to fetch consolidated report');
        setConsolidatedReport(null);
        setMonthlyReport(null);
        
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
      toast({
        title: "Error",
        description: "Failed to fetch reports. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoadingReport(false);
    }
  }, [selectedMonth, reportType, processConsolidatedData]);

  const fetchDashboardStats = useCallback(async () => {
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

      const newStats = {
        totalBranches: branches?.length || 0,
        totalRooms: branches?.reduce((total, branch) => total + (branch.rooms?.length || 0), 0) || 0,
        occupiedRooms: branches?.reduce((total, branch) => total + (branch.rooms?.filter(room => room.is_occupied)?.length || 0), 0) || 0,
        activeTenants: activeTenants?.length || 0,
        monthlyIncome,
        monthlyExpenses
      };

      setStats(newStats);
      setStatsCache(newStats); // Cache the stats

      setIsLoading(false);
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      setIsLoading(false);
    }
  }, [supabase, consolidatedReport, selectedMonth]);

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

  // Memoized computed values to prevent unnecessary recalculations
  const occupancyRate = useMemo(() => {
    return stats.totalRooms > 0 ? (stats.occupiedRooms / stats.totalRooms) * 100 : 0;
  }, [stats.totalRooms, stats.occupiedRooms]);

  const profit = useMemo(() => {
    return monthlyReport?.profitLoss || 0;
  }, [monthlyReport?.profitLoss]);

  // Memoized currency formatter
  const formatCurrency = useCallback((amount: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP'
    }).format(amount);
  }, []);

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

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8">
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
                      value={tempSelectedMonth}
                      onChange={(e) => setTempSelectedMonth(e.target.value)}
                      className="w-full sm:w-auto"
                    />
                    {tempSelectedMonth !== selectedMonth && (
                      <div className="text-xs text-gray-500 italic whitespace-nowrap">
                        Loading...
                      </div>
                    )}
                  </div>
                </div>

                {/* Report Summary */}
                {isLoadingReport ? (
                  <div className="space-y-2">
                    <div className="h-4 bg-gray-200 rounded animate-pulse"></div>
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4"></div>
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-1/2"></div>
                  </div>
                ) : monthlyReport ? (
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
                ) : (
                  <div className="text-center py-4 text-gray-500">
                    <div className="text-sm">No data available</div>
                    <div className="text-xs mt-1">Select a different month</div>
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row flex-wrap gap-2 pt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const [year, month] = selectedMonth.split('-');
                      window.open(`/api/reports/consolidated-excel?month=${month}&year=${year}`, '_blank');
                    }}
                    disabled={!monthlyReport}
                    className="flex items-center justify-center space-x-1 w-full sm:w-auto"
                  >
                    <DocumentArrowDownIcon className="h-4 w-4" />
                    <span>Download Report</span>
                  </Button>

                  <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
                    <DialogTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!monthlyReport}
                        className="flex items-center justify-center space-x-1 w-full sm:w-auto"
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

// Memoized components for better performance
const StatsCard = React.memo(({ 
  title, 
  value, 
  icon: Icon, 
  description, 
  trend 
}: {
  title: string;
  value: string | number;
  icon: any;
  description?: string;
  trend?: 'up' | 'down' | 'neutral';
}) => (
  <Card>
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-gray-600">{title}</CardTitle>
      <Icon className="h-4 w-4 text-gray-600" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold text-gray-900">{value}</div>
      {description && (
        <p className="text-xs text-gray-600 mt-1">{description}</p>
      )}
    </CardContent>
  </Card>
));
StatsCard.displayName = 'StatsCard';

const MonthSelector = React.memo(({ 
  tempSelectedMonth, 
  selectedMonth, 
  onMonthChange 
}: {
  tempSelectedMonth: string;
  selectedMonth: string;
  onMonthChange: (month: string) => void;
}) => (
  <div className="flex items-center space-x-2">
    <label htmlFor="month-select" className="text-sm font-medium text-gray-700">
      Select Month:
    </label>
    <Input
      id="month-select"
      type="month"
      value={tempSelectedMonth}
      onChange={(e) => onMonthChange(e.target.value)}
      className="w-auto"
    />
    {tempSelectedMonth !== selectedMonth && (
      <div className="text-xs text-gray-500 italic">
        Loading...
      </div>
    )}
  </div>
));
MonthSelector.displayName = 'MonthSelector';

export default React.memo(DashboardPage);
