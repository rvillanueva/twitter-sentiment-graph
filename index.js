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
var nodeCount = 0;
var storedSeedStep = {};
var traversals = [];

// ANALYSIS-SPECIFIC RANKING FUNCTIONS

function scoringFunc(item){
  return item.sentiment.score;
}

// MAIN PROCESS

addSeedNode(args.input)
.then(userId => runRecursiveSearch(userId))
.then(() => console.log(`Done, with ${graph.nodes().length} steps!`))
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
    .then(tweet => resolve(tweet.user.id))
    .then(() => resolve())
    .catch(err => reject(err))
  })
}


function runRecursiveSearch(userId){
  return new Promise((resolve, reject) => {
    if(graph.nodes.length > 1 ){
      return resolve();
    }
    getTimelineByUserId(userId)
    .then(timeline => analyzeTweetSentiments(timeline.statuses))
    .then(tweets => recordAdjacentNodes(userId, tweets))
    .then(() => selectNextTraversal(userId))
    .then(user => runRecursiveSearch(user))
    .then(() => resolve())
    .catch(err => reject(err))
  });
}


// HELPER FUNCTIONS

// Search tweets for a specific keyword. Used to get seed node options.
// Put tweets into item container.
function searchTweets(term){
  return new Promise((resolve, reject) => {
    client.get('search/tweets', { q: term, count: 20 }, (err, data, res) => {
      if(err){
        return reject(err);
      }
      resolve(data.statuses);
    })
  })
}

function getTimelineByUserId(userId){
  return new Promise((resolve, reject) => {
    console.log('User is ' + userId);
    client.get('statuses/user', {
      user_id: userId,
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
function recordAdjacentNodes(userId, tweets){
  tweets.map(tweet => {
    if(false){
      if(false){
        graph.setNode();
      }
      graph.setEdge(userId, 'a');
    }
  })
  return Promise.resolve();
}

function selectNextTraversal(userId){
  graph.getEdges(userId)
}
