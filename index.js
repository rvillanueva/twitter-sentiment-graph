require('dotenv').load();
const Twitter = require('twitter');
const ArgumentParser = require('argparse').ArgumentParser;

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

client.get('search/tweets', { q: args.input }, (err, tweets, res) => {
  console.log(tweets);
})
