'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCurrency, formatDate, formatAuditAction, formatTimestamp } from '@/lib/utils';
import type { Bill, Tenant, AuditLog } from '@/types/database';
import { 
  History as HistoryIcon,
  FileText,
  Users,
  Shield,
  Calendar,
  Search,
  Filter,
  Loader2,
  Receipt,
  UserX,
  Activity,
  Eye,
  X,
  Check,
  AlertCircle,
  Building2,
  Home,
  User,
  CreditCard,
  Zap,
  Droplets
} from 'lucide-react';

type HistoryTab = 'audit-logs' | 'paid-bills' | 'moved-out-tenants';

export default function HistoryPage() {
  const [activeTab, setActiveTab] = useState<HistoryTab>('audit-logs');
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [actionFilter, setActionFilter] = useState('all');
  
  // Dialog states
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [isBillDetailsOpen, setIsBillDetailsOpen] = useState(false);

  // Data states
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [paidBills, setPaidBills] = useState<Bill[]>([]);
  const [movedOutTenants, setMovedOutTenants] = useState<Tenant[]>([]);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setIsLoading(true);
    setSearchTerm('');
    setDateFilter('');
    setActionFilter('all');
    try {
      if (activeTab === 'audit-logs') {
        await fetchAuditLogs();
      } else if (activeTab === 'paid-bills') {
        await fetchPaidBills();
      } else if (activeTab === 'moved-out-tenants') {
        await fetchMovedOutTenants();
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const response = await fetch('/api/audit-logs');
      const result = await response.json();
      if (result.success) {
        setAuditLogs(result.data || []);
      } else {
        console.error('Failed to fetch audit logs:', result.error);
        // You might want to show a toast notification here
      }
    } catch (error) {
      console.error('Error fetching audit logs:', error);
    }
  };

  const fetchPaidBills = async () => {
    try {
      const response = await fetch('/api/bills?status=fully_paid');
      const result = await response.json();
      if (result.success) {
        setPaidBills(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching paid bills:', error);
    }
  };

  const fetchMovedOutTenants = async () => {
    try {
      const response = await fetch('/api/tenants?status=inactive');
      const result = await response.json();
      if (result.success) {
        setMovedOutTenants(result.data || []);
      }
    } catch (error) {
      console.error('Error fetching moved-out tenants:', error);
    }
  };
  
  const uniqueActions = ['all', ...Array.from(new Set(auditLogs.map(log => log.action)))];

  const filteredAuditLogs = auditLogs.filter(log => {
    const userDisplayName = (log as any).user_display_name || '';
    const matchesSearch = searchTerm === '' || 
      log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.target_table.toLowerCase().includes(searchTerm.toLowerCase()) ||
      userDisplayName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesAction = actionFilter === 'all' || log.action === actionFilter;
    
    const matchesDate = dateFilter === '' || 
      new Date(log.timestamp).toISOString().split('T')[0] === dateFilter;
    
    return matchesSearch && matchesAction && matchesDate;
  });

  const filteredPaidBills = paidBills.filter(bill => {
    const tenantName = (bill as any).tenants?.full_name || '';
    const roomNumber = (bill as any).tenants?.rooms?.room_number || '';
    const matchesSearch = searchTerm === '' || 
      tenantName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      roomNumber.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
  });

  const filteredMovedOutTenants = movedOutTenants.filter(tenant => {
    const roomNumber = (tenant as any).rooms?.room_number || '';
    const matchesSearch = searchTerm === '' || 
      tenant.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      roomNumber.toLowerCase().includes(searchTerm.toLowerCase());
    
    return matchesSearch;
  });

  // Add a function to format the target table name
  function formatTargetTable(table: string): string {
    // Convert from snake_case or table name to Title Case
    return table.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  }

  // Function to handle viewing log details
  const handleViewDetails = (log: AuditLog) => {
    setSelectedLog(log);
    setIsDetailsOpen(true);
  };

  // Function to handle viewing bill details
  const handleViewBillDetails = (bill: Bill) => {
    setSelectedBill(bill);
    setIsBillDetailsOpen(true);
  };

  // Function to format values for display
  const formatValue = (value: any): string | React.ReactNode => {
    if (value === null || value === undefined) return 'None';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') {
      // Check if it might be a currency value
      if (['amount', 'fee', 'rent', 'deposit', 'payment', 'total', 'charge', 'rate'].some(
        term => String(value).includes(term)
      )) {
        return formatCurrency(value);
      }
      return value.toString();
    }
    if (typeof value === 'object') {
      try {
        // Pretty format JSON objects
        return (
          <pre className="text-xs bg-gray-100 p-2 rounded overflow-x-auto">
            {JSON.stringify(value, null, 2)}
          </pre>
        );
      } catch (e) {
        return JSON.stringify(value);
      }
    }
    return value.toString();
  };

  // Function to parse JSON if it's a string
  const parseJsonValue = (value: any) => {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch (e) {
        return value;
      }
    }
    return value;
  };

  // Function to render changes in a readable format
  const renderChanges = (log: AuditLog) => {
    // Parse old_values and new_values if they're strings
    const oldValues = parseJsonValue(log.old_values);
    const newValues = parseJsonValue(log.new_values);
    
    if (!oldValues && !newValues) {
      return <p className="text-gray-500">No detailed change information available.</p>;
    }
    
    // If it's a creation event with only new values
    if (newValues && !oldValues) {
      return (
        <div>
          <h4 className="text-sm font-medium mb-2">Created with values:</h4>
          <div className="space-y-2">
            {Object.entries(newValues).map(([key, value]) => (
              <div key={key} className="grid grid-cols-1 gap-2 border-b pb-2">
                <span className="text-sm font-medium">{key.replace(/_/g, ' ')}:</span>
                <div className="text-sm">{formatValue(value)}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    
    // If it's a deletion event with only old values
    if (oldValues && !newValues) {
      return (
        <div>
          <h4 className="text-sm font-medium mb-2">Deleted values:</h4>
          <div className="space-y-2">
            {Object.entries(oldValues).map(([key, value]) => (
              <div key={key} className="grid grid-cols-1 gap-2 border-b pb-2">
                <span className="text-sm font-medium">{key.replace(/_/g, ' ')}:</span>
                <div className="text-sm">{formatValue(value)}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    
    // If it's an update with both old and new values
    if (oldValues && newValues) {
      // Get all unique keys from both objects
      const allKeys = [...new Set([...Object.keys(oldValues), ...Object.keys(newValues)])];
      
      return (
        <div>
          <h4 className="text-sm font-medium mb-2">Changes:</h4>
          <div className="space-y-3">
            {allKeys.map(key => {
              const oldValue = oldValues[key];
              const newValue = newValues[key];
              const hasChanged = JSON.stringify(oldValue) !== JSON.stringify(newValue);
              
              // Skip unchanged values
              if (!hasChanged && oldValue !== undefined) return null;
              
              return (
                <div key={key} className="border-b pb-2">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium">{key.replace(/_/g, ' ')}</span>
                    {hasChanged && <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">Changed</span>}
                  </div>
                  
                  {oldValue !== undefined && (
                    <div className="mb-2">
                      <div className="flex items-center gap-2 mb-1">
                        <X className="h-4 w-4 text-red-500 flex-shrink-0" />
                        <span className="text-sm text-red-700 font-medium">Old value:</span>
                      </div>
                      <div className="pl-6">{formatValue(oldValue)}</div>
                    </div>
                  )}
                  
                  {newValue !== undefined && (
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <Check className="h-4 w-4 text-green-500 flex-shrink-0" />
                        <span className="text-sm text-green-700 font-medium">New value:</span>
                      </div>
                      <div className="pl-6">{formatValue(newValue)}</div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    
    return <p className="text-gray-500">No changes recorded.</p>;
  };

  // Update the audit logs table to make the View Details button clickable
  const renderAuditLogsTable = () => {
    return (
      <div className="rounded-md border">
        <div className="max-h-[600px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-white z-10">
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead className="text-right">Changes</TableHead>
              </TableRow>
            </TableHeader>
          <TableBody>
            {filteredAuditLogs.length > 0 ? (
              filteredAuditLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell>{formatTimestamp(log.timestamp)}</TableCell>
                  <TableCell>{(log as any).user_display_name || 'System'}</TableCell>
                  <TableCell>{formatAuditAction(log.action)}</TableCell>
                  <TableCell>{formatTargetTable(log.target_table)}</TableCell>
                  <TableCell className="text-right">
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleViewDetails(log)}
                      className="flex items-center gap-1"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      View Details
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  No audit logs found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </div>
    );
  };

  // Update the paid bills section to include branch info and view details button
  const renderPaidBillsTable = () => {
    return (
      <div className="rounded-md border">
        <div className="max-h-[600px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-white z-10">
            <TableRow>
              <TableHead>Billing Period</TableHead>
              <TableHead>Tenant</TableHead>
              <TableHead>Total Amount</TableHead>
              <TableHead>Date Paid</TableHead>
              <TableHead className="text-right">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredPaidBills.length > 0 ? (
              filteredPaidBills.map((bill) => {
                // Find the latest payment date (for fully paid bills)
                const payments = bill.payments || [];
                const latestPayment = payments.length > 0 
                  ? payments.sort((a, b) => 
                      new Date(b.payment_date).getTime() - new Date(a.payment_date).getTime()
                    )[0]
                  : null;
                
                return (
                  <TableRow key={bill.id}>
                    <TableCell>{formatDate(bill.billing_period_start)} - {formatDate(bill.billing_period_end)}</TableCell>
                    <TableCell>
                      <div className="font-medium">{(bill as any).tenants?.full_name}</div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <Building2 className="h-3 w-3" />
                        {(bill as any).tenants?.rooms?.branches?.name || 'Unknown Branch'}
                      </div>
                      <div className="text-sm text-muted-foreground flex items-center gap-1">
                        <Home className="h-3 w-3" />
                        Room {(bill as any).tenants?.rooms?.room_number || 'Unknown'}
                      </div>
                    </TableCell>
                    <TableCell>{formatCurrency(bill.total_amount_due)}</TableCell>
                    <TableCell>
                      {latestPayment ? formatDate(latestPayment.payment_date) : 'N/A'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleViewBillDetails(bill)}
                        className="flex items-center gap-1"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View Details
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            ) : (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  No paid bills found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      );
    }
    
    switch (activeTab) {
      case 'audit-logs':
        return (
          <Card>
            <CardHeader>
              <CardTitle>System Activity Logs</CardTitle>
              <CardDescription>Comprehensive audit trail of all system activities.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row gap-4 mb-6">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input 
                      placeholder="Search by action, target, or user..." 
                      className="pl-10"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>
                </div>
                <Select value={actionFilter} onValueChange={setActionFilter}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <Filter className="h-4 w-4 mr-2" />
                    <SelectValue placeholder="Filter by action" />
                  </SelectTrigger>
                  <SelectContent>
                    {uniqueActions.map(action => (
                      <SelectItem key={action} value={action}>
                        {action === 'all' ? 'All Actions' : action}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="date"
                  className="w-full sm:w-auto"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                />
              </div>
              {renderAuditLogsTable()}
            </CardContent>
          </Card>
        );
      case 'paid-bills':
        return (
          <Card>
            <CardHeader>
              <CardTitle>Paid Bills History</CardTitle>
              <CardDescription>Records of all fully settled bills.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search by tenant, room, or branch..." 
                    className="pl-10"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              {renderPaidBillsTable()}
            </CardContent>
          </Card>
        );
      case 'moved-out-tenants':
        return (
          <Card>
            <CardHeader>
              <CardTitle>Moved-Out Tenant History</CardTitle>
              <CardDescription>Records of all tenants who have moved out.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search by tenant name or room..." 
                    className="pl-10"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div className="rounded-md border">
                <div className="max-h-[600px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-white z-10">
                      <TableRow>
                        <TableHead>Tenant</TableHead>
                        <TableHead>Last Room</TableHead>
                        <TableHead>Contract Dates</TableHead>
                        <TableHead>Move-Out Date</TableHead>
                      </TableRow>
                    </TableHeader>
                  <TableBody>
                    {filteredMovedOutTenants.length > 0 ? (
                      filteredMovedOutTenants.map((tenant) => (
                        <TableRow key={tenant.id}>
                          <TableCell>
                            <div className="font-medium">{tenant.full_name}</div>
                            <div className="text-sm text-muted-foreground">{tenant.email_address}</div>
                          </TableCell>
                          <TableCell>
                            <div>Room {(tenant as any).rooms?.room_number || 'N/A'}</div>
                            <div className="text-sm text-muted-foreground">
                              {(tenant as any).rooms?.branches?.name || 'Unknown Branch'}
                            </div>
                          </TableCell>
                          <TableCell>{formatDate(tenant.contract_start_date)} - {formatDate(tenant.contract_end_date)}</TableCell>
                          <TableCell>{formatDate(tenant.move_out_date)}</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={4} className="h-24 text-center">
                          No moved-out tenants found.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 px-3 sm:px-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">History</h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            Comprehensive historical data and audit trails
          </p>
        </div>
      </div>
      <div className="border-b">
        <div className="flex flex-col sm:flex-row sm:space-x-8 space-y-2 sm:space-y-0">
          <button
            onClick={() => setActiveTab('audit-logs')}
            className={`flex items-center space-x-2 py-2 border-b-2 font-medium text-sm w-full sm:w-auto justify-center sm:justify-start ${
              activeTab === 'audit-logs'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Shield className="h-4 w-4" />
            <span>Audit Logs</span>
          </button>
          <button
            onClick={() => setActiveTab('paid-bills')}
            className={`flex items-center space-x-2 py-2 border-b-2 font-medium text-sm w-full sm:w-auto justify-center sm:justify-start ${
              activeTab === 'paid-bills'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Receipt className="h-4 w-4" />
            <span>Fully Paid Bills</span>
          </button>
          <button
            onClick={() => setActiveTab('moved-out-tenants')}
            className={`flex items-center space-x-2 py-2 border-b-2 font-medium text-sm w-full sm:w-auto justify-center sm:justify-start ${
              activeTab === 'moved-out-tenants'
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <UserX className="h-4 w-4" />
            <span>Moved-Out Tenants</span>
          </button>
        </div>
      </div>
      <div>{renderContent()}</div>

      {/* Audit Log Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Audit Log Details
            </DialogTitle>
            <DialogDescription>
              {selectedLog && (
                <div className="text-sm text-muted-foreground">
                  <span className="font-medium">{formatAuditAction(selectedLog.action)}</span> on {formatTargetTable(selectedLog.target_table)} • {formatTimestamp(selectedLog.timestamp)}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {selectedLog && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">User</Label>
                  <div className="font-medium">
                    {(selectedLog as any).user_display_name || 'System'}
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Target ID</Label>
                  <div className="font-medium text-sm truncate">
                    {selectedLog.target_id || 'N/A'}
                  </div>
                </div>
              </div>
              
              <div className="border rounded-md p-4 bg-gray-50">
                <div className="font-medium mb-2 flex items-center gap-1">
                  <AlertCircle className="h-4 w-4" />
                  Changes Information
                </div>
                {renderChanges(selectedLog)}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bill Details Dialog */}
      <Dialog open={isBillDetailsOpen} onOpenChange={setIsBillDetailsOpen}>
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              Bill Details
            </DialogTitle>
            <DialogDescription>
              {selectedBill && (
                <div className="text-sm text-muted-foreground">
                  Billing Period: {formatDate(selectedBill.billing_period_start)} - {formatDate(selectedBill.billing_period_end)}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {selectedBill && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-4 rounded-md">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-gray-600">{(selectedBill as any).tenants?.rooms?.branches?.name}</span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <Home className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-gray-600">Room {(selectedBill as any).tenants?.rooms?.room_number}</span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-gray-500" />
                  <span className="text-sm font-medium">{(selectedBill as any).tenants?.full_name}</span>
                </div>
              </div>
              
              <div className="border rounded-md p-4">
                <h3 className="text-sm font-medium mb-3">Bill Breakdown</h3>
                <div className="space-y-2">
                  <div className="flex justify-between items-center py-1 border-b">
                    <div className="flex items-center gap-2">
                      <Home className="h-4 w-4 text-gray-500" />
                      <span className="text-sm">Monthly Rent</span>
                    </div>
                    <span className="font-medium">{formatCurrency(selectedBill.monthly_rent_amount)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b">
                    <div className="flex items-center gap-2">
                      <Zap className="h-4 w-4 text-gray-500" />
                      <span className="text-sm">Electricity</span>
                    </div>
                    <span className="font-medium">{formatCurrency(selectedBill.electricity_amount)}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b">
                    <div className="flex items-center gap-2">
                      <Droplets className="h-4 w-4 text-gray-500" />
                      <span className="text-sm">Water</span>
                    </div>
                    <span className="font-medium">{formatCurrency(selectedBill.water_amount)}</span>
                  </div>
                  {selectedBill.extra_fee > 0 && (
                    <div className="flex justify-between items-center py-1 border-b">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-gray-500" />
                        <span className="text-sm">
                          Extra Fee
                          {selectedBill.extra_fee_description && (
                            <span className="text-gray-500 ml-1">({selectedBill.extra_fee_description})</span>
                          )}
                        </span>
                      </div>
                      <span className="font-medium">{formatCurrency(selectedBill.extra_fee)}</span>
                    </div>
                  )}
                  {selectedBill.penalty_amount > 0 && (
                    <div className="flex justify-between items-center py-1 border-b">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-red-500" />
                        <span className="text-sm">Penalty</span>
                      </div>
                      <span className="font-medium text-red-600">{formatCurrency(selectedBill.penalty_amount)}</span>
                    </div>
                  )}
                  <div className="flex justify-between items-center py-2 mt-2 border-t border-gray-300">
                    <span className="font-medium">Total Amount</span>
                    <span className="font-bold text-lg">{formatCurrency(selectedBill.total_amount_due)}</span>
                  </div>
                </div>
              </div>
              
              <div className="border rounded-md p-4">
                <h3 className="text-sm font-medium mb-3">Payment History</h3>
                {selectedBill.payments && selectedBill.payments.length > 0 ? (
                  <div className="space-y-3">
                    {selectedBill.payments.map((payment: any) => (
                      <div key={payment.id} className="flex justify-between items-center py-2 border-b last:border-0">
                        <div>
                          <div className="flex items-center gap-2">
                            <CreditCard className="h-4 w-4 text-gray-500" />
                            <span className="font-medium">{formatCurrency(payment.amount)}</span>
                          </div>
                          <div className="text-sm text-gray-500 mt-1">
                            {formatDate(payment.payment_date)} • {payment.payment_method}
                          </div>
                        </div>
                        <div className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                          Payment Recorded
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-500">No payment records found</div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
} 