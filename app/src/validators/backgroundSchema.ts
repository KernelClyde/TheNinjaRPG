import { z } from "zod";

export const BgSchemaValidator = z.object({
  ocean: z.string().url(),
  ice: z.string().url(),
  dessert: z.string().url(),
  ground: z.string().url(),
  arena: z.string().url(),
  default: z.string().url(),
});

export type ZodBgSchemaType = z.infer<typeof BgSchemaValidator>;

export const BackgroundSchemaValidator = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(191),
  description: z.string().min(1).max(191),
  isActive: z.boolean().default(false),
  schema: BgSchemaValidator,
  createdAt: z.coerce.date().optional(),
  updatedAt: z.coerce.date().optional(),
});

export type ZodBackgroundSchemaType = z.infer<typeof BackgroundSchemaValidator>;

export const BackgroundSchemaPartialValidator = BackgroundSchemaValidator.partial();

export type BackgroundSchemaPartial = z.infer<typeof BackgroundSchemaPartialValidator>;