import { redirect } from "next/navigation";
import { accountsEnabled } from "@/lib/auth/current";
import { signInRequired } from "@/lib/session";
import { setUpOwner } from "../login/actions";
import { LoginForm } from "../login/LoginForm";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await accountsEnabled()) redirect("/login");
  return (
    <>
      <header className="top">
        <div>
          <div className="label">First-time setup</div>
          <h1>Create the admin account</h1>
          <p>This becomes the owner account. From then on everyone signs in with their own email and password, and you invite staff from the Staff page.</p>
        </div>
      </header>
      <LoginForm
        action={setUpOwner}
        submit="Create account"
        fields={[
          ...(signInRequired() ? [{ name: "shopPassword", label: "Current shop password", type: "password" }] : []),
          { name: "name", label: "Your name", type: "text", autoComplete: "name" },
          { name: "email", label: "Email", type: "email", autoComplete: "username" },
          { name: "password", label: "Password (10+ characters)", type: "password", autoComplete: "new-password" },
        ]}
      />
    </>
  );
}
