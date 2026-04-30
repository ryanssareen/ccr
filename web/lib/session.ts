import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export type SessionUser = {
  uid: string;
  email: string;
  provider: "email" | "github";
};

export async function requireAuth(): Promise<SessionUser> {
  const cookieStore = await cookies();
  const uid = cookieStore.get("ccr_uid")?.value;
  const email = cookieStore.get("ccr_email")?.value;
  const providerValue = cookieStore.get("ccr_provider")?.value;

  if (!uid || !email || (providerValue !== "email" && providerValue !== "github")) {
    redirect("/login");
  }

  return { uid, email, provider: providerValue };
}
