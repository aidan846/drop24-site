// The one place Drop24's plan limits are written down.
//
// api/_lib/common.mjs re-exports this table and the API enforces it directly.
// lib/plans.ts derives every customer-facing sentence from the same numbers, so
// the pricing page, the plan manager, the account page, and the dashboard cannot
// quote a limit the service does not actually apply.
//
// `maxPairedDevices` counts devices *in addition to* the one being signed in, so
// the signed-in device total a customer sees is maxPairedDevices + 1. null means
// no limit.
const MB = 1024 * 1024;
const GB = 1024 * MB;

export const PLAN_LIMITS = {
  anonymous: { maxFileBytes: 10 * MB, storageBytes: null, defaultRetentionDays: 1 / 24, retentionDays: 1 / 24, maxPairedDevices: 0, maxUploadsPerHour: 2, maxDownloadsPerFile: 5, monthlyTransferBytes: 2 * GB, priorityTransfers: false, canHostSharedSessions: false },
  free: { maxFileBytes: 100 * MB, storageBytes: 100 * MB, defaultRetentionDays: 1, retentionDays: 1, maxPairedDevices: 1, maxUploadsPerHour: null, maxDownloadsPerFile: 10, monthlyTransferBytes: 10 * GB, priorityTransfers: false, canHostSharedSessions: false },
  plus: { maxFileBytes: GB, storageBytes: 5 * GB, defaultRetentionDays: 1, retentionDays: 7, maxPairedDevices: 9, maxUploadsPerHour: null, maxDownloadsPerFile: 25, monthlyTransferBytes: 50 * GB, priorityTransfers: true, canHostSharedSessions: true },
  pro: { maxFileBytes: 5 * GB, storageBytes: 25 * GB, defaultRetentionDays: 1, retentionDays: 30, maxPairedDevices: null, maxUploadsPerHour: null, maxDownloadsPerFile: 100, monthlyTransferBytes: 250 * GB, priorityTransfers: true, canHostSharedSessions: true },
};

/** Signed-in device total a customer sees, or null when the plan has no limit. */
export function signedInDeviceLimit(planName) {
  const max = PLAN_LIMITS[planName]?.maxPairedDevices;
  return max === null || max === undefined ? null : max + 1;
}

/** Byte counts as the plan pages write them: whole units, binary multiples. */
export function formatLimitBytes(bytes) {
  if (bytes === null || bytes === undefined) return "Unlimited";
  const units = [
    [GB, "GB"],
    [MB, "MB"],
    [1024, "KB"],
  ];
  for (const [size, label] of units) {
    if (bytes >= size) {
      const value = bytes / size;
      return `${Number.isInteger(value) ? value : value.toFixed(1)} ${label}`;
    }
  }
  return `${bytes} B`;
}
