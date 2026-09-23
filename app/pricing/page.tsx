import type { Metadata } from 'next';
import PricingClient from '../components/pricing-client';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Compare Drop24 Basic, Plus, and Pro transfer plans, storage limits, retention periods, and features.',
  alternates: { canonical: '/pricing' },
};

export default function PricingPage() {
  return <PricingClient />;
}
