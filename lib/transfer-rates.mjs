// Single source of truth for download transfer lanes.
//
// The server throttles each download stream to these byte rates in
// The retired service used these limits; lib/plans.ts renders matching labels on the
// pricing page. Both read this file so a quoted speed cannot drift from the
// speed that is actually applied.
//
// Caps are per download stream and are chosen in decimal Mbps, the unit
// customers see in network-speed tests, rather than binary megabytes.
export const DOWNLOAD_BYTES_PER_SECOND = {
  anonymous: 625_000, // 5 Mbps
  free: 3_125_000, // 25 Mbps
  plus: 9_375_000, // 75 Mbps
  pro: 9_375_000, // 75 Mbps
};

/** The same caps as customer-facing copy, derived so the two cannot disagree. */
export const DOWNLOAD_SPEED_LABELS = Object.fromEntries(
  Object.entries(DOWNLOAD_BYTES_PER_SECOND).map(([plan, bytesPerSecond]) => [
    plan,
    `${(bytesPerSecond * 8) / 1_000_000} Mbps`,
  ]),
);
