import { NextRequest } from "next/server";
import { db } from "@/lib/store";
import { guard, json, readJson } from "@/lib/auth";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const g = guard(req);
  if (g) return g;
  const rec = db.getCustomer(params.id);
  return rec ? json({ data: rec }) : json({ error: "not_found", message: "customer not found" }, 404);
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const g = guard(req);
  if (g) return g;
  const body = await readJson(req);
  if (!body) return json({ error: "validation", message: "JSON body required" }, 422);
  const rec = db.updateCustomer(params.id, body);
  return rec ? json({ data: rec }) : json({ error: "not_found", message: "customer not found" }, 404);
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = guard(req);
  if (g) return g;
  const ok = db.deleteCustomer(params.id);
  return ok ? json({ data: { deleted: params.id } }) : json({ error: "not_found", message: "customer not found" }, 404);
}
