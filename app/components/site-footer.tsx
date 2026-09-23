import Link from 'next/link';

export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border bg-card px-6 py-12">
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-7 text-center md:flex-row md:items-center md:justify-between md:gap-8 md:text-left">
        <div className="flex flex-col items-center gap-5 md:flex-row md:gap-8">
          <Link href="/" className="text-xl font-bold uppercase leading-none tracking-tighter transition-colors hover:text-primary">Drop24</Link>
          <div className="flex items-center gap-3 font-mono-tight text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            <Link href="/about" className="transition-colors hover:text-primary">About</Link>
            <Link href="/contact" className="transition-colors hover:text-primary">Contact</Link>
            <Link href="/pricing" className="transition-colors hover:text-primary">Pricing</Link>
            <Link href="/features" className="transition-colors hover:text-primary">Have a Say</Link>
          </div>
        </div>
        <div className="flex w-full max-w-[13rem] flex-col items-center gap-3 font-mono-tight text-[10px] uppercase leading-none tracking-[0.14em] text-muted-foreground md:w-auto md:max-w-none md:items-end">
          <span>© 2026 Drop24</span>
          <span>Made with <span role="img" aria-label="love">❤️</span></span>
          <div className="flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-2 md:justify-end">
            <Link href="/support" className="transition-colors hover:text-primary">Support</Link>
            <Link href="/privacy" className="transition-colors hover:text-primary">Privacy Policy</Link>
            <Link href="/terms" className="transition-colors hover:text-primary">Terms</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
