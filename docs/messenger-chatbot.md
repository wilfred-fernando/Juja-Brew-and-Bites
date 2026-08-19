# Messenger chatbot setup

The Messenger webhook is available at:

```txt
https://YOUR_APP_DOMAIN/api/messenger/webhook
```

## Environment variables

Add these server-only variables locally and in Vercel. Do not prefix them with `NEXT_PUBLIC_`.

```txt
META_MESSENGER_VERIFY_TOKEN=choose-a-long-random-value
META_APP_SECRET=copy-from-your-meta-app-settings
META_PAGE_ACCESS_TOKEN=copy-from-messenger-api-settings
META_GRAPH_API_VERSION=copy-the-version-selected-in-your-meta-app
MESSENGER_ORDER_URL=https://customer.jujabrewandbites.com
OPENAI_API_KEY=copy-from-your-openai-project
OPENAI_MESSENGER_MODEL=gpt-5.6-luna
MESSENGER_AI_ENABLED=true
```

`META_MESSENGER_VERIFY_TOKEN` is a secret value you create yourself. Enter the same value in Meta when configuring the callback URL. Keep the App Secret and Page access token out of source control and browser-exposed variables.

`OPENAI_MESSENGER_MODEL` is configurable. The default uses `gpt-5.6-luna` for lower-cost, high-volume replies. Keep `OPENAI_API_KEY` server-only. Set `MESSENGER_AI_ENABLED=false` to disable AI without unpublishing the flow.

## Meta configuration

1. Create or open a Meta app connected to the JUJA Brew & Bites Facebook Page.
2. Add Messenger and configure the webhook callback URL shown above.
3. Enter the same verify token stored in `META_MESSENGER_VERIFY_TOKEN`.
4. Subscribe the Page webhook to `messages` and `messaging_postbacks`.
5. Generate a Page access token and store it as `META_PAGE_ACCESS_TOKEN`.
6. Request the permissions Meta requires for the Page and move the app to Live mode when review is complete.
7. Send the Page a test message such as `menu`, `store hours`, or `talk to staff`.

Meta must reach the callback over public HTTPS with a valid certificate. The POST handler validates `X-Hub-Signature-256` against the exact raw body before processing an event.

## Conversation routing

- Open `/admin/messenger` as an administrator to edit, publish, or unpublish flows.
- Keyword and postback triggers select a published flow by priority.
- Flow nodes support messages, questions, conditions, actions, handoff, flow jumps, and end nodes.
- Question answers can be stored as customer fields and used by conditional edges.
- Inbound and outbound events are recorded, and duplicate webhook events are ignored.
- Human handoff pauses automation until an administrator selects **Resume bot**.
- Unmatched text is answered by the AI assistant using recent conversation history and business guardrails.
- The AI never receives the raw Messenger customer ID; the request uses a one-way privacy-preserving safety identifier.
- If the AI service is disabled or unavailable, the customer receives the configured fallback message.
- If the routing migration is unavailable, the original safe reply rules remain as a fallback.

The migration seeds Welcome, Order online, Store details, Human handoff, and Fallback flows. Verify the installed routing schema with:

```bash
npm run verify:messenger-routing
```

The router does not create orders entirely inside Messenger. AI replies direct customers to the ordering site or staff for live prices, availability, payments, refunds, and account-specific actions.
