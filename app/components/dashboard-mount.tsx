"use client";

import dynamic from "next/dynamic";

// The dashboard reads localStorage (device id, pair token, shared-session state)
// while computing its initial state, which cannot run on the server. It was a
// client-only SPA before the merge and stays one: this mounts it in the browser
// only, so prerendering never touches those reads.
const DashboardClient = dynamic(() => import("./dashboard-client"), {
  ssr: false,
  loading: () => <main className="flex-1 bg-background" aria-label="Loading your dashboard" />,
});

export default function DashboardMount() {
  return <DashboardClient />;
}
