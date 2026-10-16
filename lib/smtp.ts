import nodemailer from "nodemailer";
import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import { AppError, demand } from "./errors";

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(address, prefix, "ipv4");

export const publicSmtpIPv4 = (address: string) =>
  isIP(address) === 4 && !blocked.check(address, "ipv4");

export type SmtpCredentials = {
  host: string;
  port: number;
  username: string;
  password: string;
  senderName: string;
};
export interface MailAdapter {
  verify(config: SmtpCredentials): Promise<void>;
  send(
    config: SmtpCredentials,
    message: { to: string; subject: string; text: string },
  ): Promise<void>;
}

async function transport(config: SmtpCredentials) {
  // Pin the validated public IPv4 address; TLS still verifies the original hostname.
  // No loopback/private SMTP, no unchecked DNS lookup by the transport, no plaintext mode.
  const addresses = await lookup(config.host, { family: 4, all: true });
  demand(
    addresses.length && addresses.every((a) => publicSmtpIPv4(a.address)),
    "El servidor SMTP debe resolver únicamente a direcciones IPv4 públicas.",
  );
  return nodemailer.createTransport({
    host: addresses[0].address,
    port: config.port,
    secure: config.port === 465,
    requireTLS: true,
    auth: { user: config.username, pass: config.password },
    tls: {
      servername: config.host,
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  });
}
export const smtpAdapter: MailAdapter = {
  async verify(config) {
    const client = await transport(config);
    try {
      await client.verify();
    } finally {
      client.close();
    }
  },
  async send(config, message) {
    const client = await transport(config);
    try {
      const result = await client.sendMail({
        from: { name: config.senderName, address: config.username },
        to: message.to,
        subject: message.subject,
        text: message.text,
      });
      demand(
        result.accepted.some(
          (value) => String(value).toLowerCase() === message.to.toLowerCase(),
        ),
        "El servidor SMTP no aceptó al destinatario.",
        502,
      );
    } finally {
      client.close();
    }
  },
};

export function safeMailError(error: unknown) {
  const code = (error as { code?: string })?.code;
  if (code === "EAUTH")
    return "El servidor rechazó el usuario o la contraseña del correo. Revisa las credenciales en Hostinger.";
  if (
    [
      "ESOCKET",
      "ECONNECTION",
      "ETIMEDOUT",
      "EDNS",
      "ENOTFOUND",
      "ECONNREFUSED",
    ].includes(code ?? "")
  )
    return "No se pudo conectar de forma segura al servidor SMTP. Revisa el servidor, puerto, certificado y las restricciones de salida del alojamiento.";
  if (code === "EENVELOPE")
    return "El servidor de correo rechazó el remitente o destinatario. Revisa la cuenta y sus límites de envío.";
  if (error instanceof AppError && error.message.startsWith("El servidor SMTP"))
    return error.message;
  return "No se pudo completar la operación de correo. Revisa la configuración y los límites del proveedor; no se reintentó automáticamente.";
}
