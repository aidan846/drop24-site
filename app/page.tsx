import type { Metadata } from 'next';
import HomePageClient from './components/home-page-client';

export const metadata: Metadata = {
  title: 'Fast, temporary file transfers',
  description: 'Upload and share files in seconds. Drop24 automatically expires transfers and works without an account.',
  alternates: { canonical: '/' },
};

export default function HomePage() {
  return <HomePageClient />;
}
