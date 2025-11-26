#!/usr/bin/env node
import { Effect } from "effect";
import { buildSyncProgram, parseArgs } from "./syncKnowledge.js";

const program = buildSyncProgram(parseArgs());

Effect.runSync(program);
