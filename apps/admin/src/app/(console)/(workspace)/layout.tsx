import { requireRegistryOperator } from "../../../lib/registry-page";
import { StudioShell } from "../../../components/studio-shell";
export const dynamic = "force-dynamic";
export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = await requireRegistryOperator();
  return (
    <StudioShell
      user={{ name: user.name, role: "operator" }}
      ssoEnabled
    >
      {children}
    </StudioShell>
  );
}
