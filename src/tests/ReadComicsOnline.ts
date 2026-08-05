import { type TestLogger } from "@paperback/types";

import { ReadComicsOnline } from "../ReadComicsOnline/main.js";
import sourceInfo from "../ReadComicsOnline/pbconfig.js";
import { registerDefaultTests, TestSuite } from "./suite.js";

export async function runTests(logger: TestLogger) {
  const suite = new TestSuite("ReadComicsOnline tests", logger);
  registerDefaultTests(suite, ReadComicsOnline, sourceInfo);

  await suite.run();
}
