import { notFound } from "next/navigation";
import { getAdmin } from "../../../../lib/admin";
import RoleSelect from "./role-select";

export const dynamic = "force-dynamic";
export const metadata = { title: "People" };

export default async function UsersPage() {
  const admin = await getAdmin();
  if (!admin) notFound();

  const { data: accounts } = await admin.service
    .from("accounts")
    .select("id, email, company, role, created_at")
    .order("created_at", { ascending: true });

  return (
    <>
      <div className="main-head">
        <h1>People</h1>
      </div>
      <p className="lede">
        Everyone who signs up is a developer. Advertiser and admin are given here. You cannot change
        your own role.
      </p>

      <div className="panel" style={{ padding: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Company</th>
              <th>Joined</th>
              <th>Role</th>
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
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
