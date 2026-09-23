"use client";

import { useState, useEffect, useRef } from "react";
import type { ReactNode } from "react";
type User = { id: string; email?: string; created_at?: string };
import { AnimatePresence, motion, type Variants } from "motion/react";
import PlanManagementModal, { type PlanName } from "./plan-management-modal";
import SiteFooter from "./site-footer";
import { signInWithGooglePopup } from "@/lib/oauth-popup";
import {
  authHeaders,
  isSupabaseAuthConfigured,
  supabase,
  supabaseAnonKey,
  supabaseStorageBucket,
  verifyEmailOtp,
} from "@/lib/supabase-browser";
import {
  shouldUseResumableUpload,
  uploadResumable,
} from "@/lib/resumable-upload";
import { installDemoBackend } from "@/lib/demo-backend";

if (typeof window !== "undefined") installDemoBackend();

export const pageVariants: Variants = {
  initial: {
    opacity: 0,
    y: 14,
    filter: "blur(5px)",
  },
  animate: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: {
      duration: 0.42,
      ease: [0.22, 1, 0.36, 1],
    },
  },
  exit: {
    opacity: 0,
    y: -10,
    filter: "blur(4px)",
    transition: {
      duration: 0.18,
      ease: [0.4, 0, 1, 1],
    },
  },
};

function DotSeparator() {
  return (
    <span
      aria-hidden="true"
      className="h-1 w-1 shrink-0 rounded-full bg-current opacity-55"
    />
  );
}

interface FileRecord {
  id: string;
  fileName: string;
  fileSize: number;
  downloadCount: number;
  createdAt: string;
  sourceDeviceId?: string | null;
  sourceDeviceName?: string | null;
  expiresAt: string;
  url: string;
}

interface PairedDevice {
  deviceId: string;
  deviceName: string;
  isHost: boolean;
  lastSeenAt: string;
}

interface PlanInfo {
  plan: "free" | "plus" | "pro";
  limits: {
    maxFileBytes: number;
    storageBytes: number;
    defaultRetentionDays: number;
    retentionDays: number;
    maxPairedDevices: number | null;
    maxDownloadsPerFile: number;
    priorityTransfers: boolean;
  };
  usage: {
    activeFiles: number;
    storageBytes: number;
  };
}

const USER_ID_KEY = "drop24_user_id";
const USER_ID_COOKIE = USER_ID_KEY + "=";
const DEVICE_ID_KEY = "drop24_device_id";
const PAIR_ACCESS_TOKEN_KEY = "drop24_pair_access_token";
const SHARED_SESSION_INVITE_KEY = "drop24_shared_session_invite";
const SHARED_SESSION_OWNER_KEY = "drop24_shared_session_owner";

function getDeviceId() {
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId =
      crypto.randomUUID?.() ??
      "device_" + Math.random().toString(36).slice(2, 15);
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

function getDeviceName() {
  const userAgent = navigator.userAgent;
  if (/iPhone/i.test(userAgent)) return "iPhone";
  if (/iPad/i.test(userAgent)) return "iPad";
  if (/Android/i.test(userAgent)) return "Android device";
  if (/Macintosh/i.test(userAgent)) return "Mac";
  if (/Windows/i.test(userAgent)) return "Windows PC";
  return "Another device";
}

function persistUserId(userId: string) {
  localStorage.setItem(USER_ID_KEY, userId);
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie =
    USER_ID_COOKIE +
    encodeURIComponent(userId) +
    "; Max-Age=31536000; Path=/; SameSite=Lax" +
    secure;
}

async function writeToClipboard(text: string) {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Mobile Safari can reject the modern API even after a direct tap.
    }
  }

  const input = document.createElement("textarea");
  input.value = text;
  input.setAttribute("readonly", "");
  input.style.position = "fixed";
  input.style.left = "-9999px";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.focus({ preventScroll: true });
  input.select();
  input.setSelectionRange(0, input.value.length);
  const copied = document.execCommand("copy");
  input.remove();
  return copied;
}
export default function Dashboard() {
  const [userId, setUserId] = useState<string>("");
  const [deviceId, setDeviceId] = useState(getDeviceId);
  const [pairedDevices, setPairedDevices] = useState<PairedDevice[]>([]);
  const [isHostDevice, setIsHostDevice] = useState(false);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<FileRecord | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [retentionFileId, setRetentionFileId] = useState<string | null>(null);
  const [retentionLoading, setRetentionLoading] = useState(false);
  const [pairQrCodeUrl, setPairQrCodeUrl] = useState<string>("");
  const [pairingLink, setPairingLink] = useState<string>("");
  const [sharedSession, setSharedSession] = useState<SharedSession | null>(null);
  const [confirmEndSharedSession, setConfirmEndSharedSession] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
  const [planManagerOpen, setPlanManagerOpen] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<{ [key: string]: string }>(
    {},
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadInFlightRef = useRef(false);

  // Drop24 currently ships with one fixed, light visual theme.
  const isDark = false;
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [dangerZoneOpen, setDangerZoneOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [emailLinkSent, setEmailLinkSent] = useState(false);
  const [emailCode, setEmailCode] = useState("");
  const [authStatus, setAuthStatus] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!supabase);
  const [notification, setNotification] = useState<{
    type: "success" | "error";
    message: string;
    upgrade?: boolean;
  } | null>(null);
  const notificationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const knownFileIdsRef = useRef(new Set<string>());
  const hasLoadedFilesRef = useRef(false);
  const deviceAccessRemovedRef = useRef(false);
  const deviceRegisteredRef = useRef(false);
  const deviceRegistrationPromptRef = useRef(false);
  const suppressNextSignOutNotificationRef = useRef(false);
  const planFetchErrorShownRef = useRef(false);
  const authUserIdRef = useRef<string | null>(null);
  const previousAuthUserIdRef = useRef<string | null>(null);
  const checkoutReconciledRef = useRef(false);
  const sharedSessionIdRef = useRef<string | null>(null);
  const lastAutoSubmittedCodeRef = useRef<string | null>(null);
  const sharedMemberUserId = sharedSession?.memberUserId ?? userId;
  const sharedSessionHeaders = (): Record<string, string> =>
    sharedSession?.memberToken
      ? { "X-Drop24-Shared-Session-Token": sharedSession.memberToken }
      : {};
  const exitSharedSession = () => {
    sessionStorage.removeItem(SHARED_SESSION_INVITE_KEY);
    sessionStorage.removeItem(SHARED_SESSION_OWNER_KEY);
    sharedSessionIdRef.current = null;
    setSharedSession(null);
    setConfirmEndSharedSession(false);
    setPairingLink("");
    setFiles([]);
    setSelectedFile(null);
    setRetentionFileId(null);
    knownFileIdsRef.current = new Set();
  };

  const showNotification = (
    type: "success" | "error",
    message: string,
    upgrade = false,
  ) => {
    if (notificationTimerRef.current)
      clearTimeout(notificationTimerRef.current);
    setNotification({ type, message, upgrade });
    // An upgrade prompt carries a button, so it waits to be dismissed rather
    // than sliding away while the person is still reading it.
    if (upgrade) return;
    notificationTimerRef.current = setTimeout(
      () => setNotification(null),
      3000,
    );
  };

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      authUserIdRef.current = data.session?.user.id ?? null;
      setAuthUser(data.session?.user ?? null);
      if (data.session?.user) {
        localStorage.removeItem(PAIR_ACCESS_TOKEN_KEY);
        persistUserId(data.session.user.id);
        setUserId(data.session.user.id);
      }
      setAuthReady(true);
      const isAuthCallback =
        window.location.hash.includes("access_token") ||
        new URLSearchParams(window.location.search).has("code");
      if (data.session && isAuthCallback)
        showNotification("success", "Log in successful");
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        authUserIdRef.current = session?.user.id ?? null;
        setAuthUser(session?.user ?? null);
        if (session?.user) {
          localStorage.removeItem(PAIR_ACCESS_TOKEN_KEY);
          persistUserId(session.user.id);
          setUserId(session.user.id);
        }

        if (event === "SIGNED_OUT") {
          if (suppressNextSignOutNotificationRef.current) {
            suppressNextSignOutNotificationRef.current = false;
          } else {
            showNotification("success", "Log out successful");
          }
        }
      },
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authUser?.id) return;
    const previousUserId = previousAuthUserIdRef.current;
    if (previousUserId && previousUserId !== authUser.id) {
      // Never carry a shared-session invite across account changes in the same tab.
      // The invite may belong to another account or to an abandoned room.
      sessionStorage.removeItem(SHARED_SESSION_INVITE_KEY);
      sessionStorage.removeItem(SHARED_SESSION_OWNER_KEY);
      if (sharedSession) exitSharedSession();
    }
    previousAuthUserIdRef.current = authUser.id;
  }, [authUser?.id, sharedSession]);

  useEffect(() => {
    if (!authReady || authUser || sharedSession) return;
    const hasSessionInvite =
      new URLSearchParams(window.location.search).has("session") ||
      Boolean(sessionStorage.getItem(SHARED_SESSION_INVITE_KEY));
    if (!hasSessionInvite) window.location.replace("/account");
  }, [authReady, authUser, sharedSession]);

  useEffect(() => {
    if (!uploadError) return;
    showNotification("error", uploadError);
    const id = setTimeout(() => setUploadError(null), 3200);
    return () => clearTimeout(id);
  }, [uploadError]);

  useEffect(() => {
    if (!confirmEndSharedSession) return;
    const timeout = window.setTimeout(() => setConfirmEndSharedSession(false), 3500);
    return () => window.clearTimeout(timeout);
  }, [confirmEndSharedSession]);

  useEffect(() => {
    const modalOpen = authModalOpen || qrModalOpen || Boolean(retentionFileId) || planManagerOpen;
    if (!modalOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [authModalOpen, qrModalOpen, retentionFileId, planManagerOpen]);

  useEffect(() => {
    sharedSessionIdRef.current = sharedSession?.id ?? null;
  }, [sharedSession]);

  useEffect(() => {
    if (!sharedSession) return;
    let cancelled = false;
    const sessionId = sharedSession.id;
    const checkSessionStatus = async () => {
      try {
        const response = await fetch("/api/shared-session", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()), ...sharedSessionHeaders() },
          body: JSON.stringify({ action: "status", sessionId, userId: sharedSession.memberUserId }),
        });
        const data = await response.json();
        if (cancelled || sharedSessionIdRef.current !== sessionId) return;
        if (response.status === 403 || response.status === 404) {
          exitSharedSession();
          showNotification(
            "success",
            data.inactive
              ? "You were removed after an hour of inactivity."
              : data.error || "This Shared Session has ended.",
          );
          if (!authUser) {
            window.setTimeout(() => window.location.replace("/"), 900);
          }
          return;
        }
        if (response.ok && data.success && data.session) {
          setSharedSession((current) => current ? { ...data.session, memberUserId: current.memberUserId, memberToken: current.memberToken, hostEndToken: current.hostEndToken } : current);
          if (data.session.inviteToken) setPairingLink(`${window.location.origin}/dashboard?session=${encodeURIComponent(data.session.inviteToken)}`);
        }
      } catch (error) {
        console.error("Failed to check Shared Session status:", error);
      }
    };
    const interval = window.setInterval(() => void checkSessionStatus(), 2000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [sharedSession]);

  useEffect(() => {
    if (!authReady) return;
    const params = new URLSearchParams(window.location.search);
    const explicitSessionToken = params.get("session");
    const savedSessionToken = sessionStorage.getItem(SHARED_SESSION_INVITE_KEY);
    const savedSessionOwner = sessionStorage.getItem(SHARED_SESSION_OWNER_KEY);
    const savedSessionBelongsToCurrentUser = authUser
      ? savedSessionOwner === authUser.id
      : savedSessionOwner === "guest";
    if (!explicitSessionToken && savedSessionToken && !savedSessionBelongsToCurrentUser) {
      sessionStorage.removeItem(SHARED_SESSION_INVITE_KEY);
      sessionStorage.removeItem(SHARED_SESSION_OWNER_KEY);
    }
    const sessionToken = explicitSessionToken || (savedSessionBelongsToCurrentUser ? savedSessionToken : null);
    if (sessionToken) {
      const joinPairing = async () => {
        try {
          const res = await fetch("/api/shared-session", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(authUser ? await authHeaders() : {}) },
            body: JSON.stringify({
              action: "join",
              inviteToken: sessionToken,
              userId: authUser?.id || "",
              displayName: authUser?.email?.split("@")[0] || "Guest",
            }),
          });
          const data = await res.json();
          if (!res.ok || !data.success) {
            sessionStorage.removeItem(SHARED_SESSION_INVITE_KEY);
            showNotification("error", data.error || "Could not join this Shared Session.");
            window.setTimeout(() => window.location.replace("/account"), 1800);
            return;
          }
          sharedSessionIdRef.current = data.session.id;
          setFiles([]);
          setSelectedFile(null);
          knownFileIdsRef.current = new Set();
          setSharedSession({
            ...data.session,
            memberUserId: data.memberUserId,
            memberToken: data.guestMemberToken,
          });
          setUserId(data.memberUserId);
          sessionStorage.setItem(SHARED_SESSION_INVITE_KEY, sessionToken);
          sessionStorage.setItem(SHARED_SESSION_OWNER_KEY, authUser?.id || "guest");
          setPairingLink(`${window.location.origin}/dashboard?session=${encodeURIComponent(sessionToken)}`);
          window.history.replaceState({}, document.title, window.location.pathname);
          showNotification("success", "Joined Shared Session.");
        } catch (error) {
          sessionStorage.removeItem(SHARED_SESSION_INVITE_KEY);
          console.error("Failed to join pairing link:", error);
          showNotification("error", "Could not join this Shared Session. Please try again.");
          window.setTimeout(() => window.location.replace("/account"), 1800);
        }
      };
      void joinPairing();
      return;
    }

    if (!authUser) {
      setUserId("");
      return;
    }

    if (authUser?.id) {
      const restoreCurrentSession = async () => {
        try {
          const res = await fetch("/api/shared-session", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(await authHeaders()) },
            body: JSON.stringify({ action: "current", userId: authUser.id }),
          });
          const data = await res.json();
          if (!res.ok || !data.success || !data.session) return;
          sharedSessionIdRef.current = data.session.id;
          setFiles([]);
          setSelectedFile(null);
          knownFileIdsRef.current = new Set();
          setSharedSession({ ...data.session, memberUserId: authUser.id });
          if (data.session.inviteToken) setPairingLink(`${window.location.origin}/dashboard?session=${encodeURIComponent(data.session.inviteToken)}`);
        } catch (error) {
          console.error("Failed to restore Shared Session:", error);
        }
      };
      void restoreCurrentSession();
    }
    const syncId = params.get("sync");
    const uid = authUserIdRef.current || authUser.id;
    if (syncId) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    persistUserId(uid);
    setUserId(uid);
  }, [authReady, authUser]);

  const fetchFiles = async (uid: string) => {
    const requestedSessionId = sharedSession?.id ?? null;
    const authenticatedUserId = authUserIdRef.current;
    if (authenticatedUserId && uid !== authenticatedUserId) return;
    if (authUser && !deviceRegisteredRef.current) return;
    try {
      const res = await fetch(
        `/api/files?userId=${encodeURIComponent(sharedSession?.memberUserId ?? uid)}&deviceId=${encodeURIComponent(deviceId)}${sharedSession ? `&sharedSessionId=${encodeURIComponent(sharedSession.id)}` : ""}`,
        { headers: { ...(await authHeaders()), ...sharedSessionHeaders() } },
      );
      const data = await res.json();
      if (sharedSessionIdRef.current !== requestedSessionId) return;
      if (authUserIdRef.current && authUserIdRef.current !== uid) return;
      if (!data.success) {
        if (res.status === 403 && !deviceAccessRemovedRef.current) {
          deviceAccessRemovedRef.current = true;
          setFiles([]);
          showNotification(
            "error",
            "This device was signed out because it no longer has access to this account.",
          );
          if (authUser && supabase) {
            suppressNextSignOutNotificationRef.current = true;
            void supabase.auth.signOut({ scope: "local" });
          } else {
            localStorage.removeItem(PAIR_ACCESS_TOKEN_KEY);
            setPairedDevices([]);
          }
        }
        return;
      }
      deviceAccessRemovedRef.current = false;

      const incomingFiles = data.files as FileRecord[];
      if (hasLoadedFilesRef.current) {
        const uploadedElsewhere = incomingFiles.find(
          (file) =>
            !knownFileIdsRef.current.has(file.id) &&
            file.sourceDeviceId !== deviceId,
        );
        if (uploadedElsewhere) {
          showNotification(
            "success",
            uploadedElsewhere.sourceDeviceName
              ? `A new file was uploaded from ${uploadedElsewhere.sourceDeviceName}.`
              : "A new file has been uploaded.",
          );
        }
      }
      knownFileIdsRef.current = new Set(incomingFiles.map((file) => file.id));
      hasLoadedFilesRef.current = true;
      setFiles(incomingFiles);
      const requestedFileId = new URLSearchParams(window.location.search).get("file");
      const requestedFile = requestedFileId
        ? incomingFiles.find((file) => file.id === requestedFileId) ?? null
        : null;
      setSelectedFile((current) =>
        requestedFile ??
        (current ? incomingFiles.find((file) => file.id === current.id) ?? null : null),
      );
      if (requestedFileId && requestedFile) window.history.replaceState({}, document.title, "/dashboard");
    } catch (err) {
      console.error("Failed to fetch files:", err);
    }
  };

  useEffect(() => {
    if (!authReady || !userId) return;
    hasLoadedFilesRef.current = false;
    knownFileIdsRef.current = new Set();
    deviceAccessRemovedRef.current = false;
    void fetchFiles(userId);
  }, [authReady, userId, deviceId, sharedSession]);

  useEffect(() => {
    if (!userId || !authUser) {
      deviceRegisteredRef.current = false;
      deviceAccessRemovedRef.current = false;
      setPairedDevices([]);
      setIsHostDevice(false);
      return;
    }
    deviceRegisteredRef.current = false;
    deviceAccessRemovedRef.current = false;
    const registerDevice = async () => {
      try {
        const res = await fetch("/api/devices", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({
            userId,
            deviceId,
            deviceName: getDeviceName(),
          }),
        });
        const responseBody = await res.text();
        let data: {
          success?: boolean;
          error?: string;
          upgrade?: boolean;
          deviceLimit?: boolean;
          inactive?: boolean;
          oldestDevice?: PairedDevice;
          devices?: PairedDevice[];
          isHost?: boolean;
        };
        try {
          data = JSON.parse(responseBody);
        } catch {
          throw new Error(`Device service unavailable (HTTP ${res.status}).`);
        }
        if (res.status === 409 && data.deviceLimit && data.oldestDevice) {
          if (deviceRegistrationPromptRef.current) return;
          deviceRegistrationPromptRef.current = true;
          const oldestName = data.oldestDevice.deviceName || "the oldest device";
          const replaceOldest = window.confirm(
            `You are already signed in on the maximum number of devices for this plan. Do you want to log out ${oldestName} and sign in on this device?`,
          );

          if (!replaceOldest) {
            suppressNextSignOutNotificationRef.current = true;
            await supabase?.auth.signOut({ scope: "local" });
            showNotification("error", "This device was not signed in.");
            deviceRegistrationPromptRef.current = false;
            return;
          }

          const replacementRes = await fetch("/api/devices", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...(await authHeaders()) },
            body: JSON.stringify({
              userId,
              deviceId,
              deviceName: getDeviceName(),
              replaceDeviceId: data.oldestDevice.deviceId,
            }),
          });
          const replacementData = await replacementRes.json();
          deviceRegistrationPromptRef.current = false;
          if (!replacementRes.ok || !replacementData.success) {
            showNotification(
              "error",
              replacementData.error || "Could not replace the oldest device.",
            );
            return;
          }
          setPairedDevices(replacementData.devices || []);
          setIsHostDevice(Boolean(replacementData.isHost));
          deviceRegisteredRef.current = true;
          showNotification("success", `${oldestName} was signed out. This device is now logged in.`);
          void fetchFiles(userId);
          return;
        }

        if (res.status === 401 && data.inactive) {
          suppressNextSignOutNotificationRef.current = true;
          setPairedDevices([]);
          await supabase?.auth.signOut({ scope: "local" });
          showNotification("error", "You were signed out after 7 days of inactivity. Please sign in again.");
          return;
        }

        if (!res.ok || !data.success) {
          showNotification(
            "error",
            data.error || "Could not connect this device.",
            Boolean(data.upgrade),
          );
          return;
        }
        setPairedDevices(data.devices || []);
        setIsHostDevice(Boolean(data.isHost));
        deviceRegisteredRef.current = true;
        void fetchFiles(userId);
      } catch (error) {
        deviceRegistrationPromptRef.current = false;
        console.error("Failed to register device:", error);
        showNotification("error", "Could not verify this device login. Please try again.");
      }
    };
    void registerDevice();
  }, [userId, deviceId, authUser, sharedSession]);

  useEffect(() => {
    if (!authReady || !userId) return;

    // Guest sessions use the local guest limits in the upload flow. Do not
    // call the authenticated plan API for a logged-out browser, especially
    // after sign-out where the previous user id may still be in storage.
    if (!authUser) {
      setPlanInfo(null);
      planFetchErrorShownRef.current = false;
      return;
    }

    const fetchPlan = async () => {
      try {
        const authenticatedUserId = authUserIdRef.current;
        if (authenticatedUserId && authenticatedUserId !== userId) return;
        const res = await fetch(`/api/plan?userId=${userId}`, { headers: await authHeaders() });
        const data = await res.json() as {
          success?: boolean;
          plan?: PlanInfo['plan'];
          limits?: PlanInfo['limits'];
          usage?: PlanInfo['usage'];
          error?: string;
        };
        if (authUserIdRef.current && authUserIdRef.current !== userId) return;
        if (data.success && data.plan && data.limits && data.usage) {
          planFetchErrorShownRef.current = false;
          setPlanInfo({
            plan: data.plan,
            limits: data.limits,
            usage: data.usage,
          });
        } else if (!planFetchErrorShownRef.current) {
          planFetchErrorShownRef.current = true;
          showNotification("error", data.error || "Could not load your plan limits.");
        }
      } catch (err) {
        console.error("Failed to fetch plan:", err);
        if (!planFetchErrorShownRef.current) {
          planFetchErrorShownRef.current = true;
          showNotification("error", "Could not load your plan limits. Please refresh and try again.");
        }
      }
    };

    fetchPlan();
  }, [userId, authUser]);

  useEffect(() => {
    if (!authReady || !authUser || !userId || checkoutReconciledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (params.get("checkout") !== "success" || !sessionId) return;
    checkoutReconciledRef.current = true;

    const reconcileCheckout = async () => {
      try {
        const response = await fetch("/api/checkout-complete", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(await authHeaders()) },
          body: JSON.stringify({ userId, sessionId }),
        });
        const data = await response.json() as { success?: boolean; error?: string };
        if (!response.ok || !data.success) throw new Error(data.error || "Could not verify the completed payment.");
        params.delete("checkout");
        params.delete("session_id");
        const cleanQuery = params.toString();
        window.history.replaceState({}, document.title, `${window.location.pathname}${cleanQuery ? `?${cleanQuery}` : ""}`);
        window.location.reload();
      } catch (error) {
        checkoutReconciledRef.current = false;
        showNotification("error", error instanceof Error ? error.message : "Could not verify the completed payment.");
      }
    };
    void reconcileCheckout();
  }, [authReady, authUser, userId]);

  useEffect(() => {
    if (!authReady || !userId || (!authUser && !sharedSession)) return;
    const refresh = async () => {
      void fetchFiles(userId);
      if (!authUser || !deviceId) return;
      const headers = await authHeaders();
      void fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ userId, deviceId, deviceName: getDeviceName() }),
      })
        .then(async (res) => {
          const data = await res.json();
          if (res.ok && data.success) {
            setPairedDevices(data.devices || []);
            setIsHostDevice(Boolean(data.isHost));
            deviceRegisteredRef.current = true;
          } else if (res.status === 401 && data.inactive) {
            suppressNextSignOutNotificationRef.current = true;
            await supabase?.auth.signOut({ scope: "local" });
            showNotification("error", "You were signed out after 7 days of inactivity. Please sign in again.");
          } else if (res.status === 403 && !deviceAccessRemovedRef.current) {
            deviceAccessRemovedRef.current = true;
            setFiles([]);
            showNotification("error", "This device was signed out because it no longer has access to this account.");
            if (authUser && supabase) {
              suppressNextSignOutNotificationRef.current = true;
              await supabase.auth.signOut({ scope: "local" });
            } else {
              localStorage.removeItem(PAIR_ACCESS_TOKEN_KEY);
              setPairedDevices([]);
            }
          }
        })
        .catch((error) =>
          console.error("Failed to refresh paired devices:", error),
        );
    };
    const interval = setInterval(() => void refresh(), 5000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [authReady, userId, deviceId, authUser, sharedSession]);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const updated: { [k: string]: string } = {};
      files.forEach((f) => {
        const diff = new Date(f.expiresAt).getTime() - now;
        if (diff <= 0) {
          updated[f.id] = "Expired";
          return;
        }
        const totalSeconds = Math.floor(diff / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        updated[f.id] = `${days}D ${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
      });
      setTimeRemaining(updated);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [files]);

  useEffect(() => {
    if (!pairingLink) {
      setPairQrCodeUrl("");
      return;
    }
    let cancelled = false;
    const qrBg = isDark ? "#161b27" : "#ffffff";
    void import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(pairingLink, {
        width: 256,
        margin: 2,
        color: isDark
          ? { dark: "#ffffff", light: qrBg }
          : { dark: "#0f172a", light: qrBg },
      }))
      .then((url) => {
        if (!cancelled) setPairQrCodeUrl(url);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [pairingLink, isDark]);

  const createPairingLink = async () => {
    if (!authUser || !userId || !deviceId) return null;
    try {
      const res = await fetch("/api/shared-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ action: "create", userId, displayName: authUser.email?.split("@")[0] || "Host" }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showNotification("error", data.error || "Could not create a pairing link.");
        return null;
      }
      sharedSessionIdRef.current = data.session.id;
      setFiles([]);
      setSelectedFile(null);
      knownFileIdsRef.current = new Set();
      setSharedSession({ ...data.session, memberUserId: userId });
      const link = `${window.location.origin}/dashboard?session=${encodeURIComponent(data.inviteToken)}`;
      sessionStorage.setItem(SHARED_SESSION_INVITE_KEY, data.inviteToken);
      sessionStorage.setItem(SHARED_SESSION_OWNER_KEY, userId);
      setPairingLink(link);
      return link;
    } catch (error) {
      console.error("Failed to create pairing link:", error);
      showNotification("error", "Could not create a pairing link.");
      return null;
    }
  };

  const leaveSharedSession = async () => {
    if (!sharedSession) return;
    const action = sharedSession.isHost ? "end" : "leave";
    if (sharedSession.isHost && !confirmEndSharedSession) {
      setConfirmEndSharedSession(true);
      return;
    }
    const res = await fetch("/api/shared-session", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()), ...sharedSessionHeaders() }, body: JSON.stringify({ action, userId: sharedMemberUserId, sessionId: sharedSession.id }) });
    const data = await res.json();
    if (!res.ok || !data.success) return showNotification("error", data.error || "Could not leave Shared Session.");
    exitSharedSession();
    if (!authUser) window.location.replace("/");
  };

  const kickSharedSessionMember = async (targetUserId: string) => {
    if (!sharedSession || !authUser) return;
    const res = await fetch("/api/shared-session", { method: "POST", headers: { "Content-Type": "application/json", ...(await authHeaders()) }, body: JSON.stringify({ action: "kick", userId: authUser.id, sessionId: sharedSession.id, targetUserId }) });
    const data = await res.json();
    if (!res.ok || !data.success) return showNotification("error", data.error || "Could not remove member.");
    setSharedSession((current) => current ? { ...data.session, memberUserId: current.memberUserId, memberToken: current.memberToken, hostEndToken: current.hostEndToken } : data.session);
  };

  const extendFileRetention = async (file: FileRecord, extensionAction: "add-day" | "set-days", days?: 7 | 30) => {
    if (retentionLoading) return;
    setRetentionLoading(true);
    try {
      const response = await fetch(
        `/api/files?id=${encodeURIComponent(file.id)}&userId=${encodeURIComponent(sharedMemberUserId)}&deviceId=${encodeURIComponent(deviceId)}${sharedSession ? `&sharedSessionId=${encodeURIComponent(sharedSession.id)}` : ""}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", ...(await authHeaders()), ...sharedSessionHeaders() },
          body: JSON.stringify({ userId: sharedMemberUserId, deviceId, sharedSessionId: sharedSession?.id, extensionAction, days }),
        },
      );
      const data = await response.json();
      if (!response.ok || !data.success || !data.file) {
        showNotification("error", data.error || "Could not extend this file.", Boolean(data.upgrade));
        return;
      }
      setFiles((current) => current.map((entry) => entry.id === file.id ? data.file : entry));
      setSelectedFile((current) => current?.id === file.id ? data.file : current);
      showNotification("success", `File available until ${new Date(data.file.expiresAt).toLocaleString()}.`);
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Could not extend this file.");
    } finally {
      setRetentionLoading(false);
    }
  };

  const signOutOtherDevices = async () => {
    if (!authUser || !supabase) return;
    if (!window.confirm("Sign out all other devices and browser sessions for this account?")) return;
    setAuthLoading(true);
    try {
      const response = await fetch("/api/devices", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ action: "sign-out-others", userId, deviceId }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || "Could not sign out other devices.");
      const { error } = await supabase.auth.signOut({ scope: "others" });
      if (error) throw error;
      setPairedDevices(data.devices || []);
      setIsHostDevice(Boolean(data.devices?.find((device: PairedDevice) => device.deviceId === deviceId)?.isHost));
      showNotification("success", "All other devices were signed out.");
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Could not sign out other devices.");
    } finally {
      setAuthLoading(false);
    }
  };

  const copyPairingLink = async () => {
    const link = pairingLink || await createPairingLink();
    if (link) copy(link, "pair");
  };

  const handleUpload = async (file: File) => {
    if (uploadInFlightRef.current) return;
    const maxFileBytes =
      sharedSession?.hostMaxFileBytes ?? planInfo?.limits.maxFileBytes;
    // Pro is the top of the ladder, so there is nothing to offer them here.
    const canUpgrade = planInfo?.plan !== "pro" && !sharedSession;
    if (maxFileBytes && file.size > maxFileBytes) {
      showNotification(
        "error",
        canUpgrade
          ? "That file is bigger than the " + formatBytes(maxFileBytes) + " your plan allows. A higher plan will take it."
          : "That file is bigger than the " + formatBytes(maxFileBytes) + " limit that applies here.",
        canUpgrade,
      );
      return;
    }
    if (!supabase) {
      setUploadError("Supabase is not configured.");
      return;
    }

    uploadInFlightRef.current = true;
    setUploadProgress(0);
    setUploadError(null);
    let preparedFileId = "";

    try {
      const initResponse = await fetch("/api/upload-init", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()), ...sharedSessionHeaders() },
        body: JSON.stringify({
          userId: sharedMemberUserId,
          deviceId,
          fileName: file.name,
          fileSize: file.size,
          contentType: file.type,
          sharedSessionId: sharedSession?.id,
        }),
      });
      const initData = await initResponse.json();
      if (!initResponse.ok || !initData.success) {
        if (initData.upgrade)
          showNotification(
            "error",
            initData.error || "Upgrade required.",
            canUpgrade,
          );
        throw new Error(initData.error || "Could not prepare upload.");
      }
      preparedFileId = initData.file.id;

      if (shouldUseResumableUpload(file)) {
        await uploadResumable({
          apiKey: supabaseAnonKey,
          bucket: supabaseStorageBucket,
          endpoint: initData.upload.endpoint,
          file,
          objectPath: initData.upload.path,
          onProgress: setUploadProgress,
          signedToken: initData.upload.token,
        });
      } else {
        const { error: uploadError } = await supabase.storage
          .from(supabaseStorageBucket)
          .uploadToSignedUrl(initData.upload.path, initData.upload.token, file);
        if (uploadError) throw uploadError;
        setUploadProgress(100);
      }

      const completeResponse = await fetch("/api/upload-complete", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()), ...sharedSessionHeaders() },
        body: JSON.stringify({
          fileId: initData.file.id,
          userId: sharedMemberUserId,
          deviceId,
          deviceName: getDeviceName(),
          sharedSessionId: sharedSession?.id,
        }),
      });
      const completeData = await completeResponse.json();
      if (!completeResponse.ok || !completeData.success) {
        throw new Error(completeData.error || "Could not complete upload.");
      }

      setUploadProgress(100);
      knownFileIdsRef.current.add(completeData.file.id);
      setFiles((prev) =>
        prev.some((entry) => entry.id === completeData.file.id)
          ? prev
          : [completeData.file, ...prev],
      );
      setSelectedFile(completeData.file);
      showNotification("success", "File uploaded successfully");
    } catch (error) {
      if (preparedFileId) {
        await fetch(
          `/api/files?id=${encodeURIComponent(preparedFileId)}&userId=${encodeURIComponent(sharedMemberUserId)}&deviceId=${encodeURIComponent(deviceId)}${sharedSession ? `&sharedSessionId=${encodeURIComponent(sharedSession.id)}` : ""}`,
          { method: "DELETE", headers: { ...(await authHeaders()), ...sharedSessionHeaders() } },
        ).catch(() => undefined);
      }
      const message = error instanceof Error ? error.message : "Upload failed.";
      if (!message.includes("plan") && !message.includes("storage limit"))
        setUploadError(message);
    } finally {
      uploadInFlightRef.current = false;
      if (fileInputRef.current) fileInputRef.current.value = "";
      setTimeout(() => setUploadProgress(null), 400);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) handleUpload(f);
  };
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) handleUpload(f);
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(
      `/api/files?id=${encodeURIComponent(id)}&userId=${encodeURIComponent(sharedMemberUserId)}&deviceId=${encodeURIComponent(deviceId)}${sharedSession ? `&sharedSessionId=${encodeURIComponent(sharedSession.id)}` : ""}`,
      { method: "DELETE", headers: { ...(await authHeaders()), ...sharedSessionHeaders() } },
    );
    const data = await res.json();
    if (data.success) {
      setFiles((prev) => prev.filter((f) => f.id !== id));
      if (selectedFile?.id === id) {
        setSelectedFile(null);
        setQrModalOpen(false);
      }
    }
  };

  const removePairedDevice = async (targetDevice: PairedDevice) => {
    if (
      !window.confirm(
        `Remove ${targetDevice.deviceName}? It will no longer be able to access this shared library.`,
      )
    )
      return;

    const res = await fetch("/api/devices", {
      method: "DELETE",
      headers: { "Content-Type": "application/json", ...(await authHeaders()) },
      body: JSON.stringify({
        userId,
        deviceId,
        targetDeviceId: targetDevice.deviceId,
      }),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      showNotification(
        "error",
        data.error || "Could not remove paired device.",
      );
      return;
    }
    setPairedDevices(data.devices || []);
    showNotification("success", `${targetDevice.deviceName} removed.`);
  };

  const formatBytes = (b: number) => {
    if (b <= 0) return "0 B";
    const k = 1024,
      s = ["B", "KB", "MB", "GB", "TB"],
      // Clamped so a value past the last unit still renders a real label
      // instead of "undefined".
      i = Math.min(s.length - 1, Math.floor(Math.log(b) / Math.log(k)));
    return (b / Math.pow(k, i)).toFixed(1) + " " + s[i];
  };

  const maxFileLabel = formatBytes(
    sharedSession?.hostMaxFileBytes ??
      planInfo?.limits.maxFileBytes ??
      (authUser ? 100 * 1024 * 1024 : 10 * 1024 * 1024),
  );
  const maxDownloadsPerFile =
    sharedSession?.hostMaxDownloadsPerFile ??
    planInfo?.limits.maxDownloadsPerFile ??
    (authUser ? 10 : 5);

  useEffect(() => {
    const downloadLimitReached =
      Boolean(selectedFile) &&
      selectedFile!.downloadCount >= maxDownloadsPerFile;
    if (!selectedFile || !qrModalOpen || downloadLimitReached) {
      setQrCodeUrl("");
      if (downloadLimitReached && qrModalOpen) setQrModalOpen(false);
      return;
    }

    let cancelled = false;
    const qrBg = isDark ? "#161b27" : "#ffffff";
    void import("qrcode")
      .then(({ default: QRCode }) => QRCode.toDataURL(
        `${window.location.origin}/download/${selectedFile.id}`,
        {
          width: 256,
          margin: 2,
          color: isDark
            ? { dark: "#ffffff", light: qrBg }
            : { dark: "#0f172a", light: qrBg },
        },
      ))
      .then((url) => {
        if (!cancelled) setQrCodeUrl(url);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [
    selectedFile?.id,
    selectedFile?.downloadCount,
    maxDownloadsPerFile,
    qrModalOpen,
    isDark,
  ]);

  const retentionDays = planInfo?.limits.retentionDays ?? (authUser ? 1 : 1 / 24);
  const maximumRetentionDays = sharedSession?.hostRetentionDays ?? retentionDays;
  const hasExtendedRetention = Boolean(sharedSession || authUser) && maximumRetentionDays > 1;
  const retentionLabel = sharedSession || authUser
    ? hasExtendedRetention
      ? "24-Hour Default"
      : "1-Day Retention"
    : "1-Hour Retention";
  const retentionExtensionLabel = hasExtendedRetention
    ? `Up To ${maximumRetentionDays}-Day Retention`
    : null;
  const retentionFile = retentionFileId ? files.find((file) => file.id === retentionFileId) ?? null : null;
  const personalStorageUsed = files.reduce((total, file) => total + file.fileSize, 0);
  const storageUsed = sharedSession?.hostStorageUsed ?? personalStorageUsed;
  const storageCap = sharedSession?.hostStorageCap ?? planInfo?.limits.storageBytes ?? 0;

  const copy = async (text: string, id: string) => {
    const copied = await writeToClipboard(text);
    if (!copied) {
      showNotification("error", "Could not copy automatically. Press and hold the URL to copy it.");
      return;
    }
    setCopiedId(id);
    window.setTimeout(() => setCopiedId((current) => current === id ? null : current), 1800);
  };

  const openAuthModal = () => {
    setAuthModalOpen(true);
    setDangerZoneOpen(false);
    setEmailLinkSent(false);
    setEmailCode("");
    setAuthStatus(authUser?.email ? `Signed in as ${authUser.email}` : null);
    setAuthError(null);
  };

  const handleLogout = async () => {
    if (!supabase) {
      showNotification("error", "Supabase auth is not configured.");
      return;
    }

    setAuthLoading(true);
    const { error } = await supabase.auth.signOut({ scope: "local" });
    setAuthLoading(false);

    if (error) {
      showNotification("error", error.message);
      return;
    }

    setAuthUser(null);
    setAuthModalOpen(false);
  };

  const deleteAccount = async () => {
    if (!supabase) {
      showNotification("error", "Supabase auth is not configured.");
      return;
    }

    if (
      !window.confirm("Delete your account permanently? This cannot be undone.")
    )
      return;

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      showNotification("error", "Your session is no longer valid.");
      return;
    }

    setAuthLoading(true);
    const response = await fetch("/api/account", {
      method: "DELETE",
      headers: { Authorization: "Bearer " + token },
    });
    const data = await response.json().catch(() => ({}));
    setAuthLoading(false);

    if (!response.ok || !data.success) {
      showNotification("error", data.error || "Could not delete your account.");
      return;
    }

    await supabase.auth.signOut();
    setAuthUser(null);
    setAuthModalOpen(false);
    showNotification("success", "Account deleted");
  };

  const resetDeviceId = () => {
    const nextDeviceId =
      crypto.randomUUID?.() ?? "device_" + Math.random().toString(36).slice(2, 15);
    localStorage.setItem(DEVICE_ID_KEY, nextDeviceId);
    setDeviceId(nextDeviceId);
    setFiles([]);
    setSelectedFile(null);
    setPlanInfo(null);
    setPairingLink("");
    setPairQrCodeUrl("");
    deviceRegisteredRef.current = false;
    setAuthModalOpen(false);
    showNotification(
      "success",
      "Device ID reset. This browser can connect again.",
    );
  };

  const handleGoogleLogin = async () => {
    if (!supabase) {
      setAuthError("Supabase auth is not configured.");
      return;
    }

    setAuthLoading(true);
    setAuthError(null);
    try {
      await signInWithGooglePopup("/dashboard");
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Google sign-in failed.";
      setAuthError(message);
      showNotification("error", message);
    } finally {
      setAuthLoading(false);
    }
  };

  const continueWithEmail = async () => {
    const email = authEmail.trim();
    if (!email || !email.includes("@")) {
      setAuthError("Enter a valid email address.");
      return;
    }
    if (!supabase) {
      setAuthError("Supabase auth is not configured.");
      return;
    }

    setAuthLoading(true);
    setAuthError(null);
    setAuthStatus(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}/dashboard`,
      },
    });

    setAuthLoading(false);

    if (error) {
      setAuthError(error.message);
      showNotification("error", error.message);
      return;
    }

    setEmailLinkSent(true);
    setAuthStatus("Check your email for your secure sign-in link or six-digit code.");
    showNotification("success", "Sign-in link sent. Check your email.");
  };

  const verifyEmailCode = async () => {
    const token = emailCode.trim();
    if (token.length !== 6 || authLoading || !supabase) return;
    setAuthLoading(true);
    setAuthError(null);
    const { data, error } = await verifyEmailOtp(authEmail.trim(), token);
    setAuthLoading(false);
    if (error || !data.user) {
      const message = error?.message || "That code could not be verified.";
      setAuthError(message);
      showNotification("error", message);
      return;
    }
    setAuthUser(data.user);
    setAuthStatus("Signed in successfully. Reloading your account…");
    window.setTimeout(() => window.location.reload(), 700);
  };

  useEffect(() => {
    if (emailCode.length !== 6) {
      lastAutoSubmittedCodeRef.current = null;
      return;
    }
    if (!emailLinkSent || authLoading || lastAutoSubmittedCodeRef.current === emailCode) return;
    const timer = window.setTimeout(() => {
      lastAutoSubmittedCodeRef.current = emailCode;
      void verifyEmailCode();
    }, 700);
    return () => window.clearTimeout(timer);
  }, [authLoading, emailCode, emailLinkSent]);

  const handleAuthSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (emailLinkSent) void verifyEmailCode();
    else void continueWithEmail();
  };

  const C = {
    page: isDark
      ? "bg-[#0d1117] text-[#f1f5f9]"
      : "bg-[#f8fafc] text-[#0f172a]",
    header: isDark
      ? "border-[#1e2a3a] bg-[#0d1117]"
      : "border-[#e4ecfc] bg-white",
    fadeRule: isDark
      ? "from-transparent via-[#1e2a3a] to-transparent"
      : "from-transparent via-[#e4ecfc] to-transparent",
    card: isDark
      ? "bg-[#161b27] border-[#1e2a3a]"
      : "bg-white border-[#e4ecfc]",
    cardHover: isDark
      ? "hover:border-[#2563eb]/40 hover:bg-[#1a2236]"
      : "hover:border-[#2563eb]/30 hover:bg-[#f0f6ff]",
    cardActive: "border-[#2563eb] bg-[#eff6ff]",
    input: isDark
      ? "bg-[#0d1117] border-[#1e2a3a] text-[#94a3b8]"
      : "bg-[#f8fafc] border-[#e4ecfc] text-[#64748b]",
    muted: isDark ? "text-[#64748b]" : "text-[#94a3b8]",
    text: isDark ? "text-[#f1f5f9]" : "text-[#0f172a]",
    subtext: isDark ? "text-[#94a3b8]" : "text-[#64748b]",
    divider: isDark ? "border-[#1e2a3a]" : "border-[#e4ecfc]",
    badge: isDark
      ? "bg-[#1e2a3a] border-[#263548]"
      : "bg-[#f1f5fd] border-[#e4ecfc]",
    dropzone: uploadError
      ? isDark
        ? "border-red-500/70 bg-[#2a1619] hover:border-red-500/70 hover:bg-[#2a1619]"
        : "border-red-300 bg-red-50 hover:border-red-300 hover:bg-red-50"
      : isDark
        ? isDragging
          ? "border-[#2563eb] bg-[#1a2236]"
          : "border-[#1e2a3a] bg-[#161b27] hover:border-[#263548] hover:bg-[#1a2236]"
        : isDragging
          ? "border-primary-bright bg-white"
          : "border-border bg-white hover:border-primary-bright hover:bg-white",
    toggleBtn: isDark
      ? "border-[#1e2a3a] bg-[#161b27] text-amber-400 hover:text-amber-300 hover:border-[#263548]"
      : "border-[#e4ecfc] bg-white text-[#2563eb] hover:border-[#bfdbfe] shadow-sm",
    iconBtn: isDark
      ? "border-[#1e2a3a] hover:border-[#2563eb]/40 hover:bg-[#1e2a3a] text-[#64748b] hover:text-[#2563eb]"
      : "border-[#e4ecfc] hover:border-[#bfdbfe] hover:bg-[#eff6ff] text-[#94a3b8] hover:text-[#2563eb]",
    delBtn: isDark
      ? "border-[#1e2a3a] hover:border-red-600/30 hover:bg-[#2a1a1a] text-[#64748b] hover:text-red-400"
      : "border-[#e4ecfc] hover:border-red-200 hover:bg-red-50 text-[#94a3b8] hover:text-red-500",
    pill: isDark
      ? "bg-[#1e2a3a] border-[#263548]"
      : "bg-[#f1f5fd] border-[#e4ecfc]",
  };
  if (!authReady || !authUser) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f8fafc] px-6 text-center text-[#64748b]">
        <p className="font-mono-tight text-xs uppercase tracking-[0.16em]">Redirecting to sign in…</p>
      </main>
    );
  }
  return (
    <div
      className={`relative flex flex-1 flex-col text-[16px] font-sans antialiased transition-colors duration-200 ${C.page}`}
    >

      <div className="mx-auto flex w-full max-w-[83rem] flex-1 flex-col px-4 pb-12 pt-8 sm:px-6 sm:pt-12 lg:pt-16">
        <AnimatePresence>
          {authModalOpen && (
            <motion.div
              key="profile-modal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-50 flex min-h-[100dvh] items-center justify-center overflow-hidden overscroll-contain bg-[#0f172a]/45 p-4 backdrop-blur-sm sm:p-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="auth-modal-title"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget)
                  setAuthModalOpen(false);
              }}
            >
              <motion.div
                initial={{ opacity: 0, y: 18, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                transition={{ duration: 0.22 }}
                className={`my-0 w-full max-w-[28rem] max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border p-5 shadow-2xl sm:my-auto sm:p-6 ${C.card}`}
              >
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <h2
                      id="auth-modal-title"
                      className={`text-[18px] font-bold ${C.text}`}
                    >
                      Profile
                    </h2>
                    <p
                      className={`mt-1 text-[12px] leading-relaxed ${C.subtext}`}
                    >
                      Sign in to connect this browser to your Drop24 account.
                    </p>
                  </div>
                  <button
                    onClick={() => setAuthModalOpen(false)}
                    className={`modal-close rounded-lg border p-2 transition-all duration-200 cursor-pointer ${C.iconBtn}`}
                    aria-label="Close profile popup"
                  >
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>{" "}
                {authUser && (
                  <div className="space-y-4">
                    <div className={"w-full rounded-xl border p-4 " + C.badge}>
                      <p
                        className={
                          "text-[12px] font-semibold uppercase tracking-[0.16em] " +
                          C.muted
                        }
                      >
                        Your profile
                      </p>
                      <p
                        className={
                          "mt-2 truncate text-[15px] font-bold " + C.text
                        }
                      >
                        {authUser.email}
                      </p>
                      <p
                        className={
                          "mt-1 text-[11px] leading-relaxed " + C.subtext
                        }
                      >
                        Sign in with Google, Apple, or email using this same
                        verified address and Drop24 will keep it as one account.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setAuthModalOpen(false);
                        setPlanManagerOpen(true);
                      }}
                      className={`w-full rounded-xl border px-4 py-3 text-[13px] font-bold transition-colors ${isDark ? "border-[#263548] text-[#93c5fd] hover:bg-[#1e2a3a]" : "border-[#bfdbfe] bg-[#eff6ff] text-[#2563eb] hover:bg-[#dbeafe]"}`}
                    >
                      Manage Plan
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleLogout()}
                      disabled={authLoading}
                      className={`w-full rounded-xl border px-4 py-3 text-[13px] font-bold transition-colors disabled:opacity-60 ${isDark ? "border-red-900/70 bg-[#381a20] text-red-200 hover:bg-[#4a2028]" : "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"}`}
                    >
                      {authLoading ? "Logging out" : "Log out"}
                    </button>
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setDangerZoneOpen((open) => !open)}
                        aria-expanded={dangerZoneOpen}
                        className="flex w-full items-center justify-between border-b border-red-200 pb-2 text-left text-[12px] font-bold uppercase tracking-[0.16em] text-red-600 transition-colors hover:text-red-700 dark:border-red-900/50 dark:text-red-300 dark:hover:text-red-200"
                      >
                        <span>Danger Zone</span>
                        <svg
                          className={`h-4 w-4 transition-transform duration-200 ${dangerZoneOpen ? "rotate-180" : ""}`}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                      <AnimatePresence initial={false}>
                        {dangerZoneOpen && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden pt-3"
                          >
                            <p className="mb-3 text-[11px] leading-relaxed text-red-700/80 dark:text-red-300/70">
                              These actions affect your account and device
                              pairing.
                            </p>
                            <div className="space-y-2">
                              <button
                                type="button"
                                onClick={() => void signOutOtherDevices()}
                                disabled={authLoading}
                                className={`w-full rounded-xl border px-4 py-3 text-left text-[13px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${isDark ? "border-red-900/70 bg-[#381a20] text-red-200 hover:bg-[#4a2028]" : "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"}`}
                              >
                                {authLoading ? "Signing out devices" : "Sign out other devices"}
                              </button>
                              <p className="px-1 text-[11px] leading-relaxed text-red-700/80 dark:text-red-300/70">
                                This signs out every other active session on your account.
                              </p>
                              <button
                                type="button"
                                onClick={resetDeviceId}
                                className={`w-full rounded-xl border px-4 py-3 text-left text-[13px] font-bold transition-colors ${isDark ? "border-red-900/70 bg-[#381a20] text-red-200 hover:bg-[#4a2028]" : "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"}`}
                              >
                                Reset device ID
                              </button>
                              <p className="px-1 text-[11px] leading-relaxed text-red-700/80 dark:text-red-300/70">
                                Resetting creates a new pairing ID. Your old
                                pairing link will no longer work here.
                              </p>
                              <button
                                type="button"
                                onClick={() => void deleteAccount()}
                                disabled={authLoading}
                                className={`w-full rounded-xl border px-4 py-3 text-left text-[13px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${isDark ? "border-red-900/70 bg-[#381a20] text-red-200 hover:bg-[#4a2028]" : "border-red-300 bg-red-50 text-red-600 hover:bg-red-100"}`}
                              >
                                {authLoading
                                  ? "Deleting account"
                                  : "Delete account"}
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                )}
                {!authUser && (
                  <form onSubmit={handleAuthSubmit} className="mx-auto w-full max-w-sm space-y-3">
                    <div className="space-y-2">
                      <input
                        type="email"
                        value={authEmail}
                        onChange={(event) => setAuthEmail(event.target.value)}
                        disabled={emailLinkSent}
                        placeholder="email@example.com"
                        autoComplete="email"
                        className="w-full min-w-0 rounded-xl border border-border bg-secondary px-3.5 py-2.5 text-[13px] font-medium text-foreground outline-none transition-all duration-200 placeholder:text-muted-foreground focus:border-primary disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      {!emailLinkSent ? (
                        <button type="submit" disabled={authLoading} className="sign-in-action h-10 w-full shrink-0 rounded-xl border border-border bg-white px-3 text-[12px] font-semibold text-foreground transition-all duration-200 hover:border-primary hover:bg-secondary active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 cursor-pointer">
                          {authLoading ? "Sending" : "Email me a sign-in link"}
                        </button>
                      ) : (
                        <>
                          <input aria-label="Six-digit sign-in code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={emailCode} onChange={(event) => setEmailCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="6-digit code" className="w-full min-w-0 rounded-xl border border-border bg-secondary px-3.5 py-2.5 font-mono text-[13px] tracking-[0.16em] text-foreground outline-none transition-all duration-200 focus:border-primary" />
                          <button type="submit" disabled={authLoading || emailCode.length !== 6} className="sign-in-action h-10 w-full shrink-0 rounded-xl border border-border bg-white px-3 text-[12px] font-semibold text-foreground transition-all duration-200 hover:border-primary hover:bg-secondary active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer">{authLoading ? "Checking" : "Enter Code"}</button>
                        </>
                      )}
                    </div>

                    <div className="space-y-2 pt-2">
                      <button
                        type="button"
                        onClick={() => void handleGoogleLogin()}
                        disabled={authLoading || !isSupabaseAuthConfigured}
                        className="sign-in-action relative flex h-10 w-full items-center justify-center rounded-xl border border-border bg-white px-10 text-[12px] font-semibold leading-none text-foreground transition-all duration-200 hover:border-primary hover:bg-secondary active:scale-[0.98] cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <svg
                          className="absolute left-3 h-4 w-4"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path
                            fill="#4285F4"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          />
                          <path
                            fill="#34A853"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84z"
                          />
                          <path
                            fill="#EA4335"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38z"
                          />
                        </svg>
                        <span>Continue with Google</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => undefined}
                        className={`flex w-full items-center justify-center gap-2 rounded-xl border px-4 py-3 text-[13px] font-bold transition-colors cursor-pointer ${
                          isDark
                            ? "border-[#263548] bg-[#0d1117] text-[#f1f5f9] hover:bg-[#1e2a3a]"
                            : "border-[#e4ecfc] bg-white text-[#0f172a] hover:bg-[#f8fafc]"
                        }`}
                      >
                        <svg
                          className="h-4 w-4"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M16.37 1.51c0 1.14-.46 2.19-1.21 2.97-.78.82-2.06 1.45-3.09 1.37-.14-1.1.41-2.24 1.13-2.97.8-.82 2.18-1.44 3.17-1.37z" />
                          <path d="M20.65 17.38c-.54 1.24-.8 1.8-1.5 2.9-.98 1.49-2.36 3.35-4.07 3.37-1.52.02-1.91-.98-3.98-.97-2.06.01-2.49.99-4.01.97-1.71-.02-3.02-1.69-4-3.18-2.72-4.15-3.01-9.02-1.33-11.61 1.19-1.84 3.07-2.91 4.84-2.91 1.8 0 2.94.99 4.43.99 1.45 0 2.33-.99 4.42-.99 1.58 0 3.25.86 4.43 2.35-3.89 2.13-3.25 7.69.77 9.08z" />
                        </svg>
                        <span>Login with Apple</span>
                      </button>
                    </div>
                  </form>
                )}
                {!authUser && (authStatus || authError) && (
                  <div className="mt-4 space-y-2">
                    {authStatus && (
                      <p
                        className={`rounded-xl border px-3 py-2 text-[12px] font-medium ${
                          isDark
                            ? "border-emerald-900/60 bg-emerald-950/40 text-emerald-300"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {authStatus}
                      </p>
                    )}
                    {authError && (
                      <p
                        className={`rounded-xl border px-3 py-2 text-[12px] font-medium ${
                          isDark
                            ? "border-red-900/60 bg-red-950/40 text-red-300"
                            : "border-red-200 bg-red-50 text-red-700"
                        }`}
                      >
                        {authError}
                      </p>
                    )}
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {qrModalOpen && selectedFile && selectedFile.downloadCount < maxDownloadsPerFile && (
            <motion.div
              key="file-qr-modal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-50 flex min-h-[100dvh] items-center justify-center overflow-hidden overscroll-contain bg-[#0f172a]/45 p-4 backdrop-blur-sm sm:p-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="file-qr-modal-title"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) setQrModalOpen(false);
              }}
            >
              <motion.div
                initial={{ opacity: 0, y: 18, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                transition={{ duration: 0.22 }}
                className={`max-h-[calc(100dvh-2rem)] w-full max-w-[28rem] overflow-y-auto overscroll-contain border p-5 shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:p-6 ${C.card}`}
              >
                <div className="mb-4 flex items-center justify-between gap-4">
                  <h2 id="file-qr-modal-title" className={`min-w-0 truncate font-mono-tight text-[12px] font-bold uppercase tracking-[0.12em] ${C.text}`}>
                    {selectedFile.fileName}
                  </h2>
                  <button
                    type="button"
                    onClick={() => setQrModalOpen(false)}
                    className={`modal-close shrink-0 rounded-lg border p-2 transition-all duration-200 cursor-pointer ${C.iconBtn}`}
                    aria-label="Close QR code popup"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
                <div className="flex h-[11.5rem] items-center justify-center border border-border bg-white">
                  {qrCodeUrl ? (
                    <img src={qrCodeUrl} alt={`QR code for ${selectedFile.fileName}`} className="size-40 select-none" draggable={false} />
                  ) : (
                    <span className={`font-mono-tight text-[10px] uppercase ${C.subtext}`}>Generating QR…</span>
                  )}
                </div>
                <div className="mt-4 grid gap-2">
                  <button
                    type="button"
                    onClick={() => copy(`${window.location.origin}/download/${selectedFile.id}`, `qr-copy-${selectedFile.id}`)}
                    className="w-full border border-border bg-transparent px-4 py-2.5 font-mono-tight text-[11px] font-bold uppercase tracking-[0.08em] text-foreground transition-colors hover:bg-foreground hover:text-background"
                  >
                    {copiedId === `qr-copy-${selectedFile.id}` ? "Copied" : "Copy URL"}
                  </button>
                  {qrCodeUrl ? (
                    <a href={qrCodeUrl} download={`${selectedFile.fileName}-qr.png`} className="w-full border border-border bg-transparent px-4 py-2.5 text-center font-mono-tight text-[11px] font-bold uppercase tracking-[0.08em] text-foreground transition-colors hover:bg-foreground hover:text-background">
                      Download PNG
                    </a>
                  ) : (
                    <span className={`w-full border border-border px-4 py-2.5 text-center font-mono-tight text-[11px] font-bold uppercase tracking-[0.08em] ${C.subtext}`}>Download PNG</span>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {retentionFile && (
            <motion.div
              key="retention-modal"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex min-h-[100dvh] items-center justify-center overflow-hidden overscroll-contain bg-[#0f172a]/45 p-4 backdrop-blur-sm sm:p-6"
              role="dialog"
              aria-modal="true"
              aria-labelledby="retention-modal-title"
              onMouseDown={(event) => { if (event.target === event.currentTarget && !retentionLoading) setRetentionFileId(null); }}
            >
              <motion.div
                initial={{ opacity: 0, y: 18, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                className={`max-h-[calc(100dvh-2rem)] w-full max-w-[28rem] overflow-y-auto overscroll-contain border p-5 shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:p-6 ${C.card}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-mono-tight text-[10px] uppercase tracking-[0.16em] text-primary">File lifetime</p>
                    <h2 id="retention-modal-title" className="mt-2 truncate text-lg font-bold uppercase tracking-tight">{retentionFile.fileName}</h2>
                  </div>
                  <button type="button" onClick={() => setRetentionFileId(null)} disabled={retentionLoading} className="modal-close shrink-0 border border-border p-2 text-muted-foreground transition-colors hover:border-primary hover:text-primary disabled:opacity-50" aria-label="Close file lifetime controls">
                    <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18" /></svg>
                  </button>
                </div>
                <div className="mt-5 border-y border-border py-4 font-mono-tight text-[10px] uppercase leading-6 tracking-[0.1em] text-muted-foreground">
                  <p>Remaining: <span className="font-bold text-foreground">{timeRemaining[retentionFile.id] || "Active"}</span></p>
                  <p>Uploaded: {new Date(retentionFile.createdAt).toLocaleString()}</p>
                  <p>Plan maximum: {maximumRetentionDays >= 1 ? `${maximumRetentionDays} day${maximumRetentionDays === 1 ? "" : "s"} from upload` : "1 hour"}</p>
                </div>
                {maximumRetentionDays > 1 && (!sharedSession || sharedSession.isHost) ? (
                  <div className="mt-5 grid gap-2 sm:grid-cols-2">
                    <button type="button" disabled={retentionLoading} onClick={() => void extendFileRetention(retentionFile, "add-day")} className="border border-border bg-secondary px-4 py-3 text-[12px] font-semibold transition-colors hover:border-primary hover:bg-card disabled:opacity-50">+1 day</button>
                    {maximumRetentionDays >= 7 && <button type="button" disabled={retentionLoading} onClick={() => void extendFileRetention(retentionFile, "set-days", 7)} className="border border-border bg-secondary px-4 py-3 text-[12px] font-semibold transition-colors hover:border-primary hover:bg-card disabled:opacity-50">Set to 7 days</button>}
                    {maximumRetentionDays >= 30 && <button type="button" disabled={retentionLoading} onClick={() => void extendFileRetention(retentionFile, "set-days", 30)} className="border border-border bg-secondary px-4 py-3 text-[12px] font-semibold transition-colors hover:border-primary hover:bg-card disabled:opacity-50 sm:col-span-2">Set to 30 days</button>}
                  </div>
                ) : (
                  <div className="mt-5 border border-border bg-secondary p-4 text-[12px] leading-relaxed text-muted-foreground">
                    {sharedSession && !sharedSession.isHost ? "Only the host can extend Shared Session files." : "Basic files use the 24-hour maximum. Plus and Pro can extend files only when they need the extra time."}
                  </div>
                )}
                <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">Every paid upload starts at 24 hours. Extensions never exceed the plan limit measured from the original upload.</p>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <PlanManagementModal
          open={planManagerOpen}
          initialPlan={(planInfo?.plan ?? "free") as PlanName}
          onClose={() => setPlanManagerOpen(false)}
          onError={(message) => showNotification("error", message)}
        />

        <AnimatePresence>
          {notification && (
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ type: "spring", stiffness: 360, damping: 26 }}
              role="status"
              className={
                "fixed left-4 right-4 top-20 z-[60] mx-auto flex w-auto max-w-[24rem] items-center gap-3 rounded-2xl border px-4 py-3 text-[13px] font-bold shadow-xl md:left-auto md:right-6 md:top-20 md:mx-0 md:w-[calc(100%-3rem)] " +
                (notification.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/80 dark:text-emerald-300"
                  : "border-red-200 bg-red-50 text-red-700 dark:border-red-900/60 dark:bg-red-950/80 dark:text-red-300")
              }
            >
              <span
                className={
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[14px] " +
                  (notification.type === "success"
                    ? "bg-emerald-500 text-white"
                    : "bg-red-500 text-white")
                }
              >
                {notification.type === "success" ? (
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="m5 12 4 4L19 6" />
                  </svg>
                ) : (
                  "!"
                )}
              </span>
              <span className="min-w-0 flex-1">{notification.message}</span>
              {notification.upgrade && (
                <>
                  <button
                    type="button"
                    onClick={() => { setNotification(null); setPlanManagerOpen(true); }}
                    className="shrink-0 rounded-lg bg-primary px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wide text-white transition-opacity hover:opacity-90"
                  >
                    Upgrade
                  </button>
                  <button
                    type="button"
                    onClick={() => setNotification(null)}
                    aria-label="Dismiss"
                    className="shrink-0 opacity-70 transition-opacity hover:opacity-100"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
                  </button>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <section className="mb-12 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="mt-2 text-4xl font-bold uppercase tracking-tighter sm:text-5xl">
              Dashboard
            </h1>
          </div>
          <p className="font-mono-tight text-[10px] uppercase tracking-wider text-muted-foreground">
            Storage used: {formatBytes(storageUsed)} / {formatBytes(storageCap)}
          </p>
        </section>

        <main className="grid flex-grow grid-cols-1 items-start gap-8 lg:grid-cols-[minmax(0,2.1fr)_minmax(19rem,1fr)]">
          <div className="space-y-7">
            <section className="border border-border bg-card p-5 shadow-sm sm:min-h-[266px] sm:p-6">
              <div className="mb-4 flex items-center">
                <h2 className="font-mono-tight text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Upload Files</h2>
              </div>
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => {
                  if (!uploadInFlightRef.current) fileInputRef.current?.click();
                }}
                className={`group flex min-h-[160px] flex-col items-center justify-center border border-dashed p-8 text-center transition-all duration-150 sm:min-h-[180px] ${uploadProgress === null ? "cursor-pointer" : "cursor-wait"} ${C.dropzone}`}
              >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
              />

              {uploadProgress !== null ? (
                <div className="w-full max-w-sm space-y-3.5">
                  <div className="flex justify-between items-center">
                    {/* Label text stays on --color-primary: it is body size, where
                        the brighter orange does not carry enough contrast. */}
                    <span className="text-[12px] font-bold uppercase tracking-wider text-primary">
                      Uploading
                    </span>
                    <span className="font-mono-tight text-[12px] font-bold tabular-nums text-primary">
                      {uploadProgress}%
                    </span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div
                      style={{ width: `${uploadProgress}%` }}
                      className="h-full rounded-full bg-primary-bright transition-all duration-100"
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Keep this tab open…
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div
                    className={`mx-auto flex h-11 w-11 items-center justify-center border transition-colors ${
                      isDragging
                        ? "border-primary-bright bg-primary-bright text-white"
                        : "border-border bg-transparent text-muted-foreground group-hover:border-primary-bright group-hover:bg-primary-bright group-hover:text-white"
                    }`}
                  >
                    <svg
                      className="w-5 h-5 transition-colors"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </div>
                  <div>
                    <p className={`font-semibold text-[15px] uppercase ${C.text}`}>
                      Drop files or click to browse
                    </p>
                  </div>
                  <p className="px-2 text-center text-[10px] leading-relaxed text-[#94a3b8] font-mono sm:hidden">
                    Max {maxFileLabel}, {retentionLabel}{retentionExtensionLabel ? ` · ${retentionExtensionLabel}` : ""}{!authUser && !sharedSession ? ", 2 uploads/hr" : ""}, {maxDownloadsPerFile} downloads/file.
                  </p>
                  <p className="hidden items-center justify-center gap-2 text-[10px] text-[#94a3b8] font-mono sm:flex">
                    <span>Max {maxFileLabel}</span>
                    <DotSeparator />
                    <span>
                      {retentionLabel}
                    </span>
                    {retentionExtensionLabel && (
                      <>
                        <DotSeparator />
                        <span>{retentionExtensionLabel}</span>
                      </>
                    )}
                    {!authUser && !sharedSession && (
                      <>
                        <DotSeparator />
                        <span>2 uploads/hour</span>
                      </>
                    )}
                    <DotSeparator />
                    <span>{maxDownloadsPerFile} downloads/file</span>
                  </p>
                </div>
              )}
              </div>
            </section>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="font-mono-tight text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Uploaded Files</h2>
                <span className={`text-[10px] font-mono ${C.subtext}`}>
                  {files.length} file{files.length !== 1 ? "s" : ""}
                </span>
              </div>

              <AnimatePresence initial={false} mode="popLayout">
                {files.length === 0 ? (
                <motion.div
                  key="no-active-drops"
                  initial={{ opacity: 0, scale: 0.96 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94, filter: "blur(3px)" }}
                  transition={{ duration: 0.2 }}
                  className="border border-dashed border-border bg-transparent p-8 text-center font-mono-tight text-xs uppercase tracking-widest text-muted-foreground"
                >
                  No files yet
                </motion.div>
              ) : (
                <div className="space-y-3">
                  {files.map((file) => (
                    <motion.div
                      key={file.id}
                      layout
                      initial={{ opacity: 0, scale: 0.94, y: 8 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.82, y: -8, filter: "blur(5px)" }}
                      transition={{ duration: 0.24, ease: "easeOut" }}
                      className="group flex flex-col items-stretch justify-between gap-3 border border-border bg-transparent p-4 transition-colors duration-150 hover:bg-background sm:flex-row sm:items-center sm:gap-4"
                    >
                      <div className="flex min-w-0 items-center gap-4">
                        <div className="flex size-10 shrink-0 items-center justify-center bg-primary/10 font-mono-tight text-[10px] font-bold text-primary">
                          {file.fileName.split(".").pop()?.slice(0, 4).toUpperCase() || "FILE"}
                        </div>
                        <div className="min-w-0">
                          <p className={`truncate text-sm font-bold uppercase ${C.text}`}>{file.fileName}</p>
                          <button type="button" onClick={(event) => { event.stopPropagation(); setRetentionFileId(file.id); }} className="mt-1 inline-flex items-center gap-1 font-mono-tight text-[9px] uppercase tracking-wide text-primary transition-colors hover:text-foreground sm:hidden">
                            Expires {timeRemaining[file.id] || "Active"}
                            <svg className="size-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /><path d="m15 5 3 3" /></svg>
                          </button>
                          <p className={`font-mono-tight text-[10px] uppercase tabular-nums ${C.subtext}`}>{formatBytes(file.fileSize)} <span aria-hidden="true">•</span> {file.downloadCount}/{maxDownloadsPerFile} downloads</p>
                        </div>
                      </div>
                      <div className="flex w-full shrink-0 items-center justify-between gap-4 sm:w-auto sm:justify-end">
                        <button type="button" onClick={(event) => { event.stopPropagation(); setRetentionFileId(file.id); }} className="group/expiry relative hidden min-w-[7.5rem] pr-5 text-right transition-colors hover:text-primary sm:block" aria-label={`Change expiry for ${file.fileName}`}>
                          <span className="absolute right-0 top-1/2 -translate-y-1/2 text-primary opacity-0 transition-all duration-150 group-hover/expiry:translate-x-0 group-hover/expiry:opacity-100 group-focus-visible/expiry:opacity-100" aria-hidden="true">
                            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /><path d="m15 5 3 3" /></svg>
                          </span>
                          <span className={`block font-mono-tight text-[10px] uppercase ${C.subtext}`}>Expiring in</span>
                          <span className={`block font-mono-tight text-base font-bold tabular-nums transition-colors group-hover/expiry:text-primary ${C.text}`}>{timeRemaining[file.id] || "Active"}</span>
                        </button>
                        <div className={`grid flex-1 gap-2 sm:flex sm:flex-none ${file.downloadCount < maxDownloadsPerFile ? "grid-cols-4" : "grid-cols-1"}`}>
                          {file.downloadCount < maxDownloadsPerFile && (
                            <>
                              <a
                                href={`/download/${encodeURIComponent(file.id)}?autoclose=1&return=dashboard`}
                                target="_blank"
                                rel="noopener"
                                onClick={(event) => event.stopPropagation()}
                                title="Download file"
                                aria-label={`Download ${file.fileName}`}
                                className="flex size-11 w-full items-center justify-center border border-border bg-transparent text-muted-foreground transition-all active:scale-95 hover:border-primary hover:text-primary sm:size-9"
                              >
                                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
                              </a>
                              <button type="button" onClick={(e) => { e.stopPropagation(); void copy(`${window.location.origin}/download/${file.id}`, `file-${file.id}`); }} title="Copy download link" aria-label={`Copy download link for ${file.fileName}`} className={`flex size-11 w-full items-center justify-center border transition-all active:scale-95 sm:size-9 ${copiedId === `file-${file.id}` ? "border-emerald-600 bg-emerald-600 text-white" : "border-border bg-transparent text-muted-foreground hover:border-primary hover:text-primary"}`}>
                                {copiedId === `file-${file.id}` ? <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg> : <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" /></svg>}
                              </button>
                              <button type="button" onClick={(e) => { e.stopPropagation(); setSelectedFile(file); setQrModalOpen(true); }} title="Show QR" aria-label={`Show QR code for ${file.fileName}`} className="flex size-11 w-full items-center justify-center border border-border bg-transparent text-muted-foreground transition-all active:scale-95 hover:border-primary hover:text-primary sm:size-9">
                                <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><rect width="5" height="5" x="3" y="3" rx="1" /><rect width="5" height="5" x="16" y="3" rx="1" /><rect width="5" height="5" x="3" y="16" rx="1" /><path d="M21 16h-3a2 2 0 0 0-2 2v3" /><path d="M21 21v.01" /><path d="M12 7v3a2 2 0 0 1-2 2H7" /><path d="M3 12h.01" /><path d="M12 3h.01" /><path d="M12 16v.01" /><path d="M16 12h1" /><path d="M21 12v.01" /><path d="M12 21v-1" /></svg>
                              </button>
                            </>
                          )}
                          <button type="button" onClick={(e) => { e.stopPropagation(); void handleDelete(file.id); }} title="Delete" aria-label={`Delete ${file.fileName}`} className="flex size-11 w-full items-center justify-center border border-red-200 bg-transparent text-red-600 transition-all active:scale-95 hover:bg-red-600 hover:text-white sm:size-9">
                            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10 11v6" /><path d="M14 11v6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
              </AnimatePresence>
            </div>
          </div>

          <aside className="space-y-5 lg:sticky lg:top-24 lg:w-full">
            <div
              className={`hidden items-center space-x-2 text-[15px] font-bold ${C.text}`}
            >
              <svg
                className="h-[18px] w-[18px] text-[#2563eb]"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="18" cy="5" r="3" />
                <circle cx="6" cy="12" r="3" />
                <circle cx="18" cy="19" r="3" />
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
              </svg>
              <span>Share Portal</span>
            </div>
            <div className="hidden"><AnimatePresence mode="wait" initial={false}>
              {selectedFile ? (
              <motion.div
                key={selectedFile.id}
                initial={{ opacity: 0, y: 8, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.88, filter: "blur(5px)" }}
                transition={{ duration: 0.24, ease: "easeOut" }}
                className={`relative border rounded-2xl p-6 space-y-3 transition-colors duration-200 ${C.card}`}
              >
                <button
                  onClick={() => setSelectedFile(null)}
                  className={`absolute right-4 top-4 cursor-pointer transition-colors hover:text-red-500 ${C.subtext}`}
                  aria-label="Close share portal"
                >
                  <svg
                    className="h-[18px] w-[18px]"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
                <div>
                  <p className={`font-semibold text-[14px] truncate ${C.text}`}>
                    {selectedFile.fileName}
                  </p>
                  <p
                    className={`mt-0.5 flex items-center gap-2 text-[10px] font-mono ${C.subtext}`}
                  >
                    <span>{formatBytes(selectedFile.fileSize)}</span>
                    <DotSeparator />
                    <span>expires {timeRemaining[selectedFile.id]}</span>
                  </p>
                </div>
                {qrCodeUrl ? (
                  <img src={qrCodeUrl} alt="QR" className="mx-auto h-36 w-36 select-none" draggable={false} />
                ) : (
                  <div className="mx-auto flex h-32 w-32 items-center justify-center">
                    <span className="text-[10px] font-mono text-[#94a3b8]">
                      Generating…
                    </span>
                  </div>
                )}
                <div
                  className={`flex border rounded-xl p-1.5 items-center ${C.input} ${C.divider}`}
                >
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/download/${selectedFile.id}`}
                    className="bg-transparent text-[11px] focus:outline-none w-full px-2.5 font-mono truncate"
                  />
                  <button
                    onClick={() =>
                      copy(
                        `${window.location.origin}/download/${selectedFile.id}`,
                        "file",
                      )
                    }
                    className={`px-3 py-1 text-[10px] font-bold rounded-md cursor-pointer transition-colors ${copiedId === "file" ? "bg-emerald-600 text-white" : "bg-[#2563eb] hover:bg-[#1d4ed8] text-white"}`}
                  >
                    {copiedId === "file" ? "Copied" : "Copy"}
                  </button>
                </div>
              </motion.div>
              ) : (
              <motion.div
                key="share-portal-empty"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.16 }}
                className={`border border-dashed rounded-2xl p-7 text-center min-h-[190px] flex flex-col justify-center items-center transition-colors duration-200 ${C.card}`}
              >
                <svg
                  className={`w-9 h-9 mb-2.5 ${C.muted}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
                <p
                  className={`text-[11px] mt-0.5 max-w-[190px] text-center ${C.muted}`}
                >
                  Select a file to get its link and QR code.
                </p>
              </motion.div>
              )}
            </AnimatePresence></div>

            <div
              className="space-y-5 border border-border bg-card p-6 text-foreground shadow-sm transition-colors duration-200 sm:p-8"
            >
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-lg font-bold uppercase tracking-tight">Shared Session</h2>
                <span className="border border-border px-2 py-1 font-mono-tight text-[9px] uppercase tracking-wider text-muted-foreground">
                  {sharedSession ? "Active" : "Available"}
                </span>
              </div>
              {authUser || sharedSession ? (
                <>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {sharedSession && !sharedSession.isHost
                  ? "You’re in a temporary shared workspace. Leave at any time to return to your personal files."
                  : "Create a temporary shared workspace. Invitees can join without an account and return to their personal files when they leave."}
              </p>
              <AnimatePresence mode="wait">
                {!sharedSession ? (
                  <motion.button
                    key="create-shared-session"
                    type="button"
                    onClick={() => void createPairingLink()}
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ duration: 0.18 }}
                    className="industrial-button w-full cursor-pointer border-0 bg-primary py-4 text-[11px] text-white hover:bg-foreground"
                  >
                    Initialize Session
                  </motion.button>
                ) : (
                  <motion.div key="active-shared-session" initial="hidden" animate="visible" exit="exit" variants={{ hidden: { opacity: 0, y: -8 }, visible: { opacity: 1, y: 0, transition: { staggerChildren: 0.11 } }, exit: { opacity: 1, transition: { when: "afterChildren", staggerChildren: 0.1 } } }} className="space-y-3">
                    {sharedSession.isHost && <>
                    <motion.div variants={{ hidden: { opacity: 0, scale: 0.88 }, visible: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.88, y: -8 } }}>{pairQrCodeUrl ? <img src={pairQrCodeUrl} alt="Shared Session QR" className="mx-auto h-32 w-32 select-none" draggable={false} /> : <div className="mx-auto h-32 w-32 animate-pulse rounded-xl bg-[#f1f5fd]" />}</motion.div>
                    <motion.button variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 } }} onClick={() => void copyPairingLink()} className={`group relative w-full overflow-hidden rounded-xl border py-2.5 text-[11px] font-bold transition-all duration-300 cursor-pointer ${copiedId === "pair" ? "bg-emerald-600 border-emerald-600 text-white" : isDark ? "border-[#1e2a3a] bg-[#0d1117] text-[#94a3b8] hover:-translate-y-0.5 hover:border-[#2563eb]/45 hover:bg-[#1e2a3a] hover:text-white" : "border-[#e4ecfc] bg-[#f1f5fd] text-[#64748b] hover:-translate-y-0.5 hover:border-[#93c5fd] hover:bg-[#eff6ff] hover:text-[#0f172a]"}`}>{copiedId === "pair" ? "Copied!" : "Copy Shared Session Link"}</motion.button>
                    </>}
                    <motion.button variants={{ hidden: { opacity: 0, y: 8 }, visible: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 } }} type="button" onClick={() => void leaveSharedSession()} className={`w-full rounded-xl border py-2.5 text-[11px] font-bold transition-all ${confirmEndSharedSession && sharedSession.isHost ? "border-red-700 bg-red-600 text-white shadow-lg shadow-red-600/25 hover:bg-red-700" : "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"}`}>{sharedSession.isHost ? confirmEndSharedSession ? "Confirm End?" : "End Shared Session" : "Leave Shared Session"}</motion.button>
                    {sharedSession.isHost && sharedSession.members.filter((member) => !member.isHost).map((member) => <motion.div variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }} key={member.userId} className="flex items-center justify-between rounded-lg bg-[#f8fafc] px-3 py-2 text-[11px] text-[#475569]"><span className="truncate">{member.displayName}</span><button type="button" onClick={() => void kickSharedSessionMember(member.userId)} className="relative font-bold text-red-600 transition-all duration-200 after:absolute after:-bottom-0.5 after:left-0 after:h-px after:w-0 after:bg-red-600 after:transition-all after:duration-200 hover:tracking-[0.08em] hover:text-red-700 hover:after:w-full">Kick</button></motion.div>)}
                  </motion.div>
                )}
              </AnimatePresence>
                </>
              ) : (
                <div className="flex flex-col items-center gap-3 py-3 text-center">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-full ${isDark ? "bg-[#1e2a3a] text-[#93c5fd]" : "bg-[#eff6ff] text-[#2563eb]"}`}>
                    <svg aria-hidden="true" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <rect x="5" y="11" width="14" height="10" rx="2" />
                      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                    </svg>
                  </div>
                  <p className={`max-w-[220px] text-[11px] leading-relaxed ${C.subtext}`}>
                    Please sign up or log in to pair another device and sync your files.
                  </p>
                  {!authUser && (
                    <button
                      type="button"
                      onClick={openAuthModal}
                      className="w-full border border-border bg-secondary px-4 py-2.5 text-[11px] font-bold text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                    >
                      Sign up or log in
                    </button>
                  )}
                </div>
              )}
              {false && isHostDevice &&
                pairedDevices.filter((device) => device.deviceId !== deviceId)
                  .length > 0 && (
                  <div className={`space-y-2 border-t pt-3 ${C.divider}`}>
                  <p
                    className={`text-[10px] font-bold uppercase tracking-wider ${C.subtext}`}
                  >
                    Paired devices
                  </p>
                  {pairedDevices
                    .filter((device) => device.deviceId !== deviceId)
                    .map((device) => (
                      <div
                        key={device.deviceId}
                        className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 ${isDark ? "bg-[#0d1117]" : "bg-[#f8fafc]"}`}
                      >
                        <span className="min-w-0">
                          <span className={`block truncate text-[11px] font-semibold ${C.text}`}>
                            {device.deviceName}
                          </span>
                          <span className={`block text-[9px] ${C.subtext}`}>
                            Linked device
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={() => void removePairedDevice(device)}
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors ${isDark ? "text-[#64748b] hover:bg-red-950/50 hover:text-red-300" : "text-[#94a3b8] hover:bg-red-50 hover:text-red-600"}`}
                          aria-label={`Disconnect ${device.deviceName}`}
                          title={`Disconnect ${device.deviceName}`}
                        >
                          <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                            <path d="m6 6 12 12M18 6 6 18" />
                          </svg>
                        </button>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </aside>
        </main>

      </div>
      <SiteFooter />
    </div>
  );
}

interface SharedSession {
  id: string;
  hostUserId: string;
  isHost: boolean;
  memberUserId: string;
  memberToken?: string;
  hostEndToken?: string;
  inviteToken?: string;
  hostStorageCap: number | null;
  hostStorageUsed: number;
  hostMaxFileBytes: number;
  hostMaxDownloadsPerFile: number;
  hostRetentionDays: number;
  members: { userId: string; displayName: string; isHost: boolean }[];
}
