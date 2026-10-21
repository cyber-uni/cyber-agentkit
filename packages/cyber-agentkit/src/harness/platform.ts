/**
 * An operating-system platform, spelled as `process.platform` reports it.
 *
 * The queries branch on `darwin`, `linux`, and `win32`; every other platform follows the POSIX
 * (`linux`) layout. The union lists every value Node.js reports, so `process.platform` is assignable
 * to it, but it is declared here rather than as `NodeJS.Platform` so the published types do not
 * depend on `@types/node`.
 */
export type Platform =
	| 'aix'
	| 'android'
	| 'cygwin'
	| 'darwin'
	| 'freebsd'
	| 'haiku'
	| 'linux'
	| 'netbsd'
	| 'openbsd'
	| 'sunos'
	| 'win32'
