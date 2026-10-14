import { ImportForm } from "./ImportForm";

export default function ImportPage() {
  return (
    <>
      <header className="top">
        <div>
          <div className="label">Closets by Design Manager</div>
          <h1>Paste Special Orders</h1>
          <p>Copy the table on the Special Orders tab and paste it below. The board updates from it straight away.</p>
        </div>
      </header>
      <ImportForm />
    </>
  );
}
