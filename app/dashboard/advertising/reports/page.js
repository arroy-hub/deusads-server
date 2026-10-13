import { redirect } from "next/navigation";

// The Reports tab is gone: the numbers are on Overview and in each campaign. Old links land on Overview.
export default function ReportsMoved() {
  redirect("/dashboard");
}
