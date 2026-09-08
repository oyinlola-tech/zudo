/**
 * User validation schemas.
 *
 * Uses Zod for schema definition and @zudojs/validation for parsing.
 */
import { z } from "zod";
export declare const CreateUserSchema: z.ZodObject<{
    name: z.ZodString;
    email: z.ZodString;
}, z.core.$strip>;
export type CreateUserSchemaInput = z.infer<typeof CreateUserSchema>;
//# sourceMappingURL=users.schema.d.ts.map