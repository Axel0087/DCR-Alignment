import { DCRGraph, DCRGraphPP } from "./types";
import init from "./init";
import align from "./src/align";
import { DCRtoLabelDCR, graphToGraphPP } from "./src/utility";
import runDreyers from "./runDreyers";
import runPDC from "./runPDC";

// Extends Set object with set methods. BAD JS practice!
init();

runDreyers();
runPDC();