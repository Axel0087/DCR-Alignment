import { EventLog, LogAbstraction, Event, Trace, EventMap, DCRGraph } from "../types";
import { copyEventMap, copySet } from "./utility";

// Create abstraction of an EventLog in order to make fewer passes when mining constraints
export const abstractLog = (log: EventLog): LogAbstraction => {
    const logAbstraction: LogAbstraction = {
        events: copySet(log.events),
        traces: { ...log.traces },
        // At first we assume all events will be seen at least once
        // Once we see them twice in a trace, they are removed from atMostOnce
        atMostOnce: copySet(log.events),
        chainPrecedenceFor: {},
        precedenceFor: {},
        predecessor: {},
        responseTo: {},
        successor: {},
    };
    // Initialize all EventMaps in the Log Abstraction.
    // Predecessor and successor sets start empty,
    // while the rest are initialized to be all events besides itself
    for (const event of log.events) {
        logAbstraction.chainPrecedenceFor[event] = copySet(log.events);
        logAbstraction.chainPrecedenceFor[event].delete(event);
        logAbstraction.precedenceFor[event] = copySet(log.events);
        logAbstraction.precedenceFor[event].delete(event);
        logAbstraction.responseTo[event] = copySet(log.events);
        logAbstraction.responseTo[event].delete(event);
        logAbstraction.predecessor[event] = new Set<Event>();
        logAbstraction.successor[event] = new Set<Event>();
    }

    const parseTrace = (trace: Trace) => {
        const localAtLeastOnce = new Set<Event>();
        const localSeenOnlyBefore: EventMap = {};
        let lastEvent: string = "";
        for (const event of trace) {
            // All events seen before this one must be predecessors
            logAbstraction.predecessor[event].union(localAtLeastOnce);
            // If event seen before in trace, remove from atMostOnce
            if (localAtLeastOnce.has(event)) {
                logAbstraction.atMostOnce.delete(event);
            }
            localAtLeastOnce.add(event);
            // Precedence for (event): All events that occured
            // before (event) are kept in the precedenceFor set
            logAbstraction.precedenceFor[event].intersect(localAtLeastOnce);
            // Chain-Precedence for (event): Some event must occur
            // immediately before (event) in all traces
            if (lastEvent !== "") {
                // If first time this clause is encountered - leaves lastEvent in chain-precedence set.
                // The intersect is empty if this clause is encountered again with another lastEvent.
                logAbstraction.chainPrecedenceFor[event].intersect(
                    new Set([lastEvent]),
                );
            } else {
                // First event in a trace, and chainPrecedence is therefore not possible
                logAbstraction.chainPrecedenceFor[event] = new Set<Event>();
            }
            // To later compute responses we note which events were seen
            // before (event) and not after
            if (logAbstraction.responseTo[event].size > 0) {
                // Save all events seen before (event)
                localSeenOnlyBefore[event] = copySet(localAtLeastOnce);
            }
            // Clear (event) from all localSeenOnlyBefore, since (event) has now occured after
            for (const key in localSeenOnlyBefore) {
                localSeenOnlyBefore[key].delete(event);
            }
            lastEvent = event;
        }
        for (const event in localSeenOnlyBefore) {
            // Compute set of events in trace that happened after (event)
            const seenOnlyAfter = new Set(localAtLeastOnce).difference(
                localSeenOnlyBefore[event],
            );
            // Delete self-relation
            seenOnlyAfter.delete(event);
            // Set of events that always happens after (event)
            logAbstraction.responseTo[event].intersect(seenOnlyAfter);
        }
    };

    for (const traceId in log.traces) {
        const trace = log.traces[traceId];
        parseTrace(trace);
    }

    // Compute successor set based on duality with predecessor set
    for (const i in logAbstraction.predecessor) {
        for (const j of logAbstraction.predecessor[i]) {
            logAbstraction.successor[j].add(i);
        }
    }

    return logAbstraction;
};


// Removes redundant relations based on transitive closure
const optimizeRelation = (relation: EventMap): void => {
    for (const eventA in relation) {
        for (const eventB of relation[eventA]) {
            relation[eventA].difference(relation[eventB]);
        }
    }
};

// Main mining method, the findAdditionalConditions flag breaks the discovered model when converting to petri-net
const mineFromAbstraction = (
    logAbstraction: LogAbstraction,
    findAdditionalConditions: boolean = true,
    filter: (x: any) => boolean = () => true
): DCRGraph => {
    // Initialize graph
    const graph: DCRGraph = {
        // Note that events become an alias, but this is irrelevant since events are never altered
        events: logAbstraction.events,
        conditionsFor: {},
        excludesTo: {},
        includesTo: {},
        milestonesFor: {},
        responseTo: {},
        marking: {
            executed: new Set<Event>(),
            pending: new Set<Event>(),
            included: copySet(logAbstraction.events),
        },
    };
    // Initialize all mappings to avoid indexing errors
    for (const event of graph.events) {
        graph.conditionsFor[event] = new Set<Event>();
        graph.excludesTo[event] = new Set<Event>();
        graph.includesTo[event] = new Set<Event>();
        graph.responseTo[event] = new Set<Event>();
        graph.milestonesFor[event] = new Set<Event>();
    }

    // Mine self-exclusions
    for (const event of logAbstraction.atMostOnce) {
        graph.excludesTo[event].add(event);
    }

    // Mine responses from logAbstraction
    graph.responseTo = copyEventMap(logAbstraction.responseTo);


    // Mine conditions from logAbstraction
    graph.conditionsFor = copyEventMap(logAbstraction.precedenceFor);

    // For each chainprecedence(i,j) we add: include(i,j) exclude(j,j)
    for (const j in logAbstraction.chainPrecedenceFor) {
        for (const i of logAbstraction.chainPrecedenceFor[j]) {
            graph.includesTo[i].add(j);
            graph.excludesTo[j].add(j);
        }
    }

    // Additional excludes based on predecessors / successors
    for (const event of logAbstraction.events) {
        // Union of predecessor and successors sets, i.e. all events occuring in the same trace as event
        const coExisters = new Set(logAbstraction.predecessor[event]).union(
            logAbstraction.successor[event],
        );
        const nonCoExisters = new Set(logAbstraction.events).difference(coExisters);
        nonCoExisters.delete(event);
        // Note that if events i & j do not co-exist, they should exclude each other.
        // Here we only add i -->% j, but on the iteration for j, j -->% i will be added.
        graph.excludesTo[event].union(nonCoExisters);

        // if s precedes (event) but never succeeds (event) add (event) -->% s if s -->% s does not exist
        const precedesButNeverSuceeds = new Set(
            logAbstraction.predecessor[event],
        ).difference(logAbstraction.successor[event]);
        for (const s of precedesButNeverSuceeds) {
            if (!graph.excludesTo[s].has(s)) {
                graph.excludesTo[event].add(s);
            }
        }
    }

    // Removing redundant excludes.
    // If r always precedes s, and r -->% t, then s -->% t is (mostly) redundant
    for (const s in logAbstraction.precedenceFor) {
        for (const r of logAbstraction.precedenceFor[s]) {
            for (const t of graph.excludesTo[r]) {
                graph.excludesTo[s].delete(t);
            }
        }
    }

    // remove redundant conditions
    optimizeRelation(graph.conditionsFor);

    // Remove redundant responses
    optimizeRelation(graph.responseTo);

    if (findAdditionalConditions) {
        // Mining additional conditions:
        // Every event, x, that occurs before some event, y, is a possible candidate for a condition x -->* y
        // This is due to the fact, that in the traces where x does not occur before y, x might be excluded
        const possibleConditions: EventMap = copyEventMap(
            logAbstraction.predecessor,
        );
        // Replay entire log, filtering out any invalid conditions
        for (const traceId in logAbstraction.traces) {
            const trace = logAbstraction.traces[traceId];
            const localSeenBefore = new Set<Event>();
            const included = copySet(logAbstraction.events);
            for (const event of trace) {
                // Compute conditions that still allow event to be executed
                const excluded = copySet(logAbstraction.events).difference(included);
                const validConditions = copySet(localSeenBefore).union(excluded);
                // Only keep valid conditions
                possibleConditions[event].intersect(validConditions);
                // Execute excludes starting from (event)
                included.difference(graph.excludesTo[event]);
                // Execute includes starting from (event)
                included.union(graph.includesTo[event]);
            }
        }
        // Now the only possibleCondtitions that remain are valid for all traces
        // These are therefore added to the graph
        for (const key in graph.conditionsFor) {
            graph.conditionsFor[key].union(possibleConditions[key]);
        }


        // Removing redundant conditions
        optimizeRelation(graph.conditionsFor);
    }
    return graph;
};

export default mineFromAbstraction;