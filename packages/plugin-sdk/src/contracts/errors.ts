export type PluginErrorCode =
  | "invalid_input"
  | "not_supported"
  | "permission_denied"
  | "capability_unavailable"
  | "conflict"
  | "unavailable"
  | "deadline_exceeded"
  | "not_found";
export class PluginError extends Error {
  constructor(
    readonly code: PluginErrorCode,
    message: string,
    readonly retryable = false,
    readonly requestID?: string,
  ) {
    super(message);
    this.name = "PluginError";
  }
  toJSON() {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      ...(this.requestID ? { requestID: this.requestID } : {}),
    };
  }
}
