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
    help: 'Starting screen name.'
  }
);

var args = parser.parseArgs();

var graph = new Graph();
var steps = 0;
var traversals = [];
var searched = [];

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

function addSeedNode(screenName){
  return new Promise((resolve, reject) => {
    var nextTraversal;
    console.log('Adding seed node....')

    searchTweets(`@${screenName}`)
    .then(tweets => analyzeTweetSentiments(tweets))
    .then(tweets => rankTweets(tweets, scoringFunc))
    .then(ranked => {
      ranked.map(tweet => {
        graph.setEdge(tweet.screen_name, screenName, {
          score: tweet.sentiment.score
        })
      })
      return getHighestRankedTweet(ranked);
    })
    .then(tweet => {
      nextTraversal = tweet.user.screen_name
      return getTimelineByScreenName(screenName);
    })
    .then(tweets => analyzeTweetSentiments(tweets))
    .then(tweets => sumTweetSentiments(tweets))
    .then(score => {
      graph.setNode(screenName, {
        score: score
      });
      return resolve(nextTraversal);
    })
    .catch(err => reject(err))
  })
}


function runRecursiveSearch(screenName){
  return new Promise((resolve, reject) => {
    var tweets;
    if(steps > 5 ){
      return resolve();
    }
    steps ++;

    getTimelineByScreenName(screenName)
    .then(tweets => analyzeTweetSentiments(tweets))
    .then(data => {
      tweets = data;
      return sumTweetSentiments(data);
    })
    .then(score => addNodeLabel(screenName, score, tweets))
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
      var score = 0;
      var existingEdge = graph.edge(screenName, mention.screen_name);
      if(existingEdge && existingEdge.score){
        score += existingEdge.score;
      };
      score += tweet.sentiment.score;
      graph.setEdge(screenName, mention.screen_name, { type: 'mention', score: score });
    })
  })
  return Promise.resolve();
}

function addNodeLabel(screenName, score, tweets){
  graph.setNode(screenName, {
    score: score
  });
  console.log(`Added node ${screenName} with score ${score}.`)
  return Promise.resolve(tweets);
}

function sumTweetSentiments(tweets){
  var totalScore = 0;
  tweets.map(tweet => {
    totalScore += tweet.sentiment.score;
  })
  var nodeScore = totalScore/tweets.length;
  return Promise.resolve(nodeScore);
}

function selectNextTraversal(screenName){
  var edges = graph.edges();
  var filtered = edges.filter(edge => {
    return searched.indexOf(edge.w) === -1;
  });
  var sorted = filtered.sort((a, b) => {
    return a.score - b.score;
  });
  var nextTraversal = sorted[0].w;
  console.log('Next traversal is ' + nextTraversal);
  traversals.push([screenName, nextTraversal]);
  searched.push(nextTraversal);
  return Promise.resolve(nextTraversal);
}
