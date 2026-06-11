import { redirect } from "next/navigation";

export default function ShiftsRedirect() {
  redirect("/admin/sales?tab=shifts");
}
