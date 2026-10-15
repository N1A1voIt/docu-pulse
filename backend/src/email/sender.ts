export interface SendEmailInput {
  to: string;
  subject: string;
  html?: string;
  text?: string;
}

export interface InviteEmailInput {
  to: string;
  orgName: string;
  inviterName?: string | null;
  role: string;
  acceptUrl: string;
}

export interface TransactionalEmailSender {
  send(input: SendEmailInput): Promise<void>;
  sendInviteEmail(input: InviteEmailInput): Promise<void>;
}