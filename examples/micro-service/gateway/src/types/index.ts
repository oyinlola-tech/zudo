export type UserId = string & { readonly __brand: "UserId" };

export function createUserId(id: string): UserId {
  return id as UserId;
}

export function isValidUserId(id: string): id is UserId {
  return typeof id === "string" && id.length > 0;
}
