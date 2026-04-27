import { z } from "zod";

export const CommandActorSchema = z.object({
  userId: z.string(),
  tenantId: z.string(),
  source: z.enum(["human", "agent", "system"]),
});

export type CommandActor = z.infer<typeof CommandActorSchema>;

export const CommandEnvelopeSchema = z.object({
  idempotencyKey: z.string().optional(),
  name: z.string(),
  payload: z.record(z.unknown()),
  actor: CommandActorSchema,
});

export type CommandEnvelope = z.infer<typeof CommandEnvelopeSchema>;
