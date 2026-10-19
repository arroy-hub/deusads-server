import { notFound } from "next/navigation";
import { getAdmin } from "../../../lib/admin";
import { CardsProvider } from "./cards";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }) {
  // Anyone who is not an admin gets the same page as a URL that does not exist.
  if (!(await getAdmin())) notFound();
  return <CardsProvider>{children}</CardsProvider>;
}
