import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { headers } from "next/headers";
import { escapeEmailHtml, notificationRecipient, sendNotificationEmail } from "@/lib/email/notifications";

function supabaseConfig() {
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
}

async function getRequestContext() {
  const { url, anonKey } = supabaseConfig();
  if (!url || !anonKey) {
    return { user: null, client: null, error: "Supabase URL and anon key are required." };
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    url,
    anonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );

  const { data, error } = await supabase.auth.getUser();
  if (!error && data?.user) return { user: data.user, client: supabase, error: "" };

  const headerStore = await headers();
  const token = String(headerStore.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { user: null, client: null, error: "" };

  const tokenClient = createSupabaseClient(
    url,
    anonKey,
    {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    }
  );
  const { data: tokenData, error: tokenError } = await tokenClient.auth.getUser(token);
  if (tokenError || !tokenData?.user) return { user: null, client: null, error: "" };
  return { user: tokenData.user, client: tokenClient, error: "" };
}

async function sendLinkRequestEmail({ requestId, customerName, birthday, userEmail, matchedMemberId }) {
  const recipient = notificationRecipient(
    process.env.LOYALTY_NOTIFY_EMAIL ||
    process.env.ADMIN_NOTIFY_EMAIL
  );

  return sendNotificationEmail({
    to: recipient,
    subject: `New Loyalty Account Link Request - ${customerName || userEmail || "Customer"}`,
    html: `
      <h3>New Loyalty Account Link Request</h3>
      <p><b>Request ID:</b> ${escapeEmailHtml(requestId || "-")}</p>
      <p><b>Customer Name:</b> ${escapeEmailHtml(customerName || "-")}</p>
      <p><b>Birthday:</b> ${escapeEmailHtml(birthday || "-")}</p>
      <p><b>Customer Email:</b> ${escapeEmailHtml(userEmail || "-")}</p>
      <p><b>Matched Member ID:</b> ${escapeEmailHtml(matchedMemberId || "No automatic match")}</p>
      <p>Please review this request in the Admin Loyalty page.</p>
    `,
  });
}

export async function POST(req) {
  try {
    const { user, client: userSupabase, error: configError } = await getRequestContext();
    if (configError) {
      return Response.json({ error: configError }, { status: 500 });
    }
    if (!user?.id) {
      return Response.json({ error: "Customer login is required." }, { status: 401 });
    }

    const { customerName, birthday, matchedMemberId } = await req.json();
    if (!String(customerName || "").trim() || !String(birthday || "").trim()) {
      return Response.json({ error: "Full name and birthday are required." }, { status: 400 });
    }

    const { url, serviceRoleKey } = supabaseConfig();
    const supabaseAdmin = serviceRoleKey
      ? createSupabaseClient(url, serviceRoleKey)
      : userSupabase;

    if (!supabaseAdmin) {
      return Response.json({ error: "Supabase client is required." }, { status: 500 });
    }

    const { data, error } = await supabaseAdmin
      .from("loyalty_link_requests")
      .insert({
        user_id: user.id,
        input_name: String(customerName).trim(),
        input_birthday: String(birthday).trim(),
        matched_member_id: matchedMemberId ? String(matchedMemberId) : null,
        status: "pending",
      })
      .select()
      .single();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    const email = await sendLinkRequestEmail({
      requestId: data?.id,
      customerName,
      birthday,
      userEmail: user.email,
      matchedMemberId,
    });

    return Response.json({
      success: true,
      request: data,
      emailSent: email.sent,
      emailError: email.publicError || "",
    });
  } catch (err) {
    return Response.json({ error: err?.message || "Unable to send link request." }, { status: 500 });
  }
}
