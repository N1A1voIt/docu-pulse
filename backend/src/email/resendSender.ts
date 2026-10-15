import type { TransactionalEmailSender, SendEmailInput, InviteEmailInput } from "./sender.js";

export class ResendSender implements TransactionalEmailSender {
  constructor(private apiKey: string) {}

  async send(input: SendEmailInput): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    if (!res.ok) throw new Error(`Resend failed: ${res.status}`);
  }

  async sendInviteEmail(input: InviteEmailInput): Promise<void> {
    const acceptUrl = input.acceptUrl;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: input.to,
        subject: `You've been invited to ${input.orgName}`,
        html: `<p>You've been invited as ${input.role}.</p><p><a href="${acceptUrl}">Accept invitation</a></p>`,
        text: `Accept: ${acceptUrl}`,
      }),
    });
    if (!res.ok) throw new Error(`Resend failed: ${res.status}`);
  }
}