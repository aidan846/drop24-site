import type { Metadata } from 'next';
import FeaturesClient from '../components/features-client';

export const metadata: Metadata = {
  title: 'Have a Say',
  description: 'Vote on what Drop24 should build next. The most wanted features get built first.',
  alternates: { canonical: '/features' },
};

export default function FeaturesPage() {
  return <FeaturesClient />;
}
