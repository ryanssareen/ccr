import type { Metadata } from "next";

import { StaticPage } from "@/components/static-page";

export const metadata: Metadata = {
  title: "Terms of Service — ccr"
};

export default function TermsPage() {
  return (
    <StaticPage
      title="Terms of Service"
      updated="April 30, 2026"
      intro="Welcome to ccr. By using our service, you agree to these terms. Read them carefully."
    >
      <h2>1. Acceptance of Terms</h2>
      <p>
        By accessing or using ccr, you agree to be bound by these Terms of Service and our Privacy
        Policy. If you do not agree, do not use the service.
      </p>

      <h2>2. Description of Service</h2>
      <p>
        ccr is a terminal-based coding assistant that reads your code, proposes changes, and runs
        commands with your approval. The service is provided free of charge and routes requests
        across multiple LLM providers.
      </p>

      <h2>3. User Accounts</h2>
      <p>You must create an account to use ccr. You are responsible for:</p>
      <ul>
        <li>Maintaining the security of your account credentials</li>
        <li>All activity that occurs under your account</li>
        <li>Notifying us immediately of any unauthorized use</li>
      </ul>

      <h2>4. Acceptable Use</h2>
      <p>You agree not to use ccr to:</p>
      <ul>
        <li>Violate any laws or regulations</li>
        <li>Infringe on intellectual property rights</li>
        <li>Generate malicious code or exploits</li>
        <li>Abuse the service by attempting to circumvent rate limits or quotas</li>
        <li>Reverse engineer or attempt to extract underlying models</li>
      </ul>

      <h2>5. Code and Data</h2>
      <p>
        Code you submit to ccr is processed by our LLM providers. We do not train models on your
        data. We do not share your code with third parties except as necessary to provide the
        service (i.e., forwarding requests to LLM providers).
      </p>
      <p>
        You retain all rights to your code. ccr does not claim ownership of any code you submit
        or any output generated.
      </p>

      <h2>6. Service Availability</h2>
      <p>
        ccr is provided &quot;as is&quot; with no uptime guarantees. We may modify, suspend, or
        discontinue the service at any time. If we discontinue the free tier, we will provide
        notice on our website.
      </p>

      <h2>7. Disclaimer of Warranties</h2>
      <p>
        ccr is provided without warranties of any kind, express or implied. We do not guarantee
        that the service will be error-free, secure, or uninterrupted. You use ccr at your own
        risk.
      </p>

      <h2>8. Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by law, ccr and its operators are not liable for any
        damages arising from your use of the service, including but not limited to data loss,
        security breaches, or bugs introduced by generated code.
      </p>

      <h2>9. Changes to Terms</h2>
      <p>
        We may update these terms from time to time. If we make material changes, we will notify
        users via email or a prominent notice on our website. Continued use of the service after
        changes constitutes acceptance of the new terms.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions about these terms? Email us at{" "}
        <a href="mailto:legal@ccr.dev">legal@ccr.dev</a>.
      </p>
    </StaticPage>
  );
}
