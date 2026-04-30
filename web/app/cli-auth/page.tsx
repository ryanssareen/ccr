"use client";

import { onAuthStateChanged, type Auth, type User } from "firebase/auth";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

import { AuthForm } from "@/components/auth-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getFirebaseAuth } from "@/lib/firebase";
import { validateCliRedirect } from "@/lib/cli-redirect";

type ExchangeResponse = {
  token: string;
};

function CliAuthInnerPage() {
  const searchParams = useSearchParams();
  const rawCliRedirect = searchParams.get("cli_redirect");
  const cliRedirect = useMemo(() => validateCliRedirect(rawCliRedirect), [rawCliRedirect]);
  const [authClient, setAuthClient] = useState<Auth | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [state, setState] = useState<"idle" | "exchanging" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let authInstance: Auth;
    try {
      authInstance = getFirebaseAuth();
    } catch (firebaseError) {
      setError(firebaseError instanceof Error ? firebaseError.message : "Firebase setup is invalid.");
      setState("error");
      return;
    }
    setAuthClient(authInstance);
    const unsubscribe = onAuthStateChanged(authInstance, (nextUser) => {
      setUser(nextUser);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!cliRedirect || !user || !authClient) return;

    const run = async () => {
      setState("exchanging");
      setError(null);

      try {
        const idToken = await user.getIdToken();
        const response = await fetch("/api/v1/exchangeFirebaseToken", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken })
        });

        if (!response.ok) {
          throw new Error("Token exchange failed.");
        }

        const data = (await response.json()) as ExchangeResponse;
        if (!data.token) {
          throw new Error("No token returned from exchange endpoint.");
        }

        const destination = new URL(cliRedirect);
        destination.searchParams.set("token", data.token);
        if (user.email) destination.searchParams.set("email", user.email);
        window.location.assign(destination.toString());
        setState("done");
      } catch (exchangeError) {
        setState("error");
        setError(exchangeError instanceof Error ? exchangeError.message : "Authentication handoff failed.");
      }
    };

    void run();
  }, [authClient, cliRedirect, user]);

  if (!cliRedirect) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-lg">
          <CardHeader>
            <CardTitle>Invalid CLI redirect</CardTitle>
            <CardDescription>
              `cli_redirect` must be an HTTP localhost/127.0.0.1 URL with port 1024-65535.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  const isLoggedIn = Boolean(user);

  if (!isLoggedIn) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <AuthForm
          mode="login"
          cliRedirect={cliRedirect}
          title="Sign in to continue to CCR CLI"
          description="Authenticate to hand off a one-time CCR token to your local CLI callback."
        />
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>
            {state === "done" ? "Authenticated" : state === "exchanging" ? "Finalizing sign-in..." : "CCR CLI auth"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {state === "done" ? (
            <p className="text-sm text-green-700">✓ Authenticated. You can close this tab.</p>
          ) : state === "error" ? (
            <p className="text-sm text-red-600">{error ?? "Authentication handoff failed."}</p>
          ) : (
            <p className="text-sm text-muted-foreground">Exchanging Firebase token for CCR token...</p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

export default function CliAuthPage() {
  return (
    <Suspense fallback={<main className="flex min-h-screen items-center justify-center p-6">Loading...</main>}>
      <CliAuthInnerPage />
    </Suspense>
  );
}
