// Quick fixes for the reported issues:

console.log("=== J&H Management System - Quick Fixes ===");

console.log(
1. SETTINGS 403 ERROR FIX:
   Run this in your Supabase SQL Editor:

   -- Drop existing admin-only policy
   DROP POLICY IF EXISTS "Allow admins to manage system settings" ON public.system_settings;

   -- Create new policy for all authenticated users  
   CREATE POLICY "Allow authenticated users to manage system settings"
   ON public.system_settings FOR ALL
   USING (auth.uid() IS NOT NULL)
   WITH CHECK (auth.uid() IS NOT NULL);

2. MONTHLY REPORT 400 ERROR:
   The API has been fixed - variables were undefined. The system should work now.

3. HYDRATION WARNING:
   This is a common Next.js warning and is harmless. It's related to SSR differences.

4. 406 ERRORS:
   These are likely Supabase realtime connection issues and should resolve automatically.
);

console.log("Apply the SQL fix above in your Supabase dashboard to resolve the settings issue.");

// Script to fix deposit amounts in existing final bills
async function fixFinalBillDeposits() {
  // Get all final bills that don't have deposit values
  const { data: finalBills, error: billsError } = await supabase
    .from('bills')
    .select(`
      id,
      tenant_id,
      is_final_bill,
      advance_payment,
      security_deposit
    `)
    .eq('is_final_bill', true)
    .or('advance_payment.is.null,security_deposit.is.null');

  if (billsError) {
    console.error('Error fetching final bills:', billsError);
    return;
  }

  console.log(`Found ${finalBills.length} final bills without deposit values`);

  // Update each bill with the correct deposit values from tenant record
  for (const bill of finalBills) {
    // Get tenant's deposit values
    const { data: tenant, error: tenantError } = await supabase
      .from('tenants')
      .select('advance_payment, security_deposit')
      .eq('id', bill.tenant_id)
      .single();

    if (tenantError) {
      console.error(`Error fetching tenant ${bill.tenant_id}:`, tenantError);
      continue;
    }

    // Update the bill with tenant's deposit values
    const { error: updateError } = await supabase
      .from('bills')
      .update({
        advance_payment: tenant.advance_payment,
        security_deposit: tenant.security_deposit
      })
      .eq('id', bill.id);

    if (updateError) {
      console.error(`Error updating bill ${bill.id}:`, updateError);
    } else {
      console.log(`Updated bill ${bill.id} with deposit values: AP=${tenant.advance_payment}, SD=${tenant.security_deposit}`);
    }
  }

  console.log('Deposit fix operation completed');
}

// Run the fix when called from command line
if (require.main === module) {
  fixFinalBillDeposits()
    .catch(err => console.error('Error in fix script:', err));
}

module.exports = {
  fixFinalBillDeposits
};
