import { NextRequest } from "next/server";
import { db } from "@/lib/store";
import { guard, json, readJson } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const g = guard(req);
  if (g) return g;
  const customerId = req.nextUrl.searchParams.get("customerId") ?? undefined;
  return json({ data: db.listOrders(customerId) });
}

export async function POST(req: NextRequest) {
  const g = guard(req);
  if (g) return g;
  const body = await readJson(req);
  if (!body || typeof body.customerId !== "string")
    return json({ error: "validation", message: "customerId is required" }, 422);
  if (!Array.isArray(body.lines))
    return json({ error: "validation", message: "lines must be an array of {sku, description, qty, unitPrice}" }, 422);
  const res = db.createOrder(body.customerId, body.lines);
  if ("error" in res)
    return json(
      { error: "validation", message: res.error === "customer_not_found" ? "customer not found" : "order must contain at least one valid line" },
      422
    );
  return json({ data: res.order }, 201);
}
