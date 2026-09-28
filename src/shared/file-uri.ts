/** A file:// URI for a local path, in the shape a paste target expects.
 *
 * Clipboard and drag targets read `text/uri-list`, which is percent-encoded
 * and CRLF terminated (RFC 2483). Spaces and `#` are the ones that bite: a
 * recording named "Team Standup.mp4" pasted as a bare path silently becomes two
 * files in some receivers. */
export function fileUri(path: string): string {
  const encoded = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')
  return `file://${encoded}`
}

/** The clipboard payload for one file: a URI list is always CRLF terminated. */
export function uriList(paths: string[]): string {
  return paths.map(fileUri).map((uri) => `${uri}\r\n`).join('')
}
