"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const KEY = "hrms_user";

export function saveUser(u) { localStorage.setItem(KEY, JSON.stringify(u)); }
export function clearUser() { localStorage.removeItem(KEY); }

// Guard a page to a role. Redirects to /login if not authed, or to the user's own
// dashboard if the role doesn't match `role` (when provided).
export function useAuth(role) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const router = useRouter();
  useEffect(() => {
    let u = null;
    try { u = JSON.parse(localStorage.getItem(KEY) || "null"); } catch {}
    if (!u) { router.replace("/login"); return; }
    if (role && u.role !== role) { router.replace("/" + u.role); return; }
    setUser(u); setReady(true);
  }, [role, router]);
  return { user, ready };
}
