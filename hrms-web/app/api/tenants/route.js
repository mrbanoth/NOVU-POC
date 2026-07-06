import { NextResponse } from "next/server";
import { listTenants, createTenant, superadmins } from "@/lib/store";
import { trigger, notifyMany } from "@/lib/novu";

export async function GET() {
  return NextResponse.json({ tenants: listTenants() });
}

export async function POST(req) {
  try {
    const { companyName, adminName, adminEmail, password } = await req.json();
    if (!companyName || !adminName || !adminEmail || !password)
      return NextResponse.json({ error: "All fields are required" }, { status: 400 });
    const { tenant, admin } = createTenant({ companyName, adminName, adminEmail, password });

    // Notify the newly-created tenant admin (welcome) ...
    await trigger({
      subscriberId: admin.subscriberId, email: admin.email, name: admin.name, tenant: tenant.slug,
      category: "announcement", title: `Welcome to ${tenant.name}`,
      message: `Your company workspace "${tenant.name}" is ready. You can now add employees.`,
      actionUrl: "/admin",
    });
    // ... and confirm to the superadmin(s).
    await notifyMany(superadmins(), {
      category: "system", title: "New tenant provisioned",
      message: `Tenant "${tenant.name}" was created (admin ${admin.email}).`, actionUrl: "/superadmin",
    });

    return NextResponse.json({ tenant });
  } catch (e) {
    return NextResponse.json({ error: e.message || "Failed to create tenant" }, { status: 400 });
  }
}
