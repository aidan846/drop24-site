export type EnforcedPlanName = 'anonymous' | 'free' | 'plus' | 'pro';

export type EnforcedPlanLimits = {
  maxFileBytes: number;
  storageBytes: number | null;
  defaultRetentionDays: number;
  retentionDays: number;
  maxPairedDevices: number | null;
  maxUploadsPerHour: number | null;
  maxDownloadsPerFile: number;
  monthlyTransferBytes: number | null;
  priorityTransfers: boolean;
  canHostSharedSessions: boolean;
};

export declare const PLAN_LIMITS: Record<EnforcedPlanName, EnforcedPlanLimits>;
export declare function signedInDeviceLimit(planName: EnforcedPlanName): number | null;
export declare function formatLimitBytes(bytes: number | null | undefined): string;
