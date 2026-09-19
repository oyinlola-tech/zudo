/** Name of the enrollment service application. */
export const APP_NAME = "campusflow-enrollment" as const;

/** Version of the enrollment service. */
export const APP_VERSION = "0.1.0" as const;

/** Default page size for list queries. */
export const DEFAULT_PAGE_SIZE = 20 as const;

/** Maximum allowed page size for list queries. */
export const MAX_PAGE_SIZE = 100 as const;

/** Maximum number of courses a single student can be enrolled in concurrently. */
export const MAX_ENROLLMENTS_PER_STUDENT = 10 as const;
