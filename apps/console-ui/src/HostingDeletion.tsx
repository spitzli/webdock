import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { formatResource } from "@webdock/hosting-contracts";
import { Modal } from "./common";
import { deleteCommand, deletionPlanSchema, type DeletionPlan, type HostingApp } from "./hosting-contracts";
import { useHostingAction, useHostingCommand } from "./hosting-client";
import { HostingReceipt } from "./HostingOperation";
import { ActionFailure } from "./HostingActionState";
export function HostingDeletion({ app }: { app: HostingApp }) {
  const call = useHostingCommand();
  const { mutation, retry, uncertain } = useHostingAction();
  const [review, setReview] = useState<DeletionPlan>();
  const [typed, setTyped] = useState("");
  // The server derives the plan; its hash binds the confirmation to exactly what was shown.
  const plan = useMutation({
    mutationFn: () => call({ action: "apps.deletion", appID: app.id }, deletionPlanSchema),
    onSuccess: (value) => { setTyped(""); setReview(value); },
  });
  useBlocker({
    shouldBlockFn: () => uncertain && !window.confirm("The deletion outcome is unknown. Leave this view and review the server state?"),
    enableBeforeUnload: uncertain,
  });
  const locked = plan.isPending || mutation.isPending || uncertain || Boolean(mutation.data) || app.status === "pending";
  return <section className="security-section mt-6">
    <h2>Delete application</h2>
    <p className="muted">Deletion removes the runtime resources after review. Retained storage is listed separately in the plan.</p>
    <button className="button mt-4" disabled={locked} onClick={() => { mutation.reset(); plan.mutate(); }}>
      {plan.isPending ? "Loading deletion plan…" : "Review deletion"}
    </button>
    {plan.error ? <p className="error" role="alert">{plan.error.message}</p> : null}
    <ActionFailure error={mutation.error} uncertain={uncertain} retry={retry} pending={mutation.isPending} />
    {mutation.data ? <HostingReceipt receipt={mutation.data} /> : null}
    {review ? <Modal title="Delete application" close={() => { setReview(undefined); }}>
      <form className="editor" onSubmit={(event) => {
        event.preventDefault();
        mutation.mutate(deleteCommand(app, review, typed, crypto.randomUUID()));
        setReview(undefined);
      }}>
        <p>This removes {review.plan.resources.length ? review.plan.resources.join(", ") : "the unpublished draft"} for <strong>{review.plan.name}</strong>.</p>
        {review.plan.persistentData ? <p className="error">Persistent storage ({formatResource("volumeBytes", review.plan.volumeBytes)}) is retained after deletion and must be removed separately.</p> : null}
        <label>Type the application name to confirm<input value={typed} autoComplete="off" spellCheck={false} onChange={(event) => { setTyped(event.target.value); }} /></label>
        <button className="button primary" disabled={typed !== app.name || review.plan.name !== app.name}>Confirm deletion</button>
      </form>
    </Modal> : null}
  </section>;
}
