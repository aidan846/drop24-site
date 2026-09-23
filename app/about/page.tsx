import type { Metadata } from 'next';
import SiteFooter from '../components/site-footer';
import SiteNav from '../components/site-nav';

export const metadata: Metadata = {
  title: 'About',
  description: 'Why Drop24 exists: simpler, faster file sharing without the usual roadblocks.',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteNav />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-20 md:px-0">
        <header className="animate-entry border-b border-border pb-12">
          <h1 className="max-w-4xl text-5xl font-bold uppercase tracking-tighter md:text-7xl">Built to make sharing less annoying.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
            Drop24 is a simple, fast way to send files without turning a quick transfer into a whole project.
          </p>
        </header>

        <section className="grid border-x border-border md:grid-cols-2">
          <div className="border-b border-border bg-card p-8 md:border-r md:p-10">
            <p className="font-mono-tight text-xs uppercase tracking-widest text-primary">The person behind it</p>
            <h2 className="mt-5 text-2xl font-bold uppercase tracking-tight">One developer.</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Drop24 is built independently by a developer who wanted a file-sharing tool that feels straightforward, useful, and respectful of your time.
            </p>
          </div>
          <div className="border-b border-border bg-card p-8 md:p-10">
            <p className="font-mono-tight text-xs uppercase tracking-widest text-primary">Why it exists</p>
            <h2 className="mt-5 text-2xl font-bold uppercase tracking-tight">Send the file. Move on.</h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              I was tired of sending files to myself and friends through email, Drive, and iCloud—each with its own friction, limits, and roadblocks. So I made a simpler, faster platform for the transfers that should take seconds, not steps.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
