"use client";
import { useEffect, useState } from "react";
import { Building2, PlusCircle, Megaphone, Users2 } from "lucide-react";
import { useAuth } from "@/components/useAuth";
import Shell from "@/components/Shell";

export default function SuperadminPage() {
  const { user, ready } = useAuth("superadmin");
  const [tenants, setTenants] = useState([]);
  const [form, setForm] = useState({ companyName: "", adminName: "", adminEmail: "", password: "" });
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  async function load() { const j = await (await fetch("/api/tenants")).json(); setTenants(j.tenants || []); }
  useEffect(() => { if (ready) load(); }, [ready]);

  async function createTenant(e) {
    e.preventDefault(); setBusy(true); setMsg(null);
    const r = await fetch("/api/tenants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    const j = await r.json(); setBusy(false);
    if (!r.ok) { setMsg({ err: j.error }); return; }
    setMsg({ ok: `Tenant "${j.tenant.name}" created - a welcome notification was sent to ${form.adminEmail}` });
    setForm({ companyName: "", adminName: "", adminEmail: "", password: "" }); load();
  }
  async function broadcast() {
    await fetch("/api/event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "broadcast_admins", actor: user.subscriberId }) });
    setMsg({ ok: "Platform announcement sent to all tenant admins." });
  }

  if (!ready) return null;
  return (
    <Shell user={user}>
      <div className="row" style={{ marginBottom: 16 }}>
        <span className="icon-badge"><Building2 size={20} /></span>
        <div><h2 style={{ margin: 0 }}>Superadmin console</h2><div className="mut">Create tenant companies. Each gets an isolated admin who manages their own employees.</div></div>
        <div className="spacer" />
        <button className="btn ghost" onClick={broadcast}><Megaphone size={15} /> Announce to all admins</button>
      </div>

      <div className="grid two">
        <div className="card">
          <h2><PlusCircle size={16} style={{ verticalAlign: "-3px" }} /> Create a tenant</h2>
          <div className="sub">Provisions the company + its Tenant Admin account.</div>
          <form onSubmit={createTenant}>
            <label>Company name</label>
            <input value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} placeholder="Globex Corp" />
            <label>Admin full name</label>
            <input value={form.adminName} onChange={(e) => setForm({ ...form, adminName: e.target.value })} placeholder="Gina Grant" />
            <label>Admin email</label>
            <input value={form.adminEmail} onChange={(e) => setForm({ ...form, adminEmail: e.target.value })} placeholder="admin@globex.com" />
            <label>Admin password</label>
            <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Set a password" />
            {msg?.err && <div className="err">{msg.err}</div>}
            {msg?.ok && <div className="ok">{msg.ok}</div>}
            <button className="btn" disabled={busy} style={{ marginTop: 16 }}><Building2 size={15} /> {busy ? "Creating..." : "Create tenant"}</button>
          </form>
        </div>

        <div className="card">
          <h2><Users2 size={16} style={{ verticalAlign: "-3px" }} /> Tenants ({tenants.length})</h2>
          <div className="sub">The isolated companies on the platform.</div>
          {tenants.map((t) => (
            <div className="item" key={t.slug}>
              <span className="icon-badge"><Building2 size={18} /></span>
              <div style={{ flex: 1 }}><div className="t">{t.name}</div><div className="s">admin: {t.adminEmail}</div></div>
              <span className="tag">{t.slug}</span>
            </div>
          ))}
          {!tenants.length && <div className="mut">No tenants yet.</div>}
        </div>
      </div>
    </Shell>
  );
}
