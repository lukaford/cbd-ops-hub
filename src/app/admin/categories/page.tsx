import { count, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { staffCategories, userCategories } from "@/db/schema";
import { ActionForm } from "@/components/ActionForm";
import { listCategories, type Category } from "@/lib/auth/accounts";
import { requireStaff } from "@/lib/auth/current";
import { ALL_PERMISSIONS, JOB_SCOPES, PERMISSION_AREAS, PERMISSIONS } from "@/lib/auth/permissions";
import { deleteCategoryAction, saveCategoryAction } from "../actions";

export const dynamic = "force-dynamic";

function CategoryFields({ category }: { category?: Category }) {
  const has = new Set(category?.permissions ?? []);
  return (
    <>
      <div className="formgrid">
        <label>
          <span className="label">Name</span>
          <input type="text" name="name" defaultValue={category?.name} required placeholder="e.g. Lead installer" />
        </label>
        <label>
          <span className="label">Description</span>
          <input type="text" name="description" defaultValue={category?.description} />
        </label>
      </div>
      <fieldset className="checks" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="label">Which jobs they see</legend>
        {JOB_SCOPES.map((s) => (
          <label key={s.key} title={s.help}>
            <input type="radio" name="jobScope" value={s.key} defaultChecked={(category?.jobScope ?? "all") === s.key} /> {s.label}
          </label>
        ))}
      </fieldset>
      <div className="permgrid">
        {PERMISSION_AREAS.map((area) => (
          <fieldset key={area} className="checks">
            <legend className="label">{area}</legend>
            {ALL_PERMISSIONS.filter((p) => PERMISSIONS[p].area === area).map((p) => (
              <label key={p}>
                <input type="checkbox" name="permissions" value={p} defaultChecked={has.has(p)} /> {PERMISSIONS[p].label}
              </label>
            ))}
          </fieldset>
        ))}
      </div>
    </>
  );
}

export default async function CategoriesPage() {
  await requireStaff("users.manage");
  const db = await getDb();
  const [categories, counts] = await Promise.all([
    listCategories(db),
    db
      .select({ id: staffCategories.id, n: count(userCategories.userId) })
      .from(staffCategories)
      .leftJoin(userCategories, eq(userCategories.categoryId, staffCategories.id))
      .groupBy(staffCategories.id),
  ]);
  const members = new Map(counts.map((c) => [c.id, c.n]));

  return (
    <>
      <p className="small">
        A category is a group of permissions. Put each employee in one or more categories; they can do anything any of their categories allows. If every category they&apos;re in
        sees only their own work, that&apos;s all they see. Changes apply straight away.
      </p>

      <section>
        <h2>Categories ({categories.length})</h2>
        <div className="tablewrap">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Sees</th>
                <th>Can</th>
                <th className="num">People</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <td>
                    <div className="cust">{c.name}</div>
                    {c.description && <div className="small">{c.description}</div>}
                    <details className="edit">
                      <summary>Edit</summary>
                      <ActionForm action={saveCategoryAction} submit="Save category">
                        <input type="hidden" name="id" value={c.id} />
                        <CategoryFields category={c} />
                      </ActionForm>
                      {(members.get(c.id) ?? 0) === 0 && (
                        <ActionForm action={deleteCategoryAction} submit="Delete category">
                          <input type="hidden" name="id" value={c.id} />
                        </ActionForm>
                      )}
                    </details>
                  </td>
                  <td>{c.jobScope === "own" ? <span className="pill warn">Own work</span> : <span className="pill ok">Every job</span>}</td>
                  <td className="small">{c.permissions.map((p) => PERMISSIONS[p as keyof typeof PERMISSIONS]?.label ?? p).join(" · ") || "Nothing yet"}</td>
                  <td className="num">{members.get(c.id) ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>New category</h2>
        <ActionForm action={saveCategoryAction} submit="Add category">
          <CategoryFields />
        </ActionForm>
      </section>
    </>
  );
}
