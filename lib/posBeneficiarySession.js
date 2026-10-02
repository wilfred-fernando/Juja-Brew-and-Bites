// Recheck the authenticated identity before reading or saving POS beneficiaries.
// The database remains the authority for cashier/admin access.
export async function ensurePosBeneficiarySession(supabase, expectedUserId) {
  const check = async (session) => {
    if (!session?.user?.id || (expectedUserId && session.user.id !== expectedUserId)) {
      throw new Error("Your POS login has changed or expired. Sign in again with your cashier account; your ticket has not been cleared.");
    }
    const { data, error } = await supabase.rpc("pos_discount_staff_allowed");
    if (error) throw new Error(error.message);
    return data === true;
  };
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error(error.message);
  if (await check(data?.session)) return;
  // Renew the token once before reporting an authorization failure.
  const refreshed = await supabase.auth.refreshSession();
  if (refreshed.error) throw new Error("Your POS session could not be renewed. Sign in again with your cashier account; your ticket has not been cleared.");
  if (await check(refreshed.data?.session)) return;
  throw new Error("This signed-in account does not have cashier or admin access. Sign in with your cashier account to load or add beneficiaries; your ticket has not been cleared.");
}
