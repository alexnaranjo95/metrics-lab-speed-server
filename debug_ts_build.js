// Debug TypeScript compilation issues
import fs from 'fs';

// #region agent log
const logData = {
  timestamp: Date.now(),
  location: 'debug_ts_build.js:6',
  message: 'Starting TypeScript debug analysis',
  data: {},
  hypothesisId: 'TS1'
};
fs.appendFileSync('/Users/alex/Desktop/metrics-lab-speed-server/metrics-lab-speed-server/.cursor/debug.log', 
  JSON.stringify(logData) + '\n');
// #endregion

// Test hypothesis TS2: HTMLAnalyzer $ property access pattern
const htmlAnalyzerContent = fs.readFileSync('src/codeAnalysis/htmlAnalyzer.ts', 'utf8');
// #region agent log  
const htmlCheckLog = {
  timestamp: Date.now(),
  location: 'debug_ts_build.js:16',
  message: 'Analyzing HTMLAnalyzer $ usage patterns',
  data: {
    optionalChainingCount: (htmlAnalyzerContent.match(/this\.\$\?\./g) || []).length,
    directCallCount: (htmlAnalyzerContent.match(/this\.\$\(/g) || []).length,
    totalThisDollarAccess: (htmlAnalyzerContent.match(/this\.\$/g) || []).length
  },
  hypothesisId: 'TS2'
};
fs.appendFileSync('/Users/alex/Desktop/metrics-lab-speed-server/metrics-lab-speed-server/.cursor/debug.log', 
  JSON.stringify(htmlCheckLog) + '\n');
// #endregion

// Test hypothesis TS3: jsAnalyzer missing methods
const jsAnalyzerContent = fs.readFileSync('src/codeAnalysis/jsAnalyzer.ts', 'utf8');
// #region agent log
const jsCheckLog = {
  timestamp: Date.now(), 
  location: 'debug_ts_build.js:30',
  message: 'Checking jsAnalyzer method implementations',
  data: {
    hasEstimateNodeSize: jsAnalyzerContent.includes('estimateNodeSize('),
    hasCalculateCyclomaticComplexity: jsAnalyzerContent.includes('calculateCyclomaticComplexity('),
    estimateNodeSizeUsage: (jsAnalyzerContent.match(/this\.estimateNodeSize/g) || []).length,
    complexityUsage: (jsAnalyzerContent.match(/this\.calculateCyclomaticComplexity/g) || []).length
  },
  hypothesisId: 'TS3'
};
fs.appendFileSync('/Users/alex/Desktop/metrics-lab-speed-server/metrics-lab-speed-server/.cursor/debug.log', 
  JSON.stringify(jsCheckLog) + '\n');
// #endregion

// Test hypothesis TS4: CSS parser AST structure
const cssAnalyzerContent = fs.readFileSync('src/codeAnalysis/cssAnalyzer.ts', 'utf8');
// #region agent log
const cssCheckLog = {
  timestamp: Date.now(),
  location: 'debug_ts_build.js:44', 
  message: 'Checking CSS parser AST usage',
  data: {
    astStylesheetAccess: (cssAnalyzerContent.match(/ast\.stylesheet/g) || []).length,
    astStylesheetNullChecks: (cssAnalyzerContent.match(/ast\.stylesheet\?/g) || []).length
  },
  hypothesisId: 'TS4'
};
fs.appendFileSync('/Users/alex/Desktop/metrics-lab-speed-server/metrics-lab-speed-server/.cursor/debug.log', 
  JSON.stringify(cssCheckLog) + '\n');
// #endregion

console.log('TypeScript debug analysis complete');