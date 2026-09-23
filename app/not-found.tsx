import Link from 'next/link';
import SiteFooter from './components/site-footer';
import SiteNav from './components/site-nav';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteNav />
      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col justify-center px-6 py-20">
        <h1 className="text-6xl font-bold uppercase tracking-tighter md:text-8xl">Page not found.</h1>
        <Link href="/" className="industrial-button industrial-button-dark mt-8 w-fit">Return home</Link>
      </main>
      <SiteFooter />
    </div>
  );
}
