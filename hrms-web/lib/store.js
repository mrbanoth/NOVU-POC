// Tiny file-backed store for the POC (users, tenants). Not for production.
import fs from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "db.json");

const SEED = {
  users: [
    { email: "admin@hrms.com", password: "Bsandeep123?", role: "superadmin", name: "Super Admin", tenant: null, subscriberId: "platform:super" },
    { email: "admin@acme.com", password: "Acme123?", role: "admin", name: "Alice (Acme Admin)", tenant: "acme", subscriberId: "acme:admin" },
    { email: "eddie@acme.com", password: "Emp123?", role: "employee", name: "Eddie", tenant: "acme", subscriberId: "acme:eddie" },
  ],
  tenants: [{ slug: "acme", name: "Acme Corp", adminEmail: "admin@acme.com" }],
};

export function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "t" + Date.now();
}

function read() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, "utf-8"));
  } catch {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(SEED, null, 2));
    return JSON.parse(JSON.stringify(SEED));
  }
}
function write(db) {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

export function findUser(email, password) {
  return read().users.find((u) => u.email.toLowerCase() === String(email).toLowerCase() && u.password === password) || null;
}
export function userBySubscriber(sid) {
  return read().users.find((u) => u.subscriberId === sid) || null;
}
export function listTenants() {
  return read().tenants;
}
export function employeesOf(tenant) {
  return read().users.filter((u) => u.tenant === tenant && u.role === "employee");
}
export function adminsOf(tenant) {
  return read().users.filter((u) => u.tenant === tenant && u.role === "admin");
}
export function allAdmins() {
  return read().users.filter((u) => u.role === "admin");
}
export function superadmins() {
  return read().users.filter((u) => u.role === "superadmin");
}

export function createTenant({ companyName, adminName, adminEmail, password }) {
  const db = read();
  const slug = slugify(companyName);
  if (db.tenants.find((t) => t.slug === slug)) throw new Error("A tenant with this name already exists");
  if (db.users.find((u) => u.email.toLowerCase() === adminEmail.toLowerCase())) throw new Error("That admin email is already in use");
  const tenant = { slug, name: companyName, adminEmail };
  const admin = { email: adminEmail, password, role: "admin", name: adminName, tenant: slug, subscriberId: `${slug}:admin` };
  db.tenants.push(tenant);
  db.users.push(admin);
  write(db);
  return { tenant, admin };
}

export function createEmployee({ tenant, name, email, password }) {
  const db = read();
  if (!db.tenants.find((t) => t.slug === tenant)) throw new Error("Unknown tenant");
  if (db.users.find((u) => u.email.toLowerCase() === email.toLowerCase())) throw new Error("That email is already in use");
  const id = slugify(name || email.split("@")[0]);
  let sid = `${tenant}:${id}`;
  let n = 1;
  while (db.users.find((u) => u.subscriberId === sid)) sid = `${tenant}:${id}-${n++}`;
  const emp = { email, password, role: "employee", name, tenant, subscriberId: sid };
  db.users.push(emp);
  write(db);
  return emp;
}
