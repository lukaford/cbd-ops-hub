import Link from "next/link";
import { accountsEnabled } from "@/lib/auth/current";
import { signInRequired } from "@/lib/session";
import { signIn } from "./actions";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const accounts = await accountsEnabled();
  return (
    <>
      <header className="top">
        <div>
          <div className="label">Closets by Design · Staff</div>
          <h1>Sign in</h1>
          <p>{accounts ? "Use the email and password from your invite." : "Enter the shop password to see the board."}</p>
        </div>
      </header>
      {accounts ? (
        <LoginForm
          action={signIn}
          hidden={{ next: next ?? "/" }}
          fields={[
            { name: "email", label: "Email", type: "email", autoComplete: "username" },
            { name: "password", label: "Password", type: "password", autoComplete: "current-password" },
          ]}
        />
      ) : signInRequired() ? (
        <LoginForm action={signIn} hidden={{ next: next ?? "/" }} fields={[{ name: "password", label: "Password", type: "password", autoComplete: "current-password" }]} />
      ) : null}
      {!accounts && (
        <p className="small">
          No staff accounts yet. <Link href="/setup">Create the first admin account</Link> to turn on personal sign-ins.
        </p>
      )}
      {accounts && <p className="small">Forgot your password? Ask an admin for a reset link. Clients sign in <Link href="/portal/sign-in">here</Link>.</p>}
    </>
  );
}
