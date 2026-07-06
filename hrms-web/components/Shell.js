"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, LogOut, BellRing } from "lucide-react";
import { useInbox } from "./useInbox";
import { clearUser } from "./useAuth";

const roleAv = (role) => (role === "superadmin" ? "super" : role === "admin" ? "admin" : "employee");
const initials = (n) => n.replace(/\(.*\)/, "").trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join("").toUpperCase();

export default function Shell({ user, children }) {
  const { notifications, unread, live, markAllRead, enableAlerts } = useInbox(user.subscriberId);
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState(false);
  const router = useRouter();

  const roleLabel = user.role === "superadmin" ? "Superadmin" : user.role === "admin" ? "Tenant Admin" : "Employee";

  return (
    <div>
      <div className="nav">
        <div className="brand">HR<b>MS</b> <span className="mut" style={{ fontWeight: 500, fontSize: 12 }}>Novu POC</span></div>
        <div className="spacer" />
        <button className="btn ghost sm" onClick={async () => { const p = await enableAlerts(); setAlerts(p === "granted"); }}>
          <BellRing size={15} /> {alerts ? "Alerts on" : "Enable alerts"}
        </button>
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
        <button className="btn ghost sm" onClick={() => { clearUser(); router.replace("/login"); }}><LogOut size={15} /> Logout</button>
      </div>
      <div className="container">{children}</div>
    </div>
  );
}
