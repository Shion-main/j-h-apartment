import { Suspense } from 'react';
import { BillingPageSkeleton } from '@/components/ui/skeleton';
import { default as dynamicImport } from 'next/dynamic';

export const dynamic = 'force-dynamic';

const BillingPageClient = dynamicImport(() => import('./BillingPageClient'), {
  loading: () => <BillingPageSkeleton />,
  ssr: false
});

export default function BillingPage() {
  return (
    <Suspense fallback={<BillingPageSkeleton />}>
      <BillingPageClient />
    </Suspense>
  );
} 