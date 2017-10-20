require('dotenv').load();
const Twitter = require('twitter');
const ArgumentParser = require('argparse').ArgumentParser;
const sentiment = require('sentiment');
const stats = require('stats-lite');
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

searchTweets(args.input)
.then(tweets => analyzeTweets(tweets))
.then(analysis => console.log(analysis))
.catch(err => {
  throw new Error(err);
  return;
})

function searchTweets(term){
  return new Promise((resolve, reject) => {
    client.get('search/tweets', { q: term, count: 100 }, (err, tweets, res) => {
      if(err){
        return reject(err);
      }
      resolve(tweets);
    })
  })
}

function analyzeTweets(tweets){
  return new Promise((resolve, reject) => {
    var total = 0;
    var comparatives = [];
    var mostPositive, mostNegative;
    tweets.statuses.map(tweet => {
      var output = sentiment(tweet.text);
      comparatives.push(output.comparative);
      total += output.comparative;
      if(!mostPositive || output.score > mostPositive.sentiment.score){
        mostPositive = {
          sentiment:output,
          tweet: tweet
        }
      }

      if(!mostNegative || output.score < mostNegative.sentiment.score){
        mostNegative = {
          sentiment: output,
          tweet: tweet
        }
      }
    })
    resolve({
      averageSentiment: total/tweets.statuses.length,
      stdev: stats.stdev(comparatives),
      quantity: tweets.statuses.length,
      mostPositive: mostPositive,
      mostNegative: mostNegative
    })
  })
}
