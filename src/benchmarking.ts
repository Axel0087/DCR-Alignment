import { ClassifiedTraces, DCRGraphPP, EventLog, Metric } from "../types";
import { parseClassifiedLog, parseLog } from "./fsInteraction";

import fs from "fs";

export const pdcScore: Metric = (tp, fp, tn, fn) => {
    try {
        const posAcc = tp / (tp + fn);
        const negAcc = tn / (tn + fp);
        const res = (2 * posAcc * negAcc) / (posAcc + negAcc);
        return res;
    } catch (e) {
        return 0;
    }
};

export const benchmarkDatasetAlign = (
    modelGeneration: (trainingLog: EventLog) => DCRGraphPP,
    trainingToRest: (trainingPath: string) => string,
    classify: (model: DCRGraphPP, testLog: EventLog, baseLog: EventLog) => ClassifiedTraces,
    metric: Metric,
    paths: {
        trainingDir: string;
        testDir: string;
        baseDir: string;
        groundTruthDir: string;
        exportPath?: string;
    },
    preprocessing?: (trainingLog: EventLog) => EventLog,
): Array<number> => {
    let data = "log_name;tp;fp;tn;fn\n";
    const scores = [];
    for (const elem of fs.readdirSync(paths.trainingDir)) {
        if (elem.endsWith(".xes")) {
            console.log("Processing: " + elem);
            const trainingLogRaw = parseLog(paths.trainingDir + elem);
            const trainingLog = preprocessing ? preprocessing(trainingLogRaw) : trainingLogRaw;
            const model = modelGeneration(trainingLog);

            const elemToComp = trainingToRest(elem);
            const testLog = parseLog(paths.testDir + elemToComp);
            const baseLog = parseLog(paths.baseDir + elemToComp);

            const cL = classify(model, testLog, baseLog);
            const gtL = parseClassifiedLog(paths.groundTruthDir + elemToComp);

            let tp = 0;
            let fp = 0;
            let fn = 0;
            let tn = 0;
            for (const i in cL) {
                if (cL[i]) {
                    if (gtL[i]) {
                        tp++;
                    } else {
                        fp++;
                    }
                } else {
                    if (gtL[i]) {
                        fn++;
                    } else {
                        tn++;
                    }
                }
            }
            const val = metric(tp, fp, tn, fn);
            console.log(val);
            scores.push(val);

            if (paths.exportPath) data += `${elem};${tp};${fp};${tn};${fn} \n`;
        }
    }
    if (paths.exportPath) fs.writeFileSync(paths.exportPath, data);
    return scores;
}