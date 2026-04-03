import {
  MINESWEEPER_RANKED_RULESETS,
  createSoloMinesweeperRuleset,
  findMinesweeperPresetBoardKey,
  type BoardConfig,
  type PresetBoardKey,
  type RulesetConfig,
} from "@workspace/game-contracts"
import {
  buildBoardKey,
  buildLeaderboardCategoryKey,
  buildRulesetKey,
  serializeLeaderboardCategoryKey,
} from "@workspace/game-core"
import { query } from "./_generated/server"

const rankedPresetKeys = ["beginner", "intermediate", "expert"] as const

type RankedPresetKey = (typeof rankedPresetKeys)[number]

function isRankedPresetKey(value: string): value is RankedPresetKey {
  return rankedPresetKeys.includes(value as RankedPresetKey)
}

export function resolveSoloMinesweeperSelection(args: {
  presetKey?: PresetBoardKey | null
  boardConfig?: BoardConfig | null
}) {
  let ruleset: RulesetConfig
  let presetKey: PresetBoardKey
  let title: string

  if (args.presetKey && args.presetKey !== "custom" && isRankedPresetKey(args.presetKey)) {
    presetKey = args.presetKey
    ruleset = MINESWEEPER_RANKED_RULESETS[presetKey]
    title = `${presetKey[0]!.toUpperCase()}${presetKey.slice(1)} ranked`
  } else {
    const inferredPreset = args.boardConfig
      ? findMinesweeperPresetBoardKey(args.boardConfig)
      : null

    if (inferredPreset && args.presetKey !== "custom") {
      presetKey = inferredPreset
      ruleset = MINESWEEPER_RANKED_RULESETS[inferredPreset]
      title = `${inferredPreset[0]!.toUpperCase()}${inferredPreset.slice(1)} ranked`
    } else {
      if (!args.boardConfig) {
        throw new Error("Custom solo matches require a board configuration.")
      }

      presetKey = "custom"
      ruleset = createSoloMinesweeperRuleset(args.boardConfig, {
        ranked: false,
        firstClickBehavior: "safe_zero",
      })
      title = "Custom practice"
    }
  }

  const boardKey = buildBoardKey(ruleset.boardConfig)
  const rulesetKey = buildRulesetKey(ruleset)
  const categoryKey = serializeLeaderboardCategoryKey(
    buildLeaderboardCategoryKey(ruleset)
  )

  return {
    presetKey,
    title,
    ruleset,
    rulesetKey,
    boardKey,
    categoryKey,
  }
}

function buildCatalog() {
  return [
    ...rankedPresetKeys.map((presetKey) => {
      const selection = resolveSoloMinesweeperSelection({ presetKey })

      return {
        presetKey,
        title: selection.title,
        boardConfig: selection.ruleset.boardConfig,
        ranked: true,
        boardKey: selection.boardKey,
        rulesetKey: selection.rulesetKey,
        categoryKey: selection.categoryKey,
      }
    }),
    {
      presetKey: "custom" as const,
      title: "Custom practice",
      boardConfig: null,
      ranked: false,
      boardKey: null,
      rulesetKey: null,
      categoryKey: null,
    },
  ]
}

export const catalog = query({
  args: {},
  handler: async () => buildCatalog(),
})

export const leaderboardCatalog = query({
  args: {},
  handler: async () =>
    buildCatalog().filter(
      (entry) => entry.ranked && typeof entry.categoryKey === "string"
    ),
})
