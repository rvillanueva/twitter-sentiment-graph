const fs = require('fs');
const Twitter = require('./twitter');
const sentiment = require('sentiment');
const Graph = require('graphlib').Graph;

class TwitterGraph {
  constructor(){
    this.graph = new Graph();
    this.steps = [];
    this.searched = [];
    this.exploreChance = 0.2;
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
      .then(targetTweets => getFriendliestTweet(targetTweets))
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
      .then(() => recalculatePredecessorNodes(this.graph, screenName))
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
      var label = this.graph.node(edge.w);
      return {
        id: edge.w,
        score: label.score
      }
    })
    var step = {
      user: {
        id: screenName,
        score: this.graph.node(screenName).score
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
      fs.mkdir('./public/data', (err, data) => {
        fs.writeFile('./public/data/graph.js', 'var graph = ' + JSON.stringify({steps: this.steps}), 'utf-8', (err, data) => {
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
  return new Promise((resolve, reject) => {
    var ranked = tweets.map(tweet => {
      tweet.sentiment = sentiment(tweet.text);
      return tweet;
    }).sort((a, b) => {
      return a.sentiment - b.sentiment;
    })
    resolve(ranked[0]);
  })
}

function saveSeedNodes(sourceTweets, targetTweet, graph){
  var sourceUserSentiment = getUserSentimentScore(sourceTweets);
  var sourceNode = sourceTweets[0].user.screen_name;
  var targetNode = targetTweet.user.screen_name;
  graph.setNode(sourceNode, {
    user: null,
    score: sourceUserSentiment,
    isSeed: true
  })
  graph.setNode(targetNode, {});
  graph.setEdge(sourceNode, targetNode, {
    score: sentiment(targetTweet.text).comparative,
    tweet: targetTweet
  })
  return Promise.resolve()
}

function getUserSentimentScore(tweets){
  var totalScore = 0;
  tweets.map(tweet => {
    totalScore += sentiment(tweet.text).comparative;
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
      mentionScore: label.mentionScore
    };
  })
  .sort((a, b) => {
    if(shouldExplore){
      return getInEdgesScore(graph, a.id) - getInEdgesScore(graph, b.id);
    }
    return 0;
  })
  .sort((a, b) => {
    if(shouldExplore){
      if(a.mentionScore && !b.mentionScore){
        return -1;
      } else if (!a.mentionScore && b.mentionScore){
        return 1;
      } else {
        return 0;
      }
    } else {
      return (a.mentionScore || 0) - (b.mentionScore || 0);
    }
  })
  if(!sorted.length){
    return Promise.reject(new Error('No valid nodes to analyze.'));
  }
  console.log(`Analyzing ${sorted[0].id}`);

  return Promise.resolve({
    id: sorted[0].id,
    stepType: shouldExplore ? 'explore' : 'exploit'
  });
}

function updateUserNode(graph, tweets){
  var screenName = tweets[0].user.screen_name;
  var score = getUserSentimentScore(tweets);
  var mentionScore = getUserMentionScore(graph, screenName);
  graph.setNode(screenName, {
    score: score,
    mentionScore: mentionScore
  })
  console.log(`Added user ${screenName} with score ${score} and mention score ${mentionScore}`);
  return Promise.resolve();
}

function recalculatePredecessorNodes(graph, screenName){
  var inEdges = graph.inEdges(screenName);
  inEdges.map(edge => {
    var label = graph.node(edge.v);
    graph.setNode(edge.v, {
      score: label.score,
      mentionScore: getUserMentionScore(graph, edge.v)
    })
  })
}

function getUserMentionScore(graph, screenName){
  var outEdges = graph.outEdges(screenName);
  var totalMentionScore = 0;
  var count = 0;
  outEdges.map(edge => {
    var label = graph.node(edge.w);
    if(typeof label.score === 'number'){
      totalMentionScore += label.score;
      count ++;
    }
  })
  return count > 0 ? totalMentionScore/count : 0;
}

function addMentionedNodes(graph, tweets){
  var allMentions = [];
  tweets.map(tweet => {
    var mentions = tweet.entities.user_mentions.map(mention => {
      allMentions.push({
        score: sentiment(tweet.text).comparative,
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
  var filtered = sorted.filter((mention, m) => {
    return m < 10 || graph.node(mention.mentionedScreenName);
  })
  filtered.map(mention => {
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

function getInEdgesScore(graph, screenName){
  var inEdges = graph.inEdges(screenName);
  var edgeScoreTotal = 0;
  inEdges.map(edge => {
    var label = graph.edge(edge.v, edge.w);
    edgeScoreTotal += label.score;
  })
  return edgeScoreTotal/inEdges.length;
}

module.exports = TwitterGraph;
