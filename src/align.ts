import {
  DCRGraphPP,
  Trace,
  Alignment,
  DCRGraph,
  Event,
  Marking,
  LabelDCRPP,
  Label,
  CostFun,
} from "../types";
import { copySet, copyMarking } from "../src/utility";

// Mutates graph's marking
const execute = (event: Event, graph: DCRGraphPP) => {
  if (graph.conditions.has(event)) graph.marking.executed.add(event);
  graph.marking.pending.delete(event);
  // Add sink of all response relations to pending
  for (const rEvent of graph.responseTo[event]) {
    graph.marking.pending.add(rEvent);
  }
  // Remove sink of all response relations from included
  for (const eEvent of graph.excludesTo[event]) {
    graph.marking.included.delete(eEvent);
  }
  // Add sink of all include relations to included
  for (const iEvent of graph.includesTo[event]) {
    graph.marking.included.add(iEvent);
  }
};

const isAccepting = (graph: DCRGraph): boolean => {
  // Graph is accepting if the intersections between pending and included events is empty
  return (
    copySet(graph.marking.pending).intersect(graph.marking.included).size === 0
  );
};

const isEnabled = (event: Event, graph: DCRGraph): boolean => {
  if (!graph.marking.included.has(event)) {
    return false;
  }
  for (const cEvent of graph.conditionsFor[event]) {
    // If an event conditioning for event is included and not executed
    if (
      graph.marking.included.has(cEvent) &&
      !graph.marking.executed.has(cEvent)
    ) {
      return false;
    }
  }
  for (const mEvent of graph.milestonesFor[event]) {
    // If an event milestoning for event is included and executed
    if (
      graph.marking.included.has(mEvent) &&
      graph.marking.pending.has(mEvent)
    ) {
      return false;
    }
  }
  return true;
};

const getEnabled = (graph: DCRGraph): Set<Event> => {
  const retSet = copySet(graph.events);
  for (const event of graph.events) {
    if (!graph.marking.included.has(event)) retSet.delete(event);
    for (const otherEvent of graph.conditionsFor[event]) {
      if (
        graph.marking.included.has(otherEvent) &&
        !graph.marking.executed.has(otherEvent)
      )
        retSet.delete(event);
    }
  }
  return retSet;
};

// Executes fun without permanent side-effects to the graphs marking
const newGraphEnv = <T>(graph: DCRGraphPP, fun: () => T): T => {
  const oldMarking = graph.marking;
  graph.marking = copyMarking(graph.marking);
  const retval = fun();
  graph.marking = oldMarking;
  return retval;
};

// Converts a marking to a uniquely identifying string (naively)
const stateToStr = (marking: Marking): string => {
  let retval = "";
  for (const setI in marking) {
    retval += Array.from(marking[setI as keyof Marking])
      .sort()
      .join();
    retval += ";";
  }
  return retval;
};

export const defaultAlignCost: CostFun = (action, target) => {
  switch (action) {
    case "consume":
      return 0;
    case "model-skip":
      return 1;
    case "trace-skip":
      return 1;
  }
}

export default (trace: Trace, graph: LabelDCRPP, costFun: CostFun, toDepth: number = Infinity): Alignment => {
  // Setup global variables
  const alignCost = costFun;
  const alignState: { [traceLen: number]: { [state: string]: number } } = {
    0: {}
  };

  let maxCost: number;
  const alignTraceLabel = (
    trace: Trace,
    graph: LabelDCRPP,
    curCost: number = 0,
    curDepth: number = 0,
  ): Alignment => {
    // Futile to continue search along this path
    if (curCost >= maxCost) return { cost: Infinity, trace: [] };
    if (curDepth >= toDepth) return { cost: Infinity, trace: [] };

    const stateStr = stateToStr(graph.marking);
    const traceLen = trace.length;

    // Already visisted state with better cost, return to avoid unnecessary computations
    const visitedCost = alignState[traceLen][stateStr];

    if (visitedCost !== undefined && visitedCost <= curCost)
      return { cost: Infinity, trace: [] };
    alignState[traceLen][stateStr] = curCost;

    const isAccept = isAccepting(graph);

    // Found alignment
    if (isAccept && traceLen == 0) return { cost: curCost, trace: [] };

    // No alignment found and should continue search.
    // This gives 3 cases: consume, model-skip & log-skip
    // Ordering is IMPORTANT. Since this is depth-first, do consumes and trace-skips first when possible.
    // This creates a bound for the very exponential model-skips by setting max-cost as quickly as possible.
    let bestAlignment: Alignment = { cost: Infinity, trace: [] };

    // Consume
    // Event is enabled, execute it and remove it from trace
    if (traceLen > 0) {
      for (const event of graph.labelMapInv[trace[0]]) {
        if (isEnabled(event, graph)) {
          const alignment = newGraphEnv(graph, () => {
            execute(event, graph);
            return alignTraceLabel(
              trace.slice(1),
              graph,
              curCost + alignCost("consume", event),
              ++curDepth
            );
          });
          if (alignment.cost < bestAlignment.cost) {
            maxCost = alignment.cost;
            alignment.trace.unshift(event);
            bestAlignment = alignment;
          }
        }
      }
    }

    // Trace-skip
    // Skip event in trace
    if (traceLen > 0) {
      const alignment = alignTraceLabel(
        trace.slice(1),
        graph,
        curCost + alignCost("trace-skip", trace[0]),
        ++curDepth
      );
      if (alignment.cost < bestAlignment.cost) {
        maxCost = alignment.cost;
        bestAlignment = alignment;
      }
    }

    // Model-skip
    // Execute any enabled event without modifying trace. Highly exponential, therefore last
    const enabled = getEnabled(graph);
    for (const event of enabled) {
      const alignment = newGraphEnv(graph, () => {
        execute(event, graph);
        return alignTraceLabel(trace, graph, curCost + alignCost("model-skip", event), ++curDepth);
      });
      if (alignment.cost < bestAlignment.cost) {
        alignment.trace.unshift(event);
        maxCost = alignment.cost;
        bestAlignment = alignment;
      }
    }

    return bestAlignment;
  };

  maxCost = toDepth !== Infinity ? toDepth : trace.map(event => costFun("trace-skip", event)).reduce((acc, cur) => acc + cur, 0) + alignTraceLabel([], graph).cost;

  for (let i = 0; i <= trace.length; i++) {
    alignState[i] = {};
  }

  return alignTraceLabel(trace, graph, 0);
};