import { Context, Layer } from "effect"

import { env } from "@/lib/env"

export class RuntimeConfig extends Context.Tag("RuntimeConfig")<RuntimeConfig, typeof env>() {}

export const RuntimeConfigLive = Layer.succeed(RuntimeConfig, env)
