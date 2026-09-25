---
title: "Object-oriented TypeScript — ZudoJS Academy"
description: "Use encapsulation, abstraction, inheritance, polymorphism, composition and dependency inversion, then compare OOP and functional designs honestly."
source: https://zudojs.oyinlola.site/learn/ts-oop
---

LEVEL 6 · LESSON 8 OF 22

Functions and design styles Advanced

# Object-oriented TypeScript

Use encapsulation, abstraction, inheritance, polymorphism, composition and dependency inversion, then compare OOP and functional designs honestly.

- **60 min** to read and try
- **You need:** Classes in TypeScript, Inheritance and composition, Union types in depth and Advanced functions
- **You build:** A payments and notifications module for a shop, with provider adapters behind interfaces the checkout owns, composed notification channels, capability checks instead of "not supported" errors, and contract tests every provider must pass

  [Test yourself](#test)

BY THE END OF THIS LESSON YOU CAN

- Protect an object's invariants with private state, and find the leaks that readonly types do not close
- Design small interfaces from the caller's needs, and model optional capabilities without "not supported" errors
- Use inheritance with override safely, and recognise a Liskov substitution violation the compiler cannot see
- Compose behaviour by wrapping objects that share an interface
- Apply dependency inversion so business code owns its interfaces and providers adapt to them
- Compare an object-oriented and a functional design of the same feature, and choose between them for a given change

## The provider that paid no fees

A shop accepts payments through several providers. The first version of its payment code is a set of functions, each with a `switch` over the provider name. The team adds OPay: a developer updates `charge`, runs a test payment, and ships.

payments.ts

```ts
type Provider = "paystack" | "flutterwave" | "bank-transfer" | "opay";

function charge(provider: Provider, amountKobo: number): string {
  switch (provider) {
    case "paystack":
    case "flutterwave":
    case "opay":
      return `${provider} charged ${amountKobo} kobo`;
    case "bank-transfer":
      return `awaiting transfer of ${amountKobo} kobo`;
  }
}

function feeKobo(provider: Provider, amountKobo: number): number {
  switch (provider) {
    case "paystack":
      return Math.min(Math.round(amountKobo * 0.015) + 10_000, 200_000);
    case "flutterwave":
      return Math.round(amountKobo * 0.014);
    default:
      return 0;
  }
}

for (const provider of ["paystack", "opay"] as const) {
  const amount = 1_500_000;
  console.log(charge(provider, amount), "| fee recorded:", feeKobo(provider, amount));
}
```

Output of `npx tsx payments.ts` and of the browser terminal

```ts
paystack charged 1500000 kobo | fee recorded: 32500
opay charged 1500000 kobo | fee recorded: 0
```

OPay charges a fee like everyone else, but the books record zero, because `feeKobo`'s `default` branch quietly answered for a provider it had never heard of. The knowledge "how OPay works" is spread across every function that switches on the provider, and nothing connects them.

Object-oriented programming answers this by putting everything about OPay in one place, an object behind an interface, so adding a provider means adding one class that the compiler checks is complete. Functional programming answers it differently: keep the data and the functions apart, but make every `switch` exhaustive, so the compiler lists every function that must learn about OPay. This lesson builds the object-oriented answer properly in TypeScript, then compares the two honestly. [Classes in TypeScript](https://zudojs.oyinlola.site/learn/ts-classes) covered the class syntax and dependency injection by hand, and [Inheritance and composition](https://zudojs.oyinlola.site/learn/js-composition) covered the JavaScript side of composition. Here the focus is design: which rules each idea gives you, what the compiler can check, and what only tests can.

## Encapsulation: guarding invariants

An **invariant** is a rule that must always hold for an object, whatever anyone does with it. For a wallet: the balance is never negative, and the balance always equals the sum of the ledger entries. **Encapsulation** means the object's own methods are the only way to change its state, so they can enforce its invariants. It is not about hiding things for the sake of it; it is about making invalid states impossible to reach from outside.

wallet.ts

```ts
export interface LedgerEntry {
  readonly kind: "deposit" | "withdrawal";
  readonly amountKobo: number;
}

export class Wallet {
  #balanceKobo = 0;
  readonly #ledger: LedgerEntry[] = [];

  get balanceKobo(): number {
    return this.#balanceKobo;
  }

  get ledger(): readonly LedgerEntry[] {
    return this.#ledger;
  }

  deposit(amountKobo: number): void {
    Wallet.#requireWholeKobo(amountKobo);
    this.#balanceKobo += amountKobo;
    this.#ledger.push({ kind: "deposit", amountKobo });
  }

  withdraw(amountKobo: number): void {
    Wallet.#requireWholeKobo(amountKobo);
    if (amountKobo > this.#balanceKobo) throw new RangeError(`insufficient funds: balance ${this.#balanceKobo}, asked ${amountKobo}`);
    this.#balanceKobo -= amountKobo;
    this.#ledger.push({ kind: "withdrawal", amountKobo });
  }

  static #requireWholeKobo(amountKobo: number): void {
    if (!Number.isInteger(amountKobo) || amountKobo <= 0) throw new RangeError(`not a positive whole kobo amount: ${amountKobo}`);
  }
}
```

The balance has a getter and no setter, the ledger is exposed as a `readonly` array, and the fields use JavaScript's `#private`, which (unlike TypeScript's `private`, as [Classes in TypeScript](https://zudojs.oyinlola.site/learn/ts-classes#access) showed) is enforced at runtime. The compiler refuses the obvious attacks:

wallet-attacks.ts

```ts
import { Wallet } from "./wallet.js";

const wallet = new Wallet();
wallet.balanceKobo = 1_000_000_000;
wallet.ledger.push({ kind: "deposit", amountKobo: 1_000_000_000 });
```

What `npx tsc --noEmit` prints

```ts
wallet-attacks.ts:4:8 - error TS2540: Cannot assign to 'balanceKobo' because it is a read-only property.

4 wallet.balanceKobo = 1_000_000_000;
         ~~~~~~~~~~~

wallet-attacks.ts:5:15 - error TS2339: Property 'push' does not exist on type 'readonly LedgerEntry[]'.

5 wallet.ledger.push({ kind: "deposit", amountKobo: 1_000_000_000 });
                ~~~~


Found 2 errors in the same file, starting at: wallet-attacks.ts:4
```

But a `readonly` type is a promise about how *typed* code uses a value. The getter hands out the real internal array, and anything that is not type-checked (plain JavaScript, a cast, a library typed as `any`) can still change it:

wallet-leak.ts

```ts
import { Wallet } from "./wallet.js";
import type { LedgerEntry } from "./wallet.js";

const wallet = new Wallet();
wallet.deposit(500_000);

const entries = wallet.ledger as LedgerEntry[];
entries.push({ kind: "deposit", amountKobo: 9_000_000 });

const ledgerTotal = wallet.ledger.reduce((sum, e) => sum + (e.kind === "deposit" ? e.amountKobo : -e.amountKobo), 0);
console.log("balance:", wallet.balanceKobo, "ledger says:", ledgerTotal);
```

Output of `npx tsx wallet-leak.ts` and of the browser terminal

```ts
balance: 500000 ledger says: 9500000
```

The invariant "balance equals ledger" is broken without touching a private field. The fix is to never hand out mutable internals: return a copy, or a frozen copy, so the object is the only owner of its state. Change the getter to `return Object.freeze([...this.#ledger]);` and the same cast then fails loudly at runtime (`TypeError: Cannot add property 1, object is not extensible`) instead of corrupting the wallet. The same applies to `Map`s, `Set`s and nested objects you store: encapsulation is only as strong as the most generous getter.

## Abstraction: interfaces designed by the caller

An **abstraction** keeps what a caller needs and hides everything else. For the checkout, a payment provider is "something that can charge an amount and tell me its fee". HTTP clients, API keys, webhook formats and retry rules are hidden behind that. In TypeScript the abstraction is an interface, and the most important design rule is that it is written from the **caller's** point of view, not copied from one provider's API:

ports.ts

```ts
export interface ChargeResult {
  readonly reference: string;
  readonly status: "success" | "pending" | "failed";
}

export interface PaymentProvider {
  readonly name: string;
  charge(amountKobo: number, customerEmail: string): Promise<ChargeResult>;
  feeKobo(amountKobo: number): number;
}

export interface Refunds {
  refund(reference: string, amountKobo: number): Promise<ChargeResult>;
}
```

Why is `refund` in its own interface? Because a bank transfer cannot be refunded automatically: a person must send the money back. If `refund` were part of `PaymentProvider`, the bank-transfer provider would have to implement it by throwing "not supported", and every caller would have to know which providers really support it. That is the **interface segregation** idea: many small interfaces that each mean something, instead of one large one that some implementers can only pretend to satisfy. A caller that needs refunds asks for `PaymentProvider & Refunds`, or checks the capability with a type guard, as the build does.

### Structural typing: implements is optional

TypeScript checks interfaces by shape. Any object with the right members *is* a `PaymentProvider`; `implements` only asks the compiler to check a class against it where the class is declared. An object literal is often all a simple implementation needs:

bank-transfer.ts

```ts
import type { PaymentProvider } from "./ports.js";

export const bankTransfer: PaymentProvider = {
  name: "bank-transfer",
  async charge(amountKobo, customerEmail) {
    return { reference: `TRF-${customerEmail.length}${amountKobo}`, status: "pending" };
  },
  feeKobo: () => 5_000,
};

const result = await bankTransfer.charge(1_500_000, "ada@shop.ng");
console.log(bankTransfer.name, result.status, bankTransfer.feeKobo(1_500_000));
```

Output of `npx tsx bank-transfer.ts` and of the browser terminal

```ts
bank-transfer pending 5000
```

There is one exception to "shape is enough". A class with a `private` or `#private` member is only compatible with itself and its subclasses: an object literal cannot supply the private part. That makes such classes behave **nominally**, which is occasionally exactly what you want, for example so that a `Money` value can only be created by its own constructor, where it is validated:

nominal.ts

```ts
class Money {
  readonly #checked = true;
  constructor(readonly kobo: number) {
    if (!Number.isInteger(kobo)) throw new RangeError("kobo must be whole");
  }
}

function payout(amount: Money): number {
  return amount.kobo;
}

payout(new Money(500_000));
payout({ kobo: 0.5 });
```

What `npx tsc --noEmit` prints

```ts
nominal.ts:13:8 - error TS2741: Property '#checked' is missing in type '{ kobo: number; }' but required in type 'Money'.

13 payout({ kobo: 0.5 });
          ~~~~~~~~~~~~~

  nominal.ts:2:12 - '#checked' is declared here.
    2   readonly #checked = true;
                 ~~~~~~~~


Found 1 error in nominal.ts:13
```

[Branded types](https://zudojs.oyinlola.site/learn/ts-branded-types) gets the same guarantee without a class.

## Inheritance: override, and the promise a subclass makes

**Inheritance** lets a class reuse another's code and be used wherever the parent is expected. Card processors in Nigeria mostly share one fee formula, a percentage with a cap, so a base class can hold the formula and let subclasses supply the numbers. That is the **template method** pattern: the base class fixes the algorithm, subclasses fill in steps.

card-providers.ts

```ts
abstract class CardProvider {
  abstract readonly name: string;
  protected abstract percent(): number;

  protected capKobo(): number {
    return 200_000;
  }

  feeKobo(amountKobo: number): number {
    return Math.min(Math.round(amountKobo * this.percent()), this.capKobo());
  }
}

class Paystack extends CardProvider {
  readonly name = "paystack";
  protected percent(): number {
    return 0.015;
  }
}

class Flutterwave extends CardProvider {
  readonly name = "flutterwave";
  protected percent(): number {
    return 0.014;
  }
  protected override capKobo(): number {
    return 250_000;
  }
}

for (const provider of [new Paystack(), new Flutterwave()]) {
  console.log(provider.name, provider.feeKobo(1_500_000), provider.feeKobo(50_000_000));
}
```

Output of `npx tsx card-providers.ts` and of the browser terminal

```ts
paystack 22500 200000
flutterwave 21000 250000
```

The `override` keyword says "this replaces a member of the parent". It is a check, erased from the output: if the parent's method is renamed or removed, every `override` of it becomes an error instead of silently turning into an unrelated new method that is never called:

override-typo.ts

```ts
abstract class CardProvider {
  protected capKobo(): number {
    return 200_000;
  }
}

class Flutterwave extends CardProvider {
  protected override capKobos(): number {
    return 250_000;
  }
}
```

What `npx tsc --noEmit` prints

```ts
override-typo.ts:8:22 - error TS4117: This member cannot have an 'override' modifier because it is not declared in the base class 'CardProvider'. Did you mean 'capKobo'?

8   protected override capKobos(): number {
                       ~~~~~~~~


Found 1 error in override-typo.ts:8
```

Turn on `noImplicitOverride` in tsconfig.json (see [tsconfig in depth](https://zudojs.oyinlola.site/learn/ts-tsconfig)) and the reverse is enforced too: replacing a parent method *without* writing `override` becomes an error, so every override is visible to readers.

### What the compiler cannot check: substitutability

Wherever a `Wallet` is expected, a subclass may be passed. The subclass therefore promises to behave like a wallet: accept what a wallet accepts, and keep its guarantees. This is the **Liskov substitution principle**. TypeScript checks the *types* of an override, but not its *behaviour*. A savings wallet with a withdrawal limit type-checks perfectly and breaks code written for wallets:

limited.ts

```ts
import { Wallet } from "./wallet.js";

class SavingsWallet extends Wallet {
  override withdraw(amountKobo: number): void {
    if (amountKobo > 5_000_000) throw new RangeError("savings wallets allow at most ₦50,000 per withdrawal");
    super.withdraw(amountKobo);
  }
}

function moveAll(from: Wallet, to: Wallet): void {
  const amount = from.balanceKobo;
  from.withdraw(amount);
  to.deposit(amount);
}

const savings = new SavingsWallet();
savings.deposit(8_000_000);
try {
  moveAll(savings, new Wallet());
} catch (error) {
  console.log(String(error));
}
console.log("left in savings:", savings.balanceKobo);
```

Output of `npx tsx limited.ts` and of the browser terminal

```ts
RangeError: savings wallets allow at most ₦50,000 per withdrawal
left in savings: 8000000
```

`moveAll` was correct for every `Wallet`, and then a subclass added a rule that `Wallet` never had: it **strengthened a precondition**. The types are the same; the promise is not. The design fix is to make the limit part of the abstraction (for example a `maxWithdrawalKobo` property every wallet has, which `moveAll` respects), or not to make `SavingsWallet` a `Wallet` at all. The testing fix is a **contract test** that every implementation must pass, which the build uses. Deep hierarchies multiply these hidden promises, which is the fragile base class problem from [Inheritance and composition](https://zudojs.oyinlola.site/learn/js-composition#coupling); keep inheritance shallow and prefer the next tool.

## Composition: wrapping objects that share an interface

**Polymorphism** means one piece of code works with many kinds of object: the checkout calls `provider.charge(…)` and the object decides what that means. With interfaces, polymorphism does not need inheritance at all, and that opens up **composition**: build behaviour by wrapping objects in other objects with the same interface. Notification channels are the classic case. SMS, email and push all `send`; retrying and falling back are behaviours you want to add to *any* channel:

channels.ts

```ts
export interface NotificationChannel {
  readonly name: string;
  send(to: string, text: string): Promise<void>;
}

export function consoleChannel(name: string, failuresBeforeSuccess = 0): NotificationChannel {
  let failures = failuresBeforeSuccess;
  return {
    name,
    async send(to, text) {
      if (failures-- > 0) throw new Error(`${name} gateway timeout`);
      console.log(`[${name}] to ${to}: ${text}`);
    },
  };
}

export function withRetry(channel: NotificationChannel, attempts: number): NotificationChannel {
  return {
    name: `${channel.name}+retry`,
    async send(to, text) {
      for (let attempt = 1; ; attempt++) {
        try {
          return await channel.send(to, text);
        } catch (error) {
          if (attempt >= attempts) throw error;
        }
      }
    },
  };
}

export function withFallback(primary: NotificationChannel, backup: NotificationChannel): NotificationChannel {
  return {
    name: `${primary.name}|${backup.name}`,
    async send(to, text) {
      try {
        await primary.send(to, text);
      } catch (error) {
        console.log(`${primary.name} failed (${error instanceof Error ? error.message : error}), using ${backup.name}`);
        await backup.send(to, text);
      }
    },
  };
}
```

notify-demo.ts

```ts
import { consoleChannel, withFallback, withRetry } from "./channels.js";

const sms = consoleChannel("sms", 3);
const email = consoleChannel("email");
const orderUpdates = withFallback(withRetry(sms, 2), email);

console.log(orderUpdates.name);
await orderUpdates.send("+2348030000000", "ORD-1042 has shipped");
await orderUpdates.send("+2348030000000", "ORD-1042 was delivered");
```

Output of `npx tsx notify-demo.ts` and of the browser terminal

```ts
sms+retry|email
sms+retry failed (sms gateway timeout), using email
[email] to +2348030000000: ORD-1042 has shipped
[sms] to +2348030000000: ORD-1042 was delivered
```

Each wrapper is a `NotificationChannel` that holds another `NotificationChannel`: the **decorator** pattern. The pieces combine freely: retry then fall back, or fall back to a retried channel, or add a `withQuietHours` wrapper later (the second exercise). With inheritance you would need a class for every combination (`SmsWithRetry`, `SmsWithRetryAndEmailFallback`, …). Notice also that the SMS channel failed three times, the retry wrapper allowed two attempts, and the second message then got through on SMS: each wrapper keeps its own simple rule, and the combination behaves predictably.

## Dependency inversion: who owns the interface

[Classes in TypeScript](https://zudojs.oyinlola.site/learn/ts-classes#injection) passed dependencies into a constructor instead of creating them inside. **Dependency inversion** is the rule behind that, and it is about the direction of imports: high-level code (the checkout, which holds business rules) must not depend on low-level code (the Paystack client); both depend on an abstraction, and the abstraction **belongs to the high-level code**.

```ts
  checkout/ports.ts          PaymentProvider, Refunds, NotificationChannel
        ^        ^            (written for the checkout's needs)
        |        |
  checkout/          providers/paystack.ts     adapts the Paystack API to PaymentProvider
  checkout.ts        providers/bank.ts         adapts manual transfers
        ^                    ^
        +------ main.ts -----+                 the composition root: the only file
                                               that knows every concrete class
```

Imports point toward the checkout's own interfaces. Providers depend on the checkout, not the other way round.

The payoff is in what changes when something changes. Paystack renames a field in its API: only its adapter changes. The shop adds OPay: one new adapter and one line in `main.ts`. The checkout's tests use fakes of *its own* interface, not mocks of a vendor SDK. If the interface had instead been copied from Paystack's SDK types (`charge(params: PaystackChargeParams)`), every provider would have to pretend to be Paystack, and the checkout would change whenever Paystack did. A DI container such as [@zudojs/container](https://zudojs.oyinlola.site/learn/zudo-container) automates the wiring in `main.ts`; it does not change the direction of the arrows. [Type-safe dependency injection](https://zudojs.oyinlola.site/learn/ts-typed-di) builds a typed container of your own.

## Build: payments behind the checkout's interfaces

REASON IT OUT

### Before you build the payments module

The checkout must charge through several providers, refund where possible, notify customers through composed channels, and be testable without the network. Before reading the code, think:

- Which file may import the Paystack adapter? Which files may import the interfaces?
- A refund is requested for a bank-transfer payment. Should that be a compile error, a runtime error, or a normal result? Who decides?
- How do you make sure a new provider added next year computes fees correctly and never returns a negative fee, without trusting whoever writes it?
- What must happen if the customer notification fails after the charge succeeded?

**Show the reasoning**

Only the composition root imports adapters; everything else imports the interfaces. Refundability is a *capability*: the refund path checks it with a type guard and returns a normal "manual refund needed" result, because a bank-transfer refund is an expected business case, not a crash. New providers are held to the behaviour, not just the types, by a contract test that runs the same checks against every provider. And a failed notification must never undo or hide a successful charge: the money moved, so the checkout records the payment and reports the notification failure separately.

ports.ts

```ts
export interface ChargeResult {
  readonly reference: string;
  readonly status: "success" | "pending" | "failed";
}

export interface PaymentProvider {
  readonly name: string;
  charge(amountKobo: number, customerEmail: string): Promise<ChargeResult>;
  feeKobo(amountKobo: number): number;
}

export interface Refunds {
  refund(reference: string, amountKobo: number): Promise<ChargeResult>;
}

export interface NotificationChannel {
  send(to: string, text: string): Promise<void>;
}

export function canRefund(provider: PaymentProvider): provider is PaymentProvider & Refunds {
  return typeof (provider as Partial<Refunds>).refund === "function";
}
```

providers.ts

```ts
import type { ChargeResult, PaymentProvider, Refunds } from "./ports.js";

export class PaystackAdapter implements PaymentProvider, Refunds {
  readonly name = "paystack";
  #counter = 0;
  constructor(private readonly secretKey: string) {}

  async charge(amountKobo: number, customerEmail: string): Promise<ChargeResult> {
    const reference = `PSK_${++this.#counter}`;
    const status = customerEmail.endsWith("@blocked.test") ? "failed" : "success";
    return { reference, status };
  }

  async refund(reference: string, amountKobo: number): Promise<ChargeResult> {
    return { reference: `${reference}-R`, status: amountKobo > 0 ? "pending" : "failed" };
  }

  feeKobo(amountKobo: number): number {
    return Math.min(Math.round(amountKobo * 0.015) + (amountKobo >= 250_000 ? 10_000 : 0), 200_000);
  }
}

export const bankTransfer: PaymentProvider = {
  name: "bank-transfer",
  async charge(amountKobo) {
    return { reference: `TRF_${amountKobo}`, status: "pending" };
  },
  feeKobo: () => 5_000,
};
```

The Paystack adapter simulates the network here; in a real project, its methods would call Paystack's HTTP API with `secretKey` and translate the answers into `ChargeResult`. Note that it `implements` two interfaces, and that the bank transfer is a plain object: both are equally valid providers. The checkout only sees the interfaces:

checkout.ts

```ts
import { canRefund } from "./ports.js";
import type { NotificationChannel, PaymentProvider } from "./ports.js";

export interface Receipt {
  readonly orderId: string;
  readonly provider: string;
  readonly reference: string;
  readonly status: string;
  readonly netKobo: number;
  readonly notified: boolean;
}

export class Checkout {
  readonly #providers: ReadonlyMap<string, PaymentProvider>;
  constructor(providers: readonly PaymentProvider[], private readonly notifier: NotificationChannel) {
    this.#providers = new Map(providers.map((p) => [p.name, p]));
  }

  async pay(orderId: string, amountKobo: number, providerName: string, customer: { email: string; phone: string }): Promise<Receipt> {
    const provider = this.#providers.get(providerName);
    if (!provider) throw new Error(`unknown provider ${providerName}`);
    const result = await provider.charge(amountKobo, customer.email);
    const netKobo = result.status === "failed" ? 0 : amountKobo - provider.feeKobo(amountKobo);
    let notified = true;
    try {
      await this.notifier.send(customer.phone, `Payment for ${orderId}: ${result.status}`);
    } catch {
      notified = false;
    }
    return { orderId, provider: provider.name, reference: result.reference, status: result.status, netKobo, notified };
  }

  async refund(providerName: string, reference: string, amountKobo: number): Promise<string> {
    const provider = this.#providers.get(providerName);
    if (!provider) throw new Error(`unknown provider ${providerName}`);
    if (!canRefund(provider)) return `manual refund needed: ${provider.name} cannot refund ${reference} automatically`;
    const result = await provider.refund(reference, amountKobo);
    return `refund ${result.reference} ${result.status}`;
  }
}
```

Inside the `canRefund` branch, `provider` is narrowed to `PaymentProvider & Refunds`, so `provider.refund` is typed; outside it, calling `refund` would not compile. A failed notification sets `notified: false` on the receipt instead of throwing away a successful payment. Now the composition root:

main.ts

```ts
import { Checkout } from "./checkout.js";
import { bankTransfer, PaystackAdapter } from "./providers.js";
import type { NotificationChannel } from "./ports.js";

const sms: NotificationChannel = {
  async send(to, text) {
    if (to === "") throw new Error("no phone number");
    console.log(`  sms to ${to}: ${text}`);
  },
};

const checkout = new Checkout([new PaystackAdapter("sk_test_placeholder"), bankTransfer], sms);

console.log(await checkout.pay("ORD-1042", 1_500_000, "paystack", { email: "ada@shop.ng", phone: "+2348030000000" }));
console.log(await checkout.pay("ORD-1043", 800_000, "bank-transfer", { email: "tunde@shop.ng", phone: "" }));
console.log(await checkout.refund("paystack", "PSK_1", 1_500_000));
console.log(await checkout.refund("bank-transfer", "TRF_800000", 800_000));
```

Output of `npx tsx main.ts` and of the browser terminal

```ts
  sms to +2348030000000: Payment for ORD-1042: success
{
  orderId: 'ORD-1042',
  provider: 'paystack',
  reference: 'PSK_1',
  status: 'success',
  netKobo: 1467500,
  notified: true
}
{
  orderId: 'ORD-1043',
  provider: 'bank-transfer',
  reference: 'TRF_800000',
  status: 'pending',
  netKobo: 795000,
  notified: false
}
refund PSK_1-R pending
manual refund needed: bank-transfer cannot refund TRF_800000 automatically
```

And what the compiler enforces on anyone adding a provider or misusing one:

mistakes.ts

```ts
import type { ChargeResult, PaymentProvider } from "./ports.js";

export class OpayAdapter implements PaymentProvider {
  readonly name = "opay";
  async charge(amountKobo: number, customerEmail: string): Promise<ChargeResult> {
    return { reference: `OPAY_${amountKobo}`, status: "success" };
  }
}

export function refundAll(provider: PaymentProvider, references: string[]) {
  return references.map((reference) => provider.refund(reference, 0));
}
```

What `npx tsc --noEmit` prints

```ts
mistakes.ts:3:14 - error TS2420: Class 'OpayAdapter' incorrectly implements interface 'PaymentProvider'.
  Property 'feeKobo' is missing in type 'OpayAdapter' but required in type 'PaymentProvider'.

3 export class OpayAdapter implements PaymentProvider {
               ~~~~~~~~~~~

  ports.ts:9:3 - 'feeKobo' is declared here.
    9   feeKobo(amountKobo: number): number;
        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

mistakes.ts:11:49 - error TS2339: Property 'refund' does not exist on type 'PaymentProvider'.

11   return references.map((reference) => provider.refund(reference, 0));
                                                   ~~~~~~


Found 2 errors in the same file, starting at: mistakes.ts:3
```

The new adapter has no `feeKobo`, which is exactly this lesson's opening bug, now a compile error instead of a silent zero. And code that assumes every provider can refund does not compile; it must go through `canRefund`. One more detail: `charge` has an explicit return type. `implements` checks a class but does not give its methods a contextual type, so without the annotation the literal `"success"` would widen to `string` and fail the check against `ChargeResult`.

## Testing: contract tests for every implementation

The compiler guarantees that every provider has the right members with the right types. It cannot guarantee behaviour: a fee that is never negative, a reference that is never empty, a charge that reports `failed` for a blocked card. Those rules belong to the `PaymentProvider` contract, so write them once, as a function that tests *any* provider, and run it against every implementation, including fakes used in other tests:

providers.test.ts

```ts
import { bankTransfer, PaystackAdapter } from "./providers.js";
import type { PaymentProvider } from "./ports.js";

async function providerContract(provider: PaymentProvider): Promise<string[]> {
  const failures: string[] = [];
  for (const amount of [100, 250_000, 1_500_000, 500_000_000]) {
    const fee = provider.feeKobo(amount);
    if (!Number.isInteger(fee) || fee < 0) failures.push(`fee for ${amount} is ${fee}`);
    if (fee >= amount) failures.push(`fee for ${amount} eats the whole payment (${fee})`);
  }
  const result = await provider.charge(250_000, "test@shop.ng");
  if (result.reference.length === 0) failures.push("empty reference");
  return failures;
}

const tooGreedy: PaymentProvider = {
  name: "too-greedy",
  async charge() {
    return { reference: "X1", status: "success" };
  },
  feeKobo: (amountKobo) => Math.max(10_000, Math.round(amountKobo * 0.02)),
};

for (const provider of [new PaystackAdapter("sk_test_placeholder"), bankTransfer, tooGreedy]) {
  const failures = await providerContract(provider);
  console.log(failures.length === 0 ? "PASS" : "FAIL", provider.name, failures.join("; "));
}
```

Output of `npx tsx providers.test.ts` and of the browser terminal

```ts
PASS paystack
FAIL bank-transfer fee for 100 eats the whole payment (5000)
FAIL too-greedy fee for 100 eats the whole payment (10000)
```

The contract caught both a greedy provider and a real flaw in the bank-transfer provider: its flat ₦50 fee is larger than a ₦1 payment, which a shop might never try by hand. That is the Liskov principle turned into a test: every implementation must be substitutable for the abstraction, so every implementation passes the abstraction's tests.

## Object-oriented or functional?

Here is the functional design of the same feature, done properly: providers are data, a discriminated union, and each operation is a function with an exhaustive `switch`. [Functional TypeScript](https://zudojs.oyinlola.site/learn/ts-functional) covers the style in depth; the `satisfies never` trick is from [Union types in depth](https://zudojs.oyinlola.site/learn/ts-unions#exhaustive).

functional.ts

```ts
type Provider =
  | { kind: "paystack"; secretKey: string }
  | { kind: "bank-transfer"; accountNumber: string }
  | { kind: "opay"; merchantId: string };

function feeKobo(provider: Provider, amountKobo: number): number {
  switch (provider.kind) {
    case "paystack":
      return Math.min(Math.round(amountKobo * 0.015) + 10_000, 200_000);
    case "bank-transfer":
      return 5_000;
    default:
      return provider satisfies never;
  }
}

function label(provider: Provider): string {
  switch (provider.kind) {
    case "paystack":
      return "Card (Paystack)";
    case "bank-transfer":
      return `Transfer to ${provider.accountNumber}`;
    default:
      return provider satisfies never;
  }
}
```

What `npx tsc --noEmit` prints

```ts
functional.ts:13:7 - error TS2322: Type '{ kind: "opay"; merchantId: string; }' is not assignable to type 'number'.

13       return provider satisfies never;
         ~~~~~~

functional.ts:13:23 - error TS1360: Type '{ kind: "opay"; merchantId: string; }' does not satisfy the expected type 'never'.

13       return provider satisfies never;
                         ~~~~~~~~~

functional.ts:24:7 - error TS2322: Type '{ kind: "opay"; merchantId: string; }' is not assignable to type 'string'.

24       return provider satisfies never;
         ~~~~~~

functional.ts:24:23 - error TS1360: Type '{ kind: "opay"; merchantId: string; }' does not satisfy the expected type 'never'.

24       return provider satisfies never;
                         ~~~~~~~~~


Found 4 errors in the same file, starting at: functional.ts:13
```

Adding `opay` to the union made the compiler list every function that must handle it. The functional style gets the same safety as the object-oriented one, from a different direction. Which is better depends on which kind of change you expect, a question known as the **expression problem**:

| Change | Object-oriented (classes behind an interface) | Functional (union plus functions) |
| --- | --- | --- |
| Add a new **kind** (a provider, a channel) | One new class, nothing else changes; the compiler checks it is complete | Every function that switches on the kind changes; the compiler lists them |
| Add a new **operation** (`refundWindowDays`) | Every class changes; the compiler lists them via `implements` | One new function, nothing else changes |
| Kinds added by other teams or plugins | Natural: they implement your interface without touching your code | Impossible without editing the union |
| State that must stay consistent (a wallet, a connection) | Natural: methods guard the invariants | Possible with immutable values and functions that return new ones |
| Sending over the network, storing in a database | Objects lose their methods and private state | Plain data survives `JSON.stringify` unchanged |
| Seeing all behaviour for one case | In one class | Spread across functions |
| Seeing one operation for all cases | Spread across classes | In one function |

The serialization row is easy to underestimate, so here it is running:

serialize.ts

```ts
import { Wallet } from "./wallet.js";

const wallet = new Wallet();
wallet.deposit(250_000);
const asObject = JSON.parse(JSON.stringify(wallet));

const walletData = { ownerId: "usr_7", balanceKobo: 250_000, ledger: [{ kind: "deposit", amountKobo: 250_000 }] };
const asData = JSON.parse(JSON.stringify(walletData));

console.log(asObject, asObject instanceof Wallet, typeof asObject.deposit);
console.log(asData.balanceKobo === walletData.balanceKobo, asData.ledger.length);
```

Output of `npx tsx serialize.ts` and of the browser terminal

```json
{} false undefined
true 1
```

A class instance with `#private` state serializes to `{}`: no balance, no ledger, no methods. Objects need explicit conversion at every boundary (`toJSON`, and a factory that validates and rebuilds), while plain data just travels.

In practice, most TypeScript codebases use both, each where it fits. In this shop, **payment providers and notification channels** are open sets, implemented by adapters, often stateful (connections, keys, counters), and sometimes added by plugins: objects behind interfaces fit. **Pricing rules, order states and promotions** are closed sets of data that travel through APIs and databases, where you add new operations (reports, exports) more often than new kinds: a union with functions fits. A useful default: data as plain, readonly types; behaviour that talks to the outside world behind small interfaces; classes where an invariant needs guarding.

## Object-oriented TypeScript in production

- **Keep interfaces small and owned by the caller.** Split capabilities (`Refunds`) instead of throwing "not supported".
- **Prefer composition to inheritance**, keep hierarchies one level deep, use `override`, and turn on `noImplicitOverride`.
- **Guard invariants at runtime.** `#private` fields, validated constructors and copies of internal collections; `readonly` types alone do not stop untyped code.
- **One composition root.** Only `main.ts` (or your container setup) knows concrete classes; everything else receives interfaces.
- **Convert at the edges.** Objects do not survive JSON. Map requests and database rows to domain objects on the way in, and to plain data on the way out.
- **Contract-test every implementation**, including the fakes your other tests rely on; a fake that breaks the contract makes those tests lie.

## Practice

TRY IT YOURSELF

### Close the leak

Change the wallet's `ledger` getter so that the leak shown in the encapsulation section can no longer corrupt the wallet, and show what the same attack does now.

**Show a solution**

safe-wallet.ts

```ts
interface LedgerEntry {
  readonly kind: "deposit" | "withdrawal";
  readonly amountKobo: number;
}

class Wallet {
  #balanceKobo = 0;
  readonly #ledger: LedgerEntry[] = [];

  get balanceKobo(): number {
    return this.#balanceKobo;
  }

  get ledger(): readonly LedgerEntry[] {
    return Object.freeze([...this.#ledger]);
  }

  deposit(amountKobo: number): void {
    this.#balanceKobo += amountKobo;
    this.#ledger.push(Object.freeze({ kind: "deposit", amountKobo }));
  }
}

const wallet = new Wallet();
wallet.deposit(500_000);
try {
  (wallet.ledger as LedgerEntry[]).push({ kind: "deposit", amountKobo: 9_000_000 });
} catch (error) {
  console.log(String(error));
}
console.log(wallet.balanceKobo, wallet.ledger.length);
```

Output of `npx tsx safe-wallet.ts` and of the browser terminal

```ts
TypeError: Cannot add property 1, object is not extensible
500000 1
```

Each call returns a frozen copy, so an attacker can at most change a copy, and here even that throws. The entries themselves are frozen when stored, so no one can edit an amount through a copy either. Copying costs a little on every read; for large ledgers, expose an iterator or paged reads instead.

TRY IT YOURSELF

### Quiet hours

Write a decorator `withQuietHours(channel, isQuiet)` for the notification channels: when `isQuiet()` returns true, it stores the message in a queue instead of sending it. It also has `pending()`, the number of queued messages, and `flush()`, which sends everything queued and returns how many it sent.

**Show a solution**

quiet.ts

```ts
import { consoleChannel } from "./channels.js";
import type { NotificationChannel } from "./channels.js";

interface QuietChannel extends NotificationChannel {
  pending(): number;
  flush(): Promise<number>;
}

function withQuietHours(channel: NotificationChannel, isQuiet: () => boolean): QuietChannel {
  const queue: [to: string, text: string][] = [];
  return {
    name: `${channel.name}+quiet`,
    async send(to, text) {
      if (isQuiet()) queue.push([to, text]);
      else await channel.send(to, text);
    },
    pending: () => queue.length,
    async flush() {
      const pending = queue.splice(0);
      for (const [to, text] of pending) await channel.send(to, text);
      return pending.length;
    },
  };
}

let night = true;
const sms = withQuietHours(consoleChannel("sms"), () => night);
await sms.send("+2348030000000", "Your order is packed");
await sms.send("+2348030000001", "Flash sale starts at 9am");
console.log("queued overnight:", sms.pending());
night = false;
console.log("flushed:", await sms.flush());
```

Output of `npx tsx quiet.ts` and of the browser terminal

```ts
queued overnight: 2
[sms] to +2348030000000: Your order is packed
[sms] to +2348030000001: Flash sale starts at 9am
flushed: 2
```

Nothing was sent during the night; both messages went out at the flush. The decorator adds a capability to any channel without subclassing, and `QuietChannel` extends the interface so callers can see it. `queue.splice(0)` empties the queue and returns what was in it, so a message cannot be sent twice even if `flush` is called again.

TRY IT YOURSELF

### Add OPay both ways

Add an OPay provider (1.25% fee, capped at ₦1,500) to the object-oriented design as a class, and to the functional design as a union member. In each style, list what else had to change, and check the fee for ₦15,000.

**Show a solution**

opay.ts

```ts
interface PaymentProvider {
  readonly name: string;
  feeKobo(amountKobo: number): number;
}

class OpayAdapter implements PaymentProvider {
  readonly name = "opay";
  feeKobo(amountKobo: number): number {
    return Math.min(Math.round(amountKobo * 0.0125), 150_000);
  }
}

type Provider = { kind: "paystack" } | { kind: "opay"; merchantId: string };

function feeKobo(provider: Provider, amountKobo: number): number {
  switch (provider.kind) {
    case "paystack":
      return Math.min(Math.round(amountKobo * 0.015) + 10_000, 200_000);
    case "opay":
      return Math.min(Math.round(amountKobo * 0.0125), 150_000);
    default:
      return provider satisfies never;
  }
}

console.log(new OpayAdapter().feeKobo(1_500_000), feeKobo({ kind: "opay", merchantId: "M-77" }, 1_500_000));
```

Output of `npx tsx opay.ts` and of the browser terminal

```ts
18750 18750
```

In the class design, only the new class and the composition root change. In the functional design, the union and every function that switches on it change, and the compiler lists each one. Both are safe; they differ in where the edit lands, which is the expression problem in miniature.

## Recap

- Encapsulation protects invariants. Use `#private` state and validated methods, and never hand out mutable internals: `readonly` types do not stop untyped code.
- Abstraction means small interfaces written for the caller. Split optional capabilities into their own interfaces and check them with type guards.
- Interfaces are structural, except that classes with private members behave nominally.
- Inheritance: use `override` and `noImplicitOverride`. Subclasses must keep the parent's promises (Liskov substitution), which only tests can check.
- Composition wraps objects that share an interface (decorators), combining behaviours without a class per combination.
- Dependency inversion: business code owns its interfaces, adapters implement them, and only the composition root knows concrete classes.
- Object-oriented designs make new kinds cheap; functional designs make new operations cheap. Use objects for open sets with state, unions and functions for closed sets of data.

Next: [Functional TypeScript](https://zudojs.oyinlola.site/learn/ts-functional), the other half of the comparison, with readonly data, Option and Result types, and algebraic data types.

## Test yourself

Five questions, picked at random from this lesson's question bank. Some ask you to choose an answer, some to predict what code prints, and some to write code and run it in the terminal. Get 4 of 5 right to pass. If you don't, read the explanations and try again: you get 5 different questions.
