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
const fs = require('fs');

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

parser.addArgument(
  [ '-s', '--steps' ],
  {
    help: 'Number of steps to search.'
  }
);

var args = parser.parseArgs();

var graph = new Graph();
var steps = 0;
var maxSteps = args.steps || 15;
var traversals = [];
var searched = [];

// ANALYSIS-SPECIFIC RANKING FUNCTIONS

function seedScoringFunc(item){
  return item.sentiment.score;
}

function traversalScoringFunc(edge){
  var node = graph.node(edge.v);
  var edge = graph.edge(edge.v, edge.w);
  return (edge.sentiment + node.sentiment * 5) / Math.pow(node.user.followers, 1/3);
}

// MAIN PROCESS
addSeedNode(args.input)
.then(screenName => runRecursiveSearch(screenName))
.then(() => writeOutput())
.catch(err => {
  console.error(err);
  throw new Error(err);
  return;
})

// STEP FUNCTIONS

function addSeedNode(screenName){
  return new Promise((resolve, reject) => {
    var nextTraversal;
    var user;
    console.log(`Adding seed node from @${screenName}.`)
    searchTweets(`@${screenName}`)
    .then(tweets => analyzeTweetSentiments(tweets))
    .then(tweets => rankTweets(tweets, seedScoringFunc))
    .then(ranked => getHighestRankedTweet(ranked))
    .then(tweet => {
      nextTraversal = tweet.user.screen_name
      graph.setEdge(tweet.user.screen_name, screenName, {
        score: tweet.sentiment.score
      })
      return getTimelineByScreenName(screenName);
    })
    .then(tweets => analyzeTweetSentiments(tweets))
    .then(tweets => {
      user = tweets[0].user;
      return sumTweetSentiments(tweets)
    })
    .then(score => {
      graph.setNode(screenName, {
        sentiment: score,
        user: user
      });
      return resolve(nextTraversal);
    })
    .catch(err => reject(err))
  })
}


function runRecursiveSearch(screenName){
  return new Promise((resolve, reject) => {
    var tweets, user;
    if(steps > maxSteps ){
      return resolve();
    }
    steps ++;
    console.log(`${graph.nodes().length} nodes, ${graph.edges().length} edges.`);

    getTimelineByScreenName(screenName)
    .then(tweets => analyzeTweetSentiments(tweets))
    .then(data => {
      tweets = data;
      user = tweets[0].user;
      return sumTweetSentiments(data);
    })
    .then(score => addNodeLabel(user, score, tweets))
    .then(tweets => recordAdjacentNodes(screenName, tweets))
    .then(() => selectNextTraversal(screenName, traversalScoringFunc))
    .then(screenName => runRecursiveSearch(screenName))
    .then(() => resolve())
    .catch(err => {
      writeOutput()
      .then(() => reject(err))
      .catch(() => reject(err))
    })
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
      graph.setEdge(screenName, mention.screen_name, { type: 'mention', sentiment: sentiment, tweet: tweet });
    })
  })
  return Promise.resolve();
}

function addNodeLabel(user, score, tweets){
  graph.setNode(user.screen_name, {
    sentiment: score,
    user: user
  });
  console.log(`Added node ${user.screen_name} with score ${score}.`)
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

function selectNextTraversal(screenName, scoringFunc){
  var edges = graph.edges();
  var filtered = edges.filter(edge => {
    return searched.indexOf(edge.w.toLowerCase()) === -1;
  });
  var sorted = filtered.sort((a, b) => {
    return scoringFunc(a) - scoringFunc(b);
  });
  var nextTraversal = sorted[0].w;
  console.log('Next traversal is ' + nextTraversal);
  traversals.push([screenName, nextTraversal]);
  searched.push(nextTraversal.toLowerCase());
  return Promise.resolve(nextTraversal);
}

function writeOutput(){
  var res = {
    links: graph.edges().filter(edge => {
      return graph.node(edge.v) && graph.node(edge.w);
    }).map(edge => {
      return {
        source: edge.v,
        target: edge.w,
        value: graph.edge(edge.v, edge.w).sentiment
      }
    }),
    nodes: graph.nodes().filter(node => {
      return graph.node(node) ? true : false;
    }).map(node => {
      return {
        id: node,
        label: graph.node(node)
      }
    }),
    traversals: traversals
  }
  fs.mkdir('./public/data', (err, data) => {
    fs.writeFile('./public/data/graph.js', 'var graph = ' + JSON.stringify(res), 'utf-8', (err, data) => {
      if(err){
        console.error(err)
        return;
      }
      console.log('Done!')
    })
  })
}
