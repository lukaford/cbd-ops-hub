import { LoginForm } from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <>
      <header className="top">
        <div>
          <div className="label">Closets by Design · Production</div>
          <h1>Sign in</h1>
          <p>Enter the shop password to see the board.</p>
        </div>
      </header>
      <LoginForm next={next ?? "/"} />
    </>
  );
}
