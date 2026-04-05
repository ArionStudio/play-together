import { createAvatar } from "@dicebear/core"
import * as pixelArt from "@dicebear/pixel-art"

import { buildProfileAvatarSeed } from "@workspace/game-core"
import { cn } from "@workspace/ui/lib/utils"

const AVATAR_BACKGROUND_COLORS = [
  "d4f0ff",
  "d9f99d",
  "fde68a",
  "fecdd3",
  "ddd6fe",
  "fed7aa",
] as const

type ProfileAvatarProps = {
  avatarSeed?: string
  className?: string
  title?: string
  usernameTag: string
}

function createAvatarDataUri(seed: string) {
  return createAvatar(pixelArt, {
    seed,
    backgroundColor: [...AVATAR_BACKGROUND_COLORS],
    backgroundType: ["solid"],
    radius: 18,
    size: 64,
    scale: 90,
  }).toDataUri()
}

export function ProfileAvatar({
  avatarSeed,
  className,
  title,
  usernameTag,
}: ProfileAvatarProps) {
  const src = createAvatarDataUri(avatarSeed ?? buildProfileAvatarSeed(usernameTag))

  return (
    <img
      alt={title ?? `${usernameTag} avatar`}
      className={cn("rounded-lg bg-muted object-cover", className)}
      draggable={false}
      src={src}
      style={{ imageRendering: "pixelated" }}
      title={title}
    />
  )
}
