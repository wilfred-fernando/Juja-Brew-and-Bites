import { redirect } from "next/navigation";

export default function SalesSummaryRedirect() {
  redirect("/admin/sales?tab=summary");
}
