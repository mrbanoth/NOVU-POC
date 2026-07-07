import { NextResponse } from "next/server";
import { userBySubscriber, adminsOf, employeesOf, allAdmins, listTenants } from "@/lib/store";
import { notifyMany } from "@/lib/notify";

// action definitions: how each role's action fans out
const ACTIONS = {
  submit_timesheet: { cat: "timesheet", title: "Timesheet submitted", msg: (a) => `${a.name} submitted a weekly timesheet for approval.`, url: "/admin", to: "tenant_admins" },
  request_leave:    { cat: "approval",  title: "Leave request",       msg: (a) => `${a.name} requested 2 days of leave.`,               url: "/admin", to: "tenant_admins" },
  approve_timesheet:{ cat: "approval",  title: "Timesheet approved",  msg: (a) => `Your timesheet was approved by ${a.name}.`,          url: "/employee", to: "target" },
  assign_task:      { cat: "task",      title: "New task assigned",   msg: (a) => `${a.name} assigned you a task: "Prepare the Q3 report".`, url: "/employee", to: "target" },
  announce_holiday: { cat: "announcement", title: "Company holiday",  msg: (a, t) => `${t} will be closed this Friday for a company holiday.`, url: "/employee", to: "tenant_employees" },
  broadcast_admins: { cat: "announcement", title: "Platform announcement", msg: () => "Scheduled maintenance tonight 11pm-12am.", url: "/admin", to: "all_admins" },
};

async function resolve(rule, actor, targetSid) {
  if (rule === "tenant_admins") return adminsOf(actor.tenant);
  if (rule === "tenant_employees") return employeesOf(actor.tenant);
  if (rule === "all_admins") return allAdmins();
  if (rule === "target") { const u = await userBySubscriber(targetSid); return u ? [u] : []; }
  return [];
}

export async function POST(req) {
  const { action, actor, target } = await req.json();
  const def = ACTIONS[action];
  const me = await userBySubscriber(actor);
  if (!def || !me) return NextResponse.json({ error: "unknown action or actor" }, { status: 400 });
  const tenantName = ((await listTenants()).find((t) => t.slug === me.tenant) || {}).name || me.tenant;
  const recipients = (await resolve(def.to, me, target)).filter((r) => r.subscriberId !== me.subscriberId);
  const count = await notifyMany(recipients, {
    category: def.cat, title: def.title, message: def.msg(me, tenantName), actionUrl: def.url,
  });
  return NextResponse.json({ delivered: recipients.map((r) => r.name), count });
}
