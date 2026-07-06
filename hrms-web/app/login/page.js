"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogIn, ShieldCheck } from "lucide-react";
import { saveUser } from "@/components/useAuth";

const SAMPLES = [
  { role: "Superadmin", email: "admin@hrms.com", password: "Bsandeep123?" },
  { role: "Tenant Admin", email: "admin@acme.com", password: "Acme123?" },
  { role: "Employee", email: "eddie@acme.com", password: "Emp123?" },
];

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  useEffect(() => {
    try { const u = JSON.parse(localStorage.getItem("hrms_user") || "null"); if (u) router.replace("/" + u.role); } catch {}
  }, [router]);

  async function submit(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    const r = await fetch("/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    setBusy(false);
    if (!r.ok) { setErr((await r.json()).error || "Login failed"); return; }
    const { user } = await r.json();
    saveUser(user);
    router.replace("/" + user.role);
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <div className="row" style={{ marginBottom: 6 }}>
          <span className="icon-badge"><ShieldCheck size={20} /></span>
          <div><h2>HRMS Sign in</h2><div className="mut" style={{ fontSize: 12 }}>Novu notification POC - dummy local auth</div></div>
        </div>
        <form onSubmit={submit}>
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="off" />
          <label>Password</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="password" />
          {err && <div className="err">{err}</div>}
          <button className="btn" disabled={busy} style={{ width: "100%", justifyContent: "center", marginTop: 16 }}>
            <LogIn size={16} /> {busy ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <div className="samples">
          <div className="mut" style={{ fontSize: 11, marginBottom: 8, textTransform: "uppercase", letterSpacing: ".5px" }}>Sample accounts (click to fill)</div>
          {SAMPLES.map((s) => (
            <div key={s.email} className="sample" onClick={() => { setEmail(s.email); setPassword(s.password); }}>
              <div><div className="who">{s.role}</div><div className="cred">{s.email}</div></div>
              <div className="cred">{s.password}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
