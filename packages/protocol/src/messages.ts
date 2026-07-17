import { z } from "zod";

export const SESSION_STATUS = z.enum(["starting", "live", "tunnel_down", "ended"]);
export type SessionStatus = z.infer<typeof SESSION_STATUS>;

export const ClientMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("auth"),
    pairingToken: z.string().optional(),
    sessionToken: z.string().optional(),
    cols: z.number().int().positive().optional(),
    rows: z.number().int().positive().optional(),
  }),
  z.object({ type: z.literal("input"), data: z.string() }),
  z.object({ type: z.literal("ping"), sequence: z.number().int() }),
]);

export type ClientMessage = z.infer<typeof ClientMessage>;

export const ServerMessage = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("authed"),
    clientId: z.string(),
    sessionToken: z.string(),
    cols: z.number().int().positive(),
    rows: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("snapshot"),
    data: z.string(),
    cols: z.number().int().positive(),
    rows: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("resize"),
    cols: z.number().int().positive(),
    rows: z.number().int().positive(),
  }),
  z.object({ type: z.literal("status"), status: SESSION_STATUS }),
  z.object({
    type: z.literal("ended"),
    exitCode: z.number().int().nullable(),
    signal: z.string().nullable(),
  }),
  z.object({ type: z.literal("pong"), sequence: z.number().int() }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
]);

export type ServerMessage = z.infer<typeof ServerMessage>;

export const BINARY_OUTPUT_MARKER = 0x01;

export function isClientMessage(value: unknown): value is ClientMessage {
  return ClientMessage.safeParse(value).success;
}

export function parseClientMessage(value: unknown): ClientMessage | null {
  const result = ClientMessage.safeParse(value);
  return result.success ? result.data : null;
}

export function parseServerMessage(value: unknown): ServerMessage | null {
  const result = ServerMessage.safeParse(value);
  return result.success ? result.data : null;
}
