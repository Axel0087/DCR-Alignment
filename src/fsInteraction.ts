import { EventMap, Label, LabelDCR, Event, Marking, ClassifiedTraces, EventLog, Trace } from "../types";
import { copyEventMap, copySet } from "./utility";

import fs from "fs";

import parser from "fast-xml-parser";

export const parserOptions = {
    attributeNamePrefix: "",
    attrNodeName: "attr", //default is 'false'
    textNodeName: "#text",
    ignoreAttributes: false,
    ignoreNameSpace: false,
    allowBooleanAttributes: false,
    parseNodeValue: true,
    parseAttributeValue: true,
    trimValues: true,
    parseTrueNumberOnly: false,
    arrayMode: true, //"strict"
    stopNodes: ["parse-me-as-string"],
};

// Parse .xes file to an EventLog
export const parseLog = (
    filepath: string,
    classifierName: string = "Event Name",
): EventLog => {
    if (!filepath.endsWith(".xes")) {
        throw new Error("Invalid file extension");
    }
    const data = fs.readFileSync(filepath);
    const logJson = parser.parse(data.toString(), parserOptions);
    const log: EventLog = {
        events: new Set<Event>(),
        traces: {},
    };

    let keys = "";
    for (const i in logJson.log[0].classifier) {
        if (logJson.log[0].classifier[i].attr.name === classifierName) {
            keys = logJson.log[0].classifier[i].attr.keys;
        }
    }
    if (keys === "") keys = "concept:name";
    // Extract classifiers to array according to https://xes-standard.org/_media/xes/xesstandarddefinition-2.0.pdf
    // Example: "x y 'z w' hello" => ["hello", "x", "y", "z w"]
    const classifiers = (keys + " ") // Fix for case where
        .split("'") // Split based on ' to discern which classifiers have spaces
        .map((newKeys) => {
            // Only the classifiers surrounded by ' will have no spaces on either side, split the rest on space
            if (newKeys.startsWith(" ") || newKeys.endsWith(" ")) {
                return newKeys.split(" ");
            } else return newKeys;
        })
        .flat() // Flatten to 1d array
        .filter((key) => key !== "") // Remove empty strings
        .sort(); // Sort to ensure arbitrary but deterministic order

    let id = 0;
    for (const i in logJson.log[0].trace) {
        const trace: Trace = [];
        let traceId: string = "";
        const xmlTrace = logJson.log[0].trace[i];
        try {
            for (const elem of xmlTrace.string) {
                if (elem.attr.key === "concept:name") {
                    traceId = elem.attr.value;
                }
            }
        } catch (e) {
            traceId = (id++).toString();
        }
        if (traceId === "") {
            throw new Error("No trace id found!");
        }
        const events = xmlTrace.event ? xmlTrace.event : [];
        for (const elem of events) {
            let nameArr = [];
            for (const clas of classifiers) {
                try {
                    const event = elem.string.find(
                        (newElem: any) => newElem.attr.key === clas,
                    );
                    nameArr.push(event.attr.value);
                } catch {
                    throw new Error(
                        "Couldn't discern Events with classifiers: " + classifiers,
                    );
                }
            }
            const name = nameArr.join(":");
            trace.push(name);
            log.events.add(name);
        }
        log.traces[traceId] = trace;
    }
    return log;
};

export const parseClassifiedLog = (filepath: string): ClassifiedTraces => {
    if (!filepath.endsWith(".xes")) {
        throw new Error("Invalid file extension");
    }
    const data = fs.readFileSync(filepath);
    const logJson = parser.parse(data.toString(), parserOptions);
    const traces: ClassifiedTraces = {};

    for (const i in logJson.log[0].trace) {
        let traceId: string = "";
        let isPos: undefined;
        const xmlTrace = logJson.log[0].trace[i];
        for (const elem of xmlTrace.string) {
            if (elem.attr.key === "concept:name") {
                traceId = elem.attr.value;
            }
        }
        for (const elem of xmlTrace.boolean) {
            if (elem.attr.key === "pdc:isPos") {
                isPos = elem.attr.value;
            }
        }
        if (traceId === "") {
            throw new Error("No trace id found!");
        }
        if (isPos === undefined) {
            throw new Error("Classification not found!");
        }
        traces[traceId] = isPos;
    }
    return traces;
};

const parseXMLDCR = (graphRaw: any, defaultMarking: boolean = true, labelsFromEvents: boolean = true): LabelDCR => {
    const labels: Set<Label> = new Set();
    const labelMap: { [e: Event]: Label } = {};
    const labelMapInv: { [l: Label]: Set<Event> } = {};

    // Strips all whitespace except naturally occuring spaces
    // https://futurestud.io/tutorials/remove-extra-spaces-from-a-string-in-javascript-or-node-js
    const formatTitle = (title: string): string => title.replace(/\s+/g, ' ').trim();
    type NestingType = Array<{
        attr: { id: Event },
        custom: Array<{ title: Label }>,
        event?: NestingType
    }>
    const nestingMap: EventMap = {};
    const iterateNestings = (nestings: NestingType): Set<Event> => {
        const retSet: Set<Event> = new Set();
        for (const nesting of nestings) {
            if (!nesting.event) {
                const event = nesting.attr.id;
                if (labelsFromEvents && !nesting.custom[0].title) continue;

                retSet.add(event);
                // Leaf events nest to themselves for easier iteration of constraints
                nestingMap[event] = new Set([event]);

                if (labelsFromEvents) {
                    const label = formatTitle(nesting.custom[0].title);
                    labels.add(label);
                    labelMap[event] = label;

                    if (!labelMapInv[label]) labelMapInv[label] = new Set();
                    labelMapInv[label].add(event);
                }
            } else {
                const nestedEvents = iterateNestings(nesting.event);
                retSet.union(nestedEvents);

                const nestingId = nesting.attr.id;
                nestingMap[nestingId] = nestedEvents;
            }
        }

        return retSet;
    }

    const specification = graphRaw.specification[0];
    const resources = specification.resources[0];

    const eventsRaw = resources.events[0].event;
    const events = iterateNestings(eventsRaw);


    if (!labelsFromEvents) {
        resources.labels[0].label.forEach((label: any) => labels.add(label.attr.id));
        resources.labelMappings[0].labelMapping.forEach((labelMapping: any) => {
            const event = labelMapping.attr.eventId;
            const label = labelMapping.attr.labelId;
            labelMap[event] = label;
            if (!labelMapInv[label]) labelMapInv[label] = new Set();
            labelMapInv[label].add(event);
        });
    }

    // Extracting relations
    let numberDropped = 0;
    const parseRelation = (rawRels: Array<{
        attr: {
            sourceId: Event,
            targetId: Event,
            expressionId: boolean
        }
    }>, direction: "for" | "to"): EventMap => {
        const retval: EventMap = {};
        for (const event of events) {
            retval[event] = new Set();
        }
        for (const rawRel of rawRels) {
            if (rawRel.attr.expressionId && rawRel.attr.expressionId !== true) {
                numberDropped++;
                continue;
            };

            const sourceNest = rawRel.attr.sourceId;
            const targetNest = rawRel.attr.targetId;

            // This is why leaf events nest to themselves. 
            // No need to handle the leaf-case, as they will just be a loop over a set with themselves.
            for (const source of nestingMap[sourceNest]) {
                for (const target of nestingMap[targetNest]) {
                    if (direction === "for") {
                        retval[target].add(source);
                    } else {
                        retval[source].add(target);
                    }
                }
            }
        }
        return retval;
    }

    const emptyMap: EventMap = {};
    for (const event of events) {
        emptyMap[event] = new Set();
    }

    const constraints = specification.constraints[0];
    const conditionsFor = constraints.conditions ? parseRelation(constraints.conditions[0].condition, "for") : copyEventMap(emptyMap);
    const milestonesFor = constraints.milestones ? parseRelation(constraints.milestones[0].milestone, "for") : copyEventMap(emptyMap);
    const responseTo = constraints.responses ? parseRelation(constraints.responses[0].response, "to") : copyEventMap(emptyMap);
    const excludesTo = constraints.excludes ? parseRelation(constraints.excludes[0].exclude, "to") : copyEventMap(emptyMap);
    const includesTo = constraints.includes ? parseRelation(constraints.includes[0].include, "to") : copyEventMap(emptyMap);

    if (numberDropped > 6) console.log("Warning WAAAARNING!!!! Dropped: " + numberDropped);

    const runtime = graphRaw.runtime[0];
    const markingRaw = runtime.marking[0]
    console.log();

    const marking: Marking = defaultMarking ? {
        executed: new Set(),
        pending: new Set(),
        included: copySet(events)
    } : {
        executed: markingRaw.executed === "" ? new Set() : new Set(markingRaw.executed[0].event.map((event: any) => event.attr.id)),
        pending: markingRaw.pendingResponses === "" ? new Set() : new Set(markingRaw.pendingResponses[0].event.map((event: any) => event.attr.id)),
        included: markingRaw.included === "" ? new Set() : new Set(markingRaw.included[0].event.map((event: any) => event.attr.id)),
    }

    return {
        events,
        labels,
        labelMap,
        labelMapInv,
        conditionsFor,
        milestonesFor,
        responseTo,
        excludesTo,
        includesTo,
        marking
    }
}

export const parseDCRSolXML = (filepath: string): LabelDCR => {
    const data = fs.readFileSync(filepath);
    const logJson = parser.parse(data.toString(), parserOptions);

    const graph = parseXMLDCR(logJson.dcrgraph[0], false, false);

    return graph;
}