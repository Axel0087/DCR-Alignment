import type { DCRGraph, EventMap, Marking, Event, Optimizations, LabelDCRPP, DCRGraphPP, Labelling } from "../types";

import util from "util";
import now from "performance-now";

export const avg = (arr: Array<number>): number => arr.reduce((partialSum, a) => partialSum + a, 0) / arr.length;

// Makes deep copy of a eventMap
export const copyEventMap = (eventMap: EventMap): EventMap => {
  const copy: EventMap = {};
  for (const startEvent in eventMap) {
    copy[startEvent] = new Set(eventMap[startEvent]);
  }
  return copy;
};

export const copySet = <T>(set: Set<T>): Set<T> => {
  return new Set(set);
};

export const copyMarking = (marking: Marking): Marking => {
  return {
    executed: copySet(marking.executed),
    included: copySet(marking.included),
    pending: copySet(marking.pending),
  };
};

export const reverseRelation = (relation: EventMap): EventMap => {
  const retRelation: EventMap = {};
  for (const e in relation) {
    retRelation[e] = new Set();
  }
  for (const e in relation) {
    for (const j of relation[e]) {
      retRelation[j].add(e);
    }
  }
  return retRelation;
};

export const graphToGraphPP = <T extends DCRGraph>(graph: T): T & Optimizations => {
  const conditions = new Set<Event>();
  for (const key in graph.conditionsFor) {
    conditions.union(graph.conditionsFor[key]);
  }
  return { ...graph, conditions, includesFor: reverseRelation(graph.includesTo), excludesFor: reverseRelation(graph.excludesTo) };
};

export const DCRtoLabelDCR = <T extends DCRGraph>(model: T): T & Labelling => {
  const labelMap: { [name: string]: string } = {};
  const labelMapInv: EventMap = {};

  for (const event of model.events) {
    labelMap[event] = event;
    labelMapInv[event] = new Set([event]);
  }

  const labelModel: T & Labelling = {
    ...model,
    labels: copySet(model.events),
    labelMap,
    labelMapInv
  }
  return labelModel;
}

// Time in milliseconds
export const timer = () => {
  const start = now();
  return {
    stop: () => {
      const end = now();
      const time = (end - start);
      return time;
    }
  }
};

export const strFull = (obj: any) => util.inspect(obj, { showHidden: false, depth: null, colors: true });

// Makes dict that returns key on no-hit
export const makeProxyDict = (mappings: { [name: string]: string }) => new Proxy(mappings, {
  get: (target: { [name: string]: string }, name: string) => name in target ? target[name] : name
});

export const swapDict = (dict: { [key: string]: string }) => {
  const retDict: { [val: string]: string } = {};
  for (const key in dict) {
    retDict[dict[key]] = key;
  }
  return retDict;
}

export const relationCount = (model: DCRGraph) => {
  let count = 0;
  const relCount = (rel: EventMap) => {
    for (const e in rel) {
      for (const j of rel[e]) {
        count += 1;
      }
    }
  };
  relCount(model.conditionsFor);
  relCount(model.excludesTo);
  relCount(model.includesTo);
  relCount(model.responseTo);
  relCount(model.milestonesFor);
  return count;
};