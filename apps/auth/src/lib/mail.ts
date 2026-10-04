import nodemailer from "nodemailer";
import { publicPlatformSettings } from "./platform";
export const testOutbox: { to: string; subject: string; text: string }[] = [];
export async function sendAuthMail(message: {
  to: string;
  subject: string;
  text: string;
}) {
  if (
    process.env.AUTH_TEST_MAIL === "true" &&
    process.env.NODE_ENV !== "production"
  ) {
    testOutbox.push(message);
    return;
  }
  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS
  )
    throw Error("Authentication email transport is not configured");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 465),
    secure: process.env.SMTP_PORT !== "587",
    requireTLS: process.env.SMTP_PORT === "587",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    disableFileAccess: true,
    disableUrlAccess: true,
    connectionTimeout: 10000,
    socketTimeout: 15000,
  });
  const platform = await publicPlatformSettings();
  await transport.sendMail({
    ...message,
    from: {
      name: platform.name,
      address: process.env.SMTP_FROM || "noreply@webdock.dev",
    },
    replyTo: platform.supportEmail,
  });
}
