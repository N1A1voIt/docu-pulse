import type { TransactionalEmailSender } from "./sender.js";
import { NoopSender } from "./noopSender.js";
import { ResendSender } from "./resendSender.js";

export function createEmailSender(): TransactionalEmailSender {
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey && apiKey.trim().length > 0) {
    return new ResendSender(apiKey);
  }
  return new NoopSender();
}

export type { TransactionalEmailSender } from "./sender.js";