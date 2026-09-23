"use client";

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { authHeaders, supabase } from '@/lib/supabase-browser';
import { PLANS, PLAN_ORDER, describeChange, formatBillingDate, limitChanges, type PlanName } from '@/lib/plans';

export type { PlanName };

type BillingPreview = { immediateAmountFormatted?: string; scheduledPlan?: PlanName; scheduledFor?: string | null };
type SubscriptionState = { plan?: PlanName; status?: string; currentPeriodEnd?: string | null; cancelAtPeriodEnd?: boolean } | null;

const ALL_PLANS: PlanName[] = ['free', 'plus', 'pro'];

async function authenticatedUserId() {
  const { data } = await supabase?.auth.getSession() ?? { data: { session: null } };
  const userId = data.session?.user.id;
  if (!userId) throw new Error('Please sign in again to manage billing.');
  localStorage.setItem('drop24_user_id', userId);
  return userId;
}

export default function PlanManagementModal({
  open,
  initialPlan = 'free',
  targetPlan,
  onClose,
  onError,
  onChanged,
}: {
  open: boolean;
  initialPlan?: PlanName;
  targetPlan?: PlanName;
  onClose: () => void;
  onError?: (message: string) => void;
  onChanged?: () => void;
}) {
  const [selected, setSelected] = useState<PlanName>(targetPlan ?? initialPlan);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const [preview, setPreview] = useState<BillingPreview | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionState>(null);

  const current = initialPlan;
  const hasPaidPlan = current !== 'free';
  const isChange = selected !== current;
  const isUpgrade = PLAN_ORDER[selected] > PLAN_ORDER[current];
  const isImmediateUpgrade = hasPaidPlan && isChange && isUpgrade;
  const isNewSubscription = !hasPaidPlan && isChange;

  // /api/plan already knows about a pending cancellation. Relying on the preview
  // call alone meant the whole cancelling state vanished whenever it was slow or
  // failed, and the customer saw no sign they had cancelled.
  const scheduledPlan = preview?.scheduledPlan ?? (subscription?.cancelAtPeriodEnd ? 'free' : null);
  const scheduledFor = formatBillingDate(preview?.scheduledFor ?? subscription?.currentPeriodEnd);
  const renewalDate = formatBillingDate(subscription?.currentPeriodEnd);
  const copy = describeChange({
    current,
    selected,
    renewalDate,
    scheduledPlan,
    scheduledFor,
    immediateAmount: preview?.immediateAmountFormatted ?? null,
  });
  const { blockedBySchedule } = copy;

  const changes = isChange ? limitChanges(current, selected) : [];
  const reductions = changes.filter((change) => change.direction === 'down' && change.consequence);
  const requiresAcknowledgement = isNewSubscription || isImmediateUpgrade;

  useEffect(() => {
    if (!open) return;
    setSelected(targetPlan ?? initialPlan);
    setAcceptedTerms(false);
    setError(null);
    setOutcome(null);
    setPreview(null);
  }, [open, initialPlan, targetPlan]);

  useEffect(() => {
    if (!open) return;
    let active = true;
    const load = async () => {
      try {
        const userId = await authenticatedUserId();
        const response = await fetch(`/api/plan?userId=${encodeURIComponent(userId)}`, { headers: await authHeaders() });
        const data = await response.json();
        if (active && response.ok && data.success) setSubscription(data.subscription ?? null);
      } catch {
        if (active) setSubscription(null);
      }
    };
    void load();
    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    if (!open || !hasPaidPlan) return;
    let active = true;
    const loadPreview = async () => {
      try {
        const userId = await authenticatedUserId();
        const response = await fetch('/api/change-subscription', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ action: 'preview', userId, plan: selected }),
        });
        const data = await response.json() as { success?: boolean; error?: string; billingModeReset?: boolean } & BillingPreview;
        if (!active) return;
        if (data.billingModeReset) {
          setError(data.error || 'Your previous test subscription was disconnected. Reloading live billing…');
          window.setTimeout(() => window.location.reload(), 1600);
          return;
        }
        if (response.ok && data.success) setPreview(data);
      } catch {
        if (active) setPreview(null);
      }
    };
    void loadPreview();
    return () => { active = false; };
  }, [open, hasPaidPlan, selected]);

  const submit = async () => {
    if (requiresAcknowledgement && !acceptedTerms) {
      const message = 'Please confirm you understand the charge before continuing.';
      setError(message);
      onError?.(message);
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const userId = await authenticatedUserId();
      // A brand-new subscription goes to /checkout, which mounts Stripe Checkout
      // inside Drop24. The modal has no room for a card form, and the customer
      // never leaves the site.
      if (isNewSubscription) {
        window.location.assign(`/checkout?plan=${selected}`);
        return;
      }
      const response = await fetch('/api/change-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ userId, plan: selected }),
      });
      const raw = await response.text();
      let data: { success?: boolean; error?: string; requiresPayment?: boolean; paymentUrl?: string | null; message?: string; billingModeReset?: boolean };
      try {
        data = JSON.parse(raw);
      } catch {
        throw new Error('The plan service is unavailable. Please try again in a moment.');
      }
      if (data.billingModeReset) {
        setError(data.error || 'Your previous test subscription was disconnected. Reloading live billing…');
        window.setTimeout(() => window.location.reload(), 1600);
        return;
      }
      if (!response.ok || !data.success) throw new Error(data.error || 'Could not change your plan.');
      // An upgrade that owes money today finishes on /checkout/upgrade, which
      // mounts the card form on Drop24 rather than sending the customer to a
      // Stripe-hosted invoice.
      if (data.requiresPayment) return window.location.assign('/checkout/upgrade');
      setOutcome(data.message || 'Your plan change is confirmed.');
      onChanged?.();
    } catch (requestError) {
      const message = requestError instanceof Error ? requestError.message : 'Could not change your plan.';
      setError(message);
      onError?.(message);
    } finally {
      setIsSaving(false);
    }
  };

  const previewPending = hasPaidPlan && preview === null && !error;
  const needsTerms = requiresAcknowledgement && !acceptedTerms && !blockedBySchedule;
  const actionDisabled = isSaving || Boolean(outcome) || blockedBySchedule || needsTerms;

  if (typeof document === 'undefined') return null;

  return createPortal(<AnimatePresence>{open && (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
      className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-[#0f172a]/45 px-4 py-4 backdrop-blur-sm sm:py-6"
      role="dialog" aria-modal="true" aria-labelledby="plan-manager-title"
      onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 12, scale: 0.98 }} transition={{ duration: 0.22 }}
        className="w-full max-w-[36rem] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-[#e4ecfc] bg-white p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#2563eb]">Plan management</p>
            <h2 id="plan-manager-title" className="mt-1 text-[22px] font-bold tracking-tight text-[#0f172a]">{hasPaidPlan ? 'Manage your plan' : 'Choose a plan'}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={isSaving} className="rounded-lg border border-[#e4ecfc] p-2 text-[#64748b] transition-all duration-200 hover:bg-[#eff6ff] hover:text-[#2563eb] active:scale-95 disabled:opacity-50" aria-label="Close plan manager">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </div>

        {copy.cancellationNotice && (
          <div role="status" className="mt-4 rounded-xl border border-[#fed7aa] bg-[#fff7ed] px-4 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#9a3412]">Cancellation scheduled</p>
            <p className="mt-1 text-[12px] leading-relaxed text-[#9a3412]">{copy.cancellationNotice}</p>
            <p className="mt-2 text-[12px] leading-relaxed text-[#9a3412]">Changed your mind? Leave {PLANS[current].name} selected below and press <span className="font-bold">Resume {PLANS[current].name}</span>.</p>
          </div>
        )}

        <div className="mt-4 rounded-xl border border-[#e4ecfc] bg-[#f8fafc] px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-[13px] font-bold text-[#0f172a]">Current plan: {PLANS[current].name}</span>
            <span className="text-[13px] font-black text-[#2563eb]">{PLANS[current].price}{hasPaidPlan ? ' / month' : ''}</span>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-[#64748b]">{copy.statusLine}</p>
        </div>

        <fieldset className="mt-5">
          <legend className="text-[11px] font-black uppercase tracking-[0.14em] text-[#64748b]">Switch to</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {ALL_PLANS.map((plan) => {
              const item = PLANS[plan];
              const active = selected === plan;
              const isCurrent = plan === current;
              return (
                <button
                  key={plan}
                  type="button"
                  onClick={() => setSelected(plan)}
                  aria-pressed={active}
                  className={`rounded-xl border p-3 text-left transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563eb] focus-visible:ring-offset-2 ${active ? 'border-[#2563eb] bg-[#eff6ff] ring-2 ring-[#2563eb]/20' : 'border-[#e4ecfc] bg-white hover:border-[#bfdbfe] hover:bg-[#f8fbff]'}`}
                >
                  <span className={`block text-[13px] font-black ${active ? 'text-[#2563eb]' : 'text-[#0f172a]'}`}>{item.name}</span>
                  <span className="mt-0.5 block text-[11px] font-semibold text-[#64748b]">{item.price}{plan === 'free' ? '' : ' / mo'}</span>
                  {isCurrent && <span className="mt-2 block text-[10px] font-bold uppercase tracking-[0.1em] text-[#0f172a]">Current</span>}
                </button>
              );
            })}
          </div>
        </fieldset>

        {blockedBySchedule && (
          <p role="status" className="mt-4 rounded-lg border border-[#fed7aa] bg-[#fff7ed] px-3 py-2.5 text-[12px] font-medium leading-relaxed text-[#9a3412]">
            {copy.actionBlockedReason}
          </p>
        )}

        {!isChange && (
          <p className="mt-4 rounded-lg border border-[#e4ecfc] bg-[#f8fafc] px-3 py-2.5 text-[12px] leading-relaxed text-[#64748b]">
            {copy.kind !== 'keep'
              ? copy.actionBlockedReason
              : copy.cancelling
                ? `Resuming keeps ${PLANS[current].name} running as normal. Billing continues on your usual renewal date and nothing about your account changes.`
                : `Keeping ${PLANS[current].name} cancels the scheduled change. Your plan and price stay exactly as they are today.`}
          </p>
        )}

        {isChange && !blockedBySchedule && (
          <section className="mt-4 rounded-xl border border-[#e4ecfc]">
            <h3 className="border-b border-[#e4ecfc] px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.14em] text-[#0f172a]">What changes</h3>
            <dl className="divide-y divide-[#e4ecfc] text-[12px]">
              <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                <dt className="text-[#64748b]">Takes effect</dt>
                <dd className="text-right font-bold text-[#0f172a]">{copy.effective}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                <dt className="text-[#64748b]">Due today</dt>
                <dd className="text-right font-bold text-[#0f172a]">{copy.dueToday}</dd>
              </div>
              <div className="flex items-baseline justify-between gap-3 px-4 py-2.5">
                <dt className="text-[#64748b]">Then</dt>
                <dd className="text-right font-bold text-[#0f172a]">{copy.thenPay}</dd>
              </div>
            </dl>

            {changes.length > 0 && (
              <div className="border-t border-[#e4ecfc] px-4 py-3">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#64748b]">Your limits</p>
                <ul className="mt-2 space-y-1.5">
                  {changes.map((change) => (
                    <li key={change.key} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[12px]">
                      <span className="text-[#64748b]">{change.label}</span>
                      <span className="font-semibold">
                        <span className="text-[#94a3b8] line-through decoration-[#cbd5e1]">{change.from}</span>
                        <span aria-hidden="true" className="px-1.5 text-[#94a3b8]">&rarr;</span>
                        <span className={change.direction === 'up' ? 'text-[#047857]' : 'text-[#b45309]'}>{change.to}</span>
                        <span className="sr-only">{change.direction === 'up' ? ' (increases)' : ' (decreases)'}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {reductions.length > 0 && (
              <div className="border-t border-[#fed7aa] bg-[#fff7ed] px-4 py-3">
                <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#9a3412]">Before you switch</p>
                <ul className="mt-1.5 space-y-1 text-[12px] leading-relaxed text-[#9a3412]">
                  {reductions.map((reduction) => (
                    <li key={reduction.key}><span className="font-bold">{reduction.label}:</span> {reduction.consequence}</li>
                  ))}
                  <li>Nothing you have already uploaded is deleted by changing plans.</li>
                </ul>
              </div>
            )}
          </section>
        )}

        {requiresAcknowledgement && !blockedBySchedule && !outcome && (
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-[#e4ecfc] bg-[#f8fafc] p-3.5 text-[12px] leading-relaxed text-[#0f172a]">
            <input type="checkbox" checked={acceptedTerms} onChange={(event) => setAcceptedTerms(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-[#cbd5e1] accent-[#2563eb]" />
            <span>
              {isImmediateUpgrade
                ? `I understand ${preview?.immediateAmountFormatted ?? 'the prorated amount above'} is charged today, and ${PLANS[selected].name} then renews at ${PLANS[selected].price} / month.`
                : `I understand ${PLANS[selected].name} renews automatically at ${PLANS[selected].price} / month until I cancel.`}
              {' '}
              <a href="/terms" target="_blank" rel="noreferrer" className="font-bold text-[#2563eb] underline underline-offset-2">Read the Terms</a>.
            </span>
          </label>
        )}

        {error && <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] font-medium text-red-700">{error}</p>}
        {outcome && <p role="status" className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] font-medium text-emerald-800">{outcome}</p>}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
          <button type="button" onClick={onClose} disabled={isSaving} className="rounded-xl border border-[#1c1c1c]/15 px-4 py-2.5 text-[13px] font-bold text-[#1c1c1c] transition-all duration-200 hover:bg-[#1c1c1c] hover:text-white active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1c1c1c] focus-visible:ring-offset-2 disabled:opacity-40">
            {outcome ? 'Done' : 'Close'}
          </button>
          {/* No dead primary button. While the subscription is still loading the
              footer says so, and when there is genuinely nothing to do the button
              is absent rather than greyed out. */}
          {!outcome && previewPending && (
            <span className="inline-flex animate-pulse items-center rounded-xl bg-[#1c1c1c]/60 px-4 py-2.5 text-[13px] font-bold text-white">Checking your subscription…</span>
          )}
          {!outcome && !previewPending && copy.kind !== 'none' && (
            <button
              type="button"
              onClick={() => void submit()}
              disabled={actionDisabled}
              className="rounded-xl bg-[#1c1c1c] px-4 py-2.5 text-[13px] font-bold text-white shadow-sm transition-all duration-200 hover:bg-[#f97316] hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f97316] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:hover:bg-[#1c1c1c]"
            >
              {isSaving ? 'Working…' : copy.actionLabel}
            </button>
          )}
        </div>
        {!outcome && needsTerms && (
          <p className="mt-2 text-right text-[11px] font-medium text-[#94a3b8]">Tick the box above to continue.</p>
        )}

        {hasPaidPlan && !outcome && !copy.cancelling && (
          <p className="mt-3 text-[11px] leading-relaxed text-[#94a3b8]">
            Switching to Basic is how you cancel. You keep {PLANS[current].name} until {renewalDate ?? 'the end of the period you have paid for'}, and your account and files stay where they are.
          </p>
        )}
      </motion.div>
    </motion.div>
  )}</AnimatePresence>, document.body);
}
