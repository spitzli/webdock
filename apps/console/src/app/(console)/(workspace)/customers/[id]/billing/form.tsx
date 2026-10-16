"use client";
import { refreshBillingAction, manualReleaseAction } from "./actions";
import { billingFormKey } from "@webdock/module-billing/ui/state";
import {
  ManualReleaseForm as ModuleManualReleaseForm,
  type PublicManualReleaseFormProps,
} from "@webdock/module-billing/ui/operator-forms";
export function ManualReleaseForm(props: PublicManualReleaseFormProps) {
  return (
    <ModuleManualReleaseForm
      key={billingFormKey(props.customerID, props.contractID, props.revision)}
      {...props}
      actionPorts={{ manualReleaseAction }}
    />
  );
}
import {
  RefreshBilling as ModuleRefreshBilling,
  type PublicRefreshBillingProps,
} from "@webdock/module-billing/ui/operator-forms";
export function RefreshBilling(props: PublicRefreshBillingProps) {
  return (
    <ModuleRefreshBilling
      key={billingFormKey(props.customerID, props.environment)}
      {...props}
      actionPorts={{ refreshBillingAction }}
    />
  );
}
