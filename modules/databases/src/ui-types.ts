import type {
  ManagedDatabaseOffer,
  ManagedDatabaseCredentials,
} from "@webdock/database-contracts/runtime-ports";
export type DatabaseOffer = ManagedDatabaseOffer;
export type DatabaseCredentials = ManagedDatabaseCredentials;
export type DatabaseOrderState = {
  error?: string;
  offer?: DatabaseOffer;
  databasePath?: string;
};
