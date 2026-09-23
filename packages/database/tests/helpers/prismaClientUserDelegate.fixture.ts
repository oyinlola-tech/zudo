/**
 * Compile-only fixture: the model delegate that Prisma 7.10.0's
 * `prisma-client` generator emits for
 *
 *   model User { id String @id  email String @unique  name String  deletedAt DateTime? }
 *
 * copied from the generated `models/User.ts` and `internal/prismaNamespace.ts`
 * and trimmed to the methods and argument types `RepositoryDelegate` covers.
 * The method signatures, `SelectSubset`, `Prisma__UserClient` and the result
 * types are verbatim (they come from `@prisma/client/runtime/client`), so the
 * generic, `select`-dependent shapes that broke `new UserRepository(prisma.user)`
 * are reproduced exactly. Only filter/input types are simplified.
 */
import type * as runtime from "@prisma/client/runtime/client";

/** `NoResultExtensions` for a client without `$extends` result fields. */
type NoResultExtensions = {};
type GlobalOmitOptions = { omit: undefined };

type SelectAndInclude = { select: unknown; include: unknown };
type SelectAndOmit = { select: unknown; omit: unknown };

type SelectSubset<T, U> = {
  [key in keyof T]: key extends keyof U ? T[key] : never;
} & (T extends SelectAndInclude
  ? "Please either choose `select` or `include`."
  : T extends SelectAndOmit
    ? "Please either choose `select` or `omit`."
    : {});

type Subset<T, U> = { [key in keyof T]: key extends keyof U ? T[key] : never };

type PrismaPromise<T> = runtime.Types.Public.PrismaPromise<T>;
type BatchPayload = { count: number };

export type $UserPayload = {
  name: "User";
  objects: {};
  scalars: runtime.Types.Extensions.GetPayloadResult<
    { id: string; email: string; name: string; deletedAt: Date | null },
    NoResultExtensions
  >;
  composites: {};
};

type UserSelect = runtime.Types.Extensions.GetSelect<
  { id?: boolean; email?: boolean; name?: boolean; deletedAt?: boolean },
  NoResultExtensions
>;
type UserOmit = runtime.Types.Extensions.GetOmit<
  "id" | "email" | "name" | "deletedAt",
  NoResultExtensions
>;
type StringFilter = { equals?: string; in?: string[]; contains?: string };
type UserWhereInput = {
  AND?: UserWhereInput | UserWhereInput[];
  OR?: UserWhereInput[];
  NOT?: UserWhereInput | UserWhereInput[];
  id?: StringFilter | string;
  email?: StringFilter | string;
  name?: StringFilter | string;
  deletedAt?: { equals?: Date | null; not?: Date | null } | Date | string | null;
};
type UserWhereUniqueInput = { id?: string; email?: string } & UserWhereInput;
type UserOrderBy = { id?: "asc" | "desc"; email?: "asc" | "desc" };
type UserCreateInput = { id?: string; email: string; name: string; deletedAt?: Date | null };
type UserUpdateInput = { email?: string; name?: string; deletedAt?: Date | null };

type Read = { select?: UserSelect | null; omit?: UserOmit | null };
type UserFindUniqueArgs = Read & { where: UserWhereUniqueInput };
type UserFindManyArgs = Read & {
  where?: UserWhereInput;
  orderBy?: UserOrderBy | UserOrderBy[];
  cursor?: UserWhereUniqueInput;
  take?: number;
  skip?: number;
  distinct?: ("id" | "email" | "name" | "deletedAt")[];
};
type UserFindFirstArgs = UserFindManyArgs;
type UserCreateArgs = Read & { data: UserCreateInput };
type UserUpdateArgs = Read & { data: UserUpdateInput; where: UserWhereUniqueInput };
type UserDeleteArgs = Read & { where: UserWhereUniqueInput };
type UserUpsertArgs = Read & {
  where: UserWhereUniqueInput;
  create: UserCreateInput;
  update: UserUpdateInput;
};
type UserCreateManyArgs = { data: UserCreateInput | UserCreateInput[]; skipDuplicates?: boolean };
type UserDeleteManyArgs = { where?: UserWhereInput; limit?: number };
type UserCountArgs = Omit<UserFindManyArgs, "select" | "omit" | "distinct"> & {
  select?: { _all?: true; id?: true } | true;
};

type Result<T, Op extends runtime.Operation> = runtime.Types.Result.GetResult<
  $UserPayload,
  T,
  Op,
  GlobalOmitOptions
>;

export interface Prisma__UserClient<T, Null = never> extends PrismaPromise<T> {
  readonly [Symbol.toStringTag]: "PrismaPromise";
  then<TResult1 = T, TResult2 = never>(
    onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | undefined | null,
  ): runtime.Types.Utils.JsPromise<TResult1 | TResult2>;
  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | undefined | null,
  ): runtime.Types.Utils.JsPromise<T | TResult>;
  finally(onfinally?: (() => void) | undefined | null): runtime.Types.Utils.JsPromise<T>;
}

export interface UserDelegate {
  findUnique<T extends UserFindUniqueArgs>(args: SelectSubset<T, UserFindUniqueArgs>): Prisma__UserClient<Result<T, "findUnique"> | null, null>;
  findFirst<T extends UserFindFirstArgs>(args?: SelectSubset<T, UserFindFirstArgs>): Prisma__UserClient<Result<T, "findFirst"> | null, null>;
  findMany<T extends UserFindManyArgs>(args?: SelectSubset<T, UserFindManyArgs>): PrismaPromise<Result<T, "findMany">>;
  create<T extends UserCreateArgs>(args: SelectSubset<T, UserCreateArgs>): Prisma__UserClient<Result<T, "create">>;
  createMany<T extends UserCreateManyArgs>(args?: SelectSubset<T, UserCreateManyArgs>): PrismaPromise<BatchPayload>;
  delete<T extends UserDeleteArgs>(args: SelectSubset<T, UserDeleteArgs>): Prisma__UserClient<Result<T, "delete">>;
  update<T extends UserUpdateArgs>(args: SelectSubset<T, UserUpdateArgs>): Prisma__UserClient<Result<T, "update">>;
  deleteMany<T extends UserDeleteManyArgs>(args?: SelectSubset<T, UserDeleteManyArgs>): PrismaPromise<BatchPayload>;
  upsert<T extends UserUpsertArgs>(args: SelectSubset<T, UserUpsertArgs>): Prisma__UserClient<Result<T, "upsert">>;
  count<T extends UserCountArgs>(
    args?: Subset<T, UserCountArgs>,
  ): PrismaPromise<
    T extends { select: unknown }
      ? T["select"] extends true
        ? number
        : { _all: number; id: number }
      : number
  >;
}
