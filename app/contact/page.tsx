import type { Metadata } from 'next';
import SiteFooter from '../components/site-footer';
import SiteNav from '../components/site-nav';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Contact',
  description: 'Get in touch with the developer behind Drop24.',
  alternates: { canonical: '/contact' },
};

export default function ContactPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteNav />
      <main className="mx-auto flex w-full max-w-7xl flex-1 items-center px-6 py-20 md:px-0">
        <section className="w-full border border-border bg-card p-8 md:p-12">
          <h1 className="max-w-2xl text-5xl font-bold uppercase tracking-tighter md:text-7xl">Let&apos;s talk.</h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">
            Have a question, found an issue, or have an idea for Drop24? I&apos;d genuinely like to hear it.
          </p>
          <a href="" className="industrial-button industrial-button-dark mt-8 text-[10px] tracking-[0.08em]">
            email@email.com
          </a>

          <div className="mt-12 border-t border-border pt-8">
            <p className="font-mono-tight text-[10px] uppercase tracking-widest text-muted-foreground">Copyright complaints</p>
            <p className="mt-3 max-w-xl text-sm leading-7 text-muted-foreground">
              Reporting a file that infringes your copyright goes to our designated agent instead.
              The <Link href="" className="font-semibold text-primary underline underline-offset-2">DMCA page</Link>{' '}
              has the agent&apos;s details and what a notice has to contain — email is fastest, since
              most Drop24 files expire within 24 hours.
            </p>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
