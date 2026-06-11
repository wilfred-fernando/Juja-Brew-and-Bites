import { redirect } from "next/navigation";

export default function ReceiptsRedirect() {
  redirect("/admin/sales?tab=receipts");
}
