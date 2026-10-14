import Link from "next/link";
import { getDb } from "@/db";
import { peekToken } from "@/lib/auth/accounts";
import { acceptInvite } from "../../login/actions";
import { LoginForm } from "../../login/LoginForm";

export const dynamic = "force-dynamic";

// Staff invites and password resets: pick a password, then you're signed in.
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await peekToken(await getDb(), token, ["staff_invite", "password_reset"]);
  const invite = found?.purpose === "staff_invite";
  return (
    <>
      <header className="top">
        <div>
          <div className="label">Closets by Design · Staff</div>
          <h1>{invite ? "Welcome" : "Choose a new password"}</h1>
          {found?.user && <p>{invite ? `Hi ${found.user.name}, pick a password to finish setting up your account (${found.user.email}).` : `For ${found.user.email}.`}</p>}
        </div>
      </header>
      {found?.user ? (
        <LoginForm
          action={acceptInvite}
          submit={invite ? "Create password" : "Save password"}
          hidden={{ token }}
          fields={[
            { name: "password", label: "Password (10+ characters)", type: "password", autoComplete: "new-password" },
            { name: "confirm", label: "Type it again", type: "password", autoComplete: "new-password" },
          ]}
        />
      ) : (
        <div className="notice err">
          This link has expired or was already used. Ask an admin for a new one, or <Link href="/login">sign in</Link>.
        </div>
      )}
    </>
  );
}
