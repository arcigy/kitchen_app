import { evaluateAssistantSuite } from "../src/assistant/evaluationSuite";

const report = evaluateAssistantSuite();
console.log(JSON.stringify({
  ok: report.unsafeScenarios.length === 0,
  mode: "offline-contract-evaluation",
  ...report,
  note: "This deterministic suite spends no API credits. Run a separately approved capped live sample before treating model behaviour as verified."
}, null, 2));
process.exitCode = report.unsafeScenarios.length === 0 ? 0 : 1;
