// Customer-facing plan copy.
//
// Every number below is derived from lib/plan-limits.mjs and lib/transfer-rates.mjs
// — the same limits used by the original Drop24 product — so
// the pricing page, the plan manager, the account page, and the dashboard cannot
// describe a limit the service does not actually apply. Only names, prices, and
// prose live here as literals.

import { PLAN_LIMITS, formatLimitBytes, signedInDeviceLimit } from "./plan-limits.mjs";
import { DOWNLOAD_BYTES_PER_SECOND, DOWNLOAD_SPEED_LABELS } from "./transfer-rates.mjs";

export type PlanName = "free" | "plus" | "pro";

export const PLAN_ORDER: Record<PlanName, number> = { free: 0, plus: 1, pro: 2 };

// Rendered in this order wherever two plans are compared, so a change always
// reads down the same list.
export const LIMIT_KEYS = [
  "storage",
  "maxFile",
  "transfer",
  "downloads",
  "retention",
  "speed",
  "devices",
  "sharedSessions",
] as const;

export type LimitKey = (typeof LIMIT_KEYS)[number];

export const LIMIT_LABELS: Record<LimitKey, string> = {
  storage: "Storage",
  maxFile: "Max file size",
  transfer: "Monthly transfer",
  downloads: "Downloads per file",
  retention: "File retention",
  speed: "Download speed",
  devices: "Signed-in devices",
  sharedSessions: "Shared Sessions",
};

// What a reduction in each limit actually costs the customer. Shown only when a
// change lowers that limit, because that is the part people are surprised by.
export const LIMIT_CONSEQUENCE: Partial<Record<LimitKey, string>> = {
  storage: "Uploads are blocked once you are over the new limit. Existing files are never deleted for this reason.",
  maxFile: "Files already uploaded stay available. New uploads above the limit are rejected.",
  retention: "Files already extended past the new limit keep the expiry you gave them.",
  devices: "Your oldest signed-in devices are asked to sign in again.",
  speed: "Files you receive download at the slower lane. Files you send are unaffected.",
};

type PlanSpec = {
  name: string;
  price: string;
  priceNote: string;
  eyebrow: string;
  tagline: string;
  /** What the customer reads. */
  limits: Record<LimitKey, string>;
  /** Comparable form of the same limits, for detecting an increase or a decrease. */
  values: Record<LimitKey, number>;
  features: string[];
};

const UNLIMITED = Number.POSITIVE_INFINITY;

function deviceLabel(plan: PlanName): string {
  const limit = signedInDeviceLimit(plan);
  return limit === null ? "Unlimited" : String(limit);
}

function retentionLabel(plan: PlanName): string {
  const { retentionDays, defaultRetentionDays } = PLAN_LIMITS[plan];
  if (retentionDays <= defaultRetentionDays) return `${retentionDays} day`;
  return `Up to ${retentionDays} days`;
}

function limitsFor(plan: PlanName): Record<LimitKey, string> {
  const enforced = PLAN_LIMITS[plan];
  return {
    storage: formatLimitBytes(enforced.storageBytes),
    maxFile: formatLimitBytes(enforced.maxFileBytes),
    transfer: `${formatLimitBytes(enforced.monthlyTransferBytes)} / month`,
    downloads: `${enforced.maxDownloadsPerFile} per file`,
    retention: retentionLabel(plan),
    speed: DOWNLOAD_SPEED_LABELS[plan],
    devices: deviceLabel(plan),
    sharedSessions: enforced.canHostSharedSessions ? "Included" : "Not included",
  };
}

function valuesFor(plan: PlanName): Record<LimitKey, number> {
  const enforced = PLAN_LIMITS[plan];
  return {
    storage: enforced.storageBytes ?? UNLIMITED,
    maxFile: enforced.maxFileBytes,
    transfer: enforced.monthlyTransferBytes ?? UNLIMITED,
    downloads: enforced.maxDownloadsPerFile,
    retention: enforced.retentionDays,
    speed: DOWNLOAD_BYTES_PER_SECOND[plan],
    devices: signedInDeviceLimit(plan) ?? UNLIMITED,
    sharedSessions: enforced.canHostSharedSessions ? 1 : 0,
  };
}

/** The bullet list on a pricing card, in the order LIMIT_KEYS declares. */
function featuresFor(plan: PlanName): string[] {
  const limits = limitsFor(plan);
  const enforced = PLAN_LIMITS[plan];
  const retention = enforced.retentionDays <= enforced.defaultRetentionDays
    ? `${limits.retention} file retention`
    : `24-hour default, up to ${enforced.retentionDays}-day retention`;
  return [
    `${limits.storage} total storage`,
    `${limits.maxFile} max file size`,
    `${limits.transfer.replace(" / month", "")} monthly transfer`,
    `${limits.downloads.replace(" per file", "")} downloads per file`,
    retention,
    `${limits.speed} download speed`,
    // The asterisk points at the Fair Use note printed under the pricing table.
    signedInDeviceLimit(plan) === null ? "Unlimited signed-in devices*" : `${limits.devices} signed-in devices`,
    ...(enforced.canHostSharedSessions ? ["Host Shared Sessions"] : []),
  ];
}

export const PLANS: Record<PlanName, PlanSpec> = {
  free: {
    name: "Basic",
    price: "$0",
    priceNote: "Free, forever",
    eyebrow: "Entry",
    tagline: "Keep files across your own devices, at no cost.",
    limits: limitsFor("free"),
    values: valuesFor("free"),
    features: featuresFor("free"),
  },
  plus: {
    name: "Plus",
    price: "$4.99",
    priceNote: "per month",
    eyebrow: "Scale",
    tagline: "More room for larger transfers, longer retention, and priority service.",
    limits: limitsFor("plus"),
    values: valuesFor("plus"),
    features: featuresFor("plus"),
  },
  pro: {
    name: "Pro",
    price: "$9.99",
    priceNote: "per month",
    eyebrow: "Maximum",
    tagline: "Maximum room for large transfers and every advanced Drop24 feature.",
    limits: limitsFor("pro"),
    values: valuesFor("pro"),
    features: featuresFor("pro"),
  },
};

// Guests are not a purchasable plan, so they are not in PLANS, but the pricing
// FAQ still quotes their limits. They live here so that copy is derived from one
// place too. These mirror the `anonymous` entry in api/_lib/common.mjs.
export const GUEST_LIMITS = {
  maxFile: formatLimitBytes(PLAN_LIMITS.anonymous.maxFileBytes),
  uploadsPerHour: String(PLAN_LIMITS.anonymous.maxUploadsPerHour),
  downloads: `${PLAN_LIMITS.anonymous.maxDownloadsPerFile} per file`,
  retention: `${Math.round(PLAN_LIMITS.anonymous.retentionDays * 24)} hour`,
  speed: DOWNLOAD_SPEED_LABELS.anonymous,
  transfer: `${formatLimitBytes(PLAN_LIMITS.anonymous.monthlyTransferBytes)} / month`,
} as const;

export const PLAN_NAMES: Record<PlanName, string> = {
  free: PLANS.free.name,
  plus: PLANS.plus.name,
  pro: PLANS.pro.name,
};

export function isPlanName(value: unknown): value is PlanName {
  return value === "free" || value === "plus" || value === "pro";
}

export type LimitChange = {
  key: LimitKey;
  label: string;
  from: string;
  to: string;
  direction: "up" | "down";
  consequence?: string;
};

/** Only the limits that actually move, so the summary never pads with noise. */
export function limitChanges(from: PlanName, to: PlanName): LimitChange[] {
  return LIMIT_KEYS.flatMap((key) => {
    const before = PLANS[from].values[key];
    const after = PLANS[to].values[key];
    if (before === after) return [];
    const direction = after > before ? "up" : "down";
    return [{
      key,
      label: LIMIT_LABELS[key],
      from: PLANS[from].limits[key],
      to: PLANS[to].limits[key],
      direction,
      consequence: direction === "down" ? LIMIT_CONSEQUENCE[key] : undefined,
    }];
  });
}

export function formatBillingDate(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

// ---------------------------------------------------------------------------
// Plan-change copy
//
// Every sentence the plan manager shows about a change is derived here rather
// than inline in the component, so the wording for all nine transitions can be
// checked directly and the site and dashboard cannot describe the same change
// two different ways.
// ---------------------------------------------------------------------------

export type ChangeKind = "none" | "keep" | "new" | "upgrade" | "downgrade" | "cancel";

export type ChangeContext = {
  current: PlanName;
  selected: PlanName;
  /** Formatted renewal date, or null when it is not known yet. */
  renewalDate?: string | null;
  scheduledPlan?: PlanName | null;
  /** Formatted date the scheduled change lands on. */
  scheduledFor?: string | null;
  /** Formatted historical proration amount, when one applies. */
  immediateAmount?: string | null;
};

export type ChangeCopy = {
  kind: ChangeKind;
  isChange: boolean;
  blockedBySchedule: boolean;
  /** True while a cancellation is pending, so callers can surface it prominently. */
  cancelling: boolean;
  /** Reassurance shown when a cancellation is pending; null otherwise. */
  cancellationNotice: string | null;
  statusLine: string;
  effective: string;
  dueToday: string;
  thenPay: string;
  actionLabel: string;
  /** Null when the action is available. */
  actionBlockedReason: string | null;
};

export function describeChange(context: ChangeContext): ChangeCopy {
  const { current, selected, scheduledPlan = null } = context;
  const renewalDate = context.renewalDate ?? null;
  const scheduledFor = context.scheduledFor ?? renewalDate;
  const immediateAmount = context.immediateAmount ?? null;

  const hasPaidPlan = current !== "free";
  const isChange = selected !== current;
  const isUpgrade = PLAN_ORDER[selected] > PLAN_ORDER[current];
  const nextRenewal = renewalDate ?? "your next renewal date";

  const kind: ChangeKind = !isChange
    ? scheduledPlan ? "keep" : "none"
    : !hasPaidPlan
      ? "new"
      : selected === "free"
        ? "cancel"
        : isUpgrade
          ? "upgrade"
          : "downgrade";

  // The original billing system held one pending plan change at a time, so
  // clearing it is refused until the customer keeps their current plan.
  const blockedBySchedule = Boolean(scheduledPlan) && isChange && selected !== scheduledPlan;

  const cancelling = scheduledPlan === "free";

  const statusLine = !hasPaidPlan
    ? "Upgrading takes effect as soon as payment completes."
    : cancelling
      ? `Cancelling. You will not be billed again. ${PLANS[current].name} stays active until ${scheduledFor ?? "the end of the period you have paid for"}.`
      : scheduledPlan
        ? `Changing to ${PLANS[scheduledPlan].name} ${scheduledFor ? `on ${scheduledFor}` : "at your next renewal"}.`
        : renewalDate
          ? `Renews on ${renewalDate}.`
          : "Renews monthly.";

  const effective = kind === "new"
    ? "As soon as payment completes"
    : kind === "upgrade"
      ? "Immediately"
      : nextRenewal;

  const dueToday = kind === "new"
    ? "Shown at checkout"
    : kind === "upgrade"
      ? immediateAmount ?? "Calculating…"
      : "No charge today";

  const thenPay = kind === "cancel"
    ? `$0 — Basic from ${nextRenewal}`
    : kind === "upgrade" && renewalDate
      ? `${PLANS[selected].price} / month from ${renewalDate}`
      : `${PLANS[selected].price} / month`;

  const actionLabel = kind === "keep"
    ? cancelling ? `Resume ${PLANS[current].name}` : `Keep ${PLANS[current].name}`
    : kind === "none"
      ? "No change selected"
      : kind === "new"
        ? "Continue to payment"
        : kind === "upgrade"
          ? `Upgrade to ${PLANS[selected].name}`
          : `Schedule switch to ${PLANS[selected].name}`;

  const actionBlockedReason = blockedBySchedule
    ? `A change to ${scheduledPlan ? PLANS[scheduledPlan].name : "another plan"} is already scheduled for ${scheduledFor ?? "your next renewal date"}. Choose ${PLANS[current].name} to clear it first, then pick a different plan.`
    : kind === "none"
      ? "This is the plan you are on. Pick a different one above to see exactly what would change."
      : null;

  const cancellationNotice = cancelling
    ? `Your ${PLANS[current].name} subscription is cancelling, so there are no further charges. You keep every ${PLANS[current].name} feature until ${scheduledFor ?? "the end of the period you have paid for"}, then the account returns to Basic. Your account and files stay exactly where they are.`
    : null;

  return { kind, isChange, blockedBySchedule, cancelling, cancellationNotice, statusLine, effective, dueToday, thenPay, actionLabel, actionBlockedReason };
}
