"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
export const PLAN_MANAGER_HREF = "/pricing";
export default function SiteNav() {
  const path = usePathname(); const [open,setOpen]=useState(false);
  const cls=(href:string)=>path===href?"text-primary":"transition-colors hover:text-primary";
  return <nav className="sticky top-0 z-50 border-b border-border bg-background/90 px-6 backdrop-blur-md"><div className="mx-auto flex h-16 max-w-7xl items-center justify-between"><div className="flex items-center gap-8"><Link href="/" className="text-xl font-bold uppercase tracking-tighter">Drop24</Link><div className="hidden items-center gap-6 text-sm font-medium sm:flex"><Link href="/" className={cls("/")}>Home</Link><Link href="/pricing" className={cls("/pricing")}>Pricing</Link><Link href="/features" className={cls("/features")}>Have a Say</Link><Link href="/dashboard" className={cls("/dashboard")}>Dashboard</Link></div></div><div className="hidden items-center gap-3 sm:flex"><span className="font-mono-tight text-[10px] font-bold uppercase tracking-widest text-primary">Portfolio demo</span><Link href="/dashboard" className="industrial-button industrial-button-dark px-3 py-1.5 text-[10px]">Demo account</Link></div><button type="button" onClick={()=>setOpen(!open)} className="flex size-8 items-center justify-center bg-foreground text-background sm:hidden" aria-label="Toggle navigation">☰</button></div>{open&&<div className="border-t border-border py-2 sm:hidden">{[["/","Home"],["/pricing","Pricing"],["/features","Have a Say"],["/dashboard","Dashboard"]].map(([href,label])=><Link key={href} onClick={()=>setOpen(false)} href={href} className="block px-3 py-3 text-sm font-medium">{label}</Link>)}</div>}</nav>;
}
