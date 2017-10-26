require('dotenv').load();
const Twitter = require('twitter');
const ArgumentParser = require('argparse').ArgumentParser;
const sentiment = require('sentiment');
const stats = require('stats-lite');
const Graph = require('graphlib').Graph;
const client = new Twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
  bearer_token: process.env.TWITTER_BEARER_TOKEN
})

var parser = new ArgumentParser({
  version: '0.0.1',
  addHelp:true,
  description: 'Twitter network search and analysis.'
});

parser.addArgument(
  [ '-i', '--input' ],
  {
    help: 'Seed search term.'
  }
);

var args = parser.parseArgs();

var graph = new Graph();
var steps = 0;
var traversals = [];

// ANALYSIS-SPECIFIC RANKING FUNCTIONS

function scoringFunc(item){
  return item.sentiment.score;
}

// MAIN PROCESS

addSeedNode(args.input)
.then(screenName => runRecursiveSearch(screenName))
.then(() => console.log(`Done, with ${steps} steps.`))
.catch(err => {
  console.error(err);
  throw new Error(err);
  return;
})

// STEP FUNCTIONS

function addSeedNode(searchTerm){
  return new Promise((resolve, reject) => {
    var seedNodeId = searchTerm;
    graph.setNode(seedNodeId);

    console.log('Adding seed node....')

    searchTweets(searchTerm)
    .then(tweets => analyzeTweetSentiments(tweets))
    .then(tweets => rankTweets(tweets, scoringFunc))
    .then(ranked => {
      ranked.map(tweet => {
        if(!graph.hasNode(tweet.screen_name)){
          graph.setNode(tweet.screen_name);
        }
        graph.setEdge(seedNodeId, tweet.screen_name, {
          tweet: tweet
        })
      })
      return getHighestRankedTweet(ranked);
    })
    .then(tweet => resolve(tweet.user.screen_name))
    .then(() => resolve())
    .catch(err => reject(err))
  })
}


function runRecursiveSearch(screenName){
  return new Promise((resolve, reject) => {
    if(steps > 10 ){
      return resolve();
    }
    steps ++;

    getTimelineByScreenName(screenName)
    .then(tweets => analyzeTweetSentiments(tweets))
    .then(tweets => addNodeLabel(screenName, tweets))
    .then(tweets => recordAdjacentNodes(screenName, tweets))
    .then(() => selectNextTraversal(screenName))
    .then(screenName => runRecursiveSearch(screenName))
    .then(() => resolve())
    .catch(err => reject(err))
  });
}


// HELPER FUNCTIONS

// Search tweets for a specific keyword. Used to get seed node options.
// Put tweets into item container.
function searchTweets(term){
  return new Promise((resolve, reject) => {
    client.get('search/tweets', { q: term, count: 50 }, (err, data, res) => {
      if(err){
        return reject(err);
      }
      resolve(data.statuses);
    })
  })
}

function getTimelineByScreenName(screenName){
  return new Promise((resolve, reject) => {
    console.log('User is ' + screenName);
    client.get('statuses/user_timeline', {
      screen_name: String(screenName),
      include_rts: true,
      exclude_replies: false,
      count: 50
    }, (err, timeline, res) => {
      if(err){
        return reject(err);
      }
      resolve(timeline);
    })
  })
}

// Analyze tweet text sentiment and attach it
function analyzeTweetSentiments(tweets){
    var total = 0;
    var returned = tweets.map(tweet => {
      tweet.sentiment = sentiment(tweet.text);
      return tweet;
    });
    return Promise.resolve(returned);
}

// Rank tweets and attach score
function rankTweets(tweets, scoringFunc){
  console.log(`Ranking ${tweets.length} tweets.`)
  var ranked = tweets.map(tweet => {
    tweet.score = scoringFunc(tweet);
    return tweet;
  }).sort((a, b) => {
    return b.score - a.score;
  });
  return Promise.resolve(ranked);
}

//

function getHighestRankedTweet(ranked){
  return new Promise((resolve, reject) => {
    if(ranked.length > 0){
      console.log('Highest ranked tweet:', ranked[0].text);
      return resolve(ranked[0]);
    }
    return reject(new Error('No tweets found that match search term.'));
  })
}

// Search through tweets and create new nodes and edges from mentions
function recordAdjacentNodes(screenName, tweets){
  tweets.map(tweet => {
    tweet.entities.user_mentions.map(mention => {
      graph.setEdge(screenName, mention.screen_name, { type: 'mention' });
    })
  })
  return Promise.resolve();
}

function addNodeLabel(screenName, tweets){
  var totalScore = 0;
  tweets.map(tweet => {
    totalScore += tweet.sentiment.score;
  })
  var nodeScore = totalScore/tweets.length;
  graph.setNode(screenName, {
    score: nodeScore
  });
  console.log(`Added node ${screenName} with score ${nodeScore}.`)
  return Promise.resolve(tweets);
}

function selectNextTraversal(screenName){
  var edges = graph.edges() || [];
  var nextTraversal = edges[Math.floor(Math.random() * edges.length)].w;
  console.log('Next traversal is ' + nextTraversal);
  return Promise.resolve(nextTraversal);
}
