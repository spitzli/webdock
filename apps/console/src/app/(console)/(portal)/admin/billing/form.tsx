"use client";
import {
  retryBillingReadAction,
  sandboxCustomerAction,
  billingEndpointAction,
  billingConnectionAction,
  billingSwitchesAction,
} from "./actions";
import { billingFormKey } from "@webdock/module-billing/ui/state";
import {
  BillingForms as ModuleBillingForms,
  type PublicBillingFormsProps,
} from "@webdock/module-billing/ui/admin-forms";
export function BillingForms(props: PublicBillingFormsProps) {
  return (
    <ModuleBillingForms
      key={billingFormKey(
        props.connection.environment,
        props.connection.revision,
      )}
      {...props}
      actionPorts={{
        billingEndpointAction,
        billingConnectionAction,
        billingSwitchesAction,
      }}
    />
  );
}
import {
  SandboxCustomerForm as ModuleSandboxCustomerForm,
  type PublicSandboxCustomerFormProps,
} from "@webdock/module-billing/ui/admin-forms";
export function SandboxCustomerForm(props: PublicSandboxCustomerFormProps) {
  return (
    <ModuleSandboxCustomerForm
      key={billingFormKey(
        "sandbox",
        props.customers.map((customer) => customer.id).join(","),
      )}
      {...props}
      actionPorts={{ sandboxCustomerAction }}
    />
  );
}
import {
  RetryBillingRead as ModuleRetryBillingRead,
  type PublicRetryBillingReadProps,
} from "@webdock/module-billing/ui/admin-forms";
export function RetryBillingRead(props: PublicRetryBillingReadProps) {
  return (
    <ModuleRetryBillingRead
      key={billingFormKey(props.jobID)}
      {...props}
      actionPorts={{ retryBillingReadAction }}
    />
  );
}
