import { redirect } from "next/navigation";

export default function SalesByItemRedirect() {
  redirect("/admin/sales?tab=items");
}
