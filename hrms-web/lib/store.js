// Users + tenants, backed by the async data layer (Upstash on Vercel, file locally).
import { getJSON, setJSON } from "./data";

const KEY = "hrms:db";
const SEED = {
  users: [
    { email: "admin@hrms.com", password: "Bsandeep123?", role: "superadmin", name: "Super Admin", tenant: null, subscriberId: "platform:super" },
    { email: "admin@acme.com", password: "Acme123?", role: "admin", name: "Alice (Acme Admin)", tenant: "acme", subscriberId: "acme:admin" },
    { email: "eddie@acme.com", password: "Emp123?", role: "employee", name: "Eddie", tenant: "acme", subscriberId: "acme:eddie" },
  ],
  tenants: [{ slug: "acme", name: "Acme Corp", adminEmail: "admin@acme.com" }],
};

export function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "t" + String(s).length;
}

async function read() {
  let db = await getJSON(KEY, null);
  if (!db || !db.users) { db = JSON.parse(JSON.stringify(SEED)); await setJSON(KEY, db); }
  return db;
}
async function write(db) { await setJSON(KEY, db); }

export async function findUser(email, password) {
  return (await read()).users.find((u) => u.email.toLowerCase() === String(email).toLowerCase() && u.password === password) || null;
}
export async function userBySubscriber(sid) {
  return (await read()).users.find((u) => u.subscriberId === sid) || null;
}
export async function listTenants() {
  return (await read()).tenants;
}
export async function employeesOf(tenant) {
  return (await read()).users.filter((u) => u.tenant === tenant && u.role === "employee");
}
export async function adminsOf(tenant) {
  return (await read()).users.filter((u) => u.tenant === tenant && u.role === "admin");
}
export async function allAdmins() {
  return (await read()).users.filter((u) => u.role === "admin");
}
export async function superadmins() {
  return (await read()).users.filter((u) => u.role === "superadmin");
}

export async function createTenant({ companyName, adminName, adminEmail, password }) {
  const db = await read();
  const slug = slugify(companyName);
  if (db.tenants.find((t) => t.slug === slug)) throw new Error("A tenant with this name already exists");
  if (db.users.find((u) => u.email.toLowerCase() === adminEmail.toLowerCase())) throw new Error("That admin email is already in use");
  const tenant = { slug, name: companyName, adminEmail };
  const admin = { email: adminEmail, password, role: "admin", name: adminName, tenant: slug, subscriberId: `${slug}:admin` };
  db.tenants.push(tenant);
  db.users.push(admin);
  await write(db);
  return { tenant, admin };
}

export async function createEmployee({ tenant, name, email, password }) {
  const db = await read();
  if (!db.tenants.find((t) => t.slug === tenant)) throw new Error("Unknown tenant");
  if (db.users.find((u) => u.email.toLowerCase() === email.toLowerCase())) throw new Error("That email is already in use");
  const id = slugify(name || email.split("@")[0]);
  let sid = `${tenant}:${id}`;
  let n = 1;
  while (db.users.find((u) => u.subscriberId === sid)) sid = `${tenant}:${id}-${n++}`;
  const emp = { email, password, role: "employee", name, tenant, subscriberId: sid };
  db.users.push(emp);
  await write(db);
  return emp;
}
