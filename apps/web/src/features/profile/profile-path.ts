export function buildProfilePath(usernameTag: string) {
  return `/profile/${encodeURIComponent(usernameTag)}`
}
