"use client";
import type { ReactNode } from "react";
import { DatabaseActionsProvider } from "@webdock/module-databases/ui/actions";
import {
  prepareDatabaseOffer,
  acceptDatabaseOffer,
  createDatabasePlan,
  revealDatabaseCredentials,
} from "@/lib/managed-database-actions";
import {
  saveDatabase,
  launchDatabase,
  launchManagedDatabase,
} from "@/lib/database-actions";
const actions = {
  prepareDatabaseOffer,
  acceptDatabaseOffer,
  createDatabasePlan,
  revealDatabaseCredentials,
  saveDatabase,
  launchDatabase,
  launchManagedDatabase,
};
export function DatabaseActionBoundary({ children }: { children: ReactNode }) {
  return (
    <DatabaseActionsProvider actions={actions}>
      {children}
    </DatabaseActionsProvider>
  );
}
