/**
 * zudojs-cli — `zudojs add email`: an `EmailTransport` abstraction with two
 * implementations: `console` (development default: logs the recipient and
 * subject, never the body) and `smtp` (nodemailer). SMTP credentials come
 * from the environment only; nothing secret is written to source.
 */

import { DEPENDENCY_VERSION_RANGES } from "../../resolvers/dependency/dependencyVersions.constant.js";
import type { AppRecipe } from "../recipe.type.js";

const source = (): string => `import { createTransport } from "nodemailer";

import type { AppConfig } from "../configs/index.js";
import type { Integration, IntegrationContext } from "./integration.js";

/** A message to send. */
export interface EmailMessage {
  readonly to: string | readonly string[];
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

/** Sends email; swap implementations through EMAIL_TRANSPORT. */
export interface EmailTransport {
  send(message: EmailMessage): Promise<void>;
  verify(): Promise<boolean>;
  close(): void;
}

function consoleTransport(logger: IntegrationContext["logger"]): EmailTransport {
  return {
    async send(message) {
      logger.info("Email (console transport, not sent)", {
        to: message.to,
        subject: message.subject,
      });
    },
    async verify() {
      return true;
    },
    close() {},
  };
}

function smtpTransport(settings: AppConfig["email"]): EmailTransport {
  const transporter = createTransport({
    host: settings.smtpHost,
    port: settings.smtpPort,
    secure: settings.smtpSecure,
    ...(settings.smtpUser === ""
      ? {}
      : { auth: { user: settings.smtpUser, pass: settings.smtpPassword } }),
  });
  return {
    async send(message) {
      await transporter.sendMail({
        from: settings.from,
        to: typeof message.to === "string" ? message.to : [...message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html === undefined ? {} : { html: message.html }),
      });
    },
    async verify() {
      return transporter.verify().then(() => true, () => false);
    },
    close() {
      transporter.close();
    },
  };
}

let transport: EmailTransport | undefined;

/** The configured transport. Throws before the runtime has started. */
export function email(): EmailTransport {
  if (transport === undefined) {
    throw new Error("Email is not configured: start the runtime first.");
  }
  return transport;
}

export const emailIntegration: Integration = {
  name: "email",

  async start({ config, logger }) {
    const kind = config.email.transport;
    if (kind !== "console" && kind !== "smtp") {
      throw new Error(\`EMAIL_TRANSPORT must be "console" or "smtp", got "\${kind}".\`);
    }
    transport = kind === "smtp" ? smtpTransport(config.email) : consoleTransport(logger);
  },

  async stop() {
    transport?.close();
    transport = undefined;
  },

  async health() {
    return transport === undefined ? false : transport.verify();
  },
};
`;

export const emailRecipe: AppRecipe = {
  scope: "app",
  feature: "email",
  summary: "Email transport (src/integrations/email.ts): console in development, SMTP via nodemailer",
  dependencies: { nodemailer: DEPENDENCY_VERSION_RANGES.nodemailer },
  env: () => [
    { name: "EMAIL_TRANSPORT", value: "console", comment: "console (logs only) or smtp" },
    { name: "EMAIL_FROM", value: "no-reply@localhost" },
    { name: "SMTP_HOST", value: "localhost" },
    { name: "SMTP_PORT", value: "1025" },
    { name: "SMTP_SECURE", value: "false" },
    { name: "SMTP_USER", value: "" },
    { name: "SMTP_PASSWORD", value: "", comment: "Issued by your SMTP provider; unused by the console transport and Mailpit" },
  ],
  configSection:
    `email: Object.freeze({ transport: text(config, "email_transport", "console"), from: text(config, "email_from", "no-reply@localhost"), smtpHost: text(config, "smtp_host", "localhost"), smtpPort: int(config, "smtp_port", 1025), smtpSecure: text(config, "smtp_secure", "false") === "true", smtpUser: text(config, "smtp_user", ""), smtpPassword: text(config, "smtp_password", "") }),`,
  integration: { file: "email.ts", exportName: "emailIntegration", source },
  nextSteps: () => [
    `Send with: import { email } from "./integrations/email.js"; await email().send({ to, subject, text });`,
  ],
};
