import { ArrowClockwiseIcon } from "@phosphor-icons/react/dist/csr/ArrowClockwise";
import { WarningCircleIcon } from "@phosphor-icons/react/dist/csr/WarningCircle";
import { useEffect, useRef, type ReactNode } from "react";
export function Loading({ children = "Loading…" }: { children?: ReactNode }) {
  return (
    <div className="state" role="status">
      <span className="loading-dot" />
      {children}
    </div>
  );
}
export function Failure({
  error,
  retry,
}: {
  error: Error;
  retry?: () => void;
}) {
  return (
    <div className="state error" role="alert">
      <WarningCircleIcon size={22} />
      <div>
        <strong>Unable to load</strong>
        <p>{error.message}</p>
        {retry ? (
          <button className="button" onClick={retry}>
            <ArrowClockwiseIcon />
            Try again
          </button>
        ) : null}
      </div>
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="state">
      <div>
        <h2>{title}</h2>
        <p className="muted">{children}</p>
      </div>
    </div>
  );
}
export function Modal({
  title,
  close,
  children,
}: {
  title: string;
  close: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="dialog-head">
        <h2>{title}</h2>
        <button
          className="button quiet"
          onClick={close}
          aria-label={`Close ${title}`}
        >
          Close
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Status({ status }: { status?: string | undefined }) {
  return (
    <span className={`badge ${status === "active" ? "healthy" : ""}`}>
      {status ?? "Unknown"}
    </span>
  );
}
