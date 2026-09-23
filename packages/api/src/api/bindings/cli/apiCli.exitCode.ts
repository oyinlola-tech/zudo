/**
 * Exit codes returned by `runApiCli`, following BSD `sysexits.h` where a
 * code fits so shell scripts can branch on the kind of failure.
 */
export const APICliExitCode = Object.freeze({
  /** The operation succeeded. */
  OK: 0,
  /** The operation failed with a client error that has no closer code. */
  FAILURE: 1,
  /** Bad command line: unknown operation, malformed option (EX_USAGE). */
  USAGE: 64,
  /** Input failed validation (EX_DATAERR). */
  INVALID_INPUT: 65,
  /** Rate limited or unavailable; try again later (EX_UNAVAILABLE). */
  UNAVAILABLE: 69,
  /** Internal error (EX_SOFTWARE). */
  INTERNAL: 70,
  /** Timed out (EX_TEMPFAIL). */
  TIMEOUT: 75,
  /** Not authenticated or not permitted (EX_NOPERM). */
  PERMISSION: 77,
  /** Cancelled through the abort signal (128 + SIGINT). */
  CANCELLED: 130,
});

/** One of the {@link APICliExitCode} values. */
export type APICliExitCodeValue = (typeof APICliExitCode)[keyof typeof APICliExitCode];

/**
 * Maps a failed result's HTTP-style status to an exit code.
 */
export function apiCliExitCodeForStatus(status: number): APICliExitCodeValue {
  if (status === 400 || status === 422) return APICliExitCode.INVALID_INPUT;
  if (status === 401 || status === 403) return APICliExitCode.PERMISSION;
  if (status === 408 || status === 504) return APICliExitCode.TIMEOUT;
  if (status === 429 || status === 503) return APICliExitCode.UNAVAILABLE;
  if (status === 499) return APICliExitCode.CANCELLED;
  if (status >= 500) return APICliExitCode.INTERNAL;
  return APICliExitCode.FAILURE;
}
