import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/db";
import { loadEditableForms, loadLists } from "@/lib/forms/native/editing";
import { restoreForm } from "../actions";
import FormEditor from "./FormEditor";
import ConfirmButton from "../ConfirmButton";

export const dynamic = "force-dynamic";

export default async function EditFormPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { key } = await params;
  const sp = await searchParams;
  const db = await getDb();
  const [forms, lists] = await Promise.all([loadEditableForms(db), loadLists(db)]);
  const form = forms.find((f) => f.def.key === key);
  if (!form) notFound();

  return (
    <>
      <div className="label">
        <Link href="/paperwork">Paperwork</Link> · <Link href="/paperwork/forms">Forms</Link> · {form.def.name}
      </div>
      {sp.restored && <p className="msg">Put back as built into the app.</p>}
      <FormEditor initial={form.def} lists={lists.map((l) => ({ key: l.key, name: l.name, options: l.options }))} />
      {form.changed && (
        <form action={restoreForm} className="controls">
          <input type="hidden" name="form" value={key} />
          <ConfirmButton message="Put this form back as built into the app? Every edit made to it is lost.">Undo all edits: put this form back as built into the app</ConfirmButton>
        </form>
      )}
    </>
  );
}
