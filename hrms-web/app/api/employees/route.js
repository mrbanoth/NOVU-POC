import { NextResponse } from "next/server";
import { employeesOf, createEmployee, adminsOf, listTenants } from "@/lib/store";
import { notify, notifyMany } from "@/lib/notify";

export async function GET(req) {
  const tenant = new URL(req.url).searchParams.get("tenant");
  return NextResponse.json({ employees: employeesOf(tenant).map(({ password, ...e }) => e) });
}

export async function POST(req) {
  try {
    const { tenant, name, email, password } = await req.json();
    if (!tenant || !name || !email || !password)
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    const emp = createEmployee({ tenant, name, email, password });
    const tenantName = (listTenants().find((t) => t.slug === tenant) || {}).name || tenant;

    // Welcome the employee ...
    await notify(
      { subscriberId: emp.subscriberId, email: emp.email, name: emp.name, tenant },
      { category: "announcement", title: `Welcome to ${tenantName}`, message: `Hi ${emp.name}, your HRMS account is active. Submit timesheets and requests from your dashboard.`, actionUrl: "/employee" }
    );
    // ... and tell the tenant admin(s).
    await notifyMany(adminsOf(tenant), {
      category: "system", title: "New employee added",
      message: `${emp.name} (${emp.email}) was added to ${tenantName}.`, actionUrl: "/admin", tenant,
    });

    const { password: _p, ...safe } = emp;
    return NextResponse.json({ employee: safe });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Failed to create employee" }, { status: 400 });
  }
}
