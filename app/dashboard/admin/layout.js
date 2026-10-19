import { notFound } from "next/navigation";
import { getAdmin } from "../../../lib/admin";
import { CardsProvider } from "./cards";
import "./cabinet.css";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export default async function AdminLayout({ children }) {
  // Anyone who is not an admin gets the same page as a URL that does not exist.
  if (!(await getAdmin())) notFound();
  return <CardsProvider><div className="cb-page">{children}</div></CardsProvider>;
}
