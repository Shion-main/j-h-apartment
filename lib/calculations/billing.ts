import { addMonths, differenceInDays, startOfDay, endOfDay, subDays } from 'date-fns';
import * as dateFnsTz from 'date-fns-tz';
import type { BillingCycle, DepositCalculation, FinalBillCalculation } from '@/types/database';

/**
 * Calculate electricity charge based on consumption and rate
 */
export function calculateElectricityCharge(
  presentReading: number,
  previousReading: number,
  rate: number
): number {
  const consumption = presentReading - previousReading;
  return consumption * rate;
}

/**
 * Calculate penalty based on configurable percentage
 * Retrieved from system settings, not hardcoded
 * Always returns whole pesos (rounded to nearest peso)
 */
export function calculatePenalty(
  totalAmount: number,
  paymentDate: Date,
  dueDate: Date,
  penaltyPercentage: number
): number {
  if (paymentDate <= dueDate) return 0;
  // Always round to whole pesos for consistency across all branches
  return Math.round((totalAmount * penaltyPercentage) / 100);
}

/**
 * Calculate consistent monthly billing cycles based on rent_start_date
 * Example: rent_start_date = 2025-03-17
 * Cycle 1: 2025-03-17 to 2025-04-16
 * Cycle 2: 2025-04-17 to 2025-05-16
 */
export function calculateBillingPeriod(
  rentStartDate: Date,
  cycleNumber: number
): BillingCycle {
  // Treat the rentStartDate as a calendar date (year-month-day) in PH time.
  // We normalise to midnight UTC of that date so that, when rendered in PH (+08),
  // it still shows the same calendar day and avoids off-by-one errors.
  const anchorUtc = new Date(Date.UTC(
    rentStartDate.getUTCFullYear(),
    rentStartDate.getUTCMonth(),
    rentStartDate.getUTCDate()
  ));

  // Start of the requested cycle → anchor + (cycleNumber-1) months
  const startUtc = addMonths(anchorUtc, cycleNumber - 1);

  // End of cycle → (start + 1 month) - 1 day
  const endUtc = subDays(addMonths(startUtc, 1), 1);

  return {
    start: startUtc,
    end: endUtc,
    cycleNumber
  };
}

/**
 * Get the current billing cycle for a tenant
 */
export function getCurrentBillingCycle(rentStartDate: Date): BillingCycle {
  let cycleNumber = 1;
  let currentCycle = calculateBillingPeriod(rentStartDate, cycleNumber);
  const todayUtc = new Date();

  while (todayUtc > currentCycle.end) {
    cycleNumber += 1;
    currentCycle = calculateBillingPeriod(rentStartDate, cycleNumber);
  }
  return currentCycle;
}

/**
 * Calculate due date (billing_period_end + 10 days)
 */
export function calculateDueDate(billingPeriodEnd: Date): Date {
  const TIMEZONE = 'Asia/Manila';
  const dueDate = dateFnsTz.toZonedTime(billingPeriodEnd, TIMEZONE); // Convert to Manila timezone
  dueDate.setDate(dueDate.getDate() + 10);
  return dateFnsTz.fromZonedTime(dueDate, TIMEZONE); // Convert back to UTC for storage
}

/**
 * Calculate prorated rent for move-out
 */
export function calculateProratedRent(
  monthlyRent: number,
  billingPeriodStart: Date,
  billingPeriodEnd: Date,
  moveOutDate: Date
): number {
  const totalDaysInCycle = differenceInDays(endOfDay(billingPeriodEnd), startOfDay(billingPeriodStart)) + 1;
  const daysOccupied = differenceInDays(endOfDay(moveOutDate), startOfDay(billingPeriodStart)) + 1;
  
  const dailyRate = monthlyRent / totalDaysInCycle;
  return Math.round(dailyRate * daysOccupied);
}

/**
 * Apply deposit rules based on fully paid bill count
 * 5+ fully paid bills = 6th cycle or beyond: Both deposits available
 * 4 or fewer fully paid bills = 5th cycle or below: Only advance payment available
 * Room transfer: Never forfeit security deposit regardless of cycle count
 */
export function calculateDepositApplication(
  fullyPaidBillCount: number,
  advancePayment: number,
  securityDeposit: number,
  outstandingBalance: number,
  isRoomTransfer: boolean = false
): DepositCalculation {
  // For room transfers, always make both deposits available (no forfeiture)
  if (isRoomTransfer || fullyPaidBillCount >= 5) {
    const availableAmount = advancePayment + securityDeposit;
    const appliedAmount = Math.min(availableAmount, outstandingBalance);
    return {
      availableAmount,
      forfeitedAmount: 0,
      refundAmount: availableAmount - appliedAmount,
      appliedAmount
    };
  } else { // 4 or fewer fully paid bills = 5th cycle or below (normal move-out)
    const appliedAmount = Math.min(advancePayment, outstandingBalance);
    return {
      availableAmount: advancePayment,
      forfeitedAmount: securityDeposit,
      refundAmount: advancePayment - appliedAmount,
      appliedAmount
    };
  }
}

/**
 * Calculate final bill for move-out (Phase 1)
 */
export function calculateFinalBill(
  monthlyRent: number,
  billingPeriodStart: Date,
  billingPeriodEnd: Date,
  moveOutDate: Date,
  electricityCharges: number,
  waterCharges: number,
  extraFees: number,
  outstandingBills: number,
  fullyPaidBillCount: number,
  advancePayment: number,
  securityDeposit: number,
  isRoomTransfer: boolean = false
): FinalBillCalculation {
  // Calculate prorated rent
  const proratedRent = calculateProratedRent(
    monthlyRent,
    billingPeriodStart,
    billingPeriodEnd,
    moveOutDate
  );
  
  // Calculate total before deposits
  const totalBeforeDeposits = proratedRent + electricityCharges + waterCharges + extraFees + outstandingBills;
  
  // Apply deposit rules (with room transfer flag)
  const depositApplication = calculateDepositApplication(
    fullyPaidBillCount,
    advancePayment,
    securityDeposit,
    totalBeforeDeposits,
    isRoomTransfer
  );
  
  // Final total (positive = owed, negative = refund)
  const finalTotal = totalBeforeDeposits - depositApplication.appliedAmount;
  
  return {
    proratedRent,
    electricityCharges,
    waterCharges,
    extraFees,
    outstandingBills,
    totalBeforeDeposits,
    depositApplication,
    finalTotal
  };
}

/**
 * Format currency amount in PHP
 */
export function formatPHP(amount: number): string {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Parse PHP currency string to number
 */
export function parsePHP(value: string): number {
  return parseFloat(value.replace(/[₱,\s]/g, '')) || 0;
} 