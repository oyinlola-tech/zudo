// Minimal typing for the adapter used in the README example; the package
// is not a dependency of @zudojs/database.
declare module "@prisma/adapter-pg" {
  import type { SqlDriverAdapterFactory } from "@prisma/client/runtime/client";

  export class PrismaPg implements SqlDriverAdapterFactory {
    constructor(options: { connectionString?: string });
    readonly provider: SqlDriverAdapterFactory["provider"];
    readonly adapterName: string;
    connect: SqlDriverAdapterFactory["connect"];
  }
}
