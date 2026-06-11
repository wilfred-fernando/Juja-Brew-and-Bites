import { redirect } from "next/navigation";

export default function DiscountsRedirect() {
  redirect("/admin/sales?tab=discounts");
}
