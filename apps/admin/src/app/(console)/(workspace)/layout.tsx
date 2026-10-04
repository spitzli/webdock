import { sso } from "@payload-config";
import { requireOperator } from "../../../lib/server";
import { StudioShell } from "../../../components/studio-shell";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireOperator();
  return (
    <StudioShell
      user={{ name: user.name, role: "operator" }}
      ssoEnabled={Boolean(sso)}
    >
      {children}
    </StudioShell>
  );
}
