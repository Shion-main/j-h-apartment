import { format, parseISO, addMonths as dateFnsAddMonths } from 'date-fns';
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

// Date manipulation utilities
export function addMonths(date: Date, amount: number): Date {
  return dateFnsAddMonths(date, amount);
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
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
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

// Enhanced performance utilities

// Performance optimization utilities

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * have elapsed since the last time the debounced function was invoked.
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
  immediate?: boolean
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      timeout = null;
      if (!immediate) func(...args);
    };
    
    const callNow = immediate && !timeout;
    clearTimeout(timeout!);
    timeout = setTimeout(later, wait);
    
    if (callNow) func(...args);
  };
}

/**
 * Creates a throttled function that only invokes func at most once per every wait milliseconds
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let inThrottle: boolean;
  
  return function executedFunction(...args: Parameters<T>) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, wait);
    }
  };
}

/**
 * Memoization utility for expensive calculations
 */
export function memoize<TArgs extends any[], TReturn>(
  fn: (...args: TArgs) => TReturn,
  getKey?: (...args: TArgs) => string
): (...args: TArgs) => TReturn {
  const cache = new Map<string, TReturn>();
  
  return (...args: TArgs): TReturn => {
    const key = getKey ? getKey(...args) : JSON.stringify(args);
    
    if (cache.has(key)) {
      return cache.get(key)!;
    }
    
    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}

/**
 * Cache utility with TTL support
 */
class CacheWithTTL<T> {
  private cache = new Map<string, { value: T; timestamp: number; ttl: number }>();
  
  set(key: string, value: T, ttl: number = 300000): void { // Default 5 minutes
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl
    });
  }
  
  get(key: string): T | null {
    const cached = this.cache.get(key);
    
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > cached.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.value;
  }
  
  has(key: string): boolean {
    return this.get(key) !== null;
  }
  
  delete(key: string): void {
    this.cache.delete(key);
  }
  
  clear(): void {
    this.cache.clear();
  }
  
  size(): number {
    return this.cache.size;
  }
}

export const createCache = <T>() => new CacheWithTTL<T>();

/**
 * Optimized batch processor for handling multiple async operations
 */
export async function batchProcess<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = 10,
  delay: number = 0
): Promise<R[]> {
  const results: R[] = [];
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);
    
    // Optional delay between batches to prevent overwhelming the system
    if (delay > 0 && i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return results;
}

/**
 * Performance monitoring utility
 */
export class PerformanceMonitor {
  private static measurements = new Map<string, number[]>();
  
  static start(label: string): void {
    performance.mark(`${label}-start`);
  }
  
  static end(label: string): number {
    performance.mark(`${label}-end`);
    performance.measure(label, `${label}-start`, `${label}-end`);
    
    const measure = performance.getEntriesByName(label)[0];
    const duration = measure.duration;
    
    if (!this.measurements.has(label)) {
      this.measurements.set(label, []);
    }
    
    this.measurements.get(label)!.push(duration);
    
    // Clean up marks and measures
    performance.clearMarks(`${label}-start`);
    performance.clearMarks(`${label}-end`);
    performance.clearMeasures(label);
    
    return duration;
  }
  
  static getAverageTime(label: string): number {
    const times = this.measurements.get(label) || [];
    return times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  }
  
  static getTotalCalls(label: string): number {
    return this.measurements.get(label)?.length || 0;
  }
  
  static reset(label?: string): void {
    if (label) {
      this.measurements.delete(label);
    } else {
      this.measurements.clear();
    }
  }
}

/**
 * Utility to measure and log performance of async functions
 */
export function withPerformanceLogging<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  label: string
): T {
  return (async (...args: Parameters<T>) => {
    PerformanceMonitor.start(label);
    try {
      const result = await fn(...args);
      const duration = PerformanceMonitor.end(label);
      
      if (duration > 1000) { // Log slow operations (> 1 second)
        console.warn(`⚠️ Slow operation detected: ${label} took ${duration.toFixed(2)}ms`);
      }
      
      return result;
    } catch (error) {
      PerformanceMonitor.end(label);
      throw error;
    }
  }) as T;
}

/**
 * Optimized deep comparison utility
 */
export function deepEqual(obj1: any, obj2: any): boolean {
  if (obj1 === obj2) return true;
  
  if (obj1 == null || obj2 == null) return false;
  
  if (typeof obj1 !== typeof obj2) return false;
  
  if (typeof obj1 !== 'object') return obj1 === obj2;
  
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) return false;
  
  for (const key of keys1) {
    if (!keys2.includes(key)) return false;
    if (!deepEqual(obj1[key], obj2[key])) return false;
  }
  
  return true;
}

/**
 * Utility for audit log action formatting
 */
export function formatAuditAction(action: string): string {
  return action
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

 