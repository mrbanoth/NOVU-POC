"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bell, LogOut, BellRing, X } from "lucide-react";
import { useInbox } from "./useInbox";
import { clearUser } from "./useAuth";

const roleAv = (role) => (role === "superadmin" ? "super" : role === "admin" ? "admin" : "employee");
const initials = (n) => n.replace(/\(.*\)/, "").trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join("").toUpperCase();

export default function Shell({ user, children }) {
  const { notifications, unread, live, lastPush, markAllRead, enableAlerts, testPush } = useInbox(user.subscriberId);
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState(false);
  const [pushMsg, setPushMsg] = useState("");
  const [toast, setToast] = useState(null);
  const router = useRouter();

  useEffect(() => {
    if (!lastPush) return;
    setToast(lastPush);
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [lastPush]);

  const roleLabel = user.role === "superadmin" ? "Superadmin" : user.role === "admin" ? "Tenant Admin" : "Employee";

  return (
    <div>
      <div className="nav">
        <div className="brand">HR<b>MS</b> <span className="mut" style={{ fontWeight: 500, fontSize: 12 }}>Novu POC</span></div>
        <div className="spacer" />
        <button className="btn ghost sm" onClick={async () => {
          setPushMsg("Enabling push on this device…");
          const r = await enableAlerts();
          setAlerts(r.ok);
          setPushMsg(r.ok ? "Push enabled on this device. Click ‘Test push’ to verify." : ("Push off: " + r.reason));
        }}>
          <BellRing size={15} /> {alerts ? "Alerts on" : "Enable alerts"}
        </button>
        {alerts && <button className="btn ghost sm" onClick={async () => {
          setPushMsg("Sending a test push…");
          const r = await testPush();
          if (r.sent) setPushMsg("Test push sent to " + r.sent + " device(s) — watch the bottom-right of your screen. If nothing shows, check Windows notification settings (see below).");
          else setPushMsg("No push delivered: " + (r.results?.[0]?.message || r.error || "this device isn't subscribed — click Enable alerts first"));
        }}>Test push</button>}
        <span className="pill"><span className={"dot" + (live ? " live" : "")} /> {live ? "Live" : "Offline"}</span>
        <div style={{ position: "relative" }}>
          <button className="bell" onClick={() => setOpen((o) => !o)} aria-label="notifications">
            <Bell size={19} />
            <span className="badge" style={{ display: unread ? "flex" : "none" }}>{unread > 99 ? "99+" : unread}</span>
          </button>
          {open && (
            <div className="drop">
              <div className="dh"><b>Notifications</b><a onClick={markAllRead}>Mark all read</a></div>
              <ul className="nlist">
                {notifications.map((n) => (
                  <li key={n.id} className={n.read ? "" : "unread"}>
                    <span className="udot" />
                    <div style={{ flex: 1 }}>
                      <div className="t">{n.title}</div>
                      <div className="m">{n.body}</div>
                      <div className="d">{new Date(n.ts).toLocaleString()}</div>
                    </div>
                  </li>
                ))}
              </ul>
              {!notifications.length && <div className="nempty">No notifications yet.</div>}
            </div>
          )}
        </div>
        <span className="chip"><span className={"av " + roleAv(user.role)}>{initials(user.name)}</span>{user.name}<span className="tag">{roleLabel}</span></span>
        <button className="btn ghost sm" onClick={async () => {
          try { const r = await navigator.serviceWorker?.getRegistration(); const s = await r?.pushManager?.getSubscription(); await s?.unsubscribe(); } catch {}
          clearUser(); router.replace("/login");
        }}><LogOut size={15} /> Logout</button>
      </div>
      {pushMsg && (
        <div style={{ padding: "9px 20px", background: "#12162a", borderBottom: "1px solid var(--line)", fontSize: 12.5, color: "var(--mut)", display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ flex: 1 }}>{pushMsg}</span>
          <a style={{ cursor: "pointer", color: "var(--acc2)" }} onClick={() => setPushMsg("")}>dismiss</a>
        </div>
      )}
      <div className="container">{children}</div>

      {toast && (
        <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 60, width: 350, maxWidth: "92vw", background: "var(--panel)", border: "1px solid var(--acc)", borderRadius: 12, boxShadow: "0 18px 50px rgba(0,0,0,.55)", padding: "13px 14px", display: "flex", gap: 11, alignItems: "flex-start" }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: "var(--acc)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Bell size={19} color="#fff" /></div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10.5, letterSpacing: ".5px", textTransform: "uppercase", color: "var(--acc2)", marginBottom: 2 }}>Push notification</div>
            <div style={{ fontWeight: 600, fontSize: 13.5 }}>{toast.title}</div>
            <div style={{ color: "var(--mut)", fontSize: 12.5, marginTop: 1 }}>{toast.body}</div>
          </div>
          <a style={{ cursor: "pointer", color: "var(--mut)", lineHeight: 1 }} onClick={() => setToast(null)}><X size={16} /></a>
        </div>
      )}
    </div>
  );
}
