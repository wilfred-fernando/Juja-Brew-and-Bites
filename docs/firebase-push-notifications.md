# Firebase Push Notifications Setup

This project uses native Firebase Cloud Messaging for the customer APK order status notifications.

## 1. Create Firebase Android App

1. Open Firebase Console.
2. Create or open the JUJA Firebase project.
3. Add Android app.
4. Use this Android package name:

```txt
com.jujabrewandbites.customer
```

5. Download `google-services.json`.
6. Save it locally as:

```txt
android/app/google-services.json
```

Do not commit the real `google-services.json`. It is ignored by git.

## 2. Create FCM Server Credentials

Preferred Vercel setup:

1. Firebase Console
2. Project settings
3. Service accounts
4. Generate new private key
5. Copy the whole JSON into Vercel as:

```txt
FCM_SERVICE_ACCOUNT_JSON={...full service account json...}
```

Alternative Vercel setup:

```txt
FCM_PROJECT_ID=your-firebase-project-id
FCM_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FCM_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
```

Required existing server env:

```txt
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## 3. Verify Local Setup

Run:

```bash
npm run verify:push-config
```

The verifier checks:

- `android/app/google-services.json` exists
- Firebase package name is `com.jujabrewandbites.customer`
- FCM service account env vars exist
- Supabase server/client env vars exist

## 4. Build Customer APK

After adding `google-services.json`:

```bash
$env:CAPACITOR_APP_TARGET="customer"
npm run build
npm run android:sync
```

Then build the signed customer release APK using the existing Android release process.

## Notes

- Closed/background notifications require the native customer APK, not only the PWA.
- Vercel env changes require a production redeploy.
- The customer must open the updated APK once and allow notification permission so the app can register the device token.
