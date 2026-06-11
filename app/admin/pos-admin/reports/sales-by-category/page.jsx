import { redirect } from "next/navigation";

export default function SalesByCategoryRedirect() {
  redirect("/admin/sales?tab=categories");
}
