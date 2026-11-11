/** Returns the trimmed owner username, or throws when it is missing. */
export function readOwnerUsername(value: string | undefined): string {
  const username = value?.trim() ?? ''
  if (!username) {
    throw new Error(
      'VITE_OWNER_USERNAME is not set. Set it to the username whose reviews the site shows.',
    )
  }
  return username
}

/** The user whose reviews the site shows. */
export const OWNER_USERNAME = readOwnerUsername(
  import.meta.env.VITE_OWNER_USERNAME,
)
