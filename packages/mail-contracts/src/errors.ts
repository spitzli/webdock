/** Shared public error identity for Mail services and provider adapters. */
export class MailError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = code;
  }
}
