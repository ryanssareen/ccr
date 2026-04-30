import type { Metadata } from "next";

import { StaticPage } from "@/components/static-page";

export const metadata: Metadata = {
  title: "Privacy Policy — ccr"
};

export default function PrivacyPage() {
  return (
    <StaticPage
      title="Privacy Policy"
      updated="April 30, 2026"
      intro="Your privacy matters. This policy explains what data we collect, how we use it, and your rights."
    >
      <h2>1. Information We Collect</h2>
      <p>When you use ccr, we collect:</p>
      <ul>
        <li>
          <strong>Account information:</strong> Email address, name, and authentication
          credentials.
        </li>
        <li>
          <strong>Usage data:</strong> Commands you run, files you modify, timestamps, and error
          logs.
        </li>
        <li>
          <strong>Code snippets:</strong> Portions of your codebase sent to LLM providers to
          generate responses. We do not store your code on our servers beyond request/response
          logging for debugging purposes (retained for 30 days).
        </li>
      </ul>

      <h2>2. How We Use Your Information</h2>
      <p>We use the information we collect to:</p>
      <ul>
        <li>Provide and improve the service</li>
        <li>Authenticate your account and manage sessions</li>
        <li>Route requests to LLM providers and return responses</li>
        <li>Monitor abuse and enforce our Terms of Service</li>
        <li>Send service-related emails (authentication, account updates, security alerts)</li>
      </ul>

      <h2>3. Data Sharing</h2>
      <p>We share your data only as necessary to provide the service:</p>
      <ul>
        <li>
          <strong>LLM providers:</strong> Code snippets and prompts are sent to third-party LLM
          providers (Groq, Together AI, Cerebras, OpenRouter) to generate responses. Each
          provider has its own privacy policy. We do not control how they process your data
          beyond the terms of their APIs.
        </li>
        <li>
          <strong>Service providers:</strong> We may use third-party services for hosting,
          analytics, and infrastructure. These providers are bound by confidentiality agreements.
        </li>
      </ul>
      <p>We do not sell your data to advertisers or third parties.</p>

      <h2>4. Data Retention</h2>
      <ul>
        <li>
          <strong>Account data:</strong> Retained until you delete your account.
        </li>
        <li>
          <strong>Request/response logs:</strong> Retained for 30 days for debugging and abuse
          prevention.
        </li>
        <li>
          <strong>Usage statistics:</strong> Aggregated, anonymized usage data may be retained
          indefinitely for product analytics.
        </li>
      </ul>

      <h2>5. Your Code</h2>
      <p>
        We do not train models on your code. LLM providers may have their own policies regarding
        training data — consult their privacy policies for details. ccr processes your code
        transiently to fulfill requests and does not store it beyond request logs (30 days).
      </p>

      <h2>6. Security</h2>
      <p>
        We use industry-standard security measures to protect your data, including encrypted
        connections (TLS) and secure credential storage. However, no system is perfectly secure.
        You use ccr at your own risk.
      </p>

      <h2>7. Your Rights</h2>
      <p>You have the right to:</p>
      <ul>
        <li>Access the personal data we hold about you</li>
        <li>Request correction of inaccurate data</li>
        <li>Request deletion of your account and associated data</li>
        <li>Opt out of non-essential emails</li>
      </ul>
      <p>
        To exercise these rights, email us at{" "}
        <a href="mailto:privacy@ccr.dev">privacy@ccr.dev</a>.
      </p>

      <h2>8. Cookies and Tracking</h2>
      <p>
        We use minimal cookies for authentication and session management. We do not use
        third-party tracking or advertising cookies.
      </p>

      <h2>9. Changes to This Policy</h2>
      <p>
        We may update this policy from time to time. If we make material changes, we will notify
        you via email or a prominent notice on our website.
      </p>

      <h2>10. Contact</h2>
      <p>
        Questions about privacy? Email us at{" "}
        <a href="mailto:privacy@ccr.dev">privacy@ccr.dev</a>.
      </p>
    </StaticPage>
  );
}
