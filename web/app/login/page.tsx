import type { Metadata } from "next";

import { AuthForm } from "@/components/auth-form";
import { AuthShell } from "@/components/auth-shell";

export const metadata: Metadata = {
  title: "Sign in — ccr"
};

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ cli_redirect?: string }>;
}) {
  const params = await searchParams;
  return (
    <AuthShell>
      <AuthForm mode="login" cliRedirect={params.cli_redirect} />
    </AuthShell>
  );
}
