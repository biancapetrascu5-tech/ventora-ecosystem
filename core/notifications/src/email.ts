export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export interface EmailChannel {
  send(params: SendEmailParams): Promise<void>;
}
