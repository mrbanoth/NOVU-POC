"use client";
import { useState } from "react";
import { Briefcase, Clock, CalendarClock, Send } from "lucide-react";
import { useAuth } from "@/components/useAuth";
import Shell from "@/components/Shell";

export default function EmployeePage() {
  const { user, ready } = useAuth("employee");
  const [msg, setMsg] = useState(null);

  async function act(action, label) {
    await fetch("/api/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, actor: user.subscriberId }) });
    setMsg(`${label} - your Tenant Admin has been notified.`);
  }

  if (!ready) return null;
  return (
    <Shell user={user}>
      <div className="row" style={{ marginBottom: 16 }}>
        <span className="icon-badge"><Briefcase size={20} /></span>
        <div><h2 style={{ margin: 0 }}>My workspace</h2><div className="mut">Submit work items. Your Tenant Admin gets notified in real time.</div></div>
      </div>

      <div className="grid two">
        <div className="card">
          <h2>Quick actions</h2>
          <div className="sub">Each of these notifies your company&apos;s admin instantly.</div>
          <button className="btn" style={{ width: "100%", justifyContent: "center", marginBottom: 10 }} onClick={() => act("submit_timesheet", "Timesheet submitted")}>
            <Clock size={16} /> Submit my timesheet
          </button>
          <button className="btn ghost" style={{ width: "100%", justifyContent: "center" }} onClick={() => act("request_leave", "Leave request sent")}>
            <CalendarClock size={16} /> Request leave (2 days)
          </button>
          {msg && <div className="ok">{msg}</div>}
        </div>

        <div className="card">
          <h2>My profile</h2>
          <div className="sub">Who you are in the system.</div>
          <div className="item"><span className="av employee" style={{ width: 34, height: 34 }}>{user.name.slice(0, 1).toUpperCase()}</span><div style={{ flex: 1 }}><div className="t">{user.name}</div><div className="s">{user.email}</div></div></div>
          <div className="mono" style={{ marginTop: 10 }}>tenant: {user.tenant}</div>
          <div className="mono">subscriberId: {user.subscriberId}</div>
          <div className="mut" style={{ marginTop: 14, fontSize: 12.5 }}>
            <Send size={13} style={{ verticalAlign: "-2px" }} /> When your admin approves a timesheet or assigns a task, it appears in your <b>&#128276; bell</b> instantly with a browser alert.
          </div>
        </div>
      </div>
    </Shell>
  );
}
