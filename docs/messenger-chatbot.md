# Messenger chatbot setup

The customer-facing AI assistant is named **JujaBot**.

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
# For multiple Pages, use this instead of META_PAGE_ACCESS_TOKEN:
META_PAGE_ACCESS_TOKENS={"FACEBOOK_PAGE_ID_1":"PAGE_TOKEN_1","FACEBOOK_PAGE_ID_2":"PAGE_TOKEN_2"}
META_GRAPH_API_VERSION=copy-the-version-selected-in-your-meta-app
MESSENGER_ORDER_URL=https://customer.jujabrewandbites.com
OPENAI_API_KEY=copy-from-your-openai-project
OPENAI_MESSENGER_MODEL=gpt-5.6-luna
MESSENGER_AI_ENABLED=true
MESSENGER_ROUTING_MODE=agent
```

`META_MESSENGER_VERIFY_TOKEN` is a secret value you create yourself. Enter the same value in Meta when configuring the callback URL. Keep the App Secret and Page access token out of source control and browser-exposed variables.

For one Facebook Page, `META_PAGE_ACCESS_TOKEN` is enough. For multiple Pages, set `META_PAGE_ACCESS_TOKENS` to a compact JSON object mapping each Page ID to its Page token. The webhook reads the recipient Page ID on every event and selects the matching token. Never expose this JSON to the browser or commit it to source control.

`OPENAI_MESSENGER_MODEL` is configurable. The default uses `gpt-5.6-luna` for lower-cost, high-volume replies. Keep `OPENAI_API_KEY` server-only. `MESSENGER_ROUTING_MODE=agent` is the default and sends every normal customer message directly to the AI agent. Set it to `flows` only when you intentionally want trigger-based conversation flows. Set `MESSENGER_AI_ENABLED=false` to disable AI replies.

## Meta configuration

1. Create or open a Meta app connected to the JUJA Brew & Bites Facebook Page.
2. Add Messenger and configure the webhook callback URL shown above.
3. Enter the same verify token stored in `META_MESSENGER_VERIFY_TOKEN`.
4. Subscribe the Page webhook to `messages` and `messaging_postbacks`.
5. Generate a Page access token and store it as `META_PAGE_ACCESS_TOKEN`.
6. Request the permissions Meta requires for the Page and move the app to Live mode when review is complete.
7. Send the Page a test message such as `menu`, `store hours`, or `talk to staff`.

Meta must reach the callback over public HTTPS with a valid certificate. The POST handler validates `X-Hub-Signature-256` against the exact raw body before processing an event.

## AI-first conversation routing

- Open `/admin/messenger` as an administrator to monitor contacts, resume paused automation, and optionally manage flows.
- In the default `agent` mode, every normal text message and postback is answered by AI using recent conversation history.
- JujaBot loads customer-visible names, descriptions, base prices, variant prices, and availability directly from `menu_items` before each AI answer.
- JujaBot loads active package details from `function_room_packages` and derives the next 60 days of fixed-slot availability from `function_room_bookings`. Booking customer details and booking IDs are never sent to the AI.
- JujaBot fetches the Messenger customer profile once when needed, stores the provided first name in `messenger_contacts`, and includes that verified first name in AI replies. It does not guess names.
- Administrators can edit AI instructions, verified business reference notes, live-menu grounding, and function-room grounding from `/admin/messenger`.
- Menu questions include `https://www.jujabrewandbites.com/menu`, while function-room questions include `https://www.jujabrewandbites.com/function-room`.
- An exact `staff`, `human`, `agent`, `representative`, `person`, `tao`, or `handoff` message pauses automation and confirms that staff will take over.
- Keyword and postback triggers are used only when `MESSENGER_ROUTING_MODE=flows`.
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

The router does not create orders or reservations entirely inside Messenger. Function-room availability is a live snapshot and may change before checkout, so AI replies link customers to the public booking page to reserve. Payments, refunds, and account-specific actions remain with the website or staff.
