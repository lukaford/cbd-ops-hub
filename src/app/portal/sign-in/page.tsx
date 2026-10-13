import { ActionForm } from "@/components/ActionForm";
import { emailEnabled } from "@/lib/email";
import { emailMeALink } from "../actions";

export default function ClientSignInPage() {
  return (
    <>
      <header className="top">
        <div>
          <div className="label">Closets by Design</div>
          <h1>Your project</h1>
          <p>
            {emailEnabled()
              ? "Enter the email you gave your designer and we'll send you a sign-in link. No password needed."
              : "Open the sign-in link your designer sent you. Need a new one? Ask your designer."}
          </p>
        </div>
      </header>
      {emailEnabled() && (
        <ActionForm action={emailMeALink} submit="Email me a link">
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" autoComplete="email" required autoFocus />
        </ActionForm>
      )}
    </>
  );
}
