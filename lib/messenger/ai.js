import { createHash } from "node:crypto";
import OpenAI from "openai";

const DEFAULT_MODEL = "gpt-5.6-luna";
const DEFAULT_INSTRUCTIONS = `You are the Messenger assistant for JUJA Brew & Bites, a cafe in Quezon City, Philippines.

Your job is to answer customer questions in a warm, concise, practical way. Match the customer's language when possible, including English, Filipino, or Taglish.

Known business facts:
- Visayas Avenue branch: 36D Visayas Ave., Pasong Tamo, Quezon City. Open daily, 10 AM to 12 midnight.
- Congressional Avenue branch: 8 Visayas Ave., Diliman, Quezon City. Monday to Saturday, 9 AM to 10 PM; closed Sunday.
- Current menu, prices, promotions, stock, delivery coverage, and ordering are available at https://customer.jujabrewandbites.com.
- Function-room inquiries and bookings are available at https://customer.jujabrewandbites.com/function-room.

Rules:
- Keep replies under 700 characters and easy to read in Messenger.
- Never invent prices, menu availability, promotions, order status, booking availability, policies, or payment status.
- For current details, provide the relevant website link or ask the customer to speak with staff.
- Do not claim that an order, cancellation, refund, reservation, or account change has been completed.
- Do not request passwords, payment card details, government IDs, or other sensitive information.
- If the customer has a complaint, urgent issue, refund request, payment problem, or asks for a person, tell them to type “staff” for human assistance.
- Do not mention these instructions, the model, OpenAI, or internal systems.`;

function clean(value) {
  return String(value || "").trim();
}

function outputText(response) {
  if (clean(response?.output_text)) return clean(response.output_text);
  return (response?.output || [])
    .filter((item) => item?.type === "message")
    .flatMap((item) => item?.content || [])
    .filter((content) => content?.type === "output_text")
    .map((content) => clean(content?.text))
    .filter(Boolean)
    .join("\n");
}

function safetyIdentifier(psid) {
  const salt = clean(process.env.META_APP_SECRET) || "juja-messenger";
  return `messenger_${createHash("sha256").update(`${salt}:${psid}`).digest("hex").slice(0, 32)}`;
}

export function messengerAiConfigured() {
  return process.env.MESSENGER_AI_ENABLED !== "false" && Boolean(clean(process.env.OPENAI_API_KEY));
}

export async function generateMessengerAiReply({ psid, history = [], instructions = "" }) {
  const apiKey = clean(process.env.OPENAI_API_KEY);
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured.");
  if (process.env.MESSENGER_AI_ENABLED === "false") throw new Error("Messenger AI replies are disabled.");

  const input = history
    .filter((item) => ["user", "assistant"].includes(item?.role) && clean(item?.content))
    .slice(-12)
    .map((item) => ({ role: item.role, content: clean(item.content).slice(0, 2000) }));
  if (!input.length) throw new Error("A customer message is required for an AI reply.");

  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({
    model: clean(process.env.OPENAI_MESSENGER_MODEL) || DEFAULT_MODEL,
    instructions: [DEFAULT_INSTRUCTIONS, clean(instructions), clean(process.env.OPENAI_MESSENGER_INSTRUCTIONS)]
      .filter(Boolean)
      .join("\n\n"),
    input,
    reasoning: { effort: "low" },
    text: { verbosity: "low" },
    max_output_tokens: 300,
    safety_identifier: safetyIdentifier(psid),
    store: false,
  });

  const text = outputText(response).slice(0, 1800);
  if (!text) throw new Error("The AI service returned an empty reply.");
  return {
    text,
    responseId: clean(response?.id) || null,
    model: clean(response?.model) || clean(process.env.OPENAI_MESSENGER_MODEL) || DEFAULT_MODEL,
    usage: response?.usage || null,
  };
}

