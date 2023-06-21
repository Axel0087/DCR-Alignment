import fs from "fs";
import { benchmarkDatasetAlign, pdcScore } from "./src/benchmarking";
import { ClassifiedTraces, DCRGraphPP, EventLog } from "./types";
import { DCRtoLabelDCR, avg, graphToGraphPP, relationCount, timer } from "./src/utility";
import mineFromAbstraction, { abstractLog } from "./src/mining";

import align, { defaultAlignCost } from "./src/align";

type Data = Array<{
    cost: number,
    traceLen: number,
    time: number,
    size: number
}>;

export default () => {
    const discoverTimes: Array<number> = [];
    const alignPerfectTimes: Array<number> = [];
    const alignNotPerfectTimes: Array<number> = [];

    const data: Data = []

    const modelGeneration = (log: EventLog) => {
        const t = timer();
        const abs = abstractLog(log);
        const graph = mineFromAbstraction(abs);
        discoverTimes.push(t.stop());
        return graphToGraphPP(graph);
    }

    const classify = (model: DCRGraphPP, testLog: EventLog, baseLog: EventLog) => {

        const labelModel = DCRtoLabelDCR(model);

        const cL: ClassifiedTraces = {};
        for (const traceId in testLog.traces) {
            const testTrace = testLog.traces[traceId];
            const baseTrace = baseLog.traces[traceId];

            const modelSize = relationCount(model);

            const tb = timer();
            const baseAlignment = align(baseTrace, labelModel, defaultAlignCost, Infinity);
            const baseCost = baseAlignment.cost;
            const timeb = tb.stop();
            (baseCost === 0 ? alignPerfectTimes : alignNotPerfectTimes).push(timeb);

            data.push({ cost: baseCost, traceLen: baseTrace.length, time: timeb, size: modelSize })

            if (baseCost === 0) {
                cL[traceId] = false;
                continue;
            }
            const tt = timer();
            const testAlignment = align(testTrace, labelModel, defaultAlignCost, Infinity);
            const testCost = testAlignment.cost;
            const timet = tt.stop();
            (testCost === 0 ? alignPerfectTimes : alignNotPerfectTimes).push(timet);

            data.push({ cost: testCost, traceLen: testTrace.length, time: timet, size: modelSize })

            if (testCost === Infinity || baseCost === Infinity) console.log("WARNIIIIIIIING!");
            cL[traceId] = testCost < baseCost;
        }
        return cL;
    }

    const trainingDir22 = "./data/PDC2022/TrainingLogs/";
    const testDir22 = "./data/PDC2022/TestLogs/";
    const baseDir22 = "./data/PDC2022/BaseLogs/";
    const gtDir22 = "./data/PDC2022/GroundTruthLogs/";

    const trainingToRest = (fn: string) => fn.slice(0, -5) + ".xes";

    const scores = benchmarkDatasetAlign(modelGeneration, trainingToRest, classify, pdcScore, {
        trainingDir: trainingDir22,
        testDir: testDir22,
        groundTruthDir: gtDir22,
        baseDir: baseDir22
    });

    console.log("Avg Score: " + avg(scores));
    console.log("Avg Discover time: " + avg(discoverTimes));
    console.log("Avg Alignment times for perfect fitting: " + avg(alignPerfectTimes));
    console.log("Avg Alignment times for rest: " + avg(alignNotPerfectTimes));
}