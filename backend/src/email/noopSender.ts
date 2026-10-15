import type { TransactionalEmailSender, SendEmailInput, InviteEmailInput } from "./sender.js";

export class NoopSender implements TransactionalEmailSender {
  async send(input: SendEmailInput): Promise<void> {
    console.log("[noop-email]", JSON.stringify(input));
  }

  async sendInviteEmail(input: InviteEmailInput): Promise<void> {
    const acceptUrl = input.acceptUrl;
    console.log(`[noop-email] invite ${input.role} to ${input.to} for ${input.orgName}: ${acceptUrl}`);
    console.log(acceptUrl);
  }
}