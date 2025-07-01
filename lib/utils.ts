import { format, parseISO } from 'date-fns';
import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

// CSS class utility function
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Date formatting utilities
export function formatDate(date: string | Date | null | undefined, formatStr: string = 'MMM dd, yyyy'): string {
  if (!date) return 'N/A';
  
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    return format(dateObj, formatStr);
  } catch (error) {
    console.warn('Invalid date value:', date);
    return 'Invalid Date';
  }
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return 'N/A';
  
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    // Format in Philippine time with AM/PM
    return format(dateObj, 'MMM dd, yyyy hh:mm a');
  } catch (error) {
    console.warn('Invalid date value:', date);
    return 'Invalid Date';
  }
}

export function formatTimestamp(date: string | Date | null | undefined): string {
  if (!date) return 'N/A';
  
  try {
    const dateObj = typeof date === 'string' ? parseISO(date) : date;
    // Format in Philippine time with AM/PM and seconds
    return format(dateObj, 'MMM dd, yyyy hh:mm:ss a');
  } catch (error) {
    console.warn('Invalid date value:', date);
    return 'Invalid Date';
  }
}

export function formatDateForInput(date: string | Date | null | undefined): string {
  if (!date) return '';
  return formatDate(date, 'yyyy-MM-dd');
}

// Number formatting utilities
export function formatNumber(value: number, decimals: number = 2): string {
  return new Intl.NumberFormat('en-PH', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value);
}

// Currency formatting
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

export function formatCurrencyShort(amount: number): string {
  return `₱${formatNumber(amount)}`;
}

// Parse currency input
export function parseCurrency(value: string): number {
  return parseFloat(value.replace(/[₱,\s]/g, '')) || 0;
}

// Status color helpers
export function getBillStatusColor(status: string): string {
  switch (status) {
    case 'active':
      return 'bg-yellow-100 text-yellow-800';
    case 'partially_paid':
      return 'bg-blue-100 text-blue-800';
    case 'fully_paid':
      return 'bg-green-100 text-green-800';
    case 'refund':
      return 'bg-purple-100 text-purple-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

export function getBillStatusText(status: string): string {
  switch (status) {
    case 'active':
      return 'Active';
    case 'partially_paid':
      return 'Partially Paid';
    case 'fully_paid':
      return 'Fully Paid';
    case 'refund':
      return 'Refund';
    default:
      return status;
  }
}

// Room occupancy status
export function getRoomStatusColor(isOccupied: boolean): string {
  return isOccupied
    ? 'bg-red-100 text-red-800'
    : 'bg-green-100 text-green-800';
}

export function getRoomStatusText(isOccupied: boolean): string {
  return isOccupied ? 'Occupied' : 'Available';
}

// Tenant status - using object parameter for flexibility
export function getTenantStatusColor(tenant: any): string {
  if (!tenant.is_active) return 'text-red-500';
  if (tenant.move_out_date) return 'text-orange-500';
  return 'text-green-500';
}

export function getTenantStatusText(tenant: any): string {
  if (!tenant.is_active) return 'Inactive';
  if (tenant.move_out_date) return 'Moved Out';
  return 'Active';
}

// Error handling utilities
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unexpected error occurred';
}

// API response helpers
export function createSuccessResponse<T>(data: T) {
  return {
    data,
    error: null,
    success: true
  };
}

export function createErrorResponse(error: string) {
  return {
    data: null,
    error,
    success: false
  };
}

// Pagination helpers
export function calculateTotalPages(totalItems: number, itemsPerPage: number): number {
  return Math.ceil(totalItems / itemsPerPage);
}

export function getPageItems<T>(items: T[], page: number, itemsPerPage: number): T[] {
  const startIndex = (page - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  return items.slice(startIndex, endIndex);
}

// Text utilities
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

export function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// Form utilities
export function generateRoomNumbers(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${String(i + 1).padStart(2, '0')}`);
}

// CSV export utilities
export function convertToCSV(data: any[]): string {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row =>
      headers.map(header => {
        const value = row[header];
        // Escape commas and quotes in CSV
        if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      }).join(',')
    )
  ].join('\n');

  return csvContent;
}

export function downloadCSV(data: any[], filename: string): void {
  const csv = convertToCSV(data);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');

  if (link.download !== undefined) {
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

// Local storage utilities
export function getStoredValue<T>(key: string, defaultValue: T): T {
  try {
    const item = window.localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.error(`Error reading localStorage key "${key}":`, error);
    return defaultValue;
  }
}

export function setStoredValue<T>(key: string, value: T): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Error setting localStorage key "${key}":`, error);
  }
}

// Debounce utility
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;

  return (...args: Parameters<T>) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}

// Add months to a date
export function addMonths(date: Date, months: number): Date {
  const newDate = new Date(date);
  newDate.setMonth(newDate.getMonth() + months);
  return newDate;
}

export function formatAuditAction(action: string): string {
  // Convert from UPPER_SNAKE_CASE to Title Case and handle special cases
  const actionMap: Record<string, string> = {
    // Tenant-related actions
    'TENANT_MOVE_IN': 'Added New Tenant',
    'TENANT_MOVE_OUT_PHASE_1': 'Started Tenant Archive Process',
    'TENANT_MOVE_OUT_PHASE_2': 'Completed Tenant Archive',
    'TENANT_UPDATED': 'Updated Tenant Information',
    'TENANT_CONTRACT_RENEWED': 'Renewed Tenant Contract',

    // Bill-related actions
    'BILL_GENERATED': 'Generated New Bill',
    'BILL_MODIFIED': 'Modified Bill Details',
    'PAYMENT_RECORDED': 'Recorded Payment',

    // Settings and configuration
    'SETTINGS_CHANGED': 'Updated System Settings',
    'BRANCH_RATES_CHANGED': 'Updated Branch Rates',

    // Branch management
    'BRANCH_CREATED': 'Created New Branch',
    'BRANCH_UPDATED': 'Updated Branch Details',
    'BRANCH_DELETED': 'Deleted Branch',

    // Room management
    'ROOM_CREATED': 'Created New Room',
    'ROOM_UPDATED': 'Updated Room Details',
    'ROOM_DELETED': 'Deleted Room',

    // Expense management
    'EXPENSE_CREATED': 'Created New Expense',
    'EXPENSE_UPDATED': 'Updated Expense Details',
    'EXPENSE_DELETED': 'Deleted Expense',

    // User management
    'USER_CREATED': 'Created New User Account',
    'USER_UPDATED': 'Updated User Account',
    'USER_DELETED': 'Deleted User Account',

    // Authentication events
    'AUTH_LOGIN': 'Logged In',
    'AUTH_LOGOUT': 'Logged Out',
    'AUTH_PASSWORD_CHANGE': 'Changed Password',
    'AUTH_EMAIL_CHANGE': 'Changed Email Address'
  };

  // Return mapped value if exists, otherwise convert from UPPER_SNAKE_CASE to Title Case
  return actionMap[action] || action.split('_').map(word => 
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');
} 