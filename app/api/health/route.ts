import { json } from "@/lib/auth";

export async function GET() {
  return json({
    status: "ok",
    service: "ibridge",
    version: "1.0.0",
    time: new Date().toISOString(),
  });
}
