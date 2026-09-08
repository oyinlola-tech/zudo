/**
 * User validation schemas.
 *
 * Uses Zod for schema definition and @zudojs/validation for parsing.
 */
import { z } from "zod";
export const CreateUserSchema = z.object({
    name: z.string().min(2).max(100),
    email: z.string().email(),
});
//# sourceMappingURL=users.schema.js.map