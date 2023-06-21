import alignTrace from "./align";
import { AlignAction, CostFun, Test, Event, LabelDCRPP, Label } from "../types";

const getCostFun = (context: Set<Event>, labelMap: { [e: Event]: Label }): CostFun => {
    return (action: AlignAction, target: Event) => {
        switch (action) {
            case "consume": return 0;
            case "model-skip": {
                if (context.has(labelMap[target])) {
                    return Infinity;
                } else {
                    return 0;
                }
            };
            case "trace-skip": return Infinity;
        }

    }
}

export default (test: Test, model: LabelDCRPP, maxDepth: number): boolean => {
    const costFun = getCostFun(test.context, model.labelMap);
    const alignment = alignTrace(test.trace, model, costFun, maxDepth)
    const cost = alignment.cost;
    console.log("Trace: " + alignment.trace.map((e) => model.labelMap[e]));
    if (test.polarity === "+") {
        return (cost !== Infinity)
    } else {
        return (cost === Infinity)
    }
}