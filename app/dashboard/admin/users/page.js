import { notFound } from "next/navigation";
import { getAdmin } from "../../../../lib/admin";
import { isSchemaOutdated } from "../../../../lib/api";
import RoleSelect from "./role-select";
import SuspendButton from "./suspend-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "People" };

export default async function UsersPage() {
  const admin = await getAdmin();
  if (!admin) notFound();

  // suspended_at comes with migration 0015.
  const list = (columns) => admin.service.from("accounts").select(columns).order("created_at", { ascending: true });
  let { data: accounts, error } = await list("id, email, company, role, created_at, suspended_at");
  if (isSchemaOutdated(error)) ({ data: accounts } = await list("id, email, company, role, created_at"));

  return (
    <>
      <div className="main-head">
        <h1>People</h1>
      </div>
      <p className="lede">
        People choose developer or advertiser when they sign up. Admin is given here. You cannot change
        your own role. Suspending an account signs it out of the dashboard and stops its ads.
      </p>

      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Company</th>
              <th>Joined</th>
              <th>Role</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(accounts ?? []).map((account) => (
              <tr key={account.id}>
                <td>{account.email}</td>
                <td>{account.company || "—"}</td>
                <td>{String(account.created_at).slice(0, 10)}</td>
                <td>
                  <RoleSelect accountId={account.id} role={account.role} isSelf={account.id === admin.user.id} />
                </td>
                <td>
                  <SuspendButton
                    accountId={account.id}
                    suspended={Boolean(account.suspended_at)}
                    disabled={account.role === "admin"}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
