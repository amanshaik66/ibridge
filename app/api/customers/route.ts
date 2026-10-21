import { NextRequest } from "next/server";
import { db } from "@/lib/store";
import { guard, json, readJson } from "@/lib/auth";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function GET(req: NextRequest) {
  const g = guard(req);
  if (g) return g;
  return json({ data: db.listCustomers() });
}

export async function POST(req: NextRequest) {
  const g = guard(req);
  if (g) return g;
  const body = await readJson(req);
  if (!body || typeof body.name !== "string" || !body.name.trim())
    return json({ error: "validation", message: "name is required" }, 422);
  if (typeof body.email !== "string" || !EMAIL.test(body.email))
    return json({ error: "validation", message: "a valid email is required" }, 422);
  if (body.status && !["active", "inactive", "prospect"].includes(body.status))
    return json({ error: "validation", message: "status must be active|inactive|prospect" }, 422);
  const rec = db.createCustomer({
    name: body.name.trim(),
    email: body.email.trim().toLowerCase(),
    company: typeof body.company === "string" ? body.company.trim() : "",
    status: body.status ?? "prospect",
  });
  return json({ data: rec }, 201);
}
