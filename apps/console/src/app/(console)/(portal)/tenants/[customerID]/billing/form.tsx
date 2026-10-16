"use client";
import {
  subscriptionChangeAction,
  resumeChangeAction,
  purchaseAction,
  paymentLinkAction,
} from "./actions";
import { billingFormKey } from "@webdock/module-billing/ui/state";
import {
  PurchaseForm as ModulePurchaseForm,
  type PublicPurchaseFormProps,
} from "@webdock/module-billing/ui/tenant-forms";
export function PurchaseForm(props: PublicPurchaseFormProps) {
  return (
    <ModulePurchaseForm
      key={billingFormKey(
        props.values.customerID,
        props.values.environment,
        props.values.projectID,
        props.values.bindingID,
        props.values.versionID,
        props.values.termsHash,
      )}
      {...props}
      actionPorts={{ purchaseAction }}
    />
  );
}
import {
  PaymentLink as ModulePaymentLink,
  type PublicPaymentLinkProps,
} from "@webdock/module-billing/ui/tenant-forms";
export function PaymentLink(props: PublicPaymentLinkProps) {
  return (
    <ModulePaymentLink
      key={billingFormKey(props.customerID, props.environment, props.attemptID)}
      {...props}
      actionPorts={{ paymentLinkAction }}
    />
  );
}
import {
  ChangeForm as ModuleChangeForm,
  type PublicChangeFormProps,
} from "@webdock/module-billing/ui/tenant-forms";
export function ChangeForm(props: PublicChangeFormProps) {
  return (
    <ModuleChangeForm
      key={billingFormKey(
        props.values.customerID,
        props.values.environment,
        props.values.subscriptionID,
        props.values.versionID,
        props.values.operationID,
        props.values.termsHash,
      )}
      {...props}
      actionPorts={{ subscriptionChangeAction }}
    />
  );
}
import {
  ResumeChange as ModuleResumeChange,
  type PublicResumeChangeProps,
} from "@webdock/module-billing/ui/tenant-forms";
export function ResumeChange(props: PublicResumeChangeProps) {
  return (
    <ModuleResumeChange
      key={billingFormKey(props.customerID, props.environment, props.changeID)}
      {...props}
      actionPorts={{ resumeChangeAction }}
    />
  );
}
