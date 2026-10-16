"use client";
import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
export function AccountControls({ preview = false }: { preview?: boolean }) {
  return (
    <div className="console-clerk-account">
      {!preview && (
        <OrganizationSwitcher
          hidePersonal={false}
          afterSelectOrganizationUrl="/tenants"
          afterSelectPersonalUrl="/tenants"
        />
      )}
      <UserButton userProfileMode="navigation" userProfileUrl="/account" />
    </div>
  );
}
