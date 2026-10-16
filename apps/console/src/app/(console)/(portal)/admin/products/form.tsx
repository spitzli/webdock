"use client";
import {
  archiveVersionAction,
  availabilityAction,
  createVersionAction,
  publishVersionAction,
  privateOfferAction,
} from "./actions";
import { billingFormKey } from "@webdock/module-billing/ui/state";
import { billingFamilies } from "@/lib/billing-families";
import {
  ProductDraft as ModuleProductDraft,
  type PublicProductDraftProps,
} from "@webdock/module-billing/ui/catalog-forms";
export function ProductDraft(props: PublicProductDraftProps) {
  return (
    <ModuleProductDraft
      key={billingFormKey("catalog-draft")}
      {...props}
      actionPorts={{ createVersionAction }}
      billingFamilies={billingFamilies}
    />
  );
}
import {
  PublishVersion as ModulePublishVersion,
  type PublicPublishVersionProps,
} from "@webdock/module-billing/ui/catalog-forms";
export function PublishVersion(props: PublicPublishVersionProps) {
  return (
    <ModulePublishVersion
      key={billingFormKey(props.environment, props.versionID)}
      {...props}
      actionPorts={{ publishVersionAction }}
    />
  );
}
import {
  PrivateOfferForm as ModulePrivateOfferForm,
  type PublicPrivateOfferFormProps,
} from "@webdock/module-billing/ui/catalog-forms";
export function PrivateOfferForm(props: PublicPrivateOfferFormProps) {
  return (
    <ModulePrivateOfferForm
      key={billingFormKey(
        props.environment,
        props.versionID,
        props.customers.map((customer) => customer.id).join(","),
      )}
      {...props}
      actionPorts={{ privateOfferAction }}
    />
  );
}
import {
  AvailabilityForm as ModuleAvailabilityForm,
  type PublicAvailabilityFormProps,
} from "@webdock/module-billing/ui/catalog-forms";
export function AvailabilityForm(props: PublicAvailabilityFormProps) {
  return (
    <ModuleAvailabilityForm
      key={billingFormKey(props.productID, props.visibility, props.ready)}
      {...props}
      actionPorts={{ availabilityAction }}
    />
  );
}
import {
  ArchiveVersion as ModuleArchiveVersion,
  type PublicArchiveVersionProps,
} from "@webdock/module-billing/ui/catalog-forms";
export function ArchiveVersion(props: PublicArchiveVersionProps) {
  return (
    <ModuleArchiveVersion
      key={billingFormKey(props.environment, props.versionID, props.retry)}
      {...props}
      actionPorts={{ archiveVersionAction }}
    />
  );
}
