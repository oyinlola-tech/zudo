/**
 * Round 12 (academy findings) — @zudojs/container.
 *
 * #42  registerClass / classProvider / provideClass check the inject list
 *      against the constructor.
 * #62  A missing dependency's resolution chain ends at the missing token.
 * #69  Constructors whose parameters all have defaults are auto-registered
 *      and built with no arguments (documented behaviour).
 * #129 registerFactory defaults to TRANSIENT (documented behaviour).
 */

import { describe, expect, it } from "vitest";

import {
  ProviderResolutionError,
  RegistrationNotFoundError,
} from "@zudojs/errors";

import {
  ContainerScope,
  DependencyResolutionError,
  classProvider,
  createContainer,
  createToken,
  provideClass,
} from "../src/index.js";
import type { ProviderToken, RegisterClassOptions } from "../src/index.js";

class Db {
  query(): string {
    return "rows";
  }
}

class Clock {
  now(): number {
    return 1;
  }
}

class Report {
  constructor(
    readonly db: Db,
    readonly clock: Clock,
  ) {}
}

class Labelled {
  constructor(
    readonly db: Db,
    readonly label: string,
  ) {}
}

const DB = createToken<Db>("Db");
const REPORT = createToken<Report>("Report");
const LABELLED = createToken<Labelled>("Labelled");

describe("#42 registerClass type-checks the inject list", () => {
  it("accepts tokens in constructor order and resolves them", () => {
    const c = createContainer();
    c.registerClass(DB, Db);
    c.registerClass(Clock, Clock);
    c.registerClass(REPORT, Report, { inject: [DB, Clock] });

    const report = c.resolve(REPORT);
    expect(report.db).toBeInstanceOf(Db);
    expect(report.clock).toBeInstanceOf(Clock);
  });

  it("rejects swapped typed tokens at compile time", () => {
    const c = createContainer();
    // @ts-expect-error -- [Clock, Db] does not match new (db: Db, clock: Clock)
    c.registerClass(REPORT, Report, { inject: [Clock, DB] });
    // @ts-expect-error -- same check for the provider helper
    const provider = classProvider(Report, [Clock, DB]);
    // @ts-expect-error -- and for the registration helper
    const registration = provideClass(REPORT, Report, [Clock, DB]);
    expect(c.has(REPORT)).toBe(true);
    expect(provider.inject).toEqual([Clock, DB]);
    expect(registration.provide).toBe(REPORT);
  });

  it("rejects a missing inject list for a constructor with parameters", () => {
    const c = createContainer();
    // @ts-expect-error -- Report needs two constructor arguments
    c.registerClass(REPORT, Report);
    // @ts-expect-error -- classProvider without an inject list
    classProvider(Report);
    expect(c.has(REPORT)).toBe(true);
  });

  it("still accepts untyped string/symbol tokens and non-tuple lists", () => {
    const c = createContainer();
    c.registerClass(DB, Db);
    c.registerValue("label", "api");
    c.registerClass(LABELLED, Labelled, { inject: [DB, "label"] });
    expect(c.resolve(LABELLED).label).toBe("api");

    const deps: ProviderToken[] = [DB, "label"];
    c.registerClass("labelled-2", Labelled, { inject: deps });
    expect((c.resolve("labelled-2") as Labelled).label).toBe("api");

    const options: RegisterClassOptions = { scope: ContainerScope.SINGLETON };
    c.registerClass("db-2", Db, options);
    expect(c.resolve("db-2")).toBe(c.resolve("db-2"));
  });

  it("accepts optional and defaulted parameters beyond the inject list", () => {
    class Retrying {
      constructor(
        readonly db: Db,
        readonly retries: number = 3,
      ) {}
    }
    class Defaults {
      constructor(readonly retries: number = 3) {}
    }
    const c = createContainer();
    c.registerClass(DB, Db);
    c.registerClass(Retrying, Retrying, { inject: [DB] });
    c.registerClass(Defaults, Defaults);
    expect(c.resolve(Retrying).retries).toBe(3);
    expect(c.resolve(Defaults).retries).toBe(3);
  });
});

describe("#62 missing-dependency chain names the missing token", () => {
  class DueTodayReminder {
    constructor(readonly mailer: unknown) {}
  }
  class Deep {
    constructor(readonly reminder: DueTodayReminder) {}
  }

  it("ends the chain at the missing token and exposes it as the cause", () => {
    const c = createContainer();
    c.registerClass(DueTodayReminder, DueTodayReminder, {
      inject: ["MAILER"],
    });
    let caught: unknown;
    try {
      c.resolve(DueTodayReminder);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ProviderResolutionError);
    const error = caught as DependencyResolutionError;
    expect(error.chain).toEqual(["DueTodayReminder", "MAILER"]);
    expect(error.message).toContain("chain: DueTodayReminder -> MAILER");
    expect(error.message).toContain('No registration found for token "MAILER"');
    expect(error.message).toContain('required by "DueTodayReminder"');
    expect(error.cause).toBeInstanceOf(RegistrationNotFoundError);
    expect((error.cause as RegistrationNotFoundError).requestedToken).toBe(
      "MAILER",
    );
  });

  it("keeps the full path for a deeper consumer", () => {
    const c = createContainer();
    c.registerClass(DueTodayReminder, DueTodayReminder, {
      inject: ["MAILER"],
    });
    c.registerClass(Deep, Deep, { inject: [DueTodayReminder] });
    let caught: unknown;
    try {
      c.resolve(Deep);
    } catch (error) {
      caught = error;
    }
    const error = caught as DependencyResolutionError;
    expect(error.chain).toEqual(["Deep", "DueTodayReminder", "MAILER"]);
    expect(error.message).toContain(
      "chain: Deep -> DueTodayReminder -> MAILER",
    );
  });

  it("leaves the top-level missing-token message unchanged", () => {
    const c = createContainer();
    expect(() => c.resolve("nope")).toThrow(
      'No registration found for token "nope".',
    );
    expect(() => c.resolve("nope")).toThrow(RegistrationNotFoundError);
  });
});

describe("#69 auto-registration of defaulted constructors", () => {
  class Defaults {
    constructor(readonly retries: number = 3) {}
  }
  class Rest {
    readonly args: readonly unknown[];
    constructor(...args: readonly unknown[]) {
      this.args = args;
    }
  }

  it("builds them with no arguments so the defaults apply", () => {
    const c = createContainer();
    expect(Defaults.length).toBe(0);
    expect(c.canResolve(Defaults)).toBe(true);
    expect(c.resolve(Defaults).retries).toBe(3);
    expect(c.resolve(Rest).args).toEqual([]);
  });

  it("does not auto-register them when the option is off", () => {
    const c = createContainer({ resolution: { autoRegisterClasses: false } });
    expect(c.canResolve(Defaults)).toBe(false);
    expect(() => c.resolve(Defaults)).toThrow(RegistrationNotFoundError);
  });
});

describe("#129 registerFactory defaults to TRANSIENT", () => {
  it("runs the factory on every resolve unless a scope is given", () => {
    const c = createContainer();
    let calls = 0;
    c.registerFactory("pool", () => ({ id: ++calls }));
    c.registerFactory("shared", () => ({ id: ++calls }), [], {
      scope: ContainerScope.SINGLETON,
    });
    expect(c.resolve("pool")).not.toBe(c.resolve("pool"));
    expect(c.resolve("shared")).toBe(c.resolve("shared"));
    expect(calls).toBe(3);
  });
});
