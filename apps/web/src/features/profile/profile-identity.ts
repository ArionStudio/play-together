export function normalizeUsernameInput(value: string) {
  return value.replace(/#/g, "").replace(/\s+/g, " ").trimStart()
}

export function normalizeTagInput(value: string) {
  return value.replace(/#/g, "").replace(/\s+/g, "").trim()
}

export function validateUsernameInput(value: string) {
  const normalized = value.trim()

  if (normalized.length < 3) {
    return "Username must be at least 3 characters."
  }

  if (normalized.length > 20) {
    return "Username must be at most 20 characters."
  }

  if (normalized.includes("#")) {
    return "Enter only the username. The #tag is assigned on the server."
  }

  if (!/^[A-Za-z0-9]+(?:[ _][A-Za-z0-9]+)*$/.test(normalized)) {
    return "Use letters, numbers, single spaces, and single underscores only."
  }

  return null
}

export function validateTagInput(value: string) {
  const normalized = value.trim()

  if (normalized.length < 2) {
    return "Tag must be at least 2 characters."
  }

  if (normalized.length > 12) {
    return "Tag must be at most 12 characters."
  }

  if (!/^[A-Za-z0-9_]+$/.test(normalized)) {
    return "Tag may use letters, numbers, and underscores only."
  }

  return null
}
