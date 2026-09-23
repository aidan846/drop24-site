"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase, verifyEmailOtp } from "@/lib/supabase-browser";
import { signInWithGooglePopup } from "@/lib/oauth-popup";

// A compact sign-in prompt for pages that need an account mid-task rather than
// as a destination. It never navigates away: the caller stays where it is and
// is told when a session exists, so whatever the person was doing can continue.

export default function SignInDialog({
  open,
  title,
  detail,
  eyebrow = "Sign in to continue",
  returnPath,
  onClose,
  onSignedIn,
}: {
  open: boolean;
  title: string;
  detail: string;
  /** The small line above the title, when the reason is not signing in as such. */
  eyebrow?: string;
  /** Where the emailed link and the Google popup should come back to. */
  returnPath: string;
  onClose: () => void;
  onSignedIn: () => void;
}) {
  const [email, setEmail] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastSubmittedCode = useRef<string | null>(null);

  useEffect(() => {
    if (open) return;
    setCodeSent(false);
    setCode("");
    setStatus(null);
    setError(null);
    lastSubmittedCode.current = null;
  }, [open]);

  const sendCode = async () => {
    const address = email.trim();
    if (!address.includes("@")) return setError("Enter a valid email address.");
    if (!supabase) return setError("Account sign-in is not configured.");
    setBusy(true);
    setError(null);
    setStatus(null);
    const next = encodeURIComponent(returnPath);
    const { error: sendError } = await supabase.auth.signInWithOtp({
      email: address,
      options: {
        shouldCreateUser: true,
        // /auth/callback is the only page that exchanges the PKCE code.
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${next}`,
      },
    });
    setBusy(false);
    if (sendError) return setError(sendError.message);
    setCodeSent(true);
    setStatus("Check your email for a sign-in link or six-digit code.");
  };

  const submitCode = async () => {
    const token = code.trim();
    if (token.length !== 6 || busy || !supabase) return;
    setBusy(true);
    setError(null);
    const { data, error: verifyError } = await verifyEmailOtp(email.trim(), token);
    setBusy(false);
    if (verifyError || !data.user) {
      return setError(verifyError?.message || "That code could not be verified.");
    }
    setStatus("Signed in.");
    onSignedIn();
  };

  // Typing the sixth digit is the whole intent; making people also press a
  // button after that is friction for no safety.
  useEffect(() => {
    if (code.length !== 6) {
      lastSubmittedCode.current = null;
      return;
    }
    if (!codeSent || busy || lastSubmittedCode.current === code) return;
    const timer = window.setTimeout(() => {
      lastSubmittedCode.current = code;
      void submitCode();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [busy, code, codeSent]);

  const googleSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithGooglePopup(returnPath);
      onSignedIn();
    } catch (popupError) {
      setError(popupError instanceof Error ? popupError.message : "Google sign-in failed.");
    } finally {
      setBusy(false);
    }
  };

  if (typeof document === "undefined" || !open) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="sign-in-dialog-title"
      className="fixed inset-0 z-[70] flex items-center justify-center overflow-y-auto bg-foreground/40 px-4 py-6 backdrop-blur-sm"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}
    >
      <div className="w-full max-w-md border border-border bg-card p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-mono-tight text-[11px] uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
            <h2 id="sign-in-dialog-title" className="mt-2 text-xl font-bold uppercase tracking-tight">{title}</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{detail}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close sign-in"
            className="border border-border p-2 text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <form
          className="mt-5 space-y-3"
          onSubmit={(event) => { event.preventDefault(); if (codeSent) void submitCode(); else void sendCode(); }}
        >
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={codeSent}
            autoComplete="email"
            placeholder="you@example.com"
            aria-label="Email address"
            className="w-full border border-border bg-secondary px-4 py-2.5 text-[13px] font-medium outline-none transition-colors placeholder:text-muted-foreground focus:border-primary disabled:opacity-50"
          />
          {!codeSent ? (
            <button type="submit" disabled={busy} className="industrial-button industrial-button-dark w-full disabled:opacity-50">
              {busy ? "Sending…" : "Email me a sign-in code"}
            </button>
          ) : (
            <div className="flex gap-2">
              <input
                aria-label="Six-digit sign-in code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="6-digit code"
                className="min-w-0 flex-1 border border-border bg-secondary px-4 py-2.5 font-mono-tight text-[13px] tracking-[0.16em] outline-none focus:border-primary"
              />
              <button type="submit" disabled={busy || code.length !== 6} className="industrial-button industrial-button-dark shrink-0 disabled:opacity-40">
                {busy ? "Checking" : "Enter"}
              </button>
            </div>
          )}
        </form>

        <div className="my-4 flex items-center gap-3 font-mono-tight text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
          <span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" />
        </div>

        <button
          type="button"
          onClick={() => void googleSignIn()}
          disabled={busy}
          className="industrial-button industrial-button-outline relative w-full pl-10 disabled:opacity-50"
        >
          <svg className="absolute left-3 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z" />
          </svg>
          Continue with Google
        </button>

        {status && <p role="status" className="mt-3 border border-emerald-300 bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-800">{status}</p>}
        {error && <p role="alert" className="mt-3 border border-red-300 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-800">{error}</p>}
      </div>
    </div>,
    document.body,
  );
}
