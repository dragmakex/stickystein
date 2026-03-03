export interface EmbeddingProvider {
  readonly name: string
  readonly dimensions: number
  embedTexts(texts: ReadonlyArray<string>): Promise<ReadonlyArray<ReadonlyArray<number>>>
}
