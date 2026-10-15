import type { TransactionalEmailSender, SendEmailInput, InviteEmailInput } from "./sender.js";
import { env } from "../config/env.js";

export class ResendSender implements TransactionalEmailSender {
  constructor(private apiKey: string, private emailFrom?: string) {}

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  private get from(): string | undefined {
    return this.emailFrom ?? env.emailFrom;
  }

  async send(input: SendEmailInput): Promise<void> {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
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
    const html = `<p>You've been invited to ${this.escapeHtml(input.orgName)} as ${this.escapeHtml(input.role)}.</p><p><a href="${this.escapeHtml(acceptUrl)}">Accept invitation</a></p>`;
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: input.to,
        subject: `You've been invited to ${input.orgName}`,
        html,
        text: `Accept: ${acceptUrl}`,
      }),
    });
    if (!res.ok) throw new Error(`Resend failed: ${res.status}`);
  }
}