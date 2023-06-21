import { parseDCRSolXML } from "./src/fsInteraction";
import runTest from "./src/tdm";

import { graphToGraphPP, makeProxyDict, strFull, swapDict, timer } from "./src/utility";

import { Test } from "./types";


const testCases: Array<Test> = [
    {
        polarity: "-",
        trace: ["Fill out application", "Meeting in progress"],
        context: new Set(["Fill out application", "Meeting in progress", "Round ends"])
    },
    {
        polarity: "-",
        trace: ["Approved - to board", "Screening reject"],
        context: new Set(["Approved - to board", "Screening reject"])
    },
    {
        polarity: "-",
        trace: ["Approve", "Reject"],
        context: new Set(["Approve", "Reject"])
    },
    {
        polarity: "+",
        trace: ["Reject", "Approve"],
        context: new Set(["Approve", "Reject"])
    },
    {
        polarity: "-",
        trace: ["Reject", "Applicant informed", "Approve"],
        context: new Set(["Approve", "Reject", "Applicant informed"])
    },
    {
        polarity: "+",
        trace: ["Reject", "Applicant informed"],
        context: new Set(["Approve", "Reject", "Applicant informed"])
    },
    {
        polarity: "-",
        trace: ["Approve"],
        context: new Set(["Approve", "Reject", "Register Decision"])
    },
    {
        polarity: "-",
        trace: ["Reject"],
        context: new Set(["Approve", "Reject", "Register Decision"])
    },
    {
        polarity: "+",
        trace: ["Register Decision", "Reject"],
        context: new Set(["Approve", "Reject", "Register Decision"])
    },
    {
        polarity: "+",
        trace: ["Register Decision", "Approve"],
        context: new Set(["Approve", "Reject", "Register Decision"])
    },
    {
        polarity: "-",
        trace: ["Screen application", "Screen application"],
        context: new Set(["Screen application"])
    },
    {
        polarity: "-",
        trace: ["Approve"],
        context: new Set(["Approve", "Change phase to Preparation"])
    },

    {
        polarity: "+",
        trace: ["Approve", "Change phase to Preparation"],
        context: new Set(["Approve", "Change phase to Preparation"])
    },
    {
        polarity: "+",
        trace: ["Change phase to Preparation"],
        context: new Set(["Approve", "Change phase to Preparation"])
    },
    {
        polarity: "+",
        trace: ["Change phase to Preparation"],
        context: new Set(["Approve", "Change phase to Preparation"])
    },

    {
        polarity: "+",
        trace: ["First payment"],
        context: new Set(["First payment", "Undo payment"])
    },
    {
        polarity: "-",
        trace: ["First payment", "First payment"],
        context: new Set(["First payment", "Undo payment"])
    },
    {
        polarity: "+",
        trace: ["First payment", "Undo payment", "First payment"],
        context: new Set(["First payment", "Undo payment"])
    },
    {
        polarity: "-",
        trace: ["Undo payment"],
        context: new Set(["First payment", "Undo payment"])
    },
    {
        polarity: "+",
        trace: ["Review", "Review"],
        context: new Set(["Review"])
    },
];


const translateTest = (test: Test, translation: { [key: string]: string }): Test => {
    return {
        polarity: test.polarity,
        trace: test.trace.map((val) => translation[val]),
        context: new Set([...test.context].map((val) => translation[val]))
    }
}

const translateBindings = {
    "Afsluttet": "Completed",
    "Approve - send to board": "Approved - to board",
    "Reject": "Screening reject",
    "Reject application": "Reject",
    "Approve application": "Approve",
    "Modtag slut rapport": "Receive end report",
    "Informer ansøger om bevilling": "Inform applicant of approval",
    "Godkend ændret kontonummer": "Approve changed account",
    "Ansøger informeret": "Applicant informed",
    "Fill out Application": "Fill out application",
    "Round Ends": "Round ends",
    "Afbryd ansøgning": "Cancel application",
    "Change phase to review": "Change phase to Review",
    "Change phase to Approved": "Change phase to Preparation",
    "Informer ansøger om at best ser på sagen": "Inform application of board review",
    "Pre-approve application": "Screen application",
    "ansøger godtgør relevans af ansøgningen": "Applicant justifies relevance",
    "Udfoer bortfald": "Execute abandon",
    "Change Phase to Bortfaldet": "Change phase to Abandon"
};

const translateMap = makeProxyDict(swapDict(translateBindings));

const printTest = (test: Test) => {
    console.log(`
Running test:
    Polarity: ${test.polarity}
    Trace:    [${test.trace}]
    Context   {${[...test.context]}}
`
    )
}

export default () => {
    const dreyersVisual = graphToGraphPP(parseDCRSolXML("./data/ACM 2014 Application Dreyers Fond.xml"));
    for (const test of testCases) {
        printTest(test);
        const t0 = timer();
        const result0 = runTest(translateTest(test, translateMap), dreyersVisual, 100);
        console.log("Depth 100 took: " + Math.round(t0.stop()) + "ms");
        const t1 = timer();
        const result1 = runTest(translateTest(test, translateMap), dreyersVisual, Infinity);
        console.log("Depth Inf took: " + Math.round(t1.stop()) + "ms");

        console.log("Results", result0, result1);
    }
}

