/** Public errors remain importable without a database or service dependency. */
export class RegistryError extends Error {
  readonly isPublic = true;
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
