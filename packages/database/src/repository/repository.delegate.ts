/**
 * Model delegate accepted by `BaseRepository`: any object exposing
 * Prisma-style CRUD methods, including a generated Prisma model delegate
 * such as `prisma.user`.
 *
 * The parameters are declared loosely on purpose, the same way
 * `PrismaClientLike.$transaction` is. A generated delegate's methods are
 * generic (`findFirst<T extends UserFindFirstArgs>(args?: SelectSubset<T,
 * …>)`) and their argument types (`select?: UserSelect | null`,
 * `where?: UserWhereInput`) cannot be assigned from a single hand-written
 * argument shape, so a real client failed to type-check against the
 * previous signatures and needed a cast. Any argument list is accepted
 * here; the return types are still checked, so a delegate whose rows do not
 * match `TEntity` is rejected. The arguments the repository actually passes
 * are described by {@link RepositoryDelegateOperations}.
 */
export interface RepositoryDelegate<
  TEntity,
  TId = string,
  TCreateInput = Partial<TEntity>,
  TUpdateInput = Partial<TEntity>,
  TWhereInput = unknown,
> {
  findUnique(...args: never[]): Promise<TEntity | null>;
  findFirst(...args: never[]): Promise<TEntity | null>;
  findMany(...args: never[]): Promise<readonly TEntity[]>;
  create(...args: never[]): Promise<TEntity>;
  update(...args: never[]): Promise<TEntity>;
  delete(...args: never[]): Promise<TEntity>;
  count(...args: never[]): Promise<number>;
  upsert?(...args: never[]): Promise<TEntity>;
  createMany?(...args: never[]): Promise<{ count: number }>;
  deleteMany?(...args: never[]): Promise<{ count: number }>;
}

/**
 * The calls `BaseRepository` makes on its delegate, with the arguments it
 * passes. This is the type of `BaseRepository#delegate`, so subclasses can
 * call the delegate directly.
 */
export interface RepositoryDelegateOperations<
  TEntity,
  TId = string,
  TCreateInput = Partial<TEntity>,
  TUpdateInput = Partial<TEntity>,
  TWhereInput = unknown,
> {
  findUnique(args: { where: unknown }): Promise<TEntity | null>;

  findFirst(args: {
    where?: TWhereInput;
    orderBy?: unknown;
    select?: unknown;
  }): Promise<TEntity | null>;

  findMany(args?: {
    where?: TWhereInput;
    skip?: number;
    take?: number;
    orderBy?: unknown;
    select?: unknown;
    include?: unknown;
  }): Promise<readonly TEntity[]>;

  create(args: { data: TCreateInput }): Promise<TEntity>;

  update(args: { where: unknown; data: TUpdateInput }): Promise<TEntity>;

  delete(args: { where: unknown }): Promise<TEntity>;

  count(args?: { where?: TWhereInput }): Promise<number>;

  upsert?(args: {
    where: unknown;
    create: TCreateInput;
    update: TUpdateInput;
  }): Promise<TEntity>;

  createMany?(args: {
    data: readonly TCreateInput[];
  }): Promise<{ count: number }>;

  deleteMany?(args: { where?: TWhereInput }): Promise<{ count: number }>;
}

/**
 * Views a delegate through the calls the repository makes on it.
 *
 * The assertion is the narrowing that `RepositoryDelegate`'s loose
 * parameters defer: the repository only ever passes the Prisma argument
 * shapes described by `RepositoryDelegateOperations`, which every generated
 * model delegate accepts at runtime.
 */
export function toDelegateOperations<
  TEntity,
  TId,
  TCreateInput,
  TUpdateInput,
  TWhereInput,
>(
  delegate: RepositoryDelegate<
    TEntity,
    TId,
    TCreateInput,
    TUpdateInput,
    TWhereInput
  >,
): RepositoryDelegateOperations<
  TEntity,
  TId,
  TCreateInput,
  TUpdateInput,
  TWhereInput
> {
  return delegate as RepositoryDelegateOperations<
    TEntity,
    TId,
    TCreateInput,
    TUpdateInput,
    TWhereInput
  >;
}
