import type { Metadata } from "next";

import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";

export const metadata: Metadata = {
  title: "Get started — ccr"
};

export default async function SignupPage({
  searchParams
}: {
  searchParams: Promise<{ cli_redirect?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthShell>
      <AuthForm mode="signup" cliRedirect={params.cli_redirect} />
    </AuthShell>
  );
}
