/**
 * @zudojs/serialization — Serializer registry and factory.
 *
 * Central registry for named serializer instances and factory
 * functions for creating serializers by format.
 */

export { SerializerRegistry } from "./serializerRegistry.core.js";
export {
  createSerializer,
  createDefaultRegistry,
} from "./serializerRegistry.factory.js";
export type { CreateSerializerOptions } from "./serializerRegistry.factory.js";
