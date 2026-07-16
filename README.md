This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Email Notifications

Function booking and loyalty account link notifications are sent from server API routes with SMTP. Add these server-only environment variables in Vercel Project Settings > Environment Variables:

```txt
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=jujabrewandbites@gmail.com
SMTP_PASS=your-gmail-app-password
SMTP_FROM=JUJA Brew & Bites <jujabrewandbites@gmail.com>
LOYALTY_NOTIFY_EMAIL=jujabrewandbites@gmail.com
BOOKING_NOTIFY_EMAIL=jujabrewandbites@gmail.com
ADMIN_NOTIFY_EMAIL=jujabrewandbites@gmail.com
```

For Gmail, `SMTP_PASS` must be a Google App Password, not the normal Gmail account password. Keep these variables out of `NEXT_PUBLIC_` names so they remain server-only.

### Supabase Auth Email SMTP

Signup email confirmation and customer reset password emails are sent by Supabase Auth, not by the app API routes. Use the same SMTP mailbox details in Supabase:

```txt
Supabase Dashboard
Authentication
Emails
SMTP Settings
Enable Custom SMTP
```

Use the same values:

```txt
Host: smtp.gmail.com
Port: 587
Username: jujabrewandbites@gmail.com
Password: your-gmail-app-password
Sender email: jujabrewandbites@gmail.com
Sender name: JUJA Brew & Bites
```

Set the auth redirect URLs in Supabase Authentication URL settings:

```txt
Site URL: https://customer.jujabrewandbites.com
Redirect URLs:
https://customer.jujabrewandbites.com/auth/callback
https://customer.jujabrewandbites.com/reset-password
```

Use Supabase email templates for confirmation and recovery links. For reset password, the button should point to:

```html
https://customer.jujabrewandbites.com/reset-password?token_hash={{ .TokenHash }}&type=recovery
```

For email confirmation, the button should point to:

```html
https://customer.jujabrewandbites.com/auth/callback?token_hash={{ .TokenHash }}&type=email
```

## Customer APK Push Notifications

Native closed/background order status notifications use Firebase Cloud Messaging. See:

```txt
docs/firebase-push-notifications.md
```

After adding Firebase credentials locally and in Vercel, verify with:

```bash
npm run verify:push-config
```
