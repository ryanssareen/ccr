"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { signOutUser } from "@/lib/auth";

function clearSessionCookies() {
  document.cookie = "ccr_uid=; path=/; max-age=0; samesite=lax";
  document.cookie = "ccr_email=; path=/; max-age=0; samesite=lax";
  document.cookie = "ccr_provider=; path=/; max-age=0; samesite=lax";
}

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);

  const handleSignOut = async () => {
    setIsPending(true);
    await signOutUser();
    clearSessionCookies();
    router.push("/login");
    router.refresh();
  };

  return (
    <button
      type="button"
      className={className ?? "nav-logout"}
      onClick={handleSignOut}
      disabled={isPending}
    >
      {isPending ? "Signing out..." : "Sign out"}
    </button>
  );
}
