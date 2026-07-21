const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function normalizeLoyaltyPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("63") && digits.length === 12) digits = `0${digits.slice(2)}`;
  if (digits.length === 10 && digits.startsWith("9")) digits = `0${digits}`;
  return digits;
}

export function normalizeLoyaltyBirthday(value) {
  const text = String(value || "").trim();
  if (!text) return "";

  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) {
    const monthIndex = Number(iso[2]) - 1;
    if (monthIndex >= 0 && monthIndex < MONTH_NAMES.length) {
      return `${iso[1]}-${MONTH_NAMES[monthIndex]}-${iso[3]}`;
    }
  }

  return text;
}

export function loyaltyDuplicatePayload(member) {
  if (!member?.id) return null;
  return {
    id: member.id,
    customer_name: member.customer_name || "",
    customer_code: member.customer_code || member["Customer ID"] || "",
    Phone: member.Phone || member.phone || "",
    Note: member.Note || "",
    user_id: member.user_id || null,
  };
}

export async function findLoyaltyMemberByPhoneBirthday(supabase, phone, birthday) {
  const normalizedPhone = normalizeLoyaltyPhone(phone);
  const normalizedBirthday = normalizeLoyaltyBirthday(birthday);
  if (!normalizedPhone || !normalizedBirthday) return null;

  const { data, error } = await supabase
    .from("loyalty_members")
    .select('id,user_id,customer_name,customer_code,"Customer ID","Phone","Note"')
    .eq("Note", normalizedBirthday)
    .limit(100);

  if (error) throw error;

  return (data || []).find((member) => {
    const savedPhone = normalizeLoyaltyPhone(member.Phone || member.phone);
    return savedPhone && savedPhone === normalizedPhone;
  }) || null;
}
