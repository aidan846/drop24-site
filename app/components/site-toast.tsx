"use client";

import { useCallback, useEffect, useState } from "react";

type ToastDetail = { message: string };
type Toast = ToastDetail & { id: number };

const TOAST_EVENT = "drop24:toast";
const TOAST_STORAGE_KEY = "drop24:toast";

export function showSiteToast(message: string) {
  window.dispatchEvent(new CustomEvent<ToastDetail>(TOAST_EVENT, { detail: { message } }));
}

export default function SiteToast() {
  const [toast, setToast] = useState<Toast | null>(null);
  const [leaving, setLeaving] = useState(false);

  const show = useCallback((message: string) => {
    setLeaving(false);
    setToast({ message, id: Date.now() });
  }, []);

  const dismiss = useCallback(() => {
    setLeaving(true);
    window.setTimeout(() => setToast(null), 180);
  }, []);

  useEffect(() => {
    const pending = window.sessionStorage.getItem(TOAST_STORAGE_KEY);
    if (pending) {
      window.sessionStorage.removeItem(TOAST_STORAGE_KEY);
      show(pending);
    }
    const handleToast = (event: Event) => show((event as CustomEvent<ToastDetail>).detail.message);
    window.addEventListener(TOAST_EVENT, handleToast);
    return () => window.removeEventListener(TOAST_EVENT, handleToast);
  }, [show]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(dismiss, 3600);
    return () => window.clearTimeout(timeout);
  }, [toast, dismiss]);

  if (!toast) return null;

  return (
    <ul className="fixed left-4 right-4 top-20 z-[70] mx-auto m-0 w-auto max-w-sm list-none p-0 md:bottom-6 md:left-auto md:right-6 md:top-auto md:mx-0 md:w-[calc(100%-3rem)]" aria-live="polite" aria-atomic="true">
      <li
        tabIndex={0}
        data-sonner-toast=""
        data-type="success"
        className={`group flex cursor-pointer items-center gap-3 border border-border bg-background px-4 py-3 text-foreground shadow-lg ${leaving ? "animate-[site-toast-out_180ms_ease-in_forwards]" : "animate-[site-toast-in_220ms_ease-out]"}`}
        onClick={dismiss}
      >
        <svg className="size-5 shrink-0 text-primary" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z" clipRule="evenodd" />
        </svg>
        <span className="text-sm font-medium">{toast.message}</span>
      </li>
    </ul>
  );
}
