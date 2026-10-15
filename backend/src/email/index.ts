import type { TransactionalEmailSender } from "./sender.js";
import { env } from "../config/env.js";
import { NoopSender } from "./noopSender.js";
import { ResendSender } from "./resendSender.js";

export function createEmailSender(): TransactionalEmailSender {
  const apiKey = env.resendApiKey;
  if (apiKey && apiKey.trim().length > 0) {
    return new ResendSender(apiKey, env.emailFrom);
  }
  return new NoopSender();
}

export type { TransactionalEmailSender } from "./sender.js";