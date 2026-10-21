import { redirect } from "next/navigation";

// The lab now lives inside the app shell (Phase A). Keep old /lab links working.
export default function Page() {
  redirect("/app#studio");
}
