import { ActionForm } from "@/components/ActionForm";
import { openClientLink } from "../../actions";

export default async function ClientLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <>
      <header className="top">
        <div>
          <div className="label">Closets by Design</div>
          <h1>Welcome</h1>
          <p>Tap below to open your project. You&apos;ll stay signed in on this device.</p>
        </div>
      </header>
      <ActionForm action={openClientLink} submit="Open my project">
        <input type="hidden" name="token" value={token} />
      </ActionForm>
    </>
  );
}
