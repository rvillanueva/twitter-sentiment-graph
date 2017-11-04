require('dotenv').load();
const ArgumentParser = require('argparse').ArgumentParser;
const path = require('path');

const TwitterGraph = require('./src/graph');
const parser = new ArgumentParser({
  version: '0.0.1',
  addHelp:true,
  description: 'Twitter network search and analysis.'
});

parser.addArgument(
  [ '-i', '--input' ],
  {
    help: 'Starting screen name.'
  }
);

parser.addArgument(
  [ '-s', '--steps' ],
  {
    help: 'Number of steps to search.'
  }
);

var args = parser.parseArgs();
var graph = new TwitterGraph();
var steps = [];
var defaultMaxSteps = 15;

graph.createSeed(args.input)
.then(() => graph.search(args.steps || defaultMaxSteps))
.then(() => graph.write())
.then(() => console.log('Done!'))
.catch(err => {
  console.trace();
  console.error(err);

  graph.write()
  .then(() => {
    throw new Error(err);
  })
  .catch(err => {
    throw new Error(err);
  })
})


process.on('unhandledRejection', (reason, p) => {
  console.log('Unhandled Rejection at: Promise', p, 'reason:', reason, reason.stack);
  // application specific logging, throwing an error, or other logic here
});
