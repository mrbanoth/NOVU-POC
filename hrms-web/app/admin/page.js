"use client";
import { useEffect, useState } from "react";
import { Users, UserPlus, CheckCircle2, ClipboardList, CalendarDays } from "lucide-react";
import { useAuth } from "@/components/useAuth";
import Shell from "@/components/Shell";

export default function AdminPage() {
  const { user, ready } = useAuth("admin");
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() { const j = await (await fetch("/api/employees?tenant=" + user.tenant)).json(); setEmployees(j.employees || []); }
  useEffect(() => { if (ready) load(); }, [ready]);

  async function addEmployee(e) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const r = await fetch("/api/employees", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, tenant: user.tenant }) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg({ err: j.error }); return; }
    setMsg({ ok: `${j.employee.name} added - a welcome notification was sent.` });
    setForm({ name: "", email: "", password: "" }); load();
  }
  async function act(action, target) {
    await fetch("/api/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, actor: user.subscriberId, target }) });
    setMsg({ ok: action === "announce_holiday" ? "Holiday announced to all employees." : "Notification sent to the employee." });
  }

  if (!ready) return null;
  return (
    <Shell user={user}>
      <div className="row" style={{ marginBottom: 16 }}>
        <span className="icon-badge"><Users size={20} /></span>
        <div><h2 style={{ margin: 0 }}>{user.name.replace(/\(.*\)/, "").trim()}&apos;s company</h2><div className="mut">Add employees and notify them. Anything they do notifies you.</div></div>
        <div className="spacer" />
        <button className="btn ghost" onClick={() => act("announce_holiday")}><CalendarDays size={15} /> Announce holiday</button>
      </div>

      <div className="grid two">
        <div className="card">
          <h2><UserPlus size={16} style={{ verticalAlign: "-3px" }} /> Add an employee</h2>
          <div className="sub">Creates their account (they can sign in) and sends a welcome.</div>
          <form onSubmit={addEmployee}>
            <label>Full name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Frank Foster" />
            <label>Email</label>
            <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="frank@company.com" />
            <label>Password</label>
            <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Set a password" />
            {msg?.err && <div className="err">{msg.err}</div>}
            {msg?.ok && <div className="ok">{msg.ok}</div>}
            <button className="btn" disabled={busy} style={{ marginTop: 16 }}><UserPlus size={15} /> {busy ? "Adding..." : "Add employee"}</button>
          </form>
        </div>

        <div className="card">
          <h2><Users size={16} style={{ verticalAlign: "-3px" }} /> Employees ({employees.length})</h2>
          <div className="sub">Send each of them a notification.</div>
          {employees.map((e) => (
            <div className="item" key={e.subscriberId}>
              <span className="av employee" style={{ width: 34, height: 34 }}>{e.name.slice(0, 1).toUpperCase()}</span>
              <div style={{ flex: 1 }}><div className="t">{e.name}</div><div className="s">{e.email}</div></div>
              <button className="btn sm green" onClick={() => act("approve_timesheet", e.subscriberId)}><CheckCircle2 size={14} /> Approve</button>
              <button className="btn sm" onClick={() => act("assign_task", e.subscriberId)}><ClipboardList size={14} /> Assign task</button>
            </div>
          ))}
          {!employees.length && <div className="mut">No employees yet - add one on the left.</div>}
        </div>
      </div>
    </Shell>
  );
}
