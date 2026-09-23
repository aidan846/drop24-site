import type { Metadata } from 'next';
import DashboardMount from '../components/dashboard-mount';
import SiteNav from '../components/site-nav';

// Behind sign-in and already disallowed in robots.txt, but stated here too so a
// crawler that reaches it never indexes a transfer library.
export const metadata: Metadata = {
  title: 'Dashboard',
  description: 'Manage and share your Drop24 transfers.',
  robots: { index: false, follow: false },
};

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteNav />
      <DashboardMount />
    </div>
  );
}
