import { DashboardClient } from "@/components/dashboard-client";
import { requireAuth } from "@/lib/session";

export default async function DashboardPage() {
  const user = await requireAuth();
  return <DashboardClient user={user} />;
}
