import type { Metadata } from 'next';
import SupportClient from '../components/support-client';

export const metadata: Metadata = {
  title: 'Support Drop24',
  description: 'Leave a one-time tip to support the independent development of Drop24.',
  alternates: { canonical: '/support' },
};

export default function SupportPage() {
  return <SupportClient />;
}
