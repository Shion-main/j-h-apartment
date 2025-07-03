'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { 
  DocumentArrowDownIcon,
  EnvelopeIcon,
  ChartBarIcon,
  TableCellsIcon,
  BuildingOfficeIcon,
  UsersIcon,
  CurrencyDollarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  HomeIcon,
  ClockIcon
} from '@heroicons/react/24/outline';

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

export default function ReportsPage() {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });
  const [selectedYear, setSelectedYear] = useState(() => new Date().getFullYear().toString());
  const [consolidatedReport, setConsolidatedReport] = useState<ConsolidatedReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailAddresses, setEmailAddresses] = useState('');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [reportType, setReportType] = useState<'monthly' | 'yearly'>('monthly');
  
  // Performance optimization states
  const [tempSelectedMonth, setTempSelectedMonth] = useState(selectedMonth);
  const [tempSelectedYear, setTempSelectedYear] = useState(selectedYear);
  
  // In-memory cache for reports
  const reportCache = useMemo(() => new Map<string, ConsolidatedReport>(), []);
  
  // Comprehensive report state
  const [comprehensiveEmailDialogOpen, setComprehensiveEmailDialogOpen] = useState(false);
  const [comprehensiveEmailAddress, setComprehensiveEmailAddress] = useState('');
  const [isSendingComprehensiveEmail, setIsSendingComprehensiveEmail] = useState(false);
  const [comprehensiveReportData, setComprehensiveReportData] = useState<any>(null);
  
  const { toast } = useToast();

  // Debounced month/year selection
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (tempSelectedMonth !== selectedMonth) {
        setSelectedMonth(tempSelectedMonth);
      }
    }, 300); // 300ms debounce
    
    return () => clearTimeout(timeoutId);
  }, [tempSelectedMonth, selectedMonth]);

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (tempSelectedYear !== selectedYear) {
        setSelectedYear(tempSelectedYear);
      }
    }, 300); // 300ms debounce
    
    return () => clearTimeout(timeoutId);
  }, [tempSelectedYear, selectedYear]);

  // Memoized fetch with caching
  const fetchConsolidatedReport = useCallback(async () => {
    const cacheKey = `${reportType}-${reportType === 'monthly' ? selectedMonth : selectedYear}`;
    const cachedReport = reportCache.get(cacheKey);
    
    if (cachedReport) {
      setConsolidatedReport(cachedReport);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      let url: string;
      if (reportType === 'monthly') {
        const [year, month] = selectedMonth.split('-');
        url = `/api/reports/consolidated-json?month=${month}&year=${year}`;
      } else {
        url = `/api/reports/consolidated-json?year=${selectedYear}`;
      }
      
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        setConsolidatedReport(data.data);
        // Cache the result
        reportCache.set(cacheKey, data.data);
      } else {
        setConsolidatedReport(null);
      }
    } catch (error) {
      setConsolidatedReport(null);
    } finally {
      setIsLoading(false);
    }
  }, [selectedMonth, selectedYear, reportType, reportCache]);

  useEffect(() => {
    fetchConsolidatedReport();
  }, [fetchConsolidatedReport]);

  const fetchComprehensiveReport = async () => {
    try {
      const [year, month] = selectedMonth.split('-');
      const response = await fetch(`/api/reports/detailed?month=${month}&year=${year}`, {
        method: 'GET'
      });

      if (response.ok) {
        const data = await response.json();
        setComprehensiveReportData(data.data);
      } else {
        console.error('Failed to fetch comprehensive report');
        setComprehensiveReportData(null);
      }
    } catch (error) {
      console.error('Error fetching comprehensive report:', error);
      setComprehensiveReportData(null);
    }
  };

  const downloadReport = async () => {
    try {
      const [year, month] = selectedMonth.split('-');
      const url = reportType === 'monthly' 
        ? `/api/reports/consolidated-excel?month=${month}&year=${year}`
        : `/api/reports/consolidated-excel/yearly?year=${selectedYear}`;
      
      const response = await fetch(url);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = reportType === 'monthly'
        ? `consolidated_report_${selectedMonth}.xlsx`
        : `yearly_report_${selectedYear}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading report:', error);
      toast({
        title: "Error",
        description: "Failed to download report",
        variant: "destructive"
      });
    }
  };

  const sendReportEmail = async () => {
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
      const emails = emailAddresses.split(',').map(email => email.trim()).filter(Boolean);
      const [year, month] = selectedMonth.split('-');
      
      const response = await fetch(reportType === 'monthly' 
        ? '/api/reports/monthly/send-email'
        : '/api/reports/yearly/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          emails,
          month: reportType === 'monthly' ? month : undefined,
          year: reportType === 'monthly' ? year : selectedYear
        })
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: `${reportType === 'monthly' ? 'Monthly' : 'Yearly'} report sent to ${emails.length} recipient(s)`
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
        description: `Failed to send ${reportType} report email`,
        variant: "destructive"
      });
    } finally {
      setIsSendingEmail(false);
    }
  };

  const sendComprehensiveReportEmail = async () => {
    if (!comprehensiveEmailAddress.trim()) {
      toast({
        title: "Error",
        description: "Please enter an email address",
        variant: "destructive"
      });
      return;
    }

    if (!comprehensiveReportData) {
      toast({
        title: "Error", 
        description: "No comprehensive report data available for the selected month",
        variant: "destructive"
      });
      return;
    }

    setIsSendingComprehensiveEmail(true);
    try {
      const [year, month] = selectedMonth.split('-');
      
      const response = await fetch('/api/reports/detailed/send-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: comprehensiveEmailAddress.trim(),
          month: month,
          year: year
        })
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: "Success",
          description: "Comprehensive monthly report sent successfully"
        });
        setComprehensiveEmailDialogOpen(false);
        setComprehensiveEmailAddress('');
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.error || "Failed to send comprehensive report email",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error sending comprehensive report email:', error);
      toast({
        title: "Error",
        description: "Failed to send comprehensive report email",
        variant: "destructive"
      });
    } finally {
      setIsSendingComprehensiveEmail(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return `₱${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-PH');
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'fully_paid': return 'bg-green-100 text-green-800';
      case 'partially_paid': return 'bg-yellow-100 text-yellow-800';
      case 'active': case 'unpaid': return 'bg-red-100 text-red-800';
      case 'overdue': return 'bg-red-100 text-red-800';
      case 'pending': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
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
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <ChartBarIcon className="h-6 w-6 lg:h-8 lg:w-8 text-blue-600" />
                </div>
                Financial Reports
              </h1>
              <p className="text-gray-600 mt-2 text-sm lg:text-base">Comprehensive financial and operational insights across all branches</p>
            </div>
            
            {consolidatedReport && (
              <div className="text-left lg:text-right">
                <p className="text-xl lg:text-2xl font-bold text-gray-900">{consolidatedReport.month}</p>
                <p className="text-sm text-gray-500">Report Period</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 lg:p-6 mb-6 lg:mb-8">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <Button
                variant={reportType === 'monthly' ? 'default' : 'outline'}
                onClick={() => setReportType('monthly')}
                className="flex items-center gap-2 w-full sm:w-auto"
              >
                <TableCellsIcon className="h-4 w-4" />
                Monthly Report
              </Button>
              <Button
                variant={reportType === 'yearly' ? 'default' : 'outline'}
                onClick={() => setReportType('yearly')}
                className="flex items-center gap-2 w-full sm:w-auto"
              >
                <ChartBarIcon className="h-4 w-4" />
                Yearly Report
              </Button>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              {reportType === 'monthly' ? (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full">
                  <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Select Month:</label>
                  <Input
                    type="month"
                    value={tempSelectedMonth}
                    onChange={(e) => setTempSelectedMonth(e.target.value)}
                    className="w-full sm:w-48"
                  />
                  {tempSelectedMonth !== selectedMonth && (
                    <div className="text-xs text-gray-500 italic">
                      Loading...
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 w-full">
                  <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Select Year:</label>
                  <Input
                    type="number"
                    value={tempSelectedYear}
                    onChange={(e) => setTempSelectedYear(e.target.value)}
                    min="2020"
                    max="2100"
                    className="w-full sm:w-32"
                  />
                  {tempSelectedYear !== selectedYear && (
                    <div className="text-xs text-gray-500 italic">
                      Loading...
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 lg:ml-auto">
              <Button onClick={downloadReport} className="flex items-center justify-center gap-2 w-full sm:w-auto">
                <DocumentArrowDownIcon className="h-4 w-4" />
                Download Excel
              </Button>

              <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" className="flex items-center justify-center gap-2 w-full sm:w-auto">
                    <EnvelopeIcon className="h-4 w-4" />
                    Send Report
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md mx-4">
                  <DialogHeader>
                    <DialogTitle>Send Report via Email</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Email Addresses (comma-separated)</label>
                      <Input
                        placeholder="email1@example.com, email2@example.com"
                        value={emailAddresses}
                        onChange={(e) => setEmailAddresses(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end gap-4">
                    <Button variant="outline" onClick={() => setEmailDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={sendReportEmail} disabled={isSendingEmail}>
                      {isSendingEmail ? 'Sending...' : 'Send'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600 font-medium">Loading report data...</p>
            <p className="text-sm text-gray-500 mt-1">Please wait while we fetch the latest financial data</p>
          </div>
        </div>
      ) : !consolidatedReport ? (
        <div className="text-center py-16">
          <div className="mx-auto w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <TableCellsIcon className="h-8 w-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Data Available</h3>
          <p className="text-gray-500 max-w-md mx-auto">
            No report data is available for the selected month. This could be because no transactions occurred during this period or the data hasn't been processed yet.
          </p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6 mb-6 lg:mb-8">
            <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-600 truncate">Total Income</p>
                    <p className="text-xl lg:text-2xl font-bold text-gray-900 truncate">
                      {formatCurrency(consolidatedReport.overallSnapshot.reduce((sum, branch) => sum + branch.totalIncome, 0))}
                    </p>
                  </div>
                  <div className="p-2 lg:p-3 bg-blue-50 rounded-full flex-shrink-0">
                    <ArrowTrendingUpIcon className="h-5 w-5 lg:h-6 lg:w-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-600 truncate">Total Expenses</p>
                    <p className="text-xl lg:text-2xl font-bold text-gray-900 truncate">
                      {formatCurrency(consolidatedReport.overallSnapshot.reduce((sum, branch) => sum + branch.totalExpenses, 0))}
                    </p>
                  </div>
                  <div className="p-2 lg:p-3 bg-blue-50 rounded-full flex-shrink-0">
                    <ArrowTrendingDownIcon className="h-5 w-5 lg:h-6 lg:w-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-600 truncate">Net Profit/Loss</p>
                    <p className={`text-xl lg:text-2xl font-bold truncate ${
                      consolidatedReport.overallSnapshot.reduce((sum, branch) => sum + branch.netProfitLoss, 0) >= 0 
                        ? 'text-blue-600' 
                        : 'text-gray-900'
                    }`}>
                      {formatCurrency(consolidatedReport.overallSnapshot.reduce((sum, branch) => sum + branch.netProfitLoss, 0))}
                    </p>
                  </div>
                  <div className="p-2 lg:p-3 bg-blue-50 rounded-full flex-shrink-0">
                    <CurrencyDollarIcon className="h-5 w-5 lg:h-6 lg:w-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="p-4 lg:p-6">
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-600 truncate">Active Tenants</p>
                    <p className="text-xl lg:text-2xl font-bold text-gray-900">
                      {consolidatedReport.tenantRoomStatus.reduce((sum, branch) => sum + branch.activeTenants, 0)}
                    </p>
                  </div>
                  <div className="p-2 lg:p-3 bg-blue-50 rounded-full flex-shrink-0">
                    <UsersIcon className="h-5 w-5 lg:h-6 lg:w-6 text-blue-600" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* SECTION 1: Overall Monthly Snapshot */}
          <Card className="mb-6 lg:mb-8 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <ChartBarIcon className="h-5 w-5 lg:h-6 lg:w-6 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-lg lg:text-xl font-semibold text-gray-900">Overall Monthly Snapshot</CardTitle>
                  <CardDescription className="text-gray-600 mt-1">Income, expenses, and profit/loss by branch</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {consolidatedReport.overallSnapshot.map((branch: any, idx: number) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-6 hover:shadow-sm transition-shadow">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <BuildingOfficeIcon className="h-5 w-5 text-blue-600" />
                        {branch.branch}
                      </h3>
                      <div className={`px-3 py-1 rounded-full text-sm font-medium border ${
                        branch.netProfitLoss >= 0 
                          ? 'border-blue-200 text-blue-700 bg-blue-50' 
                          : 'border-gray-200 text-gray-700 bg-gray-50'
                      }`}>
                        Net: {formatCurrency(branch.netProfitLoss)}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {/* Income Section */}
                      <div className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                        <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                          <ArrowTrendingUpIcon className="h-4 w-4 text-blue-600" />
                          Income Breakdown
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Rent:</span>
                            <span className="font-mono font-medium text-gray-900">{formatCurrency(branch.rent)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Electricity:</span>
                            <span className="font-mono font-medium text-gray-900">{formatCurrency(branch.electricity)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Water:</span>
                            <span className="font-mono font-medium text-gray-900">{formatCurrency(branch.water)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Extra Fees:</span>
                            <span className="font-mono font-medium text-gray-900">{formatCurrency(branch.extraFees)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Penalties:</span>
                            <span className="font-mono font-medium text-gray-900">{formatCurrency(branch.penalty)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Forfeited Deposits:</span>
                            <span className="font-mono font-medium text-gray-900">{formatCurrency(branch.forfeitedDeposits)}</span>
                          </div>
                          <div className="flex justify-between border-t border-gray-200 pt-2 font-semibold">
                            <span className="text-blue-700">Total Income:</span>
                            <span className="font-mono text-blue-700">{formatCurrency(branch.totalIncome)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Expenses Section */}
                      <div className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                        <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                          <ArrowTrendingDownIcon className="h-4 w-4 text-blue-600" />
                          Expenses Breakdown
                        </h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Company Expenses:</span>
                            <span className="font-mono font-medium text-gray-900">{formatCurrency(branch.companyExpenses)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Deposits Refunded:</span>
                            <span className="font-mono font-medium text-gray-900">{formatCurrency(branch.depositsRefunded)}</span>
                          </div>
                          <div className="flex justify-between border-t border-gray-200 pt-2 font-semibold">
                            <span className="text-gray-800">Total Expenses:</span>
                            <span className="font-mono text-gray-800">{formatCurrency(branch.totalExpenses)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Summary Section */}
                      <div className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors">
                        <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                          <CurrencyDollarIcon className="h-4 w-4 text-blue-600" />
                          Financial Summary
                        </h4>
                        <div className="space-y-3">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-blue-600 font-mono">
                              {formatCurrency(branch.totalIncome)}
                            </div>
                            <div className="text-xs text-gray-600">Total Revenue</div>
                          </div>
                          <div className="text-center">
                            <div className="text-2xl font-bold text-gray-700 font-mono">
                              {formatCurrency(branch.totalExpenses)}
                            </div>
                            <div className="text-xs text-gray-600">Total Costs</div>
                          </div>
                          <div className="text-center border-t border-gray-200 pt-3">
                            <div className={`text-2xl font-bold font-mono ${
                              branch.netProfitLoss >= 0 ? 'text-blue-600' : 'text-gray-700'
                            }`}>
                              {formatCurrency(branch.netProfitLoss)}
                            </div>
                            <div className="text-xs text-gray-600">Net Profit/Loss</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* SECTION 2: Tenant & Room Status Overview */}
          <Card className="mb-6 lg:mb-8 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <UsersIcon className="h-5 w-5 lg:h-6 lg:w-6 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-lg lg:text-xl font-semibold text-gray-900">Tenant & Room Status Overview</CardTitle>
                  <CardDescription className="text-gray-600 mt-1">Occupancy and movement by branch</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {consolidatedReport.tenantRoomStatus.map((branch: any, idx: number) => (
                  <div key={idx} className="border border-gray-200 rounded-lg p-6 hover:shadow-sm transition-shadow">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                        <BuildingOfficeIcon className="h-5 w-5 text-blue-600" />
                        {branch.branch}
                      </h3>
                      <div className="text-sm text-gray-500">
                        Total: {branch.activeTenants + branch.vacantRooms} rooms
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="border border-gray-200 rounded-lg p-4 text-center hover:bg-gray-50 transition-colors">
                        <div className="flex items-center justify-center w-12 h-12 bg-blue-50 rounded-full mx-auto mb-2">
                          <UsersIcon className="h-6 w-6 text-blue-600" />
                        </div>
                        <div className="text-2xl font-bold text-gray-900">{branch.activeTenants}</div>
                        <div className="text-sm text-gray-600 font-medium">Active Tenants</div>
                      </div>
                      
                      <div className="border border-gray-200 rounded-lg p-4 text-center hover:bg-gray-50 transition-colors">
                        <div className="flex items-center justify-center w-12 h-12 bg-blue-50 rounded-full mx-auto mb-2">
                          <HomeIcon className="h-6 w-6 text-blue-600" />
                        </div>
                        <div className="text-2xl font-bold text-gray-900">{branch.vacantRooms}</div>
                        <div className="text-sm text-gray-600 font-medium">Vacant Rooms</div>
                      </div>
                      
                      <div className="border border-gray-200 rounded-lg p-4 text-center hover:bg-gray-50 transition-colors">
                        <div className="flex items-center justify-center w-12 h-12 bg-blue-50 rounded-full mx-auto mb-2">
                          <ArrowTrendingUpIcon className="h-6 w-6 text-blue-600" />
                        </div>
                        <div className="text-2xl font-bold text-gray-900">{branch.newTenants}</div>
                        <div className="text-sm text-gray-600 font-medium">New Tenants</div>
                      </div>
                      
                      <div className="border border-gray-200 rounded-lg p-4 text-center hover:bg-gray-50 transition-colors">
                        <div className="flex items-center justify-center w-12 h-12 bg-blue-50 rounded-full mx-auto mb-2">
                          <ArrowTrendingDownIcon className="h-6 w-6 text-blue-600" />
                        </div>
                        <div className="text-2xl font-bold text-gray-900">{branch.movedOutTenants}</div>
                        <div className="text-sm text-gray-600 font-medium">Moved Out</div>
                      </div>
                    </div>
                    
                    {/* Progress bar for occupancy */}
                    <div className="mt-4">
                      <div className="flex justify-between text-sm text-gray-600 mb-1">
                        <span>Occupancy Rate</span>
                        <span>{((branch.activeTenants / (branch.activeTenants + branch.vacantRooms)) * 100).toFixed(1)}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                          style={{ 
                            width: `${(branch.activeTenants / (branch.activeTenants + branch.vacantRooms)) * 100}%` 
                          }}
                        ></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* SECTION 3: Detailed Billing & Payment Breakdown */}
          <Card className="mb-6 lg:mb-8 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <TableCellsIcon className="h-5 w-5 lg:h-6 lg:w-6 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-lg lg:text-xl font-semibold text-gray-900">Detailed Billing & Payment Breakdown</CardTitle>
                  <CardDescription className="text-gray-600 mt-1">All bills and payments for the period</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {consolidatedReport.detailedBilling.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <TableCellsIcon className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p>No billing data available for this period</p>
                  </div>
                ) : (
                  consolidatedReport.detailedBilling.map((row: any, idx: number) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-3">
                        <div className="flex items-center gap-3 mb-2 lg:mb-0">
                          <div className="flex items-center gap-2">
                            <BuildingOfficeIcon className="h-4 w-4 text-blue-600" />
                            <span className="font-medium text-gray-900">{row.branch}</span>
                          </div>
                          <div className="text-gray-400">•</div>
                          <div className="flex items-center gap-2">
                            <HomeIcon className="h-4 w-4 text-gray-500" />
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800">
                              Room {row.roomNumber}
                            </span>
                          </div>
                        </div>
                        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(row.status)}`}>
                          {row.status}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {/* Tenant Info */}
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                            <UsersIcon className="h-4 w-4 text-blue-600" />
                            Tenant Details
                          </h4>
                          <div className="text-sm space-y-1">
                            <div><span className="text-gray-600">Name:</span> <span className="font-medium">{row.tenantName}</span></div>
                            <div><span className="text-gray-600">Period:</span> <span className="font-mono">{row.billingPeriod}</span></div>
                            <div><span className="text-gray-600">Due Date:</span> <span className="font-mono">{formatDate(row.dueDate)}</span></div>
                          </div>
                        </div>

                        {/* Billing Info */}
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                            <CurrencyDollarIcon className="h-4 w-4 text-blue-600" />
                            Billing Summary
                          </h4>
                          <div className="text-sm space-y-1">
                            <div className="flex justify-between">
                              <span className="text-gray-600">Original Total:</span>
                              <span className="font-mono font-medium">{formatCurrency(row.originalTotal)}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-gray-600">Total Paid:</span>
                              <span className="font-mono font-medium text-blue-600">{formatCurrency(row.totalPaid)}</span>
                            </div>
                            <div className="flex justify-between border-t border-gray-200 pt-1">
                              <span className="text-gray-600">Balance:</span>
                              <span className={`font-mono font-semibold ${
                                (row.originalTotal - row.totalPaid) > 0 ? 'text-gray-700' : 'text-blue-600'
                              }`}>
                                {formatCurrency(row.originalTotal - row.totalPaid)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Payment Info */}
                        <div className="space-y-2">
                          <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
                            <ClockIcon className="h-4 w-4 text-blue-600" />
                            Payment Details
                          </h4>
                          <div className="text-sm space-y-1">
                            <div><span className="text-gray-600">Date:</span> <span className="font-mono">{row.paymentDate ? formatDate(row.paymentDate) : 'Not paid'}</span></div>
                            <div>
                              <span className="text-gray-600">Method:</span> 
                              {row.paymentMethod ? (
                                <span className="ml-2 inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-blue-50 text-blue-700">
                                  {row.paymentMethod}
                                </span>
                              ) : (
                                <span className="ml-1 text-gray-400">-</span>
                              )}
                            </div>
                            <div><span className="text-gray-600">Amount:</span> <span className="font-mono font-medium">{formatCurrency(Number(row.paymentAmount) || 0)}</span></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>

          {/* SECTION 4: Company Expenses Breakdown */}
          <Card className="mb-6 lg:mb-8 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <CurrencyDollarIcon className="h-5 w-5 lg:h-6 lg:w-6 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-lg lg:text-xl font-semibold text-gray-900">Company Expenses Breakdown</CardTitle>
                  <CardDescription className="text-gray-600 mt-1">All company expenses for the period</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {consolidatedReport.companyExpenses.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <CurrencyDollarIcon className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p>No expense data available for this period</p>
                  </div>
                ) : (
                  consolidatedReport.companyExpenses.map((row: any, idx: number) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-3">
                        <div className="flex items-center gap-3 mb-2 sm:mb-0">
                          <BuildingOfficeIcon className="h-4 w-4 text-blue-600" />
                          <span className="font-medium text-gray-900">{row.branch}</span>
                          <div className="text-gray-400">•</div>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                            {row.category}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-sm text-gray-600 font-mono">{formatDate(row.expenseDate)}</span>
                          <span className="text-lg font-bold text-gray-900 font-mono">{formatCurrency(row.amount)}</span>
                        </div>
                      </div>
                      
                      <div className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start gap-2">
                          <ArrowTrendingDownIcon className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm text-gray-700 font-medium mb-1">Expense Description</p>
                            <p className="text-sm text-gray-600 break-words">{row.description}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {consolidatedReport.companyExpenses.length > 0 && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-gray-700">Total Expenses:</span>
                    <span className="text-lg font-bold text-gray-900 font-mono">
                      {formatCurrency(consolidatedReport.companyExpenses.reduce((sum, expense) => sum + expense.amount, 0))}
                    </span>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* SECTION 5: Tenant Movement Breakdown */}
          <Card className="mb-6 lg:mb-8 border border-gray-200 shadow-sm hover:shadow-md transition-shadow">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <ArrowTrendingUpIcon className="h-5 w-5 lg:h-6 lg:w-6 text-blue-600" />
                </div>
                <div>
                  <CardTitle className="text-lg lg:text-xl font-semibold text-gray-900">Tenant Movement Breakdown</CardTitle>
                  <CardDescription className="text-gray-600 mt-1">Move-ins and move-outs for the period</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 max-h-96 overflow-y-auto">
                {consolidatedReport.tenantMovement.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <ArrowTrendingUpIcon className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p>No tenant movement data available for this period</p>
                  </div>
                ) : (
                  consolidatedReport.tenantMovement.map((row: any, idx: number) => (
                    <div key={idx} className="border border-gray-200 rounded-lg p-4 hover:shadow-sm transition-shadow">
                      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-3">
                        <div className="flex items-center gap-3 mb-2 lg:mb-0">
                          <div className="flex items-center gap-2">
                            <BuildingOfficeIcon className="h-4 w-4 text-blue-600" />
                            <span className="font-medium text-gray-900">{row.branch}</span>
                          </div>
                          <div className="text-gray-400">•</div>
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${
                              row.type === 'Move In' 
                                ? 'border-blue-200 text-blue-700 bg-blue-50' 
                                : 'border-gray-200 text-gray-700 bg-gray-50'
                            }`}>
                              {row.type}
                            </span>
                          </div>
                          {row.roomNumber && (
                            <>
                              <div className="text-gray-400">•</div>
                              <div className="flex items-center gap-2">
                                <HomeIcon className="h-4 w-4 text-gray-500" />
                                <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 text-gray-800">
                                  Room {row.roomNumber}
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                        <div className="text-sm text-gray-600 font-mono">
                          {formatDate(row.date)}
                        </div>
                      </div>
                      
                      <div className="mb-3">
                        <div className="flex items-center gap-2 mb-2">
                          <UsersIcon className="h-4 w-4 text-blue-600" />
                          <span className="font-medium text-gray-900">{row.fullName}</span>
                        </div>
                      </div>

                      {/* Financial Details */}
                      {row.type === 'Move In' ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors">
                            <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                              <CurrencyDollarIcon className="h-4 w-4 text-blue-600" />
                              Move-In Payments
                            </h4>
                            <div className="space-y-1 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Advance Payment:</span>
                                <span className="font-mono font-medium text-blue-600">{formatCurrency(row.advancePayment || 0)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Security Deposit:</span>
                                <span className="font-mono font-medium text-blue-600">{formatCurrency(row.securityDeposit || 0)}</span>
                              </div>
                              <div className="flex justify-between border-t border-gray-200 pt-1 font-semibold">
                                <span className="text-blue-700">Total Collected:</span>
                                <span className="font-mono text-blue-700">{formatCurrency((row.advancePayment || 0) + (row.securityDeposit || 0))}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors">
                            <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                              <CurrencyDollarIcon className="h-4 w-4 text-blue-600" />
                              Final Settlement
                            </h4>
                            <div className="space-y-1 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Final Bill Total:</span>
                                <span className="font-mono font-medium text-gray-700">{formatCurrency(row.finalBillTotal || 0)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Deposits Used:</span>
                                <span className="font-mono font-medium text-gray-700">{formatCurrency(row.depositsUsed || 0)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="border border-gray-200 rounded-lg p-3 hover:bg-gray-50 transition-colors">
                            <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                              <ArrowTrendingDownIcon className="h-4 w-4 text-blue-600" />
                              Deposit Refund
                            </h4>
                            <div className="space-y-1 text-sm">
                              <div className="flex justify-between">
                                <span className="text-gray-600">Amount Refunded:</span>
                                <span className="font-mono font-medium text-blue-600">{formatCurrency(row.depositsRefunded || 0)}</span>
                              </div>
                              <div className="flex justify-between border-t border-gray-200 pt-1">
                                <span className="text-gray-600">Net Impact:</span>
                                <span className={`font-mono font-semibold ${
                                  ((row.depositsUsed || 0) - (row.depositsRefunded || 0)) >= 0 
                                    ? 'text-blue-600' 
                                    : 'text-gray-700'
                                }`}>
                                  {formatCurrency((row.depositsUsed || 0) - (row.depositsRefunded || 0))}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
      </div>
    </div>
  );
}