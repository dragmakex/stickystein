import { Layer } from "effect"

import { RuntimeConfigLive } from "@/server/app/runtime"

export const AppLayer = Layer.mergeAll(RuntimeConfigLive)
