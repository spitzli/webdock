type RouteContext = { params: Promise<{ slug?: string[] }> };

export function cmsBridgeEnabled() {
  return Boolean(
    process.env.CMS_BRIDGE_SECRET &&
    process.env.CMS_INSTANCE_ID &&
    process.env.CMS_PROJECT_ID,
  );
}

/** The native editor's Local API keeps CAS checks; raw REST cannot bypass them. */
export function guardNativeCMSMutation<C extends RouteContext>(
  handler: (request: Request, context: C) => Promise<Response>,
) {
  return async (request: Request, context: C): Promise<Response> => {
    if (cmsBridgeEnabled() && (await context.params).slug?.[0] !== "users")
      return Response.json(
        { error: "Use the CMS editor to change content." },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    return handler(request, context);
  };
}
