// Payment Component Allocation Logic
// This implements the priority-based allocation system for accurate financial tracking

export interface BillComponents {
  penalty_amount: number;
  extra_fee: number;
  electricity_amount: number;
  water_amount: number;
  monthly_rent_amount: number;
}

export interface PaymentComponent {
  component_type: 'penalty' | 'extra_fee' | 'electricity' | 'water' | 'rent';
  amount: number;
}

/**
 * Allocates a payment amount across bill components using priority-based allocation
 * Priority order: penalties > extra fees > electricity > water > rent
 * 
 * @param paymentAmount - The total payment amount to allocate
 * @param billComponents - The bill component amounts
 * @returns Array of payment components with allocated amounts
 */
export function allocatePaymentToComponents(
  paymentAmount: number,
  billComponents: BillComponents
): PaymentComponent[] {
  let remaining = paymentAmount;
  const components: PaymentComponent[] = [];

  // Priority 1: Penalties (highest priority)
  if (billComponents.penalty_amount > 0 && remaining > 0) {
    const penaltyAmount = Math.min(remaining, billComponents.penalty_amount);
    if (penaltyAmount > 0) {
      components.push({ component_type: 'penalty', amount: penaltyAmount });
      remaining -= penaltyAmount;
    }
  }

  // Priority 2: Extra fees
  if (billComponents.extra_fee > 0 && remaining > 0) {
    const extraAmount = Math.min(remaining, billComponents.extra_fee);
    if (extraAmount > 0) {
      components.push({ component_type: 'extra_fee', amount: extraAmount });
      remaining -= extraAmount;
    }
  }

  // Priority 3: Electricity
  if (billComponents.electricity_amount > 0 && remaining > 0) {
    const electricityAmount = Math.min(remaining, billComponents.electricity_amount);
    if (electricityAmount > 0) {
      components.push({ component_type: 'electricity', amount: electricityAmount });
      remaining -= electricityAmount;
    }
  }

  // Priority 4: Water
  if (billComponents.water_amount > 0 && remaining > 0) {
    const waterAmount = Math.min(remaining, billComponents.water_amount);
    if (waterAmount > 0) {
      components.push({ component_type: 'water', amount: waterAmount });
      remaining -= waterAmount;
    }
  }

  // Priority 5: Rent (lowest priority)
  if (billComponents.monthly_rent_amount > 0 && remaining > 0) {
    const rentAmount = Math.min(remaining, billComponents.monthly_rent_amount);
    if (rentAmount > 0) {
      components.push({ component_type: 'rent', amount: rentAmount });
      remaining -= rentAmount;
    }
  }

  return components;
}

/**
 * Creates payment component records in the database
 * 
 * @param supabase - Supabase client
 * @param paymentId - ID of the payment record
 * @param billId - ID of the bill record
 * @param components - Array of payment components to create
 */
export async function createPaymentComponents(
  supabase: any,
  paymentId: string,
  billId: string,
  components: PaymentComponent[]
) {
  if (components.length === 0) {
    return { data: [], error: null };
  }

  const componentRecords = components.map(component => ({
    payment_id: paymentId,
    bill_id: billId,
    component_type: component.component_type,
    amount: component.amount
  }));

  return await supabase
    .from('payment_components')
    .insert(componentRecords)
    .select();
}

/**
 * Validates that payment components sum to the expected total
 * 
 * @param components - Array of payment components
 * @param expectedTotal - Expected total amount
 * @returns boolean indicating if totals match
 */
export function validatePaymentAllocation(
  components: PaymentComponent[],
  expectedTotal: number
): boolean {
  const actualTotal = components.reduce((sum, component) => sum + component.amount, 0);
  // Allow for small floating point differences
  return Math.abs(actualTotal - expectedTotal) < 0.01;
} 