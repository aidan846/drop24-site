import type { Metadata } from 'next';
import SiteFooter from '../components/site-footer';
import SiteNav from '../components/site-nav';
import { TERMS_LAST_UPDATED, termsSections } from '@/lib/legal-content';

export const metadata: Metadata = { title: 'Terms & Conditions', description: 'The terms governing use of Drop24.', alternates: { canonical: '/terms' } };

export default function TermsPage() {
  return <LegalPage title="Terms & Conditions" updated={TERMS_LAST_UPDATED} sections={termsSections} />;
}

function LegalPage({ title, updated, sections }: { title: string; updated: string; sections: ReadonlyArray<readonly [string, string]> }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteNav />
      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-20">
        <header className="animate-entry border-b border-border pb-12">
          <h1 className="text-5xl font-bold uppercase tracking-tighter md:text-7xl">{title}</h1>
          <p className="mt-5 font-mono-tight text-[10px] uppercase tracking-widest text-muted-foreground">Last updated / {updated}</p>
        </header>
        <div className="grid border-x border-border md:grid-cols-2">
          {sections.map(([sectionTitle, body], index) => (
            <section key={sectionTitle} className="border-b border-border bg-card p-8 md:p-10 md:odd:border-r">
              <p className="mb-5 font-mono-tight text-xs uppercase tracking-widest text-primary">Section {String(index + 1).padStart(2, '0')}</p>
              <h2 className="text-xl font-bold uppercase tracking-tight">{sectionTitle}</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">{body}</p>
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
