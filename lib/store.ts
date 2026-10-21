// In-memory store. Ephemeral across serverless invocations — documented in
// the OpenAPI spec. Swap with a Postgres adapter when persistence is needed.

export type Customer = {
  id: string;
  name: string;
  email: string;
  company: string;
  status: "active" | "inactive" | "prospect";
  createdAt: string;
  updatedAt: string;
};

export type OrderLine = { sku: string; description: string; qty: number; unitPrice: number };
export type Order = {
  id: string;
  customerId: string;
  lines: OrderLine[];
  subtotal: number;
  tax: number;
  total: number;
  currency: "USD";
  status: "draft" | "confirmed" | "shipped" | "cancelled";
  createdAt: string;
};

const now = () => new Date().toISOString();
let seq = 1000;
export const nextId = (prefix: string) => `${prefix}-${++seq}`;

const customers = new Map<string, Customer>();
const orders = new Map<string, Order>();

function seed() {
  if (customers.size) return;
  const seedCustomers: Customer[] = [
    { id: "CUS-1001", name: "Priya Nair", email: "priya@acmecorp.com", company: "Acme Corp", status: "active", createdAt: now(), updatedAt: now() },
    { id: "CUS-1002", name: "Daniel Osei", email: "daniel@globex.io", company: "Globex", status: "active", createdAt: now(), updatedAt: now() },
    { id: "CUS-1003", name: "Maria Chen", email: "maria@initech.dev", company: "Initech", status: "prospect", createdAt: now(), updatedAt: now() },
  ];
  seedCustomers.forEach((c) => customers.set(c.id, c));
  const o: Order = {
    id: "ORD-1001",
    customerId: "CUS-1001",
    lines: [
      { sku: "SVC-001", description: "IBM i modernization assessment", qty: 1, unitPrice: 4500 },
      { sku: "SVC-002", description: "RPGLE code review (per module)", qty: 12, unitPrice: 180 },
    ],
    subtotal: 6660, tax: 532.8, total: 7192.8, currency: "USD",
    status: "confirmed", createdAt: now(),
  };
  orders.set(o.id, o);
}
seed();

export const db = {
  listCustomers: () => Array.from(customers.values()),
  getCustomer: (id: string) => customers.get(id),
  createCustomer: (c: Omit<Customer, "id" | "createdAt" | "updatedAt">) => {
    const rec: Customer = { ...c, id: nextId("CUS"), createdAt: now(), updatedAt: now() };
    customers.set(rec.id, rec);
    return rec;
  },
  updateCustomer: (id: string, patch: Partial<Customer>) => {
    const cur = customers.get(id);
    if (!cur) return null;
    const rec = { ...cur, ...patch, id, updatedAt: now() };
    customers.set(id, rec);
    return rec;
  },
  deleteCustomer: (id: string) => customers.delete(id),

  listOrders: (customerId?: string) =>
    Array.from(orders.values()).filter((o) => !customerId || o.customerId === customerId),
  getOrder: (id: string) => orders.get(id),
  createOrder: (customerId: string, lines: OrderLine[]) => {
    if (!customers.get(customerId)) return { error: "customer_not_found" as const };
    const clean = lines.filter((l) => l.qty > 0 && l.unitPrice >= 0 && l.sku && l.description);
    if (!clean.length) return { error: "empty_order" as const };
    const subtotal = Math.round(clean.reduce((s, l) => s + l.qty * l.unitPrice, 0) * 100) / 100;
    const tax = Math.round(subtotal * 0.08 * 100) / 100;
    const rec: Order = {
      id: nextId("ORD"), customerId, lines: clean, subtotal, tax,
      total: Math.round((subtotal + tax) * 100) / 100,
      currency: "USD", status: "draft", createdAt: now(),
    };
    orders.set(rec.id, rec);
    return { order: rec };
  },
};
