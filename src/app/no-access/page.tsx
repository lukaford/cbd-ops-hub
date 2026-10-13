import Link from "next/link";

export default function NoAccessPage() {
  return (
    <>
      <header className="top">
        <div>
          <h1>No access</h1>
          <p>Your account doesn&apos;t include this page. Ask an admin to add the department that needs it.</p>
        </div>
      </header>
      <p>
        <Link href="/">Back to the jobs board</Link>
      </p>
    </>
  );
}
