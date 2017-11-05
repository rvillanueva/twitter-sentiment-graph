const fs = require('fs');
const Twitter = require('./twitter');
const sentiment = require('sentiment');
const Graph = require('graphlib').Graph;

class TwitterGraph {
  constructor(){
    this.graph = new Graph();
    this.steps = [];
    this.searched = [];
    this.exploreChance = 0.33;
  }

  createSeed(screenName){
    return new Promise((resolve, reject) => {
      var sourceTweets;
      var sourceUser;
      var targetUser;
      Twitter.getTimelineByScreenName(screenName)
      .then(tweets => {
        sourceTweets = tweets;
        sourceUser = sourceTweets[0].user.screen_name;
        return Twitter.getMentions(screenName)
      })
      .then(targetTweets => {
        var friendliest = getFriendliestTweet(targetTweets);
        return Promise.resolve(friendliest);
      })
      .then(targetTweet => {
        targetUser = targetTweet.user.screen_name;
        return saveSeedNodes(sourceTweets, targetTweet, this.graph)
      })
      .then(() => this.addStep(sourceUser))
      .then(() => resolve())
    })
  }

  search(remainingSteps){
    return new Promise((resolve, reject) => {
      remainingSteps--;
      if(remainingSteps < 0 || typeof remainingSteps !== 'number'){
        return resolve();
      }
      var screenName;
      var tweets = [];
      selectUserToAnalyze(this.graph, this.exploreChance, this.searched)
      .then(res => {
        screenName = res.id;
        return Twitter.getTimelineByScreenName(screenName)
      })
      .then(res => {
        tweets = res;
        return updateUserNode(this.graph, tweets);
      })
      .then(() => addMentionedNodes(this.graph, tweets))
      .then(() => recalculateAdjacentNodes(this.graph, screenName))
      .then(() => this.addStep(screenName))
      .then(() => this.search(remainingSteps))
      .then(() => resolve())
      .catch(err => reject(err))
    })
  }

  addStep(screenName){
    console.log('adding step for ', screenName)
    var outEdges = this.graph.outEdges(screenName);
    var mentioned = outEdges.map(edge => {
      var label = this.graph.edge(edge.v, edge.w);
      return {
        id: edge.w,
        score: label.score
      }
    })
    var label = this.graph.node(screenName);
    var step = {
      user: {
        id: screenName,
        score: label.score,
        bestTweet: {
          text: label.bestTweet.text,
          sentiment: label.bestTweet.sentiment
        },
        profile_image_url: label.user.profile_image_url
      },
      mentioned: mentioned
    }
    this.steps.push(step);
    this.searched.push(screenName.toLowerCase());
    return Promise.resolve();
  }

  write(){
    return new Promise((resolve, reject) => {
      console.log('Writing js file with ' + this.steps.length + 'steps...');
      var meta = getMetadata(this.steps);
      var res = {
        steps: this.steps,
        maxEdgesScore: meta.maxEdgesScore,
        maxScore: meta.maxScore
      }
      fs.mkdir('./public/data', (err, data) => {
        fs.writeFile('./public/data/graph.js', 'var graph = ' + JSON.stringify(res), 'utf-8', (err, data) => {
          if (err) {
            reject(err)
            return;
          }
          resolve();
        })
      })
    })
  }
}

function getFriendliestTweet(tweets){
    var ranked = tweets.map(tweet => {
      tweet.sentiment = sentiment(tweet.text).score;
      return tweet;
    }).sort((a, b) => {
      return b.sentiment - a.sentiment;
    })
    return ranked[0];
}

function saveSeedNodes(sourceTweets, targetTweet, graph){
  var sourceUserSentiment = getUserSentimentScore(sourceTweets);
  var sourceNode = sourceTweets[0].user.screen_name;
  var targetNode = targetTweet.user.screen_name;
  var bestTweet = getFriendliestTweet(sourceTweets);
  graph.setNode(sourceNode, {
    score: sourceUserSentiment,
    user: sourceTweets[0].user,
    bestTweet: {
      text: bestTweet.text,
      sentiment: bestTweet.sentiment
    },
    isSeed: true
  })
  graph.setNode(targetNode, {});
  targetTweet.sentiment = sentiment(targetTweet.text).score;
  graph.setEdge(sourceNode, targetNode, {
    score: sentiment(targetTweet.text).score,
    tweet: targetTweet
  })
  return Promise.resolve()
}

function getUserSentimentScore(tweets){
  var totalScore = 0;
  tweets.map(tweet => {
    totalScore += sentiment(tweet.text).score;
  })
  return tweets.length > 0 ? totalScore/tweets.length : 0;
}

function selectUserToAnalyze(graph, exploreChance, searched){
  var nodes = graph.nodes();
  var shouldExplore = Math.random() < exploreChance;
  var sorted = nodes.filter(node => {
    return !node.isSeed && typeof node.score === 'undefined' && searched.indexOf(node.toLowerCase()) === -1;
  }).map(node => {
    var label = graph.node(node);
    return {
      id: node,
      score: label.score,
      edgesScore: label.edgesScore,
      followers: label.user ? label.user.followers_count : 0
    };
  })
  .sort((a, b) => {
    return (b.edgesScore * b.followers > 1000 ? 0.75 : 1) - (a.edgesScore * a.followers > 1000 ? 0.75 : 1);
  })
  if(!sorted.length){
    return Promise.reject(new Error('No valid nodes to analyze.'));
  }
  console.log(`Analyzing ${sorted[0].id}`);
  var selected = shouldExplore ? sorted[Math.floor(Math.random() * sorted.length)] : sorted[0];

  return Promise.resolve({
    id: selected.id,
    stepType: shouldExplore ? 'explore' : 'exploit'
  });
}

function updateUserNode(graph, tweets){
  var screenName = tweets[0].user.screen_name;
  var score = getUserSentimentScore(tweets);
  var edgesScore = getEdgesScore(graph, screenName);
  graph.setNode(screenName, {
    score: score,
    bestTweet: getFriendliestTweet(tweets),
    user: tweets[0].user,
    edgesScore: edgesScore
  })
  console.log(`Added user ${screenName} with score ${score} and edges score ${edgesScore}`);
  return Promise.resolve();
}

function recalculateAdjacentNodes(graph, screenName){
  var inEdges = graph.inEdges(screenName);
  var outEdges = graph.outEdges(screenName);
  inEdges.map(edge => {
    var label = graph.node(edge.v);
    graph.setNode(edge.v, {
      score: label.score,
      user: label.user,
      bestTweet: label.bestTweet,
      edgesScore: getEdgesScore(graph, edge.v)
    })
  })
  outEdges.map(edge => {
    var label = graph.node(edge.w);
    graph.setNode(edge.w, {
      score: label.score,
      user: label.user,
      bestTweet: label.bestTweet,
      edgesScore: getEdgesScore(graph, edge.v)
    })
  })
}

function addMentionedNodes(graph, tweets){
  var allMentions = [];
  tweets.map(tweet => {
    var mentions = tweet.entities.user_mentions.map(mention => {
      allMentions.push({
        score: sentiment(tweet.text).score,
        mentionedScreenName: mention.screen_name,
        tweet: tweet
      })
    })
  })
  // keep only 10 or if user already exists as node
  var sorted = allMentions.sort((a, b) => {
    // sort by score
    return a.score - b.score;
  });
  sorted.map(mention => {
    if(!graph.node(mention.mentionedScreenName)){
      graph.setNode(mention.mentionedScreenName, {});
    }
    graph.setEdge(mention.tweet.user.screen_name, mention.mentionedScreenName, {
      score: mention.score,
      tweet: mention.tweet
    });
  })
  return Promise.resolve()
}

function getEdgesScore(graph, screenName){
  var edges = graph.inEdges(screenName).concat(graph.outEdges(screenName));
  var edgeScoreTotal = 0;
  edges.map(edge => {
    var label = graph.edge(edge.v, edge.w);
    edgeScoreTotal += label.score;
  })
  edgeScoreTotal += graph.node(screenName).score;
  return edgeScoreTotal/(edges.length + 1);
}

function getMetadata(steps){
  var res = {
    maxScore: null,
    maxEdgesScore: null
  }
  steps.map(step => {
    if(!res.maxScore || Math.abs(step.user.score) > res.maxScore){
      res.maxScore = Math.abs(step.user.score);
    }
    step.mentioned.map(mention => {
      if(!res.maxEdgesScore || Math.abs(mention.score) > res.maxEdgesScore){
        res.maxEdgesScore = Math.abs(mention.score);
      }
    })
  })
  return res;
}

module.exports = TwitterGraph;
