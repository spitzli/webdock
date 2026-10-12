import { getRequestI18n } from "@webdock/i18n/next";
import { getStudioSession } from "@/lib/studio-client";
import { AreaNavigation } from "@/components/area-navigation";

export async function TenantDatabaseNavigation({
  customerID,
}: {
  customerID: string;
}) {
  const { t } = await getRequestI18n();
  const session = await getStudioSession();
  const base = `/tenants/${customerID}`;
  return (
    <AreaNavigation
      label={t("Database areas")}
      links={[
        ...(!session?.preview
          ? [{ href: base + "/databases", label: t("Browse data") }]
          : []),
        { href: base + "/managed-databases", label: t("Managed PostgreSQL") },
      ]}
    />
  );
}
