/**
 * `embedded-postgres` yalnız paket derlemesinde (pack-server) kullanılır; çalışma
 * anında paketin kendi node_modules'ünden gelir. Bu bildirim tip denetimi için.
 */
declare module "embedded-postgres" {
  import type { Client } from "pg";

  export interface EmbeddedPostgresOptions {
    databaseDir: string;
    user: string;
    password: string;
    port: number;
    persistent?: boolean;
    initdbFlags?: string[];
  }

  export default class EmbeddedPostgres {
    constructor(options: EmbeddedPostgresOptions);
    initialise(): Promise<void>;
    start(): Promise<void>;
    stop(): Promise<void>;
    createDatabase(name: string): Promise<void>;
    getPgClient(database?: string): Client;
  }
}
