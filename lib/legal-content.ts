export const TERMS_LAST_UPDATED = "September 23, 2026";
export const PRIVACY_LAST_UPDATED = "September 23, 2026";
export const termsSections: ReadonlyArray<readonly [string,string]> = [
  ["Portfolio demonstration","This website is a historical, interactive demonstration of Drop24. The hosted file-transfer service is retired, no account is created, and no transfer link produced by the demo is operational."],
  ["Local file handling","Files selected in the demonstration remain on your device. The interface simulates preparation progress and sharing controls without uploading, storing, transmitting, or processing file contents on a server."],
  ["No purchases or subscriptions","Displayed plans, limits, and product controls document the original service. Billing, subscriptions, support payments, and account management are disabled."],
  ["Acceptable use","Use the demo only for lawful evaluation. Do not rely on it to store, transfer, back up, or deliver files."],
  ["No warranty","The portfolio demo is provided as-is for informational purposes. Simulated links, download counts, expirations, and account data are illustrative."],
  ["Changes","The demo may be updated, moved, or removed at any time as the portfolio evolves."],
];
export const privacySections: ReadonlyArray<readonly [string,string]> = [
  ["Browser-only demo","The portfolio version has no backend, database, authentication provider, payment provider, email service, analytics service, or server-side storage."],
  ["Files stay local","Choosing or dropping a file gives the browser temporary access needed to display its name, type, and size. The file is never sent over the network and is not persisted by Drop24."],
  ["Simulated transfers","Progress, expiration settings, download limits, account details, transfer URLs, and QR codes are generated locally for demonstration. Generated links do not resolve to stored files."],
  ["Local browser data","Temporary interface state exists only in memory and normally disappears when the page is refreshed. The demo does not require cookies or local storage for account tracking."],
  ["Third parties","The static site is delivered by GitHub Pages. The application itself makes no requests to the retired Drop24 infrastructure or other application services."],
  ["Scope","This notice describes the public portfolio demo, not the retired production service that previously operated under the Drop24 name."],
];
