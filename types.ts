// -----------------------------------------------------------
// -------------------- Extended Set Type --------------------
// -----------------------------------------------------------

declare global {
  interface Set<T> {
    union(b: Set<T>): Set<T>;
    intersect(b: Set<T>): Set<T>;
    difference(b: Set<T>): Set<T>;
  }
}

// -----------------------------------------------------------
// ------------------------ Alignment ------------------------
// -----------------------------------------------------------

export type AlignAction = "consume" | "model-skip" | "trace-skip";

export type CostFun = (action: AlignAction, target: Event) => number;

export type Alignment = { cost: number; trace: Trace };

export type Test = {
  polarity: "+" | "-",
  trace: Trace,
  context: Set<Event>
}

// -----------------------------------------------------------
// --------------------- DCR Graph Types ---------------------
// -----------------------------------------------------------

export type Event = string;
export type Label = string;

export interface Marking {
  executed: Set<Event>;
  included: Set<Event>;
  pending: Set<Event>;
}

// Map from event to a set of events
// Used to denote different relations between events
export interface EventMap {
  [startEventId: string]: Set<Event>;
}

export interface DCRGraph {
  events: Set<Event>;
  conditionsFor: EventMap;
  milestonesFor: EventMap;
  responseTo: EventMap;
  includesTo: EventMap;
  excludesTo: EventMap;
  marking: Marking;
}

export interface Labelling {
  labels: Set<Label>;
  labelMap: { [e: Event]: Label };
  labelMapInv: { [l: Label]: Set<Event> };
}

export interface Optimizations {
  conditions: Set<Event>;
  includesFor: EventMap;
  excludesFor: EventMap;
}

export type LabelDCR = DCRGraph & Labelling;

export type LabelDCRPP = LabelDCR & Optimizations;

export type DCRGraphPP = DCRGraph & Optimizations;

// -----------------------------------------------------------
// ------------------------ Log Types ------------------------
// -----------------------------------------------------------

export type Trace = Array<Event>;

type Traces = { [traceId: string]: Trace };

export interface EventLog {
  events: Set<Event>;
  traces: Traces;
}

export interface BinaryLog {
  events: Set<Event>;
  traces: Traces;
  nTraces: Traces;
}

export interface ClassifiedLog {
  [traceId: string]: {
    isPositive: boolean;
    trace: Trace;
  };
}

export interface ClassifiedTraces {
  [traceId: string]: boolean;
}

export interface XMLEvent {
  string: {
    "@key": "concept:name";
    "@value": string;
  };
}

export interface XMLTrace {
  string: {
    "@key": "concept:name";
    "@value": string;
  };
  boolean: {
    "@key": "pdc:isPos";
    "@value": boolean;
  };
  event: Array<XMLEvent>;
}

export interface XMLLog {
  log: {
    "@xes.version": "1.0";
    "@xes.features": "nested-attributes";
    "@openxes.version": "1.0RC7";
    global: {
      "@scope": "event";
      string: {
        "@key": "concept:name";
        "@value": "__INVALID__";
      };
    };
    classifier: {
      "@name": "Event Name";
      "@keys": "concept:name";
    };
    trace: Array<XMLTrace>;
  };
}

// Abstraction of the log used for mining
export interface LogAbstraction {
  events: Set<Event>;
  traces: {
    [traceId: string]: Trace;
  };
  chainPrecedenceFor: EventMap;
  precedenceFor: EventMap;
  responseTo: EventMap;
  predecessor: EventMap;
  successor: EventMap;
  atMostOnce: Set<Event>;
}

// Similar to EventMap, although this carries information about number of traces this Map has violated
export interface FuzzyRelation {
  [startEvent: string]: {
    [endEvent: string]: number;
  };
}
export type Metric = (tp: number, fp: number, tn: number, fn: number) => number;

// Alternate LogAbstraction that denotes how many times possible conditions are broken
// This can then be converted to a LogAbstraction through statistical analysis
export interface FuzzyLogAbstraction {
  events: Set<Event>;
  traces: {
    [traceId: string]: Trace;
  };
  chainPrecedenceFor: FuzzyRelation;
  precedenceFor: FuzzyRelation;
  responseTo: FuzzyRelation;
  predecessor: EventMap;
  successor: EventMap;
  atMostOnce: {
    [event: string]: number;
  };
  // Number of traces in which event has occurred
  eventCount: {
    [event: string]: number;
  };
}

export type FuzzyMetric = (
  traceViolations: number,
  traceCount: number,
  ...eventCounts: Array<number>
) => number;
// -----------------------------------------------------------
// --------------------- Petri Net Types ---------------------
// -----------------------------------------------------------

export type Place = string;
export type Transition = string;

// Places and Transitions MUST be disjoint
interface Net {
  places: Set<Place>;
  transitions: Set<Transition>;
  inputArcs: {
    [transition: string]: Set<Place>;
  };
  outputArcs: {
    [transition: string]: Set<Place>;
  };
  // Arcs from a transition to a Place, that clears all tokens in the Place
  resetArcs: {
    [transition: string]: Set<Place>;
  };
}

// Typeguard that enforces the constraints that are not possible to encode in the static type
// It runs through all places, transitions & arcs, and should therefore be used sparingly,
// e.g. once every time a Petri Net has been constructed
const isNet = (obj: any): obj is Net => {
  try {
    if (
      obj.places.constructor === Set &&
      obj.transitions.constructor === Set &&
      obj.arcs
    ) {
      // Check that all Transitions are strings
      for (const elem of obj.transitions) {
        if (typeof elem != "string") {
          return false;
        }
      }
      // Check that Places and Transitions are disjoint aswell as Places being strings
      for (const elem of obj.places) {
        if (typeof elem != "string" || obj.transitions.has(elem)) {
          return false;
        }
      }
      // Check that inputArcs are always Place -> Transition
      for (const end in obj.inputArcs) {
        if (!obj.transitions.has(end)) {
          return false;
        }
        for (const start of obj.inputArcs[end]) {
          if (!obj.places.has(start)) return false;
        }
      }
      // Check that outputArcs are always Transition -> Place
      for (const start in obj.outputArcs) {
        if (!obj.transitions.has(start)) {
          return false;
        }
        for (const end of obj.outputArcs[start]) {
          if (!obj.places.has(end)) return false;
        }
      }
      // Checks that resetArcs are always Transition -> Place
      for (const start in obj.resetArcs) {
        if (!obj.transitions.has(start)) {
          return false;
        }
        for (const end of obj.resetArcs[start]) {
          if (!obj.places.has(end)) return false;
        }
      }
      return true;
    } else return false;
  } catch (e) {
    // Something was of wrong type
    return false;
  }
};

export interface PetriMarking {
  [place: string]: number;
}

// Note that this definition does not consider arc multiplicity
// this means that any arc can only consume or create one token
export interface PetriNet {
  net: Net;
  marking: PetriMarking;
}

export const isPetriNet = (obj: any): obj is PetriNet => {
  const net = obj.net;
  if (isNet(net)) {
    try {
      for (const key in obj.marking) {
        if (!net.places.has(key) || typeof obj.marking[key] !== "number") {
          return false;
        }
      }
      return true;
    } catch (e) {
      return false;
    }
  } else {
    console.log("Not Net");
    return false;
  }
};
