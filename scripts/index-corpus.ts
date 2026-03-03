import { indexCorpus } from "@/server/ingestion/index-corpus"

await indexCorpus()
console.log("Corpus indexing completed")
