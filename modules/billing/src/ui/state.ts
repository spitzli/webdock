/** React state boundaries include canonical tenant/environment/resource context. */
export function billingFormKey(
  ...parts: readonly (string | number | boolean | undefined)[]
): string {
  return JSON.stringify(parts);
}
