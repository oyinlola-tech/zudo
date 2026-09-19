/** Branded type for enrollment identifiers. */
export type EnrollmentId = string & { readonly __brand: "EnrollmentId" };

/** Branded type for student identifiers. */
export type StudentId = string & { readonly __brand: "StudentId" };

/** Branded type for course identifiers. */
export type CourseId = string & { readonly __brand: "CourseId" };

/**
 * Creates a branded EnrollmentId.
 * @param id - The raw string identifier.
 * @returns A branded EnrollmentId.
 */
export function createEnrollmentId(id: string): EnrollmentId {
  return id as EnrollmentId;
}

/**
 * Creates a branded StudentId.
 * @param id - The raw string identifier.
 * @returns A branded StudentId.
 */
export function createStudentId(id: string): StudentId {
  return id as StudentId;
}

/**
 * Creates a branded CourseId.
 * @param id - The raw string identifier.
 * @returns A branded CourseId.
 */
export function createCourseId(id: string): CourseId {
  return id as CourseId;
}
