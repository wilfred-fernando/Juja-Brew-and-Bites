import { redirect } from "next/navigation";

export default function SalesByPaymentRedirect() {
  redirect("/admin/sales?tab=payments");
}
